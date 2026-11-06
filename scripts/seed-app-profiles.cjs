'use strict';

const path = require('node:path');
const dotenv = require('dotenv');
const bcrypt = require('bcryptjs');
const { connectDatabase } = require('../backend/lib/database-connection');

dotenv.config({ path: path.resolve(__dirname, '../.env.local'), quiet: true });
dotenv.config({ path: path.resolve(__dirname, '../backend/.env'), quiet: true });

async function stdin() {
    const chunks = [];
    for await (const chunk of process.stdin) chunks.push(chunk);
    return Buffer.concat(chunks).toString('utf8').trim();
}

(async () => {
    const raw = process.env.APP_PROFILE_SEED_JSON || await stdin();
    const users = JSON.parse(raw || '[]');
    if (!Array.isArray(users) || users.some(user => !user.email || !user.password)) throw new Error('La semilla debe ser una lista de correos, nombres y contraseñas.');
    const adminEmail = String(process.env.VALL_AUTH_EMAIL || process.env.USER_EMAIL || '').trim().toLowerCase();
    if (!adminEmail) throw new Error('No se encontró el correo administrador configurado.');
    const database = await connectDatabase();
    if (!database) throw Object.assign(new Error('Conexión no configurada.'), { code: 'DB_NOT_CONFIGURED' });
    try {
        await database.query('BEGIN');
        const admin = (await database.query('SELECT id FROM app_profiles WHERE LOWER(email)=$1', [adminEmail])).rows[0];
        if (!admin) await database.query("INSERT INTO app_profiles (email,role,display_name,active,training_opt_in) VALUES ($1,'admin','Administrador',TRUE,TRUE)", [adminEmail]);
        let created=0,skipped=0;
        for (const user of users) {
            const email = String(user.email).trim().toLowerCase();
            const existing = (await database.query('SELECT id FROM app_profiles WHERE LOWER(email)=$1', [email])).rows[0];
            if(existing) {skipped++;continue;}
            if(!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)||email.length>254||String(user.password).length<8||Buffer.byteLength(String(user.password),'utf8')>72) throw Error('Correo o contraseña de cuenta nueva no válidos.');
            const hash = await bcrypt.hash(String(user.password), 12);
            await database.query("INSERT INTO app_profiles (email,password_hash,role,display_name,active,training_opt_in) VALUES ($1,$2,'user',$3,TRUE,TRUE)", [email, hash, String(user.displayName || '').slice(0, 80)]);
            created++;
        }
        await database.query('COMMIT');
        const summary = await database.query('SELECT role,COUNT(*)::int AS total FROM app_profiles WHERE active=TRUE GROUP BY role ORDER BY role');
        console.log(JSON.stringify({ seeded: true, created, skipped, roles: summary.rows }));
    } catch (error) { await database.query('ROLLBACK').catch(() => {}); throw error; }
    finally { await database.end(); }
})().catch(error => { console.error('[app-profiles] Semilla falló:', error.code || 'PROFILE_SEED_FAILED'); process.exitCode = 1; });
