require('dotenv').config({ path: __dirname + '/backend/.env' });
const mysql = require('mysql2/promise');
async function run() {
    const pool = mysql.createPool({ host: '127.0.0.1', port: 3306, user: 'root', password: '', database: 'vall_' });
    try {
        const [rows] = await pool.query('SELECT id, question_text, response_text FROM ai_queries WHERE evaluated_by_brain = FALSE AND response_text IS NOT NULL LIMIT 2');
        console.log(rows);
    } catch(e) {
        console.error(e.message);
    }
    process.exit(0);
}
run();
