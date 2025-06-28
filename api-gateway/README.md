# API Gateway

This is the API Gateway for webhook processing, now configured to use Railway Redis instead of Upstash Redis.

## Environment Variables

Create a `.env` file in the root directory with the following variables:

```env
# Railway Redis Configuration
# This URL is automatically provided by Railway when you add a Redis service
REDIS_URL=redis://username:password@host:port

# QStash Configuration (if still using Upstash QStash)
QSTASH_TOKEN=your_qstash_token_here

# Server Configuration
PORT=3000
```

## Setup

1. Install dependencies:
   ```bash
   npm install
   ```

2. Set up your environment variables in a `.env` file

3. Start the server:
   ```bash
   npm start
   ```

## Redis Configuration

This project now uses Railway Redis instead of Upstash Redis. The Redis client is configured in `src/config/redis-config.js` and provides the following methods:

- `connect()` - Connect to Railway Redis
- `disconnect()` - Disconnect from Redis
- `set(key, value, options)` - Set a value with optional TTL
- `get(key)` - Get a value
- `del(key)` - Delete a key
- `ttl(key)` - Get TTL for a key
- `expire(key, seconds)` - Set TTL for a key
- `healthCheck()` - Check Redis connection health

## API Endpoints

### Health Check
- `GET /health` - Server health with Redis status

### Webhook Processing
- `POST /webhook` - Process webhook events
- `POST /webhook?rerun=true` - Reprocess webhook events

### Redis Testing Routes

#### Connection Test
- `GET /redis-test/connection` - Test Redis connection and get health status

#### Basic Operations Test
- `POST /redis-test/basic` - Test basic Redis operations (set, get, ttl, keys, del)
  ```json
  {
    "key": "test-key",
    "value": "test-value",
    "ttl": 60
  }
  ```

#### TTL Operations Test
- `POST /redis-test/ttl` - Test TTL-specific operations
  ```json
  {
    "key": "ttl-test",
    "value": "test-value",
    "ttl": 60
  }
  ```

#### Multiple Operations Test
- `POST /redis-test/multiple` - Test multiple operations in sequence
  ```json
  {
    "operations": [
      {"type": "set", "value": "value1", "ttl": 60},
      {"type": "get"},
      {"type": "ttl"},
      {"type": "del"}
    ]
  }
  ```

#### Error Handling Test
- `GET /redis-test/errors` - Test error handling scenarios

#### Webhook Simulation Test
- `POST /redis-test/webhook-simulation` - Simulate actual webhook Redis operations
  ```json
  {
    "webhookId": "test-webhook-123",
    "locationId": "loc-123",
    "pipelineId": "pipe-123",
    "pipelineStageId": "stage-123",
    "contactId": "contact-123",
    "type": "OpportunityUpdate"
  }
  ```

## Testing

To test the Redis connection and operations, use the Redis testing routes above. These endpoints provide comprehensive testing of all Redis functionality used in the application.

## Health Check

The server provides a health check endpoint at `/health` that includes Redis connection status. 