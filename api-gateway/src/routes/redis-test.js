import { Hono } from 'hono';
import { redis } from '../config/index.js';

const redisTestRouter = new Hono();

// Test basic Redis connection
redisTestRouter.get('/connection', async (c) => {
    try {
        const health = await redis.healthCheck();
        const connectionInfo = redis.getConnectionInfo();

        return c.json({
            status: 'success',
            health,
            connectionInfo,
            timestamp: new Date().toISOString()
        });
    } catch (error) {
        return c.json({
            status: 'error',
            message: error.message,
            timestamp: new Date().toISOString()
        }, 500);
    }
});

// Test basic Redis operations
redisTestRouter.post('/basic', async (c) => {
    try {
        const { key, value, ttl } = await c.req.json();

        if (!key || !value) {
            return c.json({
                status: 'error',
                message: 'Key and value are required'
            }, 400);
        }

        const testKey = `test:${key}`;
        const results = {};

        // Test SET operation
        if (ttl) {
            await redis.set(testKey, value, { ttl: parseInt(ttl) });
            results.set = `Set with TTL ${ttl}s`;
        } else {
            await redis.set(testKey, value);
            results.set = 'Set without TTL';
        }

        // Test GET operation
        const retrievedValue = await redis.get(testKey);
        results.get = retrievedValue;

        // Test TTL operation
        const currentTtl = await redis.ttl(testKey);
        results.ttl = currentTtl;

        // Test KEYS operation
        const keys = await redis.keys(`test:${key}*`);
        results.keys = keys;

        // Clean up
        await redis.del(testKey);
        results.cleanup = 'Deleted test key';

        return c.json({
            status: 'success',
            operations: results,
            timestamp: new Date().toISOString()
        });
    } catch (error) {
        return c.json({
            status: 'error',
            message: error.message,
            timestamp: new Date().toISOString()
        }, 500);
    }
});

// Test TTL operations
redisTestRouter.post('/ttl', async (c) => {
    try {
        const { key, value, ttl } = await c.req.json();

        if (!key || !value || !ttl) {
            return c.json({
                status: 'error',
                message: 'Key, value, and TTL are required'
            }, 400);
        }

        const testKey = `ttl-test:${key}`;
        const results = {};

        // Set with TTL
        await redis.set(testKey, value, { ttl: parseInt(ttl) });
        results.setWithTtl = `Set with TTL ${ttl}s`;

        // Check TTL
        const initialTtl = await redis.ttl(testKey);
        results.initialTtl = initialTtl;

        // Wait a moment and check TTL again
        await new Promise(resolve => setTimeout(resolve, 1000));
        const after1SecondTtl = await redis.ttl(testKey);
        results.after1SecondTtl = after1SecondTtl;

        // Test EXPIRE operation
        const newTtl = 30;
        await redis.expire(testKey, newTtl);
        const updatedTtl = await redis.ttl(testKey);
        results.updatedTtl = updatedTtl;

        // Clean up
        await redis.del(testKey);
        results.cleanup = 'Deleted test key';

        return c.json({
            status: 'success',
            operations: results,
            timestamp: new Date().toISOString()
        });
    } catch (error) {
        return c.json({
            status: 'error',
            message: error.message,
            timestamp: new Date().toISOString()
        }, 500);
    }
});

// Test multiple operations
redisTestRouter.post('/multiple', async (c) => {
    try {
        const { operations } = await c.req.json();

        if (!operations || !Array.isArray(operations)) {
            return c.json({
                status: 'error',
                message: 'Operations array is required'
            }, 400);
        }

        const results = [];
        const testPrefix = `multi-test:${Date.now()}`;

        for (let i = 0; i < operations.length; i++) {
            const op = operations[i];
            const testKey = `${testPrefix}:${i}`;

            try {
                switch (op.type) {
                    case 'set':
                        if (op.ttl) {
                            await redis.set(testKey, op.value, { ttl: parseInt(op.ttl) });
                        } else {
                            await redis.set(testKey, op.value);
                        }
                        results.push({ operation: 'set', key: testKey, success: true });
                        break;

                    case 'get':
                        const value = await redis.get(testKey);
                        results.push({ operation: 'get', key: testKey, value, success: true });
                        break;

                    case 'del':
                        await redis.del(testKey);
                        results.push({ operation: 'del', key: testKey, success: true });
                        break;

                    case 'ttl':
                        const ttl = await redis.ttl(testKey);
                        results.push({ operation: 'ttl', key: testKey, ttl, success: true });
                        break;

                    default:
                        results.push({ operation: op.type, key: testKey, success: false, error: 'Unknown operation' });
                }
            } catch (error) {
                results.push({ operation: op.type, key: testKey, success: false, error: error.message });
            }
        }

        // Clean up all test keys
        const keysToDelete = await redis.keys(`${testPrefix}:*`);
        for (const key of keysToDelete) {
            await redis.del(key);
        }

        return c.json({
            status: 'success',
            operations: results,
            cleanup: `Deleted ${keysToDelete.length} test keys`,
            timestamp: new Date().toISOString()
        });
    } catch (error) {
        return c.json({
            status: 'error',
            message: error.message,
            timestamp: new Date().toISOString()
        }, 500);
    }
});

// Test error handling
redisTestRouter.get('/errors', async (c) => {
    try {
        const results = {};

        // Test operations without connection
        try {
            await redis.disconnect();
            await redis.get('test-key');
            results.disconnectedGet = 'Should have failed';
        } catch (error) {
            results.disconnectedGet = error.message;
        }

        // Reconnect
        await redis.connect();
        results.reconnect = 'Successfully reconnected';

        // Test invalid operations
        try {
            await redis.set('', 'value');
            results.emptyKey = 'Should have failed';
        } catch (error) {
            results.emptyKey = error.message;
        }

        return c.json({
            status: 'success',
            errorTests: results,
            timestamp: new Date().toISOString()
        });
    } catch (error) {
        return c.json({
            status: 'error',
            message: error.message,
            timestamp: new Date().toISOString()
        }, 500);
    }
});

// Test webhook-like operations (similar to actual usage)
redisTestRouter.post('/webhook-simulation', async (c) => {
    try {
        const { webhookId, locationId, pipelineId, pipelineStageId, contactId, type } = await c.req.json();

        const eventId = webhookId || `${Date.now()}-${Math.random().toString(36).substring(2, 11)}`;
        const redisKey = `webhook:${eventId}`;
        const today = new Date().toISOString().split('T')[0];
        const opportunityKey = `opportunity:${locationId}-${pipelineId}-${pipelineStageId}-${contactId}-${today}`;

        const results = {};

        // Simulate webhook deduplication check
        const isDuplicate = await redis.get(redisKey);
        results.webhookDuplicate = isDuplicate ? 'Duplicate detected' : 'No duplicate';

        // Simulate opportunity deduplication check
        const isOpportunityDuplicate = await redis.get(opportunityKey);
        results.opportunityDuplicate = isOpportunityDuplicate ? 'Opportunity duplicate detected' : 'No opportunity duplicate';

        // Store webhook key
        await redis.set(redisKey, 'processed', { ttl: 86400 });
        results.webhookStored = 'Webhook key stored with 24h TTL';

        // Store opportunity key
        await redis.set(opportunityKey, 'processed', { ttl: 86400 });
        results.opportunityStored = 'Opportunity key stored with 24h TTL';

        // Verify storage
        const storedWebhook = await redis.get(redisKey);
        const storedOpportunity = await redis.get(opportunityKey);
        results.verification = {
            webhookStored: !!storedWebhook,
            opportunityStored: !!storedOpportunity
        };

        // Clean up
        await redis.del(redisKey);
        await redis.del(opportunityKey);
        results.cleanup = 'Test keys deleted';

        return c.json({
            status: 'success',
            simulation: results,
            eventId,
            opportunityKey,
            timestamp: new Date().toISOString()
        });
    } catch (error) {
        return c.json({
            status: 'error',
            message: error.message,
            timestamp: new Date().toISOString()
        }, 500);
    }
});

export default redisTestRouter; 