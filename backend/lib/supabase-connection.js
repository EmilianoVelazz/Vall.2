'use strict';
const {createClient}=require('@supabase/supabase-js');
const {configureSystemTrust}=require('./tls-trust');
let cached,identity='';
function createServerClient({env=process.env,clientFactory=createClient}={}) {
    const url=env.SUPABASE_URL || env.VITE_SUPABASE_URL,key=env.SUPABASE_SERVICE_ROLE_KEY;
    let privateKey=key?.startsWith('sb_secret_');
    if(key?.startsWith('eyJ'))try{privateKey=JSON.parse(Buffer.from(key.split('.')[1],'base64url').toString()).role==='service_role';}catch{privateKey=false;}
    if(!url || !privateKey)throw Object.assign(Error('Se requiere la conexión privada del servidor con Supabase.'),{code:'SUPABASE_SERVER_KEY_REQUIRED'});
    if(new URL(url).protocol!=='https:')throw Object.assign(Error('La conexión de Supabase requiere HTTPS.'),{code:'SUPABASE_TLS_REQUIRED'});
    configureSystemTrust();
    return clientFactory(url,key,{auth:{persistSession:false,autoRefreshToken:false},global:{fetch:(resource,options={})=>fetch(resource,{...options,signal:options.signal || AbortSignal.timeout(6000)})}});
}
function serverSupabase(){const next=(process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL || '')+'|'+(process.env.SUPABASE_SERVICE_ROLE_KEY || '');if(!cached || next!==identity){cached=createServerClient();identity=next;}return cached;}
module.exports={createServerClient,serverSupabase};
