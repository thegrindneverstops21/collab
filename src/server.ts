import http from 'http';
import app from './app';
import { env } from './config/env';
import { pool, testConnection } from './db/pool';
import { attachRealtime } from './realtime';

const server = http.createServer(app);
const sockets = attachRealtime(server);

async function start() {
    try {
        await testConnection();
        server.listen(env.port, () => {
            console.log(`Server is running on port ${env.port}`);
        });
    } catch (error) {
        console.error('Error starting server:', error);
        process.exitCode = 1;
        sockets.close();
        await pool.end();
    }
}

start();

let stopping = false;
function shutdown() {
    if (stopping) return;
    stopping = true;
    for (const socket of sockets.clients) socket.terminate();
    sockets.close();
    server.close(() => { void pool.end(); });
    setTimeout(() => process.exit(1), 10000).unref();
}
process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);
