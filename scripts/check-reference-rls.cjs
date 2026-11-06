'use strict';
const path = require('node:path');
const fs = require('node:fs/promises');
require('dotenv').config({ path: path.resolve(__dirname, '../.env.local'), quiet: true });
require('dotenv').config({ path: path.resolve(__dirname, '../backend/.env'), quiet: true });
const { connectDatabase } = require('../backend/lib/database-connection');
const { REFERENCE_TABLES } = require('../backend/services/orion-storage-health');
const simulateWrites = process.argv.includes('--simulate-writes');

(async () => {
    const db = await connectDatabase();
    if (!db) throw Object.assign(Error('Conexión no configurada.'), { code: 'DB_NOT_CONFIGURED' });
    try {
        const { rows: tables } = await db.query(`SELECT c.relname AS table, c.relrowsecurity AS rls,
            has_table_privilege('anon',c.oid,'SELECT') AND has_table_privilege('authenticated',c.oid,'SELECT') AS reference_read,
            has_table_privilege('anon',c.oid,'INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER')
                OR has_table_privilege('authenticated',c.oid,'INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER') AS public_write,
            has_table_privilege('service_role',c.oid,'SELECT') AND has_table_privilege('service_role',c.oid,'INSERT')
                AND has_table_privilege('service_role',c.oid,'UPDATE') AND has_table_privilege('service_role',c.oid,'DELETE') AS server_access,
            (SELECT COUNT(*)::int FROM pg_policies p WHERE p.schemaname='public' AND p.tablename=c.relname) AS policies
            FROM pg_class c WHERE c.relnamespace='public'::regnamespace AND c.relname=ANY($1::text[]) ORDER BY c.relname`, [REFERENCE_TABLES]);
        const { rows: unprotected } = await db.query("SELECT relname AS table FROM pg_class WHERE relnamespace='public'::regnamespace AND relkind IN ('r','p') AND NOT relrowsecurity");
        const { rows: exposedSequences } = await db.query(`SELECT s.relname FROM pg_class s JOIN pg_depend d ON d.objid=s.oid
            JOIN pg_class t ON t.oid=d.refobjid WHERE s.relkind='S' AND d.classid='pg_class'::regclass
            AND d.refclassid='pg_class'::regclass AND d.deptype IN ('a','i') AND t.relnamespace='public'::regnamespace
            AND t.relname=ANY($1::text[]) AND (has_sequence_privilege('anon',s.oid,'USAGE,SELECT,UPDATE')
                OR has_sequence_privilege('authenticated',s.oid,'USAGE,SELECT,UPDATE'))`, [REFERENCE_TABLES]);
        for (const table of tables) {
            table.records = Number((await db.query(`SELECT COUNT(*)::int AS count FROM public."${table.table}"`)).rows[0].count);
        }
        // EXPLAIN sin ANALYZE verifica permisos sin ejecutar ninguna escritura.
        const roleChecks = [];
        const readChecks = [];
        await db.query('BEGIN READ ONLY');
        try {
            for (const role of ['anon', 'authenticated']) {
                await db.query(`SET LOCAL ROLE ${role}`);
                for (const table of REFERENCE_TABLES) {
                    const count = Number((await db.query(`SELECT COUNT(*)::int AS count FROM public."${table}"`)).rows[0].count);
                    readChecks.push({ role, table, matches: count === tables.find(row => row.table === table)?.records });
                    if (simulateWrites) for (const sql of [`INSERT INTO public."${table}" DEFAULT VALUES`,
                        `UPDATE public."${table}" SET id=id WHERE false`, `DELETE FROM public."${table}" WHERE false`]) {
                        await db.query('SAVEPOINT permission_check');
                        let denied = false;
                        try { await db.query('EXPLAIN ' + sql); }
                        catch (error) { denied = error.code === '42501'; }
                        finally { await db.query('ROLLBACK TO SAVEPOINT permission_check'); await db.query('RELEASE SAVEPOINT permission_check'); }
                        roleChecks.push({ role, table, operation: sql.split(' ')[0], denied });
                    }
                }
                await db.query('RESET ROLE');
            }
        } finally { await db.query('ROLLBACK'); }
        const report = { checkedAt: new Date().toISOString(), readOnly: true, tables, unprotected, exposedSequences,
            readChecks: readChecks.length, referenceReadsVerified: readChecks.every(row => row.matches),
            writeSimulations: roleChecks.length, allWritesDenied: roleChecks.length ? roleChecks.every(row => row.denied) : null };
        report.ready = tables.length === REFERENCE_TABLES.length && tables.every(row => row.rls && row.reference_read && !row.public_write && row.server_access && row.policies > 0)
            && !unprotected.length && !exposedSequences.length && (!simulateWrites || report.allWritesDenied) && report.referenceReadsVerified;
        await fs.mkdir(path.resolve(__dirname, '../output'), { recursive: true });
        await fs.writeFile(path.resolve(__dirname, '../output/supabase-rls-after.json'), JSON.stringify(report, null, 2));
        console.log(JSON.stringify(report, null, 2));
        if (!report.ready) process.exitCode = 1;
    } finally { await db.end(); }
})().catch(error => { console.error('Diagnóstico RLS no completado:', error.code || 'DB_UNAVAILABLE'); process.exitCode = 1; });
