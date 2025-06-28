import { createClient } from 'redis';
import dotenv from 'dotenv';

dotenv.config();

class RailwayRedisClient {
    constructor() {
        this.client = null;
        this.isConnected = false;
        this.connectionRetries = 0;
        this.maxRetries = 5;
    }

    async connect() {
        try {
            // Railway provides REDIS_URL automatically
            const redisUrl = process.env.REDIS_URL;

            if (!redisUrl) {
                throw new Error('REDIS_URL environment variable is not set. Make sure you have a Redis service added to your Railway project.');
            }

            console.log('Connecting to Railway Redis...');

            this.client = createClient({
                url: redisUrl,
                socket: {
                    // Railway-specific optimizations
                    connectTimeout: 10000, // 10 seconds
                    lazyConnect: true,
                    keepAlive: 5000,
                    reconnectStrategy: (retries) => {
                        if (retries > this.maxRetries) {
                            console.error('Max Redis reconnection attempts reached');
                            return false;
                        }
                        console.log(`Redis reconnection attempt ${retries}/${this.maxRetries}`);
                        return Math.min(retries * 1000, 5000);
                    }
                }
            });

            // Event listeners for monitoring
            this.client.on('error', (err) => {
                console.error('Redis Client Error:', err);
                this.isConnected = false;
            });

            this.client.on('connect', () => {
                console.log('✅ Connected to Railway Redis successfully!');
                this.isConnected = true;
                this.connectionRetries = 0;
            });

            this.client.on('ready', () => {
                console.log('🚀 Redis client is ready');
                this.isConnected = true;
            });

            this.client.on('end', () => {
                console.log('🔌 Redis connection ended');
                this.isConnected = false;
            });

            this.client.on('reconnecting', () => {
                console.log('🔄 Redis reconnecting...');
                this.isConnected = false;
            });

            await this.client.connect();
            return true;
        } catch (error) {
            console.error('❌ Failed to connect to Railway Redis:', error.message);
            this.isConnected = false;
            return false;
        }
    }

    async disconnect() {
        if (this.client) {
            await this.client.quit();
            this.isConnected = false;
        }
    }

    async ping() {
        if (!this.client?.isReady) {
            throw new Error('Redis client is not connected');
        }
        return await this.client.ping();
    }

    async set(key, value, options = {}) {
        if (!this.client?.isReady) {
            throw new Error('Redis client is not connected');
        }

        const { ttl } = options;
        if (ttl) {
            return await this.client.setEx(key, ttl, value);
        }
        return await this.client.set(key, value);
    }

    async get(key) {
        if (!this.client?.isReady) {
            throw new Error('Redis client is not connected');
        }
        return await this.client.get(key);
    }

    async del(key) {
        if (!this.client?.isReady) {
            throw new Error('Redis client is not connected');
        }
        return await this.client.del(key);
    }

    async keys(pattern = '*') {
        if (!this.client?.isReady) {
            throw new Error('Redis client is not connected');
        }
        return await this.client.keys(pattern);
    }

    async ttl(key) {
        if (!this.client?.isReady) {
            throw new Error('Redis client is not connected');
        }
        return await this.client.ttl(key);
    }

    async expire(key, seconds) {
        if (!this.client?.isReady) {
            throw new Error('Redis client is not connected');
        }
        return await this.client.expire(key, seconds);
    }

    // Railway-specific health check
    async healthCheck() {
        try {
            if (!this.client?.isReady) {
                return {
                    status: 'disconnected',
                    message: 'Redis client is not ready',
                    timestamp: new Date().toISOString()
                };
            }

            const startTime = Date.now();
            const pong = await this.ping();
            const latency = Date.now() - startTime;

            return {
                status: 'healthy',
                message: 'Redis connection is working',
                ping: pong,
                latency: `${latency}ms`,
                timestamp: new Date().toISOString()
            };
        } catch (error) {
            return {
                status: 'unhealthy',
                message: 'Redis health check failed',
                error: error.message,
                timestamp: new Date().toISOString()
            };
        }
    }

    // Get connection info (without sensitive data)
    getConnectionInfo() {
        if (!this.client) {
            return { connected: false };
        }

        const url = process.env.REDIS_URL;
        const urlParts = url ? new URL(url) : null;

        return {
            connected: this.isConnected,
            host: urlParts?.hostname || 'unknown',
            port: urlParts?.port || 'unknown',
            protocol: urlParts?.protocol || 'unknown',
            ready: this.client.isReady || false
        };
    }
}

// Create singleton instance
const redisClient = new RailwayRedisClient();

export default redisClient; 