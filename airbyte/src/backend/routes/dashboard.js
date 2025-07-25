const express = require('express');
const { knex } = require('../config/database');
const logger = require('../utils/logger');

const router = express.Router();

// Get authenticateToken middleware from auth routes
const { authenticateToken } = require('./auth');

// Get dashboard overview
router.get('/overview', authenticateToken, async (req, res) => {
    try {
        const userId = req.user.id;

        // Get task statistics
        const taskStats = await knex('tasks')
            .where('user_id', userId)
            .select(
                knex.raw('COUNT(*) as total_tasks'),
                knex.raw('COUNT(CASE WHEN status = \'active\' THEN 1 END) as active_tasks'),
                knex.raw('COUNT(CASE WHEN status = \'inactive\' THEN 1 END) as inactive_tasks'),
                knex.raw('COUNT(CASE WHEN status = \'paused\' THEN 1 END) as paused_tasks')
            )
            .first();

        // Get execution statistics for the last 30 days
        const thirtyDaysAgo = new Date();
        thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

        const executionStats = await knex('task_executions')
            .join('tasks', 'task_executions.task_id', 'tasks.id')
            .where('tasks.user_id', userId)
            .where('task_executions.started_at', '>=', thirtyDaysAgo)
            .select(
                knex.raw('COUNT(*) as total_executions'),
                knex.raw('COUNT(CASE WHEN task_executions.status = \'completed\' THEN 1 END) as successful_executions'),
                knex.raw('COUNT(CASE WHEN task_executions.status = \'failed\' THEN 1 END) as failed_executions'),
                knex.raw('COUNT(CASE WHEN task_executions.status = \'running\' THEN 1 END) as running_executions'),
                knex.raw('AVG(EXTRACT(EPOCH FROM (task_executions.completed_at - task_executions.started_at))) as avg_duration_seconds')
            )
            .first();

        // Get sync job statistics for the last 30 days
        const syncJobStats = await knex('sync_jobs')
            .join('task_executions', 'sync_jobs.execution_id', 'task_executions.id')
            .join('tasks', 'task_executions.task_id', 'tasks.id')
            .where('tasks.user_id', userId)
            .where('sync_jobs.created_at', '>=', thirtyDaysAgo)
            .select(
                knex.raw('COUNT(*) as total_sync_jobs'),
                knex.raw('COUNT(CASE WHEN sync_jobs.status = \'succeeded\' THEN 1 END) as successful_sync_jobs'),
                knex.raw('COUNT(CASE WHEN sync_jobs.status = \'failed\' THEN 1 END) as failed_sync_jobs'),
                knex.raw('AVG(EXTRACT(EPOCH FROM (sync_jobs.completed_at - sync_jobs.started_at))) as avg_sync_duration_seconds')
            )
            .first();

        // Get recent executions (last 10)
        const recentExecutions = await knex('task_executions')
            .join('tasks', 'task_executions.task_id', 'tasks.id')
            .where('tasks.user_id', userId)
            .select(
                'task_executions.execution_id',
                'task_executions.status',
                'task_executions.started_at',
                'task_executions.completed_at',
                'tasks.name as task_name'
            )
            .orderBy('task_executions.started_at', 'desc')
            .limit(10);

        // Get running executions
        const runningExecutions = await knex('task_executions')
            .join('tasks', 'task_executions.task_id', 'tasks.id')
            .where('tasks.user_id', userId)
            .where('task_executions.status', 'running')
            .select(
                'task_executions.execution_id',
                'task_executions.started_at',
                'tasks.name as task_name'
            )
            .orderBy('task_executions.started_at', 'asc');

        res.json({
            overview: {
                task_stats: {
                    total: parseInt(taskStats.total_tasks),
                    active: parseInt(taskStats.active_tasks),
                    inactive: parseInt(taskStats.inactive_tasks),
                    paused: parseInt(taskStats.paused_tasks)
                },
                execution_stats: {
                    total_last_30_days: parseInt(executionStats.total_executions),
                    successful_last_30_days: parseInt(executionStats.successful_executions),
                    failed_last_30_days: parseInt(executionStats.failed_executions),
                    running: parseInt(executionStats.running_executions),
                    avg_duration_seconds: parseFloat(executionStats.avg_duration_seconds) || 0
                },
                sync_job_stats: {
                    total_last_30_days: parseInt(syncJobStats.total_sync_jobs),
                    successful_last_30_days: parseInt(syncJobStats.successful_sync_jobs),
                    failed_last_30_days: parseInt(syncJobStats.failed_sync_jobs),
                    avg_duration_seconds: parseFloat(syncJobStats.avg_sync_duration_seconds) || 0
                }
            },
            recent_executions: recentExecutions,
            running_executions: runningExecutions
        });

    } catch (error) {
        logger.error('Failed to get dashboard overview:', error);
        res.status(500).json({ error: 'Failed to get dashboard overview' });
    }
});

// Get execution trends (last 7 days)
router.get('/trends', authenticateToken, async (req, res) => {
    try {
        const userId = req.user.id;
        const sevenDaysAgo = new Date();
        sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);

        // Get daily execution counts
        const dailyExecutions = await knex('task_executions')
            .join('tasks', 'task_executions.task_id', 'tasks.id')
            .where('tasks.user_id', userId)
            .where('task_executions.started_at', '>=', sevenDaysAgo)
            .select(
                knex.raw('DATE(task_executions.started_at) as date'),
                knex.raw('COUNT(*) as total'),
                knex.raw('COUNT(CASE WHEN task_executions.status = \'completed\' THEN 1 END) as successful'),
                knex.raw('COUNT(CASE WHEN task_executions.status = \'failed\' THEN 1 END) as failed')
            )
            .groupBy(knex.raw('DATE(task_executions.started_at)'))
            .orderBy('date', 'asc');

        // Get task performance (top 5 most executed tasks)
        const topTasks = await knex('task_executions')
            .join('tasks', 'task_executions.task_id', 'tasks.id')
            .where('tasks.user_id', userId)
            .where('task_executions.started_at', '>=', sevenDaysAgo)
            .select(
                'tasks.name',
                knex.raw('COUNT(*) as execution_count'),
                knex.raw('COUNT(CASE WHEN task_executions.status = \'completed\' THEN 1 END) as successful_count'),
                knex.raw('AVG(EXTRACT(EPOCH FROM (task_executions.completed_at - task_executions.started_at))) as avg_duration_seconds')
            )
            .groupBy('tasks.id', 'tasks.name')
            .orderBy('execution_count', 'desc')
            .limit(5);

        res.json({
            daily_trends: dailyExecutions.map(day => ({
                date: day.date,
                total: parseInt(day.total),
                successful: parseInt(day.successful),
                failed: parseInt(day.failed)
            })),
            top_tasks: topTasks.map(task => ({
                name: task.name,
                execution_count: parseInt(task.execution_count),
                successful_count: parseInt(task.successful_count),
                success_rate: task.execution_count > 0 ? (task.successful_count / task.execution_count * 100).toFixed(2) : 0,
                avg_duration_seconds: parseFloat(task.avg_duration_seconds) || 0
            }))
        });

    } catch (error) {
        logger.error('Failed to get dashboard trends:', error);
        res.status(500).json({ error: 'Failed to get dashboard trends' });
    }
});

// Get system health
router.get('/health', authenticateToken, async (req, res) => {
    try {
        const userId = req.user.id;

        // Check for failed executions in the last hour
        const oneHourAgo = new Date();
        oneHourAgo.setHours(oneHourAgo.getHours() - 1);

        const recentFailures = await knex('task_executions')
            .join('tasks', 'task_executions.task_id', 'tasks.id')
            .where('tasks.user_id', userId)
            .where('task_executions.status', 'failed')
            .where('task_executions.started_at', '>=', oneHourAgo)
            .count('* as count')
            .first();

        // Check for stuck executions (running for more than 2 hours)
        const twoHoursAgo = new Date();
        twoHoursAgo.setHours(twoHoursAgo.getHours() - 2);

        const stuckExecutions = await knex('task_executions')
            .join('tasks', 'task_executions.task_id', 'tasks.id')
            .where('tasks.user_id', userId)
            .where('task_executions.status', 'running')
            .where('task_executions.started_at', '<=', twoHoursAgo)
            .count('* as count')
            .first();

        // Check webhook delivery failures
        const webhookFailures = await knex('webhook_deliveries')
            .join('task_executions', 'webhook_deliveries.execution_id', 'task_executions.id')
            .join('tasks', 'task_executions.task_id', 'tasks.id')
            .where('tasks.user_id', userId)
            .whereNull('webhook_deliveries.delivered_at')
            .where('webhook_deliveries.attempts', '>=', 3)
            .count('* as count')
            .first();

        const healthStatus = {
            overall: 'healthy',
            issues: []
        };

        if (parseInt(recentFailures.count) > 5) {
            healthStatus.overall = 'warning';
            healthStatus.issues.push(`${recentFailures.count} failed executions in the last hour`);
        }

        if (parseInt(stuckExecutions.count) > 0) {
            healthStatus.overall = 'warning';
            healthStatus.issues.push(`${stuckExecutions.count} stuck executions`);
        }

        if (parseInt(webhookFailures.count) > 0) {
            healthStatus.overall = 'warning';
            healthStatus.issues.push(`${webhookFailures.count} webhook delivery failures`);
        }

        if (healthStatus.issues.length > 3) {
            healthStatus.overall = 'critical';
        }

        res.json({
            health: healthStatus,
            metrics: {
                recent_failures: parseInt(recentFailures.count),
                stuck_executions: parseInt(stuckExecutions.count),
                webhook_failures: parseInt(webhookFailures.count)
            }
        });

    } catch (error) {
        logger.error('Failed to get system health:', error);
        res.status(500).json({ error: 'Failed to get system health' });
    }
});

module.exports = router; 