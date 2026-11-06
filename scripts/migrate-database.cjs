'use strict';

const fs = require('fs/promises');
const path = require('path');
const mysql = require('mysql2/promise');
const dotenv = require('dotenv');

const ROOT = path.resolve(__dirname, '..');
dotenv.config({ path: path.join(ROOT, 'backend', '.env') });

const { mysqlTlsOptions } = require('../backend/lib/database-connection');

// Solo 001-003 son SQL de MariaDB. Desde 004 las migraciones son PostgreSQL y
// se aplican en Supabase; ejecutarlas aquí falla en la primera.
const MARIADB_MIGRATION = /^00[1-3]_.+\.sql$/i;
// 001 fija `vall_` en su ALTER DATABASE.
const EXPECTED_DATABASE = 'vall_';

async function main() {
    const directory = path.join(ROOT, 'backend', 'db', 'migrations');
    const files = (await fs.readdir(directory))
        .filter(file => MARIADB_MIGRATION.test(file))
        .sort((left, right) => left.localeCompare(right, 'en'));
    if (!files.length) throw new Error('No se encontraron migraciones SQL.');

    const database = process.env.DB_NAME || process.env.DB_DATABASE || process.env.MYSQL_DATABASE || EXPECTED_DATABASE;
    if (database !== EXPECTED_DATABASE) {
        throw new Error(`La migración 001 requiere la base \`${EXPECTED_DATABASE}\`; DB_NAME es \`${database}\`.`);
    }

    const connection = await mysql.createConnection({
        ...mysqlTlsOptions(),
        host: process.env.DB_HOST || process.env.MYSQL_HOST || '127.0.0.1',
        port: Number(process.env.DB_PORT || process.env.MYSQL_PORT || 3306),
        user: process.env.DB_USER || process.env.MYSQL_USER || 'root',
        password: process.env.DB_PASSWORD || process.env.MYSQL_PASSWORD || '',
        database,
        charset: 'utf8mb4',
        multipleStatements: true,
    });

    try {
        for (const file of files) {
            const sql = await fs.readFile(path.join(directory, file), 'utf8');
            await connection.query(sql);
            console.log(`✓ ${file}`);
        }
        const [versions] = await connection.query(
            'SELECT version, applied_at FROM schema_migrations ORDER BY version'
        );
        console.log(`Migraciones registradas: ${versions.length}`);
    } finally {
        await connection.end();
    }
}

main().catch(error => {
    console.error(`Error de migración: ${error.message}`);
    process.exitCode = 1;
});
