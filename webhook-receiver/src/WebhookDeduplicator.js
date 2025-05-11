export class WebhookDeduplicator {
    constructor(state, env) {
        this.state = state
        this.env = env
        this.seenWebhooks = new Map()
        this.pendingWrites = new Set()
        this.lastFlush = Date.now()
        this.MAX_MEMORY_SIZE = 100000
        this.FLUSH_INTERVAL = 60000
        this.CLEANUP_INTERVAL = 300000 // 5 minutes

        // Adaptive batch processing
        this.batch = []
        this.batchSize = 50
        this.minBatchSize = 10
        this.maxBatchSize = 200
        this.flushInterval = 1000
        this.flushTimeout = null
        this.processing = false
        this.memoryUsage = 0
        this.lastLoadCheck = Date.now()
        this.loadWindow = 60000 // 1 minute window for load calculation
        this.processedInWindow = 0

        // Concurrency control
        this.concurrentBatches = 0
        this.maxConcurrentBatches = 5
        this.pendingBatches = []

        // Batch pooling
        this.batchPool = []
        this.maxPoolSize = 10

        // Metrics
        this.metrics = {
            totalWebhooks: 0,
            processedBatches: 0,
            deduplicated: 0,
            errors: 0,
            lastReset: Date.now(),
            processingTimes: [],
            batchSizes: [],
            concurrencyLevels: [],
            queueDepths: []
        }

        console.log('[Deduplicator] Initializing with max memory size:', this.MAX_MEMORY_SIZE)

        // Initialize from storage
        this.state.blockConcurrencyWhile(async () => {
            await this.initializeFromStorage()
        })
    }

    async initializeFromStorage() {
        try {
            const stored = await this.state.storage.get('seenWebhooks')
            if (stored) {
                this.seenWebhooks = new Map(JSON.parse(stored))
                console.log('[Deduplicator] Loaded', this.seenWebhooks.size, 'webhook IDs from storage')
            }

            // Set alarm to ensure cleanup runs
            this.state.storage.setAlarm(Date.now() + this.CLEANUP_INTERVAL)
        } catch (error) {
            console.error('[Deduplicator] Failed to initialize from storage:', error)
        }
    }

    async fetch(request) {
        const url = new URL(request.url)

        // Add webhook endpoint
        if (url.pathname === '/add') {
            const event = await request.json()
            await this.addToBatch(event)
            return new Response(null, { status: 200 })
        }

        // Check webhook endpoint (legacy)
        if (url.pathname === '/check') {
            const { webhookId } = await request.json()
            const now = Date.now()

            // Check in-memory first
            const timestamp = this.seenWebhooks.get(webhookId)
            if (timestamp && (now - timestamp) < 24 * 60 * 60 * 1000) {
                return new Response(null, { status: 409 }) // Conflict - duplicate
            }

            // Add to memory
            this.seenWebhooks.set(webhookId, now)
            this.pendingWrites.add(webhookId)

            // Clean up old entries if we're approaching memory limit
            if (this.seenWebhooks.size > this.MAX_MEMORY_SIZE * 0.8) {
                this.cleanupOldEntries(now - 24 * 60 * 60 * 1000)
            }

            // Flush to storage periodically
            if (now - this.lastFlush > this.FLUSH_INTERVAL) {
                await this.flushToStorage()
            }

            return new Response(null, { status: 200 })
        }

        // Metrics endpoint
        if (url.pathname === '/metrics') {
            return new Response(JSON.stringify(this.getMetrics()), {
                headers: { 'Content-Type': 'application/json' }
            })
        }

        return new Response('Not found', { status: 404 })
    }

    async addToBatch(event) {
        const now = Date.now()

        // Update load metrics
        if (now - this.lastLoadCheck > this.loadWindow) {
            this.adjustBatchSize()
            this.lastLoadCheck = now
            this.processedInWindow = 0
        }
        this.processedInWindow++

        // Check memory pressure
        if (this.memoryUsage > this.MAX_MEMORY_SIZE) {
            console.warn('[Deduplicator] Memory pressure high, forcing flush')
            await this.triggerFlush()
        }

        this.batch.push(event)
        this.memoryUsage += JSON.stringify(event).length

        if (this.batch.length >= this.batchSize) {
            await this.triggerFlush()
        } else if (!this.flushTimeout) {
            this.flushTimeout = setTimeout(() => this.triggerFlush(), this.flushInterval)
        }
    }

    // Trigger a flush and potentially process multiple batches concurrently
    async triggerFlush() {
        if (this.batch.length === 0) return

        // Prepare the batch for processing
        const batchToProcess = [...this.batch]
        this.batch = []
        this.memoryUsage = 0

        if (this.flushTimeout) {
            clearTimeout(this.flushTimeout)
            this.flushTimeout = null
        }

        // Track queue depth
        this.metrics.queueDepths.push(this.pendingBatches.length)

        // Add to pending batches
        if (this.concurrentBatches >= this.maxConcurrentBatches) {
            // Queue batch for later processing
            this.pendingBatches.push(batchToProcess)
        } else {
            // Process immediately
            this.processBatchConcurrently(batchToProcess)
        }
    }

    // Process a batch with concurrency control
    async processBatchConcurrently(batchToProcess) {
        this.concurrentBatches++
        this.metrics.concurrencyLevels.push(this.concurrentBatches)

        try {
            await this.flushBatch(batchToProcess)
        } finally {
            this.concurrentBatches--

            // Process next batch if any are pending
            if (this.pendingBatches.length > 0) {
                const nextBatch = this.pendingBatches.shift()
                this.processBatchConcurrently(nextBatch)
            }
        }
    }

    async flushBatch(batchToProcess) {
        const startTime = Date.now()
        this.metrics.totalWebhooks += batchToProcess.length
        this.metrics.batchSizes.push(batchToProcess.length)

        try {
            const uniqueEvents = await this.processBatch(batchToProcess)
            this.metrics.deduplicated += (batchToProcess.length - uniqueEvents.length)

            if (uniqueEvents.length > 0) {
                await this.env.EVENTS_QUEUE.send(uniqueEvents)
            }

            this.metrics.processedBatches++
            const processingTime = Date.now() - startTime
            this.metrics.processingTimes.push(processingTime)
        } catch (error) {
            this.metrics.errors++
            console.error('[Deduplicator] Error processing batch:', error)
            // Retry individual events on failure
            for (const event of batchToProcess) {
                try {
                    await this.env.EVENTS_QUEUE.send(event)
                } catch (e) {
                    console.error('[Deduplicator] Failed to retry event:', e)
                }
            }
        }
    }

    adjustBatchSize() {
        const avgProcessingTime = this.metrics.processingTimes.length > 0
            ? this.metrics.processingTimes.reduce((a, b) => a + b, 0) / this.metrics.processingTimes.length
            : 0

        const avgConcurrency = this.metrics.concurrencyLevels.length > 0
            ? this.metrics.concurrencyLevels.reduce((a, b) => a + b, 0) / this.metrics.concurrencyLevels.length
            : 1

        const avgQueueDepth = this.metrics.queueDepths.length > 0
            ? this.metrics.queueDepths.reduce((a, b) => a + b, 0) / this.metrics.queueDepths.length
            : 0

        // Adjust maxConcurrentBatches based on performance
        if (avgProcessingTime < 100 && this.processedInWindow > 1000) {
            // Fast processing, high load - increase concurrency
            this.maxConcurrentBatches = Math.min(10, this.maxConcurrentBatches + 1)
            // Keep batch size moderate
            this.batchSize = Math.min(this.maxBatchSize, Math.floor(this.batchSize * 1.1))
        } else if (avgProcessingTime > 500) {
            // Slow processing - reduce batch size, keep concurrency
            this.batchSize = Math.max(this.minBatchSize, Math.floor(this.batchSize * 0.8))
        } else if (avgQueueDepth > 5) {
            // Growing queue - increase batch size to process more per batch
            this.batchSize = Math.min(this.maxBatchSize, Math.floor(this.batchSize * 1.2))
        } else if (avgQueueDepth === 0 && this.processedInWindow < 100) {
            // Low load - reduce batch size and concurrency
            this.batchSize = Math.max(this.minBatchSize, Math.floor(this.batchSize * 0.9))
            this.maxConcurrentBatches = Math.max(1, this.maxConcurrentBatches - 1)
        }

        // Keep metrics arrays manageable
        if (this.metrics.processingTimes.length > 100) {
            this.metrics.processingTimes = this.metrics.processingTimes.slice(-100)
        }
        if (this.metrics.batchSizes.length > 100) {
            this.metrics.batchSizes = this.metrics.batchSizes.slice(-100)
        }
        if (this.metrics.concurrencyLevels.length > 100) {
            this.metrics.concurrencyLevels = this.metrics.concurrencyLevels.slice(-100)
        }
        if (this.metrics.queueDepths.length > 100) {
            this.metrics.queueDepths = this.metrics.queueDepths.slice(-100)
        }
    }

    async processBatch(events) {
        const uniqueEvents = []
        const seenIds = new Set()
        const now = Date.now()
        const cutoff = now - 24 * 60 * 60 * 1000 // 24 hours ago

        // Clean up old entries first if needed
        if (this.seenWebhooks.size > this.MAX_MEMORY_SIZE * 0.8) {
            this.cleanupOldEntries(cutoff)
        }

        // Pre-filter duplicates within this batch
        const filteredEvents = []
        const batchIds = new Set()

        for (const event of events) {
            if (!event.webhookId) {
                filteredEvents.push(event)
                continue
            }

            if (!batchIds.has(event.webhookId)) {
                batchIds.add(event.webhookId)
                filteredEvents.push(event)
            }
        }

        // Process filtered events
        for (const event of filteredEvents) {
            if (!event.webhookId) {
                uniqueEvents.push(event)
                continue
            }

            // Check in-memory set for this batch
            if (seenIds.has(event.webhookId)) {
                continue
            }

            // Check in main deduplication set
            const timestamp = this.seenWebhooks.get(event.webhookId)
            if (timestamp && timestamp > cutoff) {
                continue
            }

            // Add to deduplication sets
            this.seenWebhooks.set(event.webhookId, now)
            this.pendingWrites.add(event.webhookId)
            uniqueEvents.push(event)
            seenIds.add(event.webhookId)
        }

        // Flush to storage if we have enough pending writes
        if (this.pendingWrites.size > 1000 || now - this.lastFlush > this.FLUSH_INTERVAL) {
            await this.flushToStorage()
        }

        return uniqueEvents
    }

    cleanupOldEntries(cutoff) {
        const initialSize = this.seenWebhooks.size
        for (const [webhookId, timestamp] of this.seenWebhooks.entries()) {
            if (timestamp < cutoff) {
                this.seenWebhooks.delete(webhookId)
                this.pendingWrites.delete(webhookId)
            }
        }
        console.log(`[Deduplicator] Cleanup removed ${initialSize - this.seenWebhooks.size} old entries`)
    }

    getMetrics() {
        const now = Date.now()
        const duration = (now - this.metrics.lastReset) / 1000 // seconds

        // Calculate percentiles for processing times
        const sortedTimes = [...this.metrics.processingTimes].sort((a, b) => a - b)
        const p50 = sortedTimes[Math.floor(sortedTimes.length * 0.5)] || 0
        const p95 = sortedTimes[Math.floor(sortedTimes.length * 0.95)] || 0
        const p99 = sortedTimes[Math.floor(sortedTimes.length * 0.99)] || 0

        // Calculate average concurrency
        const avgConcurrency = this.metrics.concurrencyLevels.length > 0
            ? this.metrics.concurrencyLevels.reduce((a, b) => a + b, 0) / this.metrics.concurrencyLevels.length
            : 0

        // Calculate average queue depth
        const avgQueueDepth = this.metrics.queueDepths.length > 0
            ? this.metrics.queueDepths.reduce((a, b) => a + b, 0) / this.metrics.queueDepths.length
            : 0

        return {
            totalWebhooks: this.metrics.totalWebhooks,
            processedBatches: this.metrics.processedBatches,
            deduplicated: this.metrics.deduplicated,
            errors: this.metrics.errors,
            webhooksPerSecond: this.metrics.totalWebhooks / Math.max(1, duration),
            memoryUsage: this.memoryUsage,
            batchSize: this.batchSize,
            seenWebhooks: this.seenWebhooks.size,
            pendingWrites: this.pendingWrites.size,
            processingTime: {
                p50,
                p95,
                p99,
                avg: this.metrics.processingTimes.reduce((a, b) => a + b, 0) / this.metrics.processingTimes.length || 0
            },
            currentLoad: this.processedInWindow / (this.loadWindow / 1000), // webhooks per second
            concurrency: {
                current: this.concurrentBatches,
                max: this.maxConcurrentBatches,
                avg: avgConcurrency
            },
            queue: {
                current: this.pendingBatches.length,
                avg: avgQueueDepth
            }
        }
    }

    async flushToStorage() {
        if (this.pendingWrites.size === 0) {
            return
        }

        try {
            // Convert Map to array of [key, value] pairs for storage
            const data = Array.from(this.seenWebhooks.entries())
            await this.state.storage.put('seenWebhooks', JSON.stringify(data))
            this.pendingWrites.clear()
            this.lastFlush = Date.now()
        } catch (error) {
            console.error('[Deduplicator] Storage flush failed:', error)
            // If flush fails, we'll try again on the next interval
        }
    }

    async alarm() {
        console.log('[Deduplicator] Alarm triggered, performing cleanup and flush')
        // Clean up old entries and flush to storage
        this.cleanupOldEntries(Date.now() - 24 * 60 * 60 * 1000)
        await this.flushToStorage()

        // Reset the alarm
        this.state.storage.setAlarm(Date.now() + this.CLEANUP_INTERVAL)
    }
} 