'use strict';
const {connectDatabase}=require('../lib/database-connection');
const {serverSupabase}=require('../lib/supabase-connection');
const calls={
    state:{name:'vall_chat_credit_state',keys:['target_id','activate'],types:['uuid','boolean']},
    reserve:{name:'vall_chat_credit_reserve',keys:['target_id','reservation_id','amount_micros','provider_model'],types:['uuid','uuid','bigint','text']},
    settle:{name:'vall_chat_credit_settle',keys:['target_id','reservation_id','actual_cost_micros','usage','estimated'],types:['uuid','uuid','bigint','jsonb','boolean']},
};
function createChatCreditStore({connect=connectDatabase,rest=serverSupabase,onDiagnostic=code=>console.warn('[chat-credit-store]',code)}={}) {
    async function invoke(kind,args){
        const call=calls[kind];let db,firstError;
        try{db=await connect();if(db){const result=await db.query(`SELECT public.${call.name}(${call.types.map((type,i)=>'$'+(i+1)+'::'+type).join(',')}) AS value`,call.keys.map(key=>key==='usage' ? JSON.stringify(args[key]) : args[key]));return result.rows[0].value;}}
        catch(error){firstError=error;}finally{await db?.end().catch(()=>{});}
        // RPCs are idempotent. Retrying after an ambiguous network failure cannot debit twice.
        for(let attempt=0;attempt<2;attempt++)try{
            const {data,error}=await rest().rpc(call.name,args).abortSignal(AbortSignal.timeout(7000));
            if(error)throw error;return data;
        }catch(error){if(attempt===1){onDiagnostic(error.code || firstError?.code || 'STORAGE_UNAVAILABLE');throw Object.assign(Error('No pudimos comprobar tu saldo de chat. Intenta nuevamente en unos momentos.'),{code:'CHAT_CREDITS_UNAVAILABLE',status:503});}}
    }
    return {state:id=>invoke('state',{target_id:id,activate:false}),reserve:(id,reservationId,amount,model)=>invoke('reserve',{target_id:id,reservation_id:reservationId,amount_micros:amount,provider_model:model}),settle:(id,reservationId,cost,usage,estimated=false)=>invoke('settle',{target_id:id,reservation_id:reservationId,actual_cost_micros:cost,usage,estimated})};
}
module.exports={createChatCreditStore,chatCreditStore:createChatCreditStore()};
