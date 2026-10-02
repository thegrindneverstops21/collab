import fs from 'fs';
import path from 'path';
import { pool } from './pool';

async function migrate() {
    const sql = fs.readFileSync(path.join(__dirname, 'schema.sql'), 'utf-8');
    try {
        await pool.query(sql);
        console.log('Database migration completed successfully.');
    }catch (error) {
        console.error('Migration failed:', error);
        process.exitCode = 1;
    } finally {
        await pool.end();
    }
}

migrate();