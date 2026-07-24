require('dotenv').config({ path: __dirname + '/backend/.env' });
const mysql = require('mysql2/promise');
const fs = require('fs');
const path = require('path');

async function run() {
    const pool = mysql.createPool({
        host: process.env.DB_HOST || '127.0.0.1', 
        port: Number(process.env.DB_PORT || 3306), 
        user: process.env.DB_USER || 'root', 
        password: process.env.DB_PASSWORD || '', 
        database: process.env.DB_NAME || 'vall_', 
        multipleStatements: true
    });
    const sql = fs.readFileSync(path.join(__dirname, 'backend/db/migrations/003_cognitive_brain.sql'), 'utf8');
    try {
        await pool.query(sql);
        console.log("Migración 003 ejecutada exitosamente.");
    } catch(e) {
        console.error("Error ejecutando migración:", e.message);
    }
    process.exit(0);
}
run();
