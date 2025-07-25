const express = require('express');
const Joi = require('joi');
const cron = require('node-cron');
const { knex } = require('../config/database');
const { generateUUID } = require('../config/database');
const AirbyteApiService = require('../services/airbyteApi');
const TaskScheduler = require('../services/taskScheduler');
const TaskExecutionService = require('../services/taskExecution');
const logger = require('../utils/logger');

const router = express.Router();

// Get authenticateToken middleware from auth routes
const { authenticateToken } = require('./auth');

// Validation schemas
const createTaskSchema = Joi.object({
    name: Joi.string().min(1).max(100).required(),
    description: Joi.string().max(500).optional(),
    workspace_id: Joi.string().required(),
    cron_schedule: Joi.string().required(),
    webhook_url: Joi.string().uri().optional(),
    webhook_headers: Joi.object().optional(),
    webhook_auth_type: Joi.string().valid('none', 'basic', 'bearer', 'header').default('none'),
    webhook_auth_credentials: Joi.object().optional(),
    execution_mode: Joi.string().valid('sequential', 'parallel').default('sequential'),
    timeout_minutes: Joi.number().integer().min(1).max(1440).default(60),
    retry_attempts: Joi.number().integer().min(0).max(10).default(3),
    connections: Joi.array().items(
        Joi.object({
            connection_id: Joi.string().required(),
            connection_name: Joi.string().required(),
            source_name: Joi.string().optional(),
            destination_name: Joi.string().optional(),
            execution_order: Joi.number().integer().min(0).default(0),
            is_enabled: Joi.boolean().default(true)
        })
    ).min(1).required()
});

const updateTaskSchema = Joi.object({
    name: Joi.string().min(1).max(100).optional(),
    description: Joi.string().max(500).optional(),
    cron_schedule: Joi.string().optional(),
    webhook_url: Joi.string().uri().optional(),
    webhook_headers: Joi.object().optional(),
    webhook_auth_type: Joi.string().valid('none', 'basic', 'bearer', 'header').optional(),
    webhook_auth_credentials: Joi.object().optional(),
    execution_mode: Joi.string().valid('sequential', 'parallel').optional(),
    timeout_minutes: Joi.number().integer().min(1).max(1440).optional(),
    retry_attempts: Joi.number().integer().min(0).max(10).optional(),
    status: Joi.string().valid('active', 'inactive', 'paused').optional(),
    connections: Joi.array().items(
        Joi.object({
            connection_id: Joi.string().required(),
            connection_name: Joi.string().required(),
            source_name: Joi.string().optional(),
            destination_name: Joi.string().optional(),
            execution_order: Joi.number().integer().min(0).default(0),
            is_enabled: Joi.boolean().default(true)
        })
    ).optional()
});

// Get all tasks for the authenticated user
router.get('/', authenticateToken, async (req, res) => {
    try {
        const { page = 1, limit = 10, status, search } = req.query;
        const offset = (page - 1) * limit;

        let query = knex('tasks')
            .where('user_id', req.user.id)
            .select('*')
            .orderBy('created_at', 'desc');

        // Apply filters
        if (status) {
            query = query.where('status', status);
        }

        if (search) {
            query = query.where(function () {
                this.where('name', 'ilike', `%${search}%`)
                    .orWhere('description', 'ilike', `%${search}%`);
            });
        }

        // Get total count
        const countQuery = query.clone();
        const totalCount = await countQuery.count('* as count').first();

        // Get paginated results
        const tasks = await query.limit(limit).offset(offset);

        // Get connection counts for each task
        const tasksWithConnections = await Promise.all(
            tasks.map(async (task) => {
                const connectionCount = await knex('task_connections')
                    .where('task_id', task.id)
                    .count('* as count')
                    .first();

                const lastExecution = await knex('task_executions')
                    .where('task_id', task.id)
                    .orderBy('started_at', 'desc')
                    .first();

                return {
                    ...task,
                    connection_count: parseInt(connectionCount.count),
                    last_execution: lastExecution ? {
                        id: lastExecution.execution_id,
                        status: lastExecution.status,
                        started_at: lastExecution.started_at,
                        completed_at: lastExecution.completed_at
                    } : null
                };
            })
        );

        res.json({
            tasks: tasksWithConnections,
            pagination: {
                page: parseInt(page),
                limit: parseInt(limit),
                total: parseInt(totalCount.count),
                pages: Math.ceil(totalCount.count / limit)
            }
        });

    } catch (error) {
        logger.error('Failed to get tasks:', error);
        res.status(500).json({ error: 'Failed to get tasks' });
    }
});

// Get a single task by ID
router.get('/:taskId', authenticateToken, async (req, res) => {
    try {
        const { taskId } = req.params;

        const task = await knex('tasks')
            .where('id', taskId)
            .where('user_id', req.user.id)
            .first();

        if (!task) {
            return res.status(404).json({ error: 'Task not found' });
        }

        // Get task connections
        const connections = await knex('task_connections')
            .where('task_id', taskId)
            .orderBy('execution_order', 'asc')
            .select('*');

        // Get recent executions
        const executions = await knex('task_executions')
            .where('task_id', taskId)
            .orderBy('started_at', 'desc')
            .limit(10)
            .select('*');

        res.json({
            task: {
                ...task,
                connections,
                recent_executions: executions
            }
        });

    } catch (error) {
        logger.error('Failed to get task:', error);
        res.status(500).json({ error: 'Failed to get task' });
    }
});

// Create a new task
router.post('/', authenticateToken, async (req, res) => {
    try {
        // Validate request body
        const { error, value } = createTaskSchema.validate(req.body);
        if (error) {
            return res.status(400).json({ error: error.details[0].message });
        }

        const {
            name,
            description,
            workspace_id,
            cron_schedule,
            webhook_url,
            webhook_headers,
            webhook_auth_type,
            webhook_auth_credentials,
            execution_mode,
            timeout_minutes,
            retry_attempts,
            connections
        } = value;

        // Validate cron expression
        if (!cron.validate(cron_schedule)) {
            return res.status(400).json({ error: 'Invalid cron expression' });
        }

        // Validate workspace exists and user has access
        const user = await knex('users').where('id', req.user.id).first();
        const airbyteService = new AirbyteApiService(user.airbyte_credentials);

        try {
            const workspaces = await airbyteService.getWorkspaces();
            const workspaceExists = workspaces.some(w => w.workspaceId === workspace_id);

            if (!workspaceExists) {
                return res.status(400).json({ error: 'Workspace not found or access denied' });
            }
        } catch (airbyteError) {
            return res.status(400).json({ error: 'Failed to validate workspace access' });
        }

        // Create task
        const taskId = generateUUID();
        const task = await knex('tasks').insert({
            id: taskId,
            user_id: req.user.id,
            name,
            description,
            workspace_id,
            cron_schedule,
            webhook_url,
            webhook_headers,
            webhook_auth_type,
            webhook_auth_credentials: webhook_auth_credentials ? JSON.stringify(webhook_auth_credentials) : null,
            execution_mode,
            timeout_minutes,
            retry_attempts,
            status: 'inactive'
        }).returning('*');

        // Create task connections
        const taskConnections = connections.map(conn => ({
            id: generateUUID(),
            task_id: taskId,
            connection_id: conn.connection_id,
            connection_name: conn.connection_name,
            source_name: conn.source_name,
            destination_name: conn.destination_name,
            execution_order: conn.execution_order,
            is_enabled: conn.is_enabled
        }));

        await knex('task_connections').insert(taskConnections);

        logger.info(`Task created: ${name} by user ${req.user.email}`);

        res.status(201).json({
            message: 'Task created successfully',
            task: task[0]
        });

    } catch (error) {
        logger.error('Failed to create task:', error);
        res.status(500).json({ error: 'Failed to create task' });
    }
});

// Update a task
router.put('/:taskId', authenticateToken, async (req, res) => {
    try {
        const { taskId } = req.params;

        // Validate request body
        const { error, value } = updateTaskSchema.validate(req.body);
        if (error) {
            return res.status(400).json({ error: error.details[0].message });
        }

        // Check if task exists and belongs to user
        const existingTask = await knex('tasks')
            .where('id', taskId)
            .where('user_id', req.user.id)
            .first();

        if (!existingTask) {
            return res.status(404).json({ error: 'Task not found' });
        }

        // Validate cron expression if provided
        if (value.cron_schedule && !cron.validate(value.cron_schedule)) {
            return res.status(400).json({ error: 'Invalid cron expression' });
        }

        // Update task
        const updateData = {
            updated_at: new Date()
        };

        Object.keys(value).forEach(key => {
            if (key !== 'connections' && value[key] !== undefined) {
                if (key === 'webhook_auth_credentials' && value[key]) {
                    updateData[key] = JSON.stringify(value[key]);
                } else {
                    updateData[key] = value[key];
                }
            }
        });

        const updatedTask = await knex('tasks')
            .where('id', taskId)
            .update(updateData)
            .returning('*');

        // Update connections if provided
        if (value.connections) {
            // Delete existing connections
            await knex('task_connections').where('task_id', taskId).del();

            // Create new connections
            const taskConnections = value.connections.map(conn => ({
                id: generateUUID(),
                task_id: taskId,
                connection_id: conn.connection_id,
                connection_name: conn.connection_name,
                source_name: conn.source_name,
                destination_name: conn.destination_name,
                execution_order: conn.execution_order,
                is_enabled: conn.is_enabled
            }));

            await knex('task_connections').insert(taskConnections);
        }

        // Update scheduler if status changed
        if (value.status && value.status !== existingTask.status) {
            const taskScheduler = new TaskScheduler();
            await taskScheduler.updateTask(updatedTask[0]);
        }

        logger.info(`Task updated: ${taskId} by user ${req.user.email}`);

        res.json({
            message: 'Task updated successfully',
            task: updatedTask[0]
        });

    } catch (error) {
        logger.error('Failed to update task:', error);
        res.status(500).json({ error: 'Failed to update task' });
    }
});

// Delete a task
router.delete('/:taskId', authenticateToken, async (req, res) => {
    try {
        const { taskId } = req.params;

        // Check if task exists and belongs to user
        const task = await knex('tasks')
            .where('id', taskId)
            .where('user_id', req.user.id)
            .first();

        if (!task) {
            return res.status(404).json({ error: 'Task not found' });
        }

        // Check if task is currently running
        const runningExecution = await knex('task_executions')
            .where('task_id', taskId)
            .where('status', 'running')
            .first();

        if (runningExecution) {
            return res.status(400).json({ error: 'Cannot delete task while it is running' });
        }

        // Remove from scheduler
        const taskScheduler = new TaskScheduler();
        taskScheduler.deleteTask(taskId);

        // Delete task (cascades to connections and executions)
        await knex('tasks').where('id', taskId).del();

        logger.info(`Task deleted: ${taskId} by user ${req.user.email}`);

        res.json({
            message: 'Task deleted successfully'
        });

    } catch (error) {
        logger.error('Failed to delete task:', error);
        res.status(500).json({ error: 'Failed to delete task' });
    }
});

// Run task immediately
router.post('/:taskId/run', authenticateToken, async (req, res) => {
    try {
        const { taskId } = req.params;

        // Check if task exists and belongs to user
        const task = await knex('tasks')
            .where('id', taskId)
            .where('user_id', req.user.id)
            .first();

        if (!task) {
            return res.status(404).json({ error: 'Task not found' });
        }

        // Check if task is already running
        const runningExecution = await knex('task_executions')
            .where('task_id', taskId)
            .where('status', 'running')
            .first();

        if (runningExecution) {
            return res.status(400).json({
                error: 'Task is already running',
                execution_id: runningExecution.execution_id
            });
        }

        // Execute task
        const executionService = new TaskExecutionService();
        const executionId = generateUUID();

        const execution = await knex('task_executions').insert({
            id: executionId,
            task_id: taskId,
            execution_id: executionId,
            status: 'running',
            started_at: new Date()
        }).returning('*');

        // Execute task asynchronously
        executionService.executeTask(task, execution[0]).catch(error => {
            logger.error(`Manual task execution failed for task ${taskId}:`, error);
        });

        logger.info(`Manual task execution started: ${taskId} by user ${req.user.email}`);

        res.json({
            message: 'Task execution started',
            execution_id: executionId
        });

    } catch (error) {
        logger.error('Failed to run task:', error);
        res.status(500).json({ error: 'Failed to run task' });
    }
});

// Toggle task status
router.put('/:taskId/toggle', authenticateToken, async (req, res) => {
    try {
        const { taskId } = req.params;

        // Check if task exists and belongs to user
        const task = await knex('tasks')
            .where('id', taskId)
            .where('user_id', req.user.id)
            .first();

        if (!task) {
            return res.status(404).json({ error: 'Task not found' });
        }

        // Toggle status
        const newStatus = task.status === 'active' ? 'inactive' : 'active';

        const updatedTask = await knex('tasks')
            .where('id', taskId)
            .update({
                status: newStatus,
                updated_at: new Date()
            })
            .returning('*');

        // Update scheduler
        const taskScheduler = new TaskScheduler();
        await taskScheduler.updateTask(updatedTask[0]);

        logger.info(`Task status toggled: ${taskId} to ${newStatus} by user ${req.user.email}`);

        res.json({
            message: `Task ${newStatus === 'active' ? 'activated' : 'deactivated'} successfully`,
            task: updatedTask[0]
        });

    } catch (error) {
        logger.error('Failed to toggle task status:', error);
        res.status(500).json({ error: 'Failed to toggle task status' });
    }
});

// Duplicate a task
router.post('/:taskId/duplicate', authenticateToken, async (req, res) => {
    try {
        const { taskId } = req.params;
        const { name } = req.body;

        if (!name) {
            return res.status(400).json({ error: 'Name is required for duplicated task' });
        }

        // Check if task exists and belongs to user
        const task = await knex('tasks')
            .where('id', taskId)
            .where('user_id', req.user.id)
            .first();

        if (!task) {
            return res.status(404).json({ error: 'Task not found' });
        }

        // Get task connections
        const connections = await knex('task_connections')
            .where('task_id', taskId)
            .select('*');

        // Create new task
        const newTaskId = generateUUID();
        const newTask = await knex('tasks').insert({
            id: newTaskId,
            user_id: req.user.id,
            name: `${name} (Copy)`,
            description: task.description,
            workspace_id: task.workspace_id,
            cron_schedule: task.cron_schedule,
            webhook_url: task.webhook_url,
            webhook_headers: task.webhook_headers,
            webhook_auth_type: task.webhook_auth_type,
            webhook_auth_credentials: task.webhook_auth_credentials,
            execution_mode: task.execution_mode,
            timeout_minutes: task.timeout_minutes,
            retry_attempts: task.retry_attempts,
            status: 'inactive' // Always start as inactive
        }).returning('*');

        // Duplicate connections
        const newConnections = connections.map(conn => ({
            id: generateUUID(),
            task_id: newTaskId,
            connection_id: conn.connection_id,
            connection_name: conn.connection_name,
            source_name: conn.source_name,
            destination_name: conn.destination_name,
            execution_order: conn.execution_order,
            is_enabled: conn.is_enabled
        }));

        await knex('task_connections').insert(newConnections);

        logger.info(`Task duplicated: ${taskId} to ${newTaskId} by user ${req.user.email}`);

        res.status(201).json({
            message: 'Task duplicated successfully',
            task: newTask[0]
        });

    } catch (error) {
        logger.error('Failed to duplicate task:', error);
        res.status(500).json({ error: 'Failed to duplicate task' });
    }
});

module.exports = router; 