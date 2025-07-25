# Airbyte Sync Orchestration Application

A comprehensive web application for orchestrating and monitoring Airbyte synchronization jobs with webhook notifications upon completion.

## Features

- **Airbyte API Integration**: Full integration with Airbyte API for managing workspaces, sources, destinations, and connections
- **Task Scheduling**: Cron-based scheduling for automated sync execution
- **Webhook Notifications**: Configurable webhook delivery with retry logic and authentication
- **Real-time Monitoring**: Live status updates and detailed execution logs
- **Parallel/Sequential Execution**: Support for both execution modes
- **User Authentication**: Secure JWT-based authentication system
- **Dashboard Analytics**: Comprehensive metrics and performance insights
- **Error Handling**: Robust error handling with retry mechanisms
- **Railway Deployment**: Optimized for Railway hosting platform

## Tech Stack

- **Backend**: Node.js, Express.js
- **Database**: PostgreSQL with Knex.js ORM
- **Queue System**: Redis with Bull Queue
- **Authentication**: JWT with bcrypt
- **Validation**: Joi
- **Logging**: Winston
- **Scheduling**: node-cron
- **Frontend**: React (to be implemented)

## Prerequisites

- Node.js 18+ 
- PostgreSQL database
- Redis instance
- Airbyte instance with API access

## Quick Start

### 1. Clone and Install

```bash
git clone <repository-url>
cd airbyte
npm install
```

### 2. Environment Setup

Copy the environment template and configure your variables:

```bash
cp env.example .env
```

Configure the following required environment variables:

```env
# Database Configuration
DATABASE_URL=postgresql://username:password@localhost:5432/airbyte_orchestrator
DB_HOST=localhost
DB_PORT=5432
DB_NAME=airbyte_orchestrator
DB_USER=username
DB_PASSWORD=password

# Redis Configuration
REDIS_URL=redis://localhost:6379
REDIS_HOST=localhost
REDIS_PORT=6379

# JWT Configuration
JWT_SECRET=your-super-secret-jwt-key-change-this-in-production

# Airbyte API Configuration
AIRBYTE_API_URL=https://your-airbyte-instance.com/api/v1
AIRBYTE_USERNAME=your-airbyte-username
AIRBYTE_PASSWORD=your-airbyte-password
```

### 3. Database Setup

```bash
# Run database migrations
npm run db:migrate

# (Optional) Seed with sample data
npm run db:seed
```

### 4. Start Development Server

```bash
npm run dev
```

The application will be available at `http://localhost:3000`

## Railway Deployment

### 1. Railway Setup

1. Create a new Railway project
2. Add PostgreSQL and Redis services to your project
3. Connect your GitHub repository

### 2. Environment Variables

Set the following environment variables in Railway:

```env
# Database (Railway PostgreSQL)
DATABASE_URL=${DATABASE_URL}

# Redis (Railway Redis)
REDIS_URL=${REDIS_URL}

# JWT
JWT_SECRET=your-super-secret-jwt-key

# Airbyte API
AIRBYTE_API_URL=https://your-airbyte-instance.com/api/v1
AIRBYTE_USERNAME=your-airbyte-username
AIRBYTE_PASSWORD=your-airbyte-password

# Application
NODE_ENV=production
PORT=3000
CORS_ORIGIN=https://your-frontend-domain.com
```

### 3. Deploy

Railway will automatically deploy your application when you push to the main branch.

## API Documentation

### Authentication

All API endpoints (except `/api/auth/*`) require authentication via JWT token in the Authorization header:

```
Authorization: Bearer <your-jwt-token>
```

### Core Endpoints

#### Authentication
- `POST /api/auth/register` - Register new user
- `POST /api/auth/login` - User login
- `GET /api/auth/profile` - Get user profile
- `PUT /api/auth/profile` - Update user profile
- `PUT /api/auth/airbyte-credentials` - Update Airbyte credentials
- `POST /api/auth/test-airbyte-credentials` - Test Airbyte credentials

#### Tasks
- `GET /api/tasks` - Get all tasks (with pagination)
- `GET /api/tasks/:taskId` - Get specific task
- `POST /api/tasks` - Create new task
- `PUT /api/tasks/:taskId` - Update task
- `DELETE /api/tasks/:taskId` - Delete task
- `POST /api/tasks/:taskId/run` - Run task immediately
- `PUT /api/tasks/:taskId/toggle` - Toggle task status
- `POST /api/tasks/:taskId/duplicate` - Duplicate task

#### Executions
- `GET /api/executions` - Get all executions
- `GET /api/executions/:executionId` - Get execution details
- `POST /api/executions/:executionId/cancel` - Cancel running execution
- `GET /api/executions/:executionId/logs` - Get execution logs
- `GET /api/executions/:executionId/stats` - Get execution statistics

#### Airbyte Integration
- `GET /api/airbyte/workspaces` - Get all workspaces
- `GET /api/airbyte/workspaces/:workspaceId` - Get workspace details
- `GET /api/airbyte/workspaces/:workspaceId/connections` - Get workspace connections
- `GET /api/airbyte/source-definitions` - Get source definitions
- `GET /api/airbyte/destination-definitions` - Get destination definitions

#### Dashboard
- `GET /api/dashboard/overview` - Get dashboard overview
- `GET /api/dashboard/trends` - Get execution trends
- `GET /api/dashboard/health` - Get system health

#### Webhooks
- `POST /api/webhooks/test` - Test webhook URL
- `POST /api/webhooks/validate` - Validate webhook URL
- `GET /api/webhooks/deliveries/:executionId` - Get webhook delivery stats

### Task Creation Example

```javascript
const taskData = {
  name: "Daily Data Sync",
  description: "Sync customer data daily at 2 AM",
  workspace_id: "your-workspace-id",
  cron_schedule: "0 2 * * *", // Daily at 2 AM
  webhook_url: "https://your-webhook-url.com/webhook",
  webhook_headers: {
    "X-Custom-Header": "value"
  },
  webhook_auth_type: "bearer",
  webhook_auth_credentials: {
    token: "your-webhook-token"
  },
  execution_mode: "sequential",
  timeout_minutes: 60,
  retry_attempts: 3,
  connections: [
    {
      connection_id: "connection-1",
      connection_name: "MySQL to BigQuery",
      source_name: "MySQL Database",
      destination_name: "BigQuery Warehouse",
      execution_order: 0,
      is_enabled: true
    }
  ]
};

const response = await fetch('/api/tasks', {
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
    'Authorization': `Bearer ${token}`
  },
  body: JSON.stringify(taskData)
});
```

## Database Schema

### Core Tables

- **users**: User accounts and Airbyte credentials
- **tasks**: Scheduled sync tasks
- **task_connections**: Connections associated with tasks
- **task_executions**: Task execution history
- **sync_jobs**: Individual sync job details
- **webhook_deliveries**: Webhook delivery tracking
- **audit_logs**: System audit trail

## Security Features

- JWT-based authentication
- Encrypted storage of Airbyte credentials
- Input validation and sanitization
- Rate limiting on API endpoints
- CORS configuration
- Audit logging for sensitive operations

## Monitoring and Logging

- Comprehensive Winston logging
- Real-time execution status tracking
- Performance metrics collection
- Error tracking and notifications
- System health monitoring

## Development

### Project Structure

```
src/
├── backend/
│   ├── config/          # Database and Redis configuration
│   ├── database/        # Schema and migrations
│   ├── routes/          # API route handlers
│   ├── services/        # Business logic services
│   ├── utils/           # Utility functions
│   └── index.js         # Main server file
├── frontend/            # React frontend (to be implemented)
└── shared/              # Shared utilities
```

### Running Tests

```bash
npm test
```

### Database Migrations

```bash
# Create new migration
npm run db:migrate

# Rollback migration
npm run db:rollback
```

## Contributing

1. Fork the repository
2. Create a feature branch
3. Make your changes
4. Add tests
5. Submit a pull request

## License

MIT License - see LICENSE file for details

## Support

For support and questions, please open an issue in the GitHub repository. 