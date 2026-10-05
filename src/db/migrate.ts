import fs from 'fs';
import path from 'path';
import { pool } from './pool';

async function migrate() {
    const sql = fs.readFileSync(path.resolve(process.cwd(), 'src/db/schema.sql'), 'utf-8');
    try {
        await pool.query(`BEGIN;\n${sql}\nCOMMIT;`);
        console.log('Database migration completed successfully.');
    }catch (error) {
        console.error('Migration failed:', error);
        process.exitCode = 1;
    } finally {
        await pool.end();
    }
}

migrate();
