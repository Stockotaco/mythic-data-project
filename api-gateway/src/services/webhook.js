import { redis, qstash, QUEUE_CONFIGS, OPPORTUNITY_EVENTS } from '../config/index.js';

export class WebhookService {
    static async processWebhook(webhookData, shouldRerun = false) {
        // Generate a unique key for this webhook event
        const eventId = webhookData.webhookId || `${Date.now()}-${Math.random().toString(36).substring(2, 11)}`;
        const redisKey = `webhook:${eventId}`;

        // Skip Redis check if rerun=true
        if (!shouldRerun) {
            // Check if we've already processed this event by webhookId
            const isDuplicate = await redis.get(redisKey);
            if (isDuplicate) {
                console.log(`Duplicate webhook event detected: ${eventId}`);
                return {
                    status: 'duplicate',
                    message: 'Event already processed',
                    eventId
                };
            }

            // Only check opportunity deduplication for opportunity events
            if (OPPORTUNITY_EVENTS.includes(webhookData.type)) {
                const today = new Date().toISOString().split('T')[0]; // YYYY-MM-DD
                const opportunityKey = `opportunity:${webhookData.locationId}-${webhookData.pipelineId}-${webhookData.pipelineStageId}-${webhookData.contactId}-${today}`;

                const isOpportunityDuplicate = await redis.get(opportunityKey);
                if (isOpportunityDuplicate) {
                    console.log(`Duplicate opportunity event detected: ${opportunityKey}`);
                    return {
                        status: 'duplicate',
                        message: 'Opportunity event already processed today',
                        eventId,
                        opportunityKey
                    };
                }

                // Store the opportunity key with a TTL (24 hours)
                await redis.set(opportunityKey, 'processed', { ex: 86400 });
            }

            // Store the webhook key with a TTL (24 hours)
            await redis.set(redisKey, 'processed', { ex: 86400 });
        }

        // Determine queue type from webhook data
        const queueType = webhookData.type || 'default';
        const config = QUEUE_CONFIGS[queueType] || QUEUE_CONFIGS.default;

        // Get the queue for this type
        const queue = qstash.queue({
            queueName: queueType
        });

        // Publish the webhook to QStash
        const message = await queue.enqueueJSON({
            url: 'https://webhook-processor-production-a065.up.railway.app/webhook/4e196e7a-7603-4322-91dd-0a89ed41dd6e',
            body: webhookData,
            deduplicationId: eventId
        });

        return {
            status: 'queued',
            message: 'Webhook queued for processing',
            eventId,
            messageId: message.messageId,
            queueType: queueType
        };
    }
} 