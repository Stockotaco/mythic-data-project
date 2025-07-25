const { knex } = require('../config/database');

const createTables = async () => {
    // Users table
    await knex.schema.createTableIfNotExists('users', (table) => {
        table.uuid('id').primary().defaultTo(knex.raw('gen_random_uuid()'));
        table.string('email').unique().notNullable();
        table.string('password_hash').notNullable();
        table.string('name');
        table.jsonb('airbyte_credentials').notNullable(); // Encrypted Airbyte API credentials
        table.boolean('is_active').defaultTo(true);
        table.timestamp('created_at').defaultTo(knex.fn.now());
        table.timestamp('updated_at').defaultTo(knex.fn.now());
    });

    // Tasks table
    await knex.schema.createTableIfNotExists('tasks', (table) => {
        table.uuid('id').primary().defaultTo(knex.raw('gen_random_uuid()'));
        table.uuid('user_id').references('id').inTable('users').onDelete('CASCADE');
        table.string('name').notNullable();
        table.text('description');
        table.string('workspace_id').notNullable();
        table.string('cron_schedule').notNullable();
        table.string('webhook_url');
        table.jsonb('webhook_headers');
        table.string('webhook_auth_type'); // 'none', 'basic', 'bearer'
        table.string('webhook_auth_credentials'); // Encrypted
        table.enum('status', ['active', 'inactive', 'paused']).defaultTo('inactive');
        table.enum('execution_mode', ['sequential', 'parallel']).defaultTo('sequential');
        table.integer('timeout_minutes').defaultTo(60);
        table.integer('retry_attempts').defaultTo(3);
        table.timestamp('created_at').defaultTo(knex.fn.now());
        table.timestamp('updated_at').defaultTo(knex.fn.now());
    });

    // Task_Connections table
    await knex.schema.createTableIfNotExists('task_connections', (table) => {
        table.uuid('id').primary().defaultTo(knex.raw('gen_random_uuid()'));
        table.uuid('task_id').references('id').inTable('tasks').onDelete('CASCADE');
        table.string('connection_id').notNullable();
        table.string('connection_name').notNullable();
        table.string('source_name');
        table.string('destination_name');
        table.integer('execution_order').defaultTo(0);
        table.boolean('is_enabled').defaultTo(true);
        table.timestamp('created_at').defaultTo(knex.fn.now());
    });

    // Task_Executions table
    await knex.schema.createTableIfNotExists('task_executions', (table) => {
        table.uuid('id').primary().defaultTo(knex.raw('gen_random_uuid()'));
        table.uuid('task_id').references('id').inTable('tasks').onDelete('CASCADE');
        table.string('execution_id').unique().notNullable();
        table.timestamp('started_at').defaultTo(knex.fn.now());
        table.timestamp('completed_at');
        table.enum('status', ['running', 'completed', 'failed', 'cancelled']).defaultTo('running');
        table.text('logs');
        table.jsonb('metadata');
        table.timestamp('created_at').defaultTo(knex.fn.now());
        table.timestamp('updated_at').defaultTo(knex.fn.now());
    });

    // Sync_Jobs table
    await knex.schema.createTableIfNotExists('sync_jobs', (table) => {
        table.uuid('id').primary().defaultTo(knex.raw('gen_random_uuid()'));
        table.uuid('execution_id').references('id').inTable('task_executions').onDelete('CASCADE');
        table.string('connection_id').notNullable();
        table.string('airbyte_job_id').notNullable();
        table.enum('status', ['pending', 'running', 'succeeded', 'failed', 'cancelled']).defaultTo('pending');
        table.timestamp('started_at');
        table.timestamp('completed_at');
        table.text('logs');
        table.jsonb('job_config');
        table.integer('attempts').defaultTo(0);
        table.timestamp('created_at').defaultTo(knex.fn.now());
        table.timestamp('updated_at').defaultTo(knex.fn.now());
    });

    // Webhook_Deliveries table
    await knex.schema.createTableIfNotExists('webhook_deliveries', (table) => {
        table.uuid('id').primary().defaultTo(knex.raw('gen_random_uuid()'));
        table.uuid('execution_id').references('id').inTable('task_executions').onDelete('CASCADE');
        table.string('webhook_url').notNullable();
        table.jsonb('payload').notNullable();
        table.integer('status_code');
        table.text('response_body');
        table.integer('attempts').defaultTo(0);
        table.timestamp('delivered_at');
        table.timestamp('created_at').defaultTo(knex.fn.now());
    });

    // Audit_Logs table
    await knex.schema.createTableIfNotExists('audit_logs', (table) => {
        table.uuid('id').primary().defaultTo(knex.raw('gen_random_uuid()'));
        table.uuid('user_id').references('id').inTable('users').onDelete('SET NULL');
        table.string('action').notNullable();
        table.string('resource_type').notNullable();
        table.string('resource_id');
        table.jsonb('details');
        table.string('ip_address');
        table.string('user_agent');
        table.timestamp('created_at').defaultTo(knex.fn.now());
    });

    console.log('Database tables created successfully');
};

const dropTables = async () => {
    const tables = [
        'webhook_deliveries',
        'sync_jobs',
        'task_executions',
        'task_connections',
        'tasks',
        'audit_logs',
        'users'
    ];

    for (const table of tables) {
        await knex.schema.dropTableIfExists(table);
    }

    console.log('Database tables dropped successfully');
};

module.exports = {
    createTables,
    dropTables
}; 