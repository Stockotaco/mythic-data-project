const express = require('express');
const Joi = require('joi');
const WebhookService = require('../services/webhookService');
const logger = require('../utils/logger');

const router = express.Router();

// Get authenticateToken middleware from auth routes
const { authenticateToken } = require('./auth');

// Validation schema for webhook test
const testWebhookSchema = Joi.object({
    url: Joi.string().uri().required(),
    payload: Joi.object().default({}),
    headers: Joi.object().optional(),
    auth_type: Joi.string().valid('none', 'basic', 'bearer', 'header').default('none'),
    auth_credentials: Joi.object().optional()
});

// Test webhook URL
router.post('/test', authenticateToken, async (req, res) => {
    try {
        // Validate request body
        const { error, value } = testWebhookSchema.validate(req.body);
        if (error) {
            return res.status(400).json({ error: error.details[0].message });
        }

        const { url, payload, headers, auth_type, auth_credentials } = value;

        // Validate webhook URL
        const webhookService = new WebhookService();
        if (!webhookService.validateWebhookUrl(url)) {
            return res.status(400).json({ error: 'Invalid webhook URL' });
        }

        // Create test payload
        const testPayload = {
            ...payload,
            test: true,
            timestamp: new Date().toISOString(),
            message: 'This is a test webhook from Airbyte Orchestrator'
        };

        // Test webhook delivery
        const result = await webhookService.testWebhook(url, testPayload, {
            headers,
            auth_type,
            auth_credentials
        });

        if (result.success) {
            res.json({
                message: 'Webhook test successful',
                result
            });
        } else {
            res.status(400).json({
                message: 'Webhook test failed',
                result
            });
        }

    } catch (error) {
        logger.error('Failed to test webhook:', error);
        res.status(500).json({ error: 'Failed to test webhook' });
    }
});

// Validate webhook URL
router.post('/validate', authenticateToken, async (req, res) => {
    try {
        const { url } = req.body;

        if (!url) {
            return res.status(400).json({ error: 'URL is required' });
        }

        const webhookService = new WebhookService();
        const isValid = webhookService.validateWebhookUrl(url);

        res.json({
            valid: isValid,
            message: isValid ? 'URL is valid' : 'Invalid webhook URL'
        });

    } catch (error) {
        logger.error('Failed to validate webhook URL:', error);
        res.status(500).json({ error: 'Failed to validate webhook URL' });
    }
});

// Get webhook delivery statistics for an execution
router.get('/deliveries/:executionId', authenticateToken, async (req, res) => {
    try {
        const { executionId } = req.params;

        const webhookService = new WebhookService();
        const stats = await webhookService.getDeliveryStats(executionId);

        res.json({
            stats
        });

    } catch (error) {
        logger.error('Failed to get webhook delivery stats:', error);
        res.status(500).json({ error: 'Failed to get webhook delivery statistics' });
    }
});

// Retry failed webhook deliveries
router.post('/deliveries/retry', authenticateToken, async (req, res) => {
    try {
        const webhookService = new WebhookService();
        await webhookService.processFailedDeliveries();

        res.json({
            message: 'Failed webhook deliveries processed'
        });

    } catch (error) {
        logger.error('Failed to retry webhook deliveries:', error);
        res.status(500).json({ error: 'Failed to retry webhook deliveries' });
    }
});

module.exports = router; 