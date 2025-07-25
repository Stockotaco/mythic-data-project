const express = require('express');
const { knex } = require('../config/database');
const TaskExecutionService = require('../services/taskExecution');
const logger = require('../utils/logger');

const router = express.Router();

// Get authenticateToken middleware from auth routes
const { authenticateToken } = require('./auth');

// Get all executions for the authenticated user
router.get('/', authenticateToken, async (req, res) => {
    try {
        const { page = 1, limit = 20, status, task_id } = req.query;
        const offset = (page - 1) * limit;

        let query = knex('task_executions')
            .join('tasks', 'task_executions.task_id', 'tasks.id')
            .where('tasks.user_id', req.user.id)
            .select(
                'task_executions.*',
                'tasks.name as task_name',
                'tasks.description as task_description'
            )
            .orderBy('task_executions.started_at', 'desc');

        // Apply filters
        if (status) {
            query = query.where('task_executions.status', status);
        }

        if (task_id) {
            query = query.where('task_executions.task_id', task_id);
        }

        // Get total count
        const countQuery = query.clone();
        const totalCount = await countQuery.count('* as count').first();

        // Get paginated results
        const executions = await query.limit(limit).offset(offset);

        // Get sync job counts for each execution
        const executionsWithDetails = await Promise.all(
            executions.map(async (execution) => {
                const syncJobs = await knex('sync_jobs')
                    .where('execution_id', execution.id)
                    .select('status');

                const statusCounts = syncJobs.reduce((acc, job) => {
                    acc[job.status] = (acc[job.status] || 0) + 1;
                    return acc;
                }, {});

                return {
                    ...execution,
                    sync_job_counts: statusCounts,
                    total_sync_jobs: syncJobs.length
                };
            })
        );

        res.json({
            executions: executionsWithDetails,
            pagination: {
                page: parseInt(page),
                limit: parseInt(limit),
                total: parseInt(totalCount.count),
                pages: Math.ceil(totalCount.count / limit)
            }
        });

    } catch (error) {
        logger.error('Failed to get executions:', error);
        res.status(500).json({ error: 'Failed to get executions' });
    }
});

// Get a single execution by ID
router.get('/:executionId', authenticateToken, async (req, res) => {
    try {
        const { executionId } = req.params;

        const execution = await knex('task_executions')
            .join('tasks', 'task_executions.task_id', 'tasks.id')
            .where('task_executions.execution_id', executionId)
            .where('tasks.user_id', req.user.id)
            .select(
                'task_executions.*',
                'tasks.name as task_name',
                'tasks.description as task_description'
            )
            .first();

        if (!execution) {
            return res.status(404).json({ error: 'Execution not found' });
        }

        // Get sync jobs for this execution
        const syncJobs = await knex('sync_jobs')
            .where('execution_id', execution.id)
            .orderBy('created_at', 'asc')
            .select('*');

        // Get webhook deliveries
        const webhookDeliveries = await knex('webhook_deliveries')
            .where('execution_id', execution.id)
            .select('*');

        res.json({
            execution: {
                ...execution,
                sync_jobs: syncJobs,
                webhook_deliveries: webhookDeliveries
            }
        });

    } catch (error) {
        logger.error('Failed to get execution:', error);
        res.status(500).json({ error: 'Failed to get execution' });
    }
});

// Cancel a running execution
router.post('/:executionId/cancel', authenticateToken, async (req, res) => {
    try {
        const { executionId } = req.params;

        // Check if execution exists and belongs to user
        const execution = await knex('task_executions')
            .join('tasks', 'task_executions.task_id', 'tasks.id')
            .where('task_executions.execution_id', executionId)
            .where('tasks.user_id', req.user.id)
            .select('task_executions.*')
            .first();

        if (!execution) {
            return res.status(404).json({ error: 'Execution not found' });
        }

        if (execution.status !== 'running') {
            return res.status(400).json({ error: 'Execution is not running' });
        }

        // Cancel execution
        const executionService = new TaskExecutionService();
        await executionService.cancelExecution(executionId);

        res.json({
            message: 'Execution cancelled successfully'
        });

    } catch (error) {
        logger.error('Failed to cancel execution:', error);
        res.status(500).json({ error: 'Failed to cancel execution' });
    }
});

// Get execution logs
router.get('/:executionId/logs', authenticateToken, async (req, res) => {
    try {
        const { executionId } = req.params;

        // Check if execution exists and belongs to user
        const execution = await knex('task_executions')
            .join('tasks', 'task_executions.task_id', 'tasks.id')
            .where('task_executions.execution_id', executionId)
            .where('tasks.user_id', req.user.id)
            .select('task_executions.*')
            .first();

        if (!execution) {
            return res.status(404).json({ error: 'Execution not found' });
        }

        // Get sync job logs
        const syncJobs = await knex('sync_jobs')
            .where('execution_id', execution.id)
            .select('connection_name', 'logs', 'status', 'started_at', 'completed_at')
            .orderBy('created_at', 'asc');

        res.json({
            execution_logs: execution.logs,
            sync_job_logs: syncJobs
        });

    } catch (error) {
        logger.error('Failed to get execution logs:', error);
        res.status(500).json({ error: 'Failed to get execution logs' });
    }
});

// Get execution statistics
router.get('/:executionId/stats', authenticateToken, async (req, res) => {
    try {
        const { executionId } = req.params;

        // Check if execution exists and belongs to user
        const execution = await knex('task_executions')
            .join('tasks', 'task_executions.task_id', 'tasks.id')
            .where('task_executions.execution_id', executionId)
            .where('tasks.user_id', req.user.id)
            .select('task_executions.*')
            .first();

        if (!execution) {
            return res.status(404).json({ error: 'Execution not found' });
        }

        // Get sync job statistics
        const syncJobStats = await knex('sync_jobs')
            .where('execution_id', execution.id)
            .select(
                knex.raw('COUNT(*) as total_jobs'),
                knex.raw('COUNT(CASE WHEN status = \'succeeded\' THEN 1 END) as successful_jobs'),
                knex.raw('COUNT(CASE WHEN status = \'failed\' THEN 1 END) as failed_jobs'),
                knex.raw('COUNT(CASE WHEN status = \'running\' THEN 1 END) as running_jobs'),
                knex.raw('AVG(EXTRACT(EPOCH FROM (completed_at - started_at))) as avg_duration_seconds')
            )
            .first();

        // Calculate execution duration
        const duration = execution.completed_at
            ? Math.floor((new Date(execution.completed_at) - new Date(execution.started_at)) / 1000)
            : Math.floor((Date.now() - new Date(execution.started_at)) / 1000);

        res.json({
            execution_stats: {
                duration_seconds: duration,
                status: execution.status,
                started_at: execution.started_at,
                completed_at: execution.completed_at
            },
            sync_job_stats: {
                total_jobs: parseInt(syncJobStats.total_jobs),
                successful_jobs: parseInt(syncJobStats.successful_jobs),
                failed_jobs: parseInt(syncJobStats.failed_jobs),
                running_jobs: parseInt(syncJobStats.running_jobs),
                avg_duration_seconds: parseFloat(syncJobStats.avg_duration_seconds) || 0
            }
        });

    } catch (error) {
        logger.error('Failed to get execution stats:', error);
        res.status(500).json({ error: 'Failed to get execution stats' });
    }
});

module.exports = router; 