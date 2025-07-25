const { knex } = require('../config/database');
const { generateUUID } = require('../config/database');
const AirbyteApiService = require('./airbyteApi');
const WebhookService = require('./webhookService');
const logger = require('../utils/logger');

class TaskExecutionService {
    constructor() {
        this.pollingIntervals = new Map();
        this.maxConcurrentSyncs = parseInt(process.env.MAX_CONCURRENT_SYNCS) || 5;
        this.pollingInterval = parseInt(process.env.SYNC_POLLING_INTERVAL) || 30000;
        this.syncTimeout = parseInt(process.env.SYNC_TIMEOUT) || 3600000; // 1 hour
    }

    // Execute a task with all its connections
    async executeTask(task, execution) {
        try {
            logger.info(`Starting task execution ${execution.execution_id} for task ${task.id}`);

            // Get task connections
            const connections = await knex('task_connections')
                .where('task_id', task.id)
                .where('is_enabled', true)
                .orderBy('execution_order', 'asc')
                .select('*');

            if (connections.length === 0) {
                throw new Error('No enabled connections found for this task');
            }

            // Create Airbyte API service instance
            const user = await knex('users').where('id', task.user_id).first();
            const airbyteService = new AirbyteApiService(user.airbyte_credentials);

            // Execute syncs based on mode
            let syncResults;
            if (task.execution_mode === 'parallel') {
                syncResults = await this.executeParallelSyncs(connections, airbyteService, execution);
            } else {
                syncResults = await this.executeSequentialSyncs(connections, airbyteService, execution);
            }

            // Update execution status
            const overallStatus = this.determineOverallStatus(syncResults);
            await knex('task_executions')
                .where('id', execution.id)
                .update({
                    status: overallStatus,
                    completed_at: new Date(),
                    metadata: { syncResults }
                });

            // Send webhook notification
            if (task.webhook_url) {
                await this.sendWebhookNotification(task, execution, syncResults);
            }

            logger.info(`Task execution ${execution.execution_id} completed with status: ${overallStatus}`);

        } catch (error) {
            logger.error(`Task execution ${execution.execution_id} failed:`, error);

            // Update execution status to failed
            await knex('task_executions')
                .where('id', execution.id)
                .update({
                    status: 'failed',
                    completed_at: new Date(),
                    logs: error.message
                });

            throw error;
        }
    }

    // Execute syncs in parallel
    async executeParallelSyncs(connections, airbyteService, execution) {
        const syncPromises = connections.map(connection =>
            this.executeSingleSync(connection, airbyteService, execution)
        );

        return await Promise.allSettled(syncPromises);
    }

    // Execute syncs sequentially
    async executeSequentialSyncs(connections, airbyteService, execution) {
        const results = [];

        for (const connection of connections) {
            try {
                const result = await this.executeSingleSync(connection, airbyteService, execution);
                results.push(result);
            } catch (error) {
                logger.error(`Sequential sync failed for connection ${connection.connection_id}:`, error);
                results.push({
                    connection_id: connection.connection_id,
                    status: 'failed',
                    error: error.message
                });
            }
        }

        return results;
    }

    // Execute a single sync job
    async executeSingleSync(connection, airbyteService, execution) {
        const syncJobId = generateUUID();

        try {
            logger.info(`Starting sync job ${syncJobId} for connection ${connection.connection_id}`);

            // Create sync job record
            const syncJob = await knex('sync_jobs').insert({
                id: syncJobId,
                execution_id: execution.id,
                connection_id: connection.connection_id,
                airbyte_job_id: null,
                status: 'pending',
                started_at: new Date()
            }).returning('*');

            // Trigger sync in Airbyte
            const airbyteResponse = await airbyteService.triggerSync(connection.connection_id);

            // Update sync job with Airbyte job ID
            await knex('sync_jobs')
                .where('id', syncJobId)
                .update({
                    airbyte_job_id: airbyteResponse.job.id,
                    status: 'running'
                });

            // Poll for completion
            const result = await this.pollSyncCompletion(
                airbyteResponse.job.id,
                airbyteService,
                syncJobId
            );

            return {
                connection_id: connection.connection_id,
                connection_name: connection.connection_name,
                airbyte_job_id: airbyteResponse.job.id,
                status: result.status,
                started_at: result.started_at,
                completed_at: result.completed_at,
                logs: result.logs
            };

        } catch (error) {
            logger.error(`Sync job ${syncJobId} failed:`, error);

            // Update sync job status
            await knex('sync_jobs')
                .where('id', syncJobId)
                .update({
                    status: 'failed',
                    completed_at: new Date(),
                    logs: error.message
                });

            return {
                connection_id: connection.connection_id,
                connection_name: connection.connection_name,
                status: 'failed',
                error: error.message
            };
        }
    }

    // Poll for sync completion
    async pollSyncCompletion(airbyteJobId, airbyteService, syncJobId) {
        const startTime = Date.now();

        return new Promise((resolve, reject) => {
            const pollInterval = setInterval(async () => {
                try {
                    // Check timeout
                    if (Date.now() - startTime > this.syncTimeout) {
                        clearInterval(pollInterval);
                        reject(new Error('Sync timeout exceeded'));
                        return;
                    }

                    // Get job status from Airbyte
                    const jobStatus = await airbyteService.getJobStatus(airbyteJobId);

                    // Update sync job status
                    await knex('sync_jobs')
                        .where('id', syncJobId)
                        .update({
                            status: jobStatus.job.status,
                            completed_at: jobStatus.job.endedAt ? new Date(jobStatus.job.endedAt) : null
                        });

                    // Check if job is complete
                    if (['succeeded', 'failed', 'cancelled'].includes(jobStatus.job.status)) {
                        clearInterval(pollInterval);

                        // Get job logs if failed
                        let logs = null;
                        if (jobStatus.job.status === 'failed') {
                            try {
                                const debugInfo = await airbyteService.getJobLogs(airbyteJobId);
                                logs = debugInfo.logs;
                            } catch (logError) {
                                logger.error('Failed to fetch job logs:', logError);
                            }
                        }

                        resolve({
                            status: jobStatus.job.status,
                            started_at: jobStatus.job.startedAt ? new Date(jobStatus.job.startedAt) : null,
                            completed_at: jobStatus.job.endedAt ? new Date(jobStatus.job.endedAt) : null,
                            logs
                        });
                    }

                } catch (error) {
                    clearInterval(pollInterval);
                    reject(error);
                }
            }, this.pollingInterval);
        });
    }

    // Determine overall execution status
    determineOverallStatus(syncResults) {
        if (syncResults.length === 0) {
            return 'failed';
        }

        const statuses = syncResults.map(result => {
            if (result.status === 'fulfilled') {
                return result.value.status;
            }
            return 'failed';
        });

        if (statuses.every(status => status === 'succeeded')) {
            return 'completed';
        } else if (statuses.some(status => status === 'succeeded')) {
            return 'completed_with_errors';
        } else {
            return 'failed';
        }
    }

    // Send webhook notification
    async sendWebhookNotification(task, execution, syncResults) {
        try {
            const webhookService = new WebhookService();

            const payload = {
                task_id: task.id,
                task_name: task.name,
                execution_id: execution.execution_id,
                started_at: execution.started_at,
                completed_at: execution.completed_at,
                status: execution.status,
                sync_results: syncResults.map(result => {
                    if (result.status === 'fulfilled') {
                        return result.value;
                    }
                    return {
                        status: 'failed',
                        error: result.reason?.message || 'Unknown error'
                    };
                })
            };

            await webhookService.sendWebhook(task.webhook_url, payload, {
                headers: task.webhook_headers,
                auth_type: task.webhook_auth_type,
                auth_credentials: task.webhook_auth_credentials
            });

            logger.info(`Webhook notification sent for execution ${execution.execution_id}`);

        } catch (error) {
            logger.error(`Failed to send webhook notification for execution ${execution.execution_id}:`, error);

            // Store webhook delivery failure
            await knex('webhook_deliveries').insert({
                execution_id: execution.id,
                webhook_url: task.webhook_url,
                payload: JSON.stringify(payload),
                attempts: 1,
                created_at: new Date()
            });
        }
    }

    // Cancel running execution
    async cancelExecution(executionId) {
        try {
            // Get execution details
            const execution = await knex('task_executions')
                .where('execution_id', executionId)
                .first();

            if (!execution) {
                throw new Error('Execution not found');
            }

            if (execution.status !== 'running') {
                throw new Error('Execution is not running');
            }

            // Get running sync jobs
            const runningSyncs = await knex('sync_jobs')
                .where('execution_id', execution.id)
                .whereIn('status', ['pending', 'running'])
                .select('*');

            // Cancel sync jobs in Airbyte
            const user = await knex('users')
                .join('tasks', 'users.id', 'tasks.user_id')
                .where('tasks.id', execution.task_id)
                .select('users.airbyte_credentials')
                .first();

            const airbyteService = new AirbyteApiService(user.airbyte_credentials);

            for (const sync of runningSyncs) {
                if (sync.airbyte_job_id) {
                    try {
                        await airbyteService.cancelJob(sync.airbyte_job_id);

                        await knex('sync_jobs')
                            .where('id', sync.id)
                            .update({
                                status: 'cancelled',
                                completed_at: new Date()
                            });
                    } catch (error) {
                        logger.error(`Failed to cancel sync job ${sync.airbyte_job_id}:`, error);
                    }
                }
            }

            // Update execution status
            await knex('task_executions')
                .where('id', execution.id)
                .update({
                    status: 'cancelled',
                    completed_at: new Date()
                });

            logger.info(`Execution ${executionId} cancelled successfully`);

        } catch (error) {
            logger.error(`Failed to cancel execution ${executionId}:`, error);
            throw error;
        }
    }

    // Get execution details with sync jobs
    async getExecutionDetails(executionId) {
        try {
            const execution = await knex('task_executions')
                .where('execution_id', executionId)
                .first();

            if (!execution) {
                return null;
            }

            const syncJobs = await knex('sync_jobs')
                .where('execution_id', execution.id)
                .orderBy('created_at', 'asc')
                .select('*');

            return {
                ...execution,
                sync_jobs: syncJobs
            };

        } catch (error) {
            logger.error(`Failed to get execution details for ${executionId}:`, error);
            throw error;
        }
    }
}

module.exports = TaskExecutionService; 