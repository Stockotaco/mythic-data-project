const axios = require('axios');
const { knex } = require('../config/database');
const { decryptData } = require('../config/database');
const logger = require('../utils/logger');

class WebhookService {
    constructor() {
        this.timeout = parseInt(process.env.WEBHOOK_TIMEOUT) || 30000;
        this.maxRetries = parseInt(process.env.WEBHOOK_RETRY_ATTEMPTS) || 3;
        this.retryDelay = parseInt(process.env.WEBHOOK_RETRY_DELAY) || 5000;
    }

    // Send webhook with retry logic
    async sendWebhook(url, payload, options = {}) {
        const { headers = {}, auth_type = 'none', auth_credentials = null } = options;

        let attempts = 0;
        let lastError = null;

        while (attempts < this.maxRetries) {
            try {
                attempts++;
                logger.info(`Sending webhook to ${url} (attempt ${attempts}/${this.maxRetries})`);

                const response = await this.makeWebhookRequest(url, payload, headers, auth_type, auth_credentials);

                // Log successful delivery
                logger.info(`Webhook delivered successfully to ${url} (status: ${response.status})`);

                return response;

            } catch (error) {
                lastError = error;
                logger.warn(`Webhook delivery failed (attempt ${attempts}/${this.maxRetries}): ${error.message}`);

                // Don't retry on client errors (4xx)
                if (error.response && error.response.status >= 400 && error.response.status < 500) {
                    logger.error(`Webhook delivery failed permanently (client error): ${error.message}`);
                    break;
                }

                // Wait before retry (except on last attempt)
                if (attempts < this.maxRetries) {
                    await this.sleep(this.retryDelay * attempts); // Exponential backoff
                }
            }
        }

        // All retries failed
        logger.error(`Webhook delivery failed after ${this.maxRetries} attempts: ${lastError.message}`);
        throw lastError;
    }

    // Make the actual HTTP request
    async makeWebhookRequest(url, payload, headers, auth_type, auth_credentials) {
        const config = {
            method: 'POST',
            url,
            timeout: this.timeout,
            headers: {
                'Content-Type': 'application/json',
                'User-Agent': 'Airbyte-Orchestrator/1.0',
                ...headers
            },
            data: payload
        };

        // Add authentication if specified
        if (auth_type !== 'none' && auth_credentials) {
            const credentials = this.getAuthCredentials(auth_type, auth_credentials);

            switch (auth_type) {
                case 'basic':
                    config.auth = credentials;
                    break;
                case 'bearer':
                    config.headers.Authorization = `Bearer ${credentials}`;
                    break;
                case 'header':
                    Object.assign(config.headers, credentials);
                    break;
            }
        }

        const response = await axios(config);
        return response;
    }

    // Get authentication credentials
    getAuthCredentials(auth_type, encrypted_credentials) {
        try {
            const decrypted = decryptData(encrypted_credentials);

            switch (auth_type) {
                case 'basic':
                    return {
                        username: decrypted.username,
                        password: decrypted.password
                    };
                case 'bearer':
                    return decrypted.token;
                case 'header':
                    return decrypted.headers;
                default:
                    return null;
            }
        } catch (error) {
            logger.error('Failed to decrypt webhook credentials:', error);
            throw new Error('Invalid webhook authentication credentials');
        }
    }

    // Process failed webhook deliveries
    async processFailedDeliveries() {
        try {
            const failedDeliveries = await knex('webhook_deliveries')
                .whereNull('delivered_at')
                .where('attempts', '<', this.maxRetries)
                .select('*');

            logger.info(`Processing ${failedDeliveries.length} failed webhook deliveries`);

            for (const delivery of failedDeliveries) {
                try {
                    const payload = JSON.parse(delivery.payload);

                    // Get task details for webhook configuration
                    const task = await knex('tasks')
                        .join('task_executions', 'tasks.id', 'task_executions.task_id')
                        .where('task_executions.id', delivery.execution_id)
                        .select('tasks.webhook_url', 'tasks.webhook_headers', 'tasks.webhook_auth_type', 'tasks.webhook_auth_credentials')
                        .first();

                    if (!task || !task.webhook_url) {
                        logger.warn(`No webhook configuration found for delivery ${delivery.id}`);
                        continue;
                    }

                    // Retry webhook delivery
                    await this.sendWebhook(task.webhook_url, payload, {
                        headers: task.webhook_headers,
                        auth_type: task.webhook_auth_type,
                        auth_credentials: task.webhook_auth_credentials
                    });

                    // Mark as delivered
                    await knex('webhook_deliveries')
                        .where('id', delivery.id)
                        .update({
                            delivered_at: new Date(),
                            status_code: 200
                        });

                } catch (error) {
                    logger.error(`Failed to retry webhook delivery ${delivery.id}:`, error);

                    // Update attempt count
                    await knex('webhook_deliveries')
                        .where('id', delivery.id)
                        .update({
                            attempts: delivery.attempts + 1,
                            response_body: error.message
                        });
                }
            }

        } catch (error) {
            logger.error('Failed to process failed webhook deliveries:', error);
        }
    }

    // Test webhook URL
    async testWebhook(url, payload, options = {}) {
        try {
            logger.info(`Testing webhook URL: ${url}`);

            const response = await this.sendWebhook(url, payload, options);

            return {
                success: true,
                status_code: response.status,
                response_time: response.headers['x-response-time'] || 'unknown'
            };

        } catch (error) {
            return {
                success: false,
                error: error.message,
                status_code: error.response?.status,
                response_body: error.response?.data
            };
        }
    }

    // Validate webhook URL
    validateWebhookUrl(url) {
        try {
            const urlObj = new URL(url);
            return ['http:', 'https:'].includes(urlObj.protocol);
        } catch (error) {
            return false;
        }
    }

    // Get webhook delivery statistics
    async getDeliveryStats(executionId) {
        try {
            const stats = await knex('webhook_deliveries')
                .where('execution_id', executionId)
                .select(
                    knex.raw('COUNT(*) as total_deliveries'),
                    knex.raw('COUNT(CASE WHEN delivered_at IS NOT NULL THEN 1 END) as successful_deliveries'),
                    knex.raw('COUNT(CASE WHEN delivered_at IS NULL THEN 1 END) as failed_deliveries'),
                    knex.raw('AVG(attempts) as avg_attempts')
                )
                .first();

            return stats;

        } catch (error) {
            logger.error(`Failed to get webhook delivery stats for execution ${executionId}:`, error);
            throw error;
        }
    }

    // Sleep utility function
    sleep(ms) {
        return new Promise(resolve => setTimeout(resolve, ms));
    }
}

module.exports = WebhookService; 