import { Hono } from 'hono'

const app = new Hono()

// Test endpoint that forwards events to external webhook
app.post('/events', async (c) => {
    try {
        const payload = await c.req.json()

        // Forward to external webhook
        const response = await fetch('https://webhook-processor-production-a065.up.railway.app/webhook/dcad3085-73b7-420a-9452-195f5985da92', {
            method: 'POST',
            body: JSON.stringify(payload),
            headers: {
                'Content-Type': 'application/json'
            }
        })

        if (!response.ok) {
            throw new Error(`Webhook request failed: ${response.status}`)
        }

        return c.json({
            message: 'Test event forwarded to webhook',
            success: true
        }, 200)
    } catch (error) {
        console.error('[Test] Error forwarding test event:', error)
        return c.json({
            error: 'Failed to forward test event',
            message: error.message
        }, 500)
    }
})

export default {
    fetch: app.fetch,
    async queue(batch, env, ctx) {
        for (const message of batch.messages) {
            try {
                const event = message.body

                // Forward to external webhook
                const response = await fetch('https://webhook-processor-production-a065.up.railway.app/webhook/dcad3085-73b7-420a-9452-195f5985da92', {
                    method: 'POST',
                    body: JSON.stringify(event),
                    headers: {
                        'Content-Type': 'application/json'
                    }
                })

                if (!response.ok) {
                    throw new Error(`Webhook request failed: ${response.status}`)
                }

                // Acknowledge the message after successful processing
                message.ack()
            } catch (error) {
                console.error('Error processing message:', error)
                // Retry the message if processing fails
                message.retry()
            }
        }
    }
}

async function processCRMEvent(event, env) {
    // TODO: Implement CRM event processing
    console.log('Processing CRM event:', event)
    // This is where we'll add Tinybird integration later
}

async function processOrderEvent(event, env) {
    // TODO: Implement order event processing
    console.log('Processing order event:', event)
    // This is where we'll add Tinybird integration later
} 