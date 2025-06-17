import { Redis } from '@upstash/redis';
import { Client } from '@upstash/qstash';

// Redis configuration
export const redis = new Redis({
    url: 'https://capital-dane-41359.upstash.io',
    token: 'AaGPAAIjcDE4M2EzMGFhYTQ4YTA0YjQ5OGIxYzAzODE5MTJjODNkMHAxMA',
});

// QStash configuration
export const qstash = new Client({
    token: 'eyJVc2VySUQiOiJhMmU0ZDA2NS1lMjQ5LTQxN2ItOTUzNy0wYTY5MjE4ZDRlZjAiLCJQYXNzd29yZCI6ImFiMjkyZWY2ZWE2NjQ3MDViYjE0ZjQyZjMyODQyY2MyIn0='
});

// Special event types that need custom deduplication
export const OPPORTUNITY_EVENTS = [
    'OpportunityUpdate',
    'OpportunityStageUpdate',
    'OpportunityCreate'
];

//sample opportunity data
// { "id": "pnea9YlmMrlItzTEB1D4", "name": "Lily Todaro", "type": "OpportunityUpdate", "appId": "67ba406be531ef5eb75a2c22", "source": "Moved from \"Did not convert\"", "status": "open", "contactId": "LHVSgueyQ2lasCev9R3o", "dateAdded": "2025-03-17T17:54:27.691Z", "timestamp": "2025-06-17T13:06:33.244Z", "versionId": "67ba406be531ef5eb75a2c22", "webhookId": "482348af-77b2-41ab-9346-f848c6cf9815", "assignedTo": "d67z2jdnyTZWSao86SXW", "locationId": "juGWMtqQXDxoeLBuI2x3", "pipelineId": "pB3N1pgWe9MdHdPSqgBW", "pipelineStageId": "d558e615-a07a-438f-a86c-f55605abc9cb" }

// Queue names and configurations
export const QUEUE_CONFIGS = {
    default: {
        queueName: 'default',
        retries: 3,
        delay: 0,
        notBefore: 0,
        contentBasedDeduplication: true
    },
    payment: {
        queueName: 'payment',
        retries: 5,
        delay: 0,
        notBefore: 0,
        contentBasedDeduplication: true
    },
    order: {
        queueName: 'order',
        retries: 3,
        delay: 0,
        notBefore: 0,
        contentBasedDeduplication: true
    },
    user: {
        queueName: 'user',
        retries: 2,
        delay: 0,
        notBefore: 0,
        contentBasedDeduplication: true
    }
}; 