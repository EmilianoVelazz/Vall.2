require('dotenv').config({ path: __dirname + '/backend/.env' });
const mysql = require('mysql2/promise');
async function run() {
    const pool = mysql.createPool({ host: '127.0.0.1', port: 3306, user: 'root', password: '', database: 'vall_' });
    try {
        const [rows] = await pool.query('SELECT condition_trigger, learned_rule FROM ai_neural_rules');
        console.log(rows);
    } catch(e) {
        console.error(e.message);
    }
    process.exit(0);
}
run();
