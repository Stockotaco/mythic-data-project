const { createTables } = require('./schema');
const logger = require('../utils/logger');

async function runMigrations() {
    try {
        logger.info('Starting database migrations...');

        await createTables();

        logger.info('Database migrations completed successfully');
        process.exit(0);
    } catch (error) {
        logger.error('Database migration failed:', error);
        process.exit(1);
    }
}

// Run migrations if this file is executed directly
if (require.main === module) {
    runMigrations();
}

module.exports = { runMigrations }; 