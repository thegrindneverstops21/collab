import http from 'http';
import app from './app';
import { env } from './config/env';
import { testConnection } from './db/pool';

const server = http.createServer(app);

async function start() {
    try {
        await testConnection();
        server.listen(env.port, () => {
            console.log(`Server is running on port ${env.port}`);
        });
    } catch (error) {
        console.error('Error starting server:', error);
        process.exitCode = 1;
    }
}

start();