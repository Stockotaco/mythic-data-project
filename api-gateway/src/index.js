import { Hono } from 'hono';
import { serve } from '@hono/node-server';
import webhookRouter from './routes/webhook.js';
import redisTestRouter from './routes/redis-test.js';
import { redis } from './config/index.js';

const app = new Hono();
const port = process.env.PORT || 3000;

// Initialize Redis connection
async function initializeRedis() {
    try {
        await redis.connect();
        console.log('Redis connection initialized successfully');
    } catch (error) {
        console.error('Failed to initialize Redis connection:', error);
        process.exit(1);
    }
}

// Mount routes
app.route('/webhook', webhookRouter);
app.route('/redis-test', redisTestRouter);

// Health check endpoint
app.get('/health', async (c) => {
    try {
        const redisHealth = await redis.healthCheck();
        return c.json({
            status: 'ok',
            redis: redisHealth
        }, 200);
    } catch (error) {
        return c.json({
            status: 'error',
            message: error.message
        }, 500);
    }
});

// Start the server
async function startServer() {
    await initializeRedis();

    serve({
        fetch: app.fetch,
        port
    }, (info) => {
        console.log(`Webhook server listening on port ${info.port}`);
    });
}

startServer().catch(console.error); 