'use strict';
const {connectDatabase}=require('../lib/database-connection');
const {serverSupabase}=require('../lib/supabase-connection');
const TABLE='report_history_editions';
const COLUMNS='id,collection,report_key,title,generated_at,publication_timestamp,cut_date';
// pg may parse DATE as a local Date object. Read its text representation so
// a cut's calendar day is identical over SQL and REST in every host timezone.
const SQL_COLUMNS='id,collection,report_key,title,generated_at,publication_timestamp,cut_date::text AS cut_date';

// Shared by independent HTTP/cron instances; a storage outage must never look
// like an empty archive or a successful write to an ephemeral local directory.
function createReportHistoryDatabase({connect=connectDatabase,rest=serverSupabase}={}){
    async function database(sql,remote){
        let db;
        try{db=await connect();if(db)return await sql(db);}
        catch{ /* The private REST adapter also works without direct PostgreSQL. */ }
        finally{await db?.end().catch(()=>{});}
        return remote(rest());
    }
    const metadata=row=>({id:row.id,collection:row.collection,key:row.report_key,title:row.title,generatedAt:row.publication_timestamp,date:String(row.cut_date).slice(0,10)});
    return {
        async archive(item,date){
            const row={id:item.id,collection:item.collection,report_key:item.key,title:item.title,generated_at:new Date(item.generatedAt).toISOString(),publication_timestamp:item.generatedAt,cut_date:date,report:item.report};
            await database(db=>db.query(`INSERT INTO public.${TABLE} (id,collection,report_key,title,generated_at,publication_timestamp,cut_date,report) VALUES ($1,$2,$3,$4,$5,$6,$7,$8::jsonb) ON CONFLICT (id) DO NOTHING`,[row.id,row.collection,row.report_key,row.title,row.generated_at,row.publication_timestamp,row.cut_date,JSON.stringify(row.report)]),async client=>{
                const {error}=await client.from(TABLE).upsert(row,{onConflict:'id',ignoreDuplicates:true});if(error)throw error;
            });
        },
        async get(id){
            const row=await database(async db=>(await db.query(`SELECT ${SQL_COLUMNS},report FROM public.${TABLE} WHERE id=$1`,[id])).rows[0],async client=>{const {data,error}=await client.from(TABLE).select(COLUMNS+',report').eq('id',id).maybeSingle();if(error)throw error;return data;});
            return row ? {id:row.id,collection:row.collection,key:row.report_key,title:row.title,generatedAt:row.publication_timestamp,report:row.report} : null;
        },
        async list({area,key,date,position,limit}){
            return database(async db=>{
                const values=[],where=[],add=(clause,value)=>{values.push(value);where.push(clause.replace('?', '$'+values.length));};
                if(area)add('collection=?',area);if(key)add('report_key=?',key);if(date)add('cut_date=?',date);
                if(position){values.push(new Date(position.generatedAt).toISOString(),position.id);where.push(`(generated_at<$${values.length-1} OR (generated_at=$${values.length-1} AND id>$${values.length}))`);}
                values.push(limit);
                return (await db.query(`SELECT ${SQL_COLUMNS} FROM public.${TABLE}${where.length ? ' WHERE '+where.join(' AND ') : ''} ORDER BY generated_at DESC,id ASC LIMIT $${values.length}`,values)).rows.map(metadata);
            },async client=>{
                let query=client.from(TABLE).select(COLUMNS);
                if(area)query=query.eq('collection',area);if(key)query=query.eq('report_key',key);if(date)query=query.eq('cut_date',date);
                if(position){const stamp=new Date(position.generatedAt).toISOString();query=query.or(`generated_at.lt.${stamp},and(generated_at.eq.${stamp},id.gt.${position.id})`);}
                const {data,error}=await query.order('generated_at',{ascending:false}).order('id',{ascending:true}).limit(limit);if(error)throw error;return (data || []).map(metadata);
            });
        },
    };
}
module.exports={createReportHistoryDatabase};
