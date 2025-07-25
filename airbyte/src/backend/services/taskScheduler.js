const cron = require('node-cron');
const { knex } = require('../config/database');
const { generateUUID } = require('../config/database');
const TaskExecutionService = require('./taskExecution');
const logger = require('../utils/logger');

class TaskScheduler {
    constructor() {
        this.scheduledTasks = new Map();
        this.executionService = new TaskExecutionService();
    }

    // Initialize scheduler and load all active tasks
    async initialize() {
        try {
            logger.info('Initializing task scheduler...');

            // Load all active tasks from database
            const activeTasks = await knex('tasks')
                .where('status', 'active')
                .select('*');

            // Schedule each active task
            for (const task of activeTasks) {
                await this.scheduleTask(task);
            }

            logger.info(`Scheduled ${activeTasks.length} active tasks`);
        } catch (error) {
            logger.error('Failed to initialize task scheduler:', error);
            throw error;
        }
    }

    // Schedule a single task
    async scheduleTask(task) {
        try {
            // Cancel existing schedule if it exists
            this.cancelTask(task.id);

            // Validate cron expression
            if (!cron.validate(task.cron_schedule)) {
                logger.error(`Invalid cron expression for task ${task.id}: ${task.cron_schedule}`);
                return false;
            }

            // Create cron job
            const cronJob = cron.schedule(task.cron_schedule, async () => {
                await this.executeTask(task);
            }, {
                scheduled: false,
                timezone: 'UTC'
            });

            // Store the cron job
            this.scheduledTasks.set(task.id, cronJob);

            // Start the job
            cronJob.start();

            logger.info(`Scheduled task ${task.id} (${task.name}) with cron: ${task.cron_schedule}`);
            return true;
        } catch (error) {
            logger.error(`Failed to schedule task ${task.id}:`, error);
            return false;
        }
    }

    // Execute a task
    async executeTask(task) {
        const executionId = generateUUID();

        try {
            logger.info(`Starting execution ${executionId} for task ${task.id} (${task.name})`);

            // Create execution record
            const execution = await knex('task_executions').insert({
                id: executionId,
                task_id: task.id,
                execution_id: executionId,
                status: 'running',
                started_at: new Date(),
            }).returning('*');

            // Execute the task
            await this.executionService.executeTask(task, execution[0]);

        } catch (error) {
            logger.error(`Failed to execute task ${task.id}:`, error);

            // Update execution status to failed
            await knex('task_executions')
                .where('id', executionId)
                .update({
                    status: 'failed',
                    completed_at: new Date(),
                    logs: error.message,
                });
        }
    }

    // Cancel a scheduled task
    cancelTask(taskId) {
        const cronJob = this.scheduledTasks.get(taskId);
        if (cronJob) {
            cronJob.stop();
            this.scheduledTasks.delete(taskId);
            logger.info(`Cancelled scheduled task ${taskId}`);
        }
    }

    // Update task schedule
    async updateTask(task) {
        try {
            if (task.status === 'active') {
                await this.scheduleTask(task);
            } else {
                this.cancelTask(task.id);
            }

            logger.info(`Updated task ${task.id} schedule`);
        } catch (error) {
            logger.error(`Failed to update task ${task.id}:`, error);
            throw error;
        }
    }

    // Delete task schedule
    deleteTask(taskId) {
        this.cancelTask(taskId);
        logger.info(`Deleted task ${taskId} schedule`);
    }

    // Get all scheduled tasks
    getScheduledTasks() {
        return Array.from(this.scheduledTasks.keys());
    }

    // Get next run time for a task
    getNextRunTime(cronExpression) {
        try {
            if (!cron.validate(cronExpression)) {
                return null;
            }

            // This is a simplified approach - in production you might want to use a more robust library
            const now = new Date();
            const nextRuns = [];

            // Generate next 5 run times
            for (let i = 0; i < 5; i++) {
                const nextRun = cron.getNextDate(cronExpression, now);
                if (nextRun) {
                    nextRuns.push(nextRun);
                    now.setTime(nextRun.getTime() + 1000); // Add 1 second to avoid duplicates
                }
            }

            return nextRuns;
        } catch (error) {
            logger.error('Failed to get next run time:', error);
            return null;
        }
    }

    // Validate cron expression
    validateCronExpression(expression) {
        return cron.validate(expression);
    }

    // Get cron expression description
    getCronDescription(expression) {
        try {
            // This is a simplified description - you might want to use a library like cronstrue
            const parts = expression.split(' ');
            if (parts.length !== 5) {
                return 'Invalid cron expression';
            }

            const [minute, hour, day, month, weekday] = parts;

            let description = '';

            if (minute !== '*' && minute !== '0') {
                description += `At minute ${minute}`;
            }

            if (hour !== '*') {
                description += description ? ` and hour ${hour}` : `At hour ${hour}`;
            }

            if (day !== '*') {
                description += description ? ` and day ${day}` : `On day ${day}`;
            }

            if (month !== '*') {
                description += description ? ` and month ${month}` : `In month ${month}`;
            }

            if (weekday !== '*') {
                description += description ? ` and weekday ${weekday}` : `On weekday ${weekday}`;
            }

            return description || 'Every minute';
        } catch (error) {
            return 'Invalid cron expression';
        }
    }

    // Stop all scheduled tasks
    stop() {
        for (const [taskId, cronJob] of this.scheduledTasks) {
            cronJob.stop();
            logger.info(`Stopped scheduled task ${taskId}`);
        }
        this.scheduledTasks.clear();
    }

    // Restart all scheduled tasks
    async restart() {
        this.stop();
        await this.initialize();
    }
}

module.exports = TaskScheduler; 