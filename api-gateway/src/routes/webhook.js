import { Hono } from 'hono';
import { validateWebhook } from '../middleware/webhook.js';
import { WebhookService } from '../services/webhook.js';

const webhookRouter = new Hono();

webhookRouter.post('/', validateWebhook, async (c) => {
    try {
        const webhookData = c.req.body;
        const url = new URL(c.req.url);
        const shouldRerun = url.searchParams.get('rerun') === 'true';

        const result = await WebhookService.processWebhook(webhookData, shouldRerun);

        if (result.status === 'duplicate') {
            return c.json(result, 200);
        }

        return c.json(result, 202);
    } catch (error) {
        console.error('Error processing webhook:', error);
        return c.json({ error: 'Internal server error' }, 500);
    }
});

export default webhookRouter; 