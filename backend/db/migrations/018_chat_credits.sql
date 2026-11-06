-- Private chat credit ledger. Report generation never opens this accounting context.
BEGIN;
CREATE TABLE IF NOT EXISTS public.chat_credit_accounts (
 profile_id uuid PRIMARY KEY REFERENCES public.app_profiles(id),
 monthly_limit_micros bigint NOT NULL DEFAULT 200000000 CHECK(monthly_limit_micros>=0),
 mxn_per_usd numeric NOT NULL DEFAULT 20 CHECK(mxn_per_usd>0 AND mxn_per_usd<=1000),
 created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS public.chat_credit_windows (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), profile_id uuid NOT NULL REFERENCES public.app_profiles(id),
 kind text NOT NULL CHECK(kind IN ('month','week','five_hours')), starts_at timestamptz NOT NULL,
 resets_at timestamptz NOT NULL, limit_micros bigint NOT NULL CHECK(limit_micros>=0),
 used_micros bigint NOT NULL DEFAULT 0 CHECK(used_micros>=0), reserved_micros bigint NOT NULL DEFAULT 0 CHECK(reserved_micros>=0),
 input_tokens bigint NOT NULL DEFAULT 0, output_tokens bigint NOT NULL DEFAULT 0, thinking_tokens bigint NOT NULL DEFAULT 0,
 CHECK(resets_at>starts_at), CHECK(used_micros+reserved_micros<=limit_micros), UNIQUE(profile_id,kind,starts_at)
);
CREATE INDEX IF NOT EXISTS chat_credit_active_windows ON public.chat_credit_windows(profile_id,kind,resets_at DESC);
CREATE TABLE IF NOT EXISTS public.chat_credit_reservations (
 id uuid PRIMARY KEY, profile_id uuid NOT NULL REFERENCES public.app_profiles(id), window_ids uuid[] NOT NULL,
 model text NOT NULL CHECK(length(model)<=160), reserved_micros bigint NOT NULL CHECK(reserved_micros>0),
 billed_micros bigint, actual_micros bigint, status text NOT NULL DEFAULT 'pending' CHECK(status IN ('pending','settled','released','estimated')),
 input_tokens bigint NOT NULL DEFAULT 0, output_tokens bigint NOT NULL DEFAULT 0, thinking_tokens bigint NOT NULL DEFAULT 0,
 usage_metadata jsonb NOT NULL DEFAULT '{}'::jsonb, created_at timestamptz NOT NULL DEFAULT now(),
 expires_at timestamptz NOT NULL DEFAULT (now()+interval '10 minutes'), settled_at timestamptz,
 CHECK(billed_micros IS NULL OR billed_micros BETWEEN 0 AND reserved_micros), CHECK(actual_micros IS NULL OR actual_micros>=0)
);
CREATE INDEX IF NOT EXISTS chat_credit_pending ON public.chat_credit_reservations(profile_id,expires_at) WHERE status='pending';
CREATE INDEX IF NOT EXISTS chat_credit_history ON public.chat_credit_reservations(profile_id,created_at DESC);

CREATE OR REPLACE FUNCTION public.vall_chat_credit_state(target_id uuid,activate boolean DEFAULT false)
RETURNS jsonb LANGUAGE plpgsql SET search_path=public AS $$
DECLARE current_time_at timestamptz:=clock_timestamp(); month_start timestamptz; month_end timestamptz;
 days_in_month integer; account public.chat_credit_accounts; period public.chat_credit_windows;
 stale public.chat_credit_reservations; k text; cap bigint; result jsonb; windows jsonb:='[]'::jsonb;
BEGIN
 PERFORM pg_advisory_xact_lock(hashtextextended('chat-credit:'||target_id::text,0));
 IF NOT EXISTS(SELECT 1 FROM public.app_profiles WHERE id=target_id AND active=true) THEN RAISE EXCEPTION 'CHAT_PROFILE_UNAVAILABLE'; END IF;
 INSERT INTO public.chat_credit_accounts(profile_id) VALUES(target_id) ON CONFLICT DO NOTHING;
 SELECT * INTO account FROM public.chat_credit_accounts WHERE profile_id=target_id;
 -- A terminated worker cannot make its reserved credit spendable again.
 FOR stale IN SELECT * FROM public.chat_credit_reservations WHERE profile_id=target_id AND status='pending' AND expires_at<=current_time_at FOR UPDATE LOOP
  UPDATE public.chat_credit_windows SET reserved_micros=reserved_micros-stale.reserved_micros,used_micros=used_micros+stale.reserved_micros WHERE id=ANY(stale.window_ids);
  UPDATE public.chat_credit_reservations SET status='estimated',billed_micros=reserved_micros,settled_at=current_time_at WHERE id=stale.id;
 END LOOP;
 month_start:=date_trunc('month',current_time_at AT TIME ZONE 'America/Mexico_City') AT TIME ZONE 'America/Mexico_City';
 month_end:=(date_trunc('month',current_time_at AT TIME ZONE 'America/Mexico_City')+interval '1 month') AT TIME ZONE 'America/Mexico_City';
 days_in_month:=extract(day FROM (month_end AT TIME ZONE 'America/Mexico_City')-interval '1 day');
 FOREACH k IN ARRAY ARRAY['month','week','five_hours'] LOOP
  cap:=CASE k WHEN 'month' THEN account.monthly_limit_micros WHEN 'week' THEN floor(account.monthly_limit_micros*7::numeric/days_in_month) ELSE floor(account.monthly_limit_micros*5::numeric/(days_in_month*24)) END;
  SELECT * INTO period FROM public.chat_credit_windows WHERE profile_id=target_id AND kind=k AND starts_at>=month_start AND resets_at>current_time_at ORDER BY starts_at DESC LIMIT 1;
  IF period.id IS NULL AND (activate OR k='month') THEN
   INSERT INTO public.chat_credit_windows(profile_id,kind,starts_at,resets_at,limit_micros)
    VALUES(target_id,k,CASE WHEN k='month' THEN month_start ELSE current_time_at END,
      CASE k WHEN 'month' THEN month_end WHEN 'week' THEN least(month_end,current_time_at+interval '7 days') ELSE least(month_end,current_time_at+interval '5 hours') END,cap) RETURNING * INTO period;
  END IF;
  windows:=windows||jsonb_build_array(jsonb_build_object('id',period.id,'kind',k,'limitMicros',coalesce(period.limit_micros,cap),'usedMicros',coalesce(period.used_micros,0),'reservedMicros',coalesce(period.reserved_micros,0),'remainingMicros',greatest(0,coalesce(period.limit_micros,cap)-coalesce(period.used_micros,0)-coalesce(period.reserved_micros,0)),'startsAt',period.starts_at,'resetsAt',period.resets_at,'inputTokens',coalesce(period.input_tokens,0),'outputTokens',coalesce(period.output_tokens,0),'thinkingTokens',coalesce(period.thinking_tokens,0)));
 END LOOP;
 result:=jsonb_build_object('currency','MXN','mxnPerUsd',account.mxn_per_usd,'serverNow',current_time_at,'windows',windows,'exempt',false);
 RETURN result;
END; $$;

CREATE OR REPLACE FUNCTION public.vall_chat_credit_reserve(target_id uuid,reservation_id uuid,amount_micros bigint,provider_model text)
RETURNS jsonb LANGUAGE plpgsql SET search_path=public AS $$
DECLARE snapshot jsonb; existing public.chat_credit_reservations; ids uuid[]; available bigint;
BEGIN
 PERFORM pg_advisory_xact_lock(hashtextextended('chat-credit:'||target_id::text,0));
 IF amount_micros<=0 OR amount_micros>200000000 OR length(provider_model)>160 THEN RAISE EXCEPTION 'CHAT_RESERVATION_INVALID'; END IF;
 snapshot:=public.vall_chat_credit_state(target_id,false);
 SELECT * INTO existing FROM public.chat_credit_reservations WHERE id=reservation_id;
 IF existing.id IS NOT NULL THEN
  IF existing.profile_id<>target_id OR existing.reserved_micros<>amount_micros OR existing.model<>provider_model THEN RAISE EXCEPTION 'CHAT_RESERVATION_CONFLICT'; END IF;
  RETURN jsonb_build_object('allowed',existing.status='pending','reservationId',existing.id,'state',public.vall_chat_credit_state(target_id));
 END IF;
 snapshot:=public.vall_chat_credit_state(target_id,true);
 SELECT min((value->>'remainingMicros')::bigint),array_agg((value->>'id')::uuid) INTO available,ids FROM jsonb_array_elements(snapshot->'windows');
 IF amount_micros>available THEN RETURN jsonb_build_object('allowed',false,'state',snapshot); END IF;
 INSERT INTO public.chat_credit_reservations(id,profile_id,window_ids,model,reserved_micros) VALUES(reservation_id,target_id,ids,provider_model,amount_micros);
 UPDATE public.chat_credit_windows SET reserved_micros=reserved_micros+amount_micros WHERE id=ANY(ids);
 RETURN jsonb_build_object('allowed',true,'reservationId',reservation_id,'state',public.vall_chat_credit_state(target_id));
END; $$;

CREATE OR REPLACE FUNCTION public.vall_chat_credit_settle(target_id uuid,reservation_id uuid,actual_cost_micros bigint,usage jsonb,estimated boolean DEFAULT false)
RETURNS jsonb LANGUAGE plpgsql SET search_path=public AS $$
DECLARE reservation public.chat_credit_reservations; bill bigint; tokens_in bigint; tokens_out bigint; tokens_thinking bigint;
BEGIN
 PERFORM pg_advisory_xact_lock(hashtextextended('chat-credit:'||target_id::text,0));
 SELECT * INTO reservation FROM public.chat_credit_reservations WHERE id=reservation_id AND profile_id=target_id FOR UPDATE;
 IF reservation.id IS NULL THEN RAISE EXCEPTION 'CHAT_RESERVATION_NOT_FOUND'; END IF;
 IF reservation.status<>'pending' THEN RETURN public.vall_chat_credit_state(target_id); END IF;
 IF actual_cost_micros<0 OR octet_length(usage::text)>4096 THEN RAISE EXCEPTION 'CHAT_USAGE_INVALID'; END IF;
 tokens_in:=greatest(0,coalesce((usage->>'inputTokens')::bigint,0));tokens_out:=greatest(0,coalesce((usage->>'outputTokens')::bigint,0));tokens_thinking:=greatest(0,coalesce((usage->>'thinkingTokens')::bigint,0));
 bill:=least(actual_cost_micros,reservation.reserved_micros);
 UPDATE public.chat_credit_windows SET reserved_micros=reserved_micros-reservation.reserved_micros,used_micros=used_micros+bill,input_tokens=input_tokens+tokens_in,output_tokens=output_tokens+tokens_out,thinking_tokens=thinking_tokens+tokens_thinking WHERE id=ANY(reservation.window_ids);
 UPDATE public.chat_credit_reservations SET billed_micros=bill,actual_micros=actual_cost_micros,status=CASE WHEN estimated THEN 'estimated' WHEN bill=0 THEN 'released' ELSE 'settled' END,input_tokens=tokens_in,output_tokens=tokens_out,thinking_tokens=tokens_thinking,usage_metadata=usage,settled_at=clock_timestamp() WHERE id=reservation_id;
 RETURN public.vall_chat_credit_state(target_id);
END; $$;

ALTER TABLE public.chat_credit_accounts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.chat_credit_windows ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.chat_credit_reservations ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.chat_credit_accounts,public.chat_credit_windows,public.chat_credit_reservations FROM PUBLIC,anon,authenticated;
GRANT SELECT,INSERT,UPDATE ON public.chat_credit_accounts,public.chat_credit_windows,public.chat_credit_reservations TO service_role;
REVOKE ALL ON FUNCTION public.vall_chat_credit_state(uuid,boolean),public.vall_chat_credit_reserve(uuid,uuid,bigint,text),public.vall_chat_credit_settle(uuid,uuid,bigint,jsonb,boolean) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.vall_chat_credit_state(uuid,boolean),public.vall_chat_credit_reserve(uuid,uuid,bigint,text),public.vall_chat_credit_settle(uuid,uuid,bigint,jsonb,boolean) TO service_role;
NOTIFY pgrst,'reload schema';
COMMIT;
