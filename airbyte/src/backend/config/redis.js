const Redis = require('redis');

const redisConfig = {
    host: process.env.REDIS_HOST || 'localhost',
    port: process.env.REDIS_PORT || 6379,
    password: process.env.REDIS_PASSWORD || undefined,
    retry_strategy: (options) => {
        if (options.error && options.error.code === 'ECONNREFUSED') {
            // End reconnecting on a specific error and flush all commands with a individual error
            return new Error('The server refused the connection');
        }
        if (options.total_retry_time > 1000 * 60 * 60) {
            // End reconnecting after a specific timeout and flush all commands with a individual error
            return new Error('Retry time exhausted');
        }
        if (options.attempt > 10) {
            // End reconnecting with built in error
            return undefined;
        }
        // Reconnect after
        return Math.min(options.attempt * 100, 3000);
    },
    max_attempts: 10,
    connect_timeout: 10000,
    command_timeout: 5000,
};

const createRedisClient = () => {
    const client = Redis.createClient(redisConfig);

    client.on('error', (err) => {
        console.error('Redis Client Error:', err);
    });

    client.on('connect', () => {
        console.log('Redis Client Connected');
    });

    client.on('ready', () => {
        console.log('Redis Client Ready');
    });

    client.on('end', () => {
        console.log('Redis Client Disconnected');
    });

    return client;
};

const redisClient = createRedisClient();

// Bull Queue configuration
const bullConfig = {
    redis: {
        host: process.env.REDIS_HOST || 'localhost',
        port: process.env.REDIS_PORT || 6379,
        password: process.env.REDIS_PASSWORD || undefined,
    },
    defaultJobOptions: {
        removeOnComplete: 100,
        removeOnFail: 50,
        attempts: 3,
        backoff: {
            type: 'exponential',
            delay: 2000,
        },
    },
};

module.exports = {
    redisClient,
    bullConfig,
    redisConfig,
    createRedisClient
}; 