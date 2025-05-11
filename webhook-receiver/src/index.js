import { Hono } from 'hono'
import { HTTPException } from 'hono/http-exception'
import { HIGHLEVEL_CONFIG } from './highlevel-config.js'
import crypto from 'node:crypto'
import { WebhookDeduplicator } from './WebhookDeduplicator.js'

const app = new Hono()

// Constants for better readability and maintenance
const SIGNATURE_HEADER = 'x-wh-signature'
const MAX_MEMORY_MB = 100 // Maximum memory usage in MB

// Thread-local verification cache (avoid key parsing on every request)
let verifierKey = null

// Fast path verification with streaming
async function verifySignatureStreaming(c, signature) {
    // Initialize public key only once (cached)
    if (!verifierKey) {
        verifierKey = crypto.createPublicKey(HIGHLEVEL_CONFIG.WEBHOOK_PUBLIC_KEY)
    }

    const verifier = crypto.createVerify('SHA256')
    const bodyChunks = []
    let totalSize = 0

    // Process in streaming fashion
    for await (const chunk of c.req.raw.body) {
        // Fast path for binary data
        const uint8Chunk = new Uint8Array(chunk)

        // Process verification in parallel with body handling
        verifier.update(uint8Chunk)
        bodyChunks.push(uint8Chunk)

        // Track size for limits
        totalSize += uint8Chunk.length

        // Early termination for oversized requests
        if (totalSize > MAX_MEMORY_MB * 1024 * 1024) {
            throw new Error('Request body too large')
        }
    }

    // Verify the signature
    const isValid = verifier.verify(verifierKey, signature, 'base64')

    // For valid signatures, convert body chunks to JSON
    // Skip this work for invalid signatures
    if (!isValid) {
        return { isValid, body: null }
    }

    // Efficient concatenation of chunks
    const bodyBuffer = new Uint8Array(totalSize)
    let offset = 0
    for (const chunk of bodyChunks) {
        bodyBuffer.set(chunk, offset)
        offset += chunk.length
    }

    // Parse JSON only if signature is valid
    const body = new TextDecoder().decode(bodyBuffer)
    return { isValid, body }
}

// Middleware to verify webhook signatures with streaming
async function verifyWebhook(c, next) {
    // Fast early rejection
    const signature = c.req.header(SIGNATURE_HEADER)
    if (!signature) {
        console.error('[Webhook] Missing signature header')
        return c.json({ error: 'Missing signature header' }, 401)
    }

    try {
        const { isValid, body } = await verifySignatureStreaming(c, signature)

        if (!isValid) {
            console.error('[Webhook] Invalid webhook signature')
            return c.json({ error: 'Invalid signature' }, 401)
        }

        // Only parse JSON if signature is valid
        c.set('webhookBody', JSON.parse(body))
        await next()
    } catch (error) {
        console.error('[Webhook] Verification error:', error)
        return c.json({
            error: 'Verification error',
            message: error.message
        }, 500)
    }
}

// Health check endpoint
app.get('/', (c) => {
    return c.json({ status: 'ok' })
})

// Metrics endpoint with caching
let lastMetrics = null
let lastMetricsTime = 0
const METRICS_CACHE_TTL = 5000 // 5 seconds

app.get('/metrics', async (c) => {
    const now = Date.now()

    // Return cached metrics if available and not expired
    if (lastMetrics && now - lastMetricsTime < METRICS_CACHE_TTL) {
        return c.json(lastMetrics)
    }

    try {
        const id = c.env.WEBHOOK_DEDUP.idFromName('metrics')
        const stub = c.env.WEBHOOK_DEDUP.get(id)
        const response = await stub.fetch('https://internal/metrics')

        if (!response.ok) {
            throw new Error(`Metrics fetch failed: ${response.status}`)
        }

        lastMetrics = await response.json()
        lastMetricsTime = now

        return c.json(lastMetrics)
    } catch (error) {
        console.error('[Metrics] Error fetching metrics:', error)
        // Return default metrics structure if there's an error
        return c.json({
            totalWebhooks: 0,
            processedBatches: 0,
            deduplicated: 0,
            errors: 0,
            webhooksPerSecond: 0,
            memoryUsage: 0,
            batchSize: 50,
            seenWebhooks: 0,
            pendingWrites: 0,
            processingTime: {
                p50: 0,
                p95: 0,
                p99: 0,
                avg: 0
            },
            currentLoad: 0,
            status: 'initializing'
        })
    }
})

// Advanced sharding strategy
function getShardId(webhookId, env) {
    if (!webhookId) return env.WEBHOOK_DEDUP.idFromName('default')

    // Use consistent hashing for better distribution
    // Take full ID into account, not just prefix
    const hash = crypto.createHash('sha1').update(webhookId).digest('hex')
    const shardIndex = parseInt(hash.substring(0, 8), 16) % 256
    return env.WEBHOOK_DEDUP.idFromName(`shard-${shardIndex}`)
}

// Single webhook endpoint with advanced sharding
app.post('/events', verifyWebhook, async (c) => {
    try {
        const event = c.get('webhookBody')

        // Get shard using consistent hashing
        const id = getShardId(event.webhookId, c.env)
        const stub = c.env.WEBHOOK_DEDUP.get(id)

        // Fast path - use streaming for body transmission
        const response = await stub.fetch('https://internal/add', {
            method: 'POST',
            body: JSON.stringify(event),
            headers: {
                'Content-Type': 'application/json'
            }
        })

        if (!response.ok) {
            throw new Error(`Deduplication failed: ${response.status}`)
        }

        return c.json({
            message: 'Webhook received',
            success: true,
            webhookId: event.webhookId
        }, 200)
    } catch (error) {
        console.error('[Queue] Error processing webhook:', error)
        return c.json({
            error: 'Failed to process webhook',
            message: error.message,
            webhookId: event?.webhookId
        }, 500)
    }
})

// Test endpoint that queues events for consumer
app.post('/events-test', async (c) => {
    try {
        const payload = await c.req.json()

        // Queue the event for processing
        await c.env.EVENTS_QUEUE.send(payload)

        return c.json({
            message: 'Test event queued for processing',
            success: true
        }, 200)
    } catch (error) {
        console.error('[Test] Error queueing test event:', error)
        return c.json({
            error: 'Failed to queue test event',
            message: error.message
        }, 500)
    }
})

// Error handling middleware
app.onError((err, c) => {
    if (err instanceof HTTPException) {
        return c.json({ error: err.message }, err.status)
    }
    console.error('Unhandled error:', err)
    return c.json({ error: 'Internal server error' }, 500)
})

export { WebhookDeduplicator }
export default {
    fetch: app.fetch,
    async scheduled(event, env, ctx) {
        console.log('[Scheduled] Running cleanup task')
        // The cleanup is handled by the Durable Object's alarm
        return new Response('Cleanup scheduled')
    }
} 