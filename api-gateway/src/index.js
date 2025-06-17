import { Hono } from 'hono';
import { serve } from '@hono/node-server';
import webhookRouter from './routes/webhook.js';

const app = new Hono();
const port = process.env.PORT || 3000;

// Mount routes
app.route('/webhook', webhookRouter);

// Health check endpoint
app.get('/health', (c) => {
    return c.json({ status: 'ok' }, 200);
});

// Start the server
serve({
    fetch: app.fetch,
    port
}, (info) => {
    console.log(`Webhook server listening on port ${info.port}`);
}); 