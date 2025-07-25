const knex = require('knex');
const { v4: uuidv4 } = require('uuid');

const config = {
    client: 'postgresql',
    connection: {
        host: process.env.DB_HOST || 'localhost',
        port: process.env.DB_PORT || 5432,
        user: process.env.DB_USER || 'postgres',
        password: process.env.DB_PASSWORD || '',
        database: process.env.DB_NAME || 'airbyte_orchestrator',
    },
    pool: {
        min: 2,
        max: 10,
        acquireTimeoutMillis: 30000,
        createTimeoutMillis: 30000,
        destroyTimeoutMillis: 5000,
        idleTimeoutMillis: 30000,
        reapIntervalMillis: 1000,
        createRetryIntervalMillis: 100,
    },
    migrations: {
        directory: './migrations',
        tableName: 'knex_migrations',
    },
    seeds: {
        directory: './seeds',
    },
    debug: process.env.NODE_ENV === 'development',
};

const db = knex(config);

// Add UUID generation function
db.raw('CREATE EXTENSION IF NOT EXISTS "uuid-ossp"').catch(() => {
    // Extension might already exist
});

// Helper function to generate UUIDs
const generateUUID = () => uuidv4();

// Helper function to encrypt sensitive data
const encryptData = (data) => {
    // In production, use a proper encryption library like crypto-js
    // For now, we'll use a simple base64 encoding as placeholder
    return Buffer.from(JSON.stringify(data)).toString('base64');
};

// Helper function to decrypt sensitive data
const decryptData = (encryptedData) => {
    try {
        const decoded = Buffer.from(encryptedData, 'base64').toString();
        return JSON.parse(decoded);
    } catch (error) {
        console.error('Error decrypting data:', error);
        return null;
    }
};

module.exports = {
    knex: db,
    generateUUID,
    encryptData,
    decryptData,
    config
}; 