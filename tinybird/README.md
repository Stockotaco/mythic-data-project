# User Identity and Location Analytics with Tinybird

## Overview
This analytics platform integrates event tracking data with user identity resolution, allowing you to analyze user behavior across both anonymous and identified sessions. It's particularly optimized for location-based analytics, making it ideal for multi-location businesses.

## Tinybird

### Overview
This Tinybird project enables advanced user analytics by connecting anonymous and identified user sessions. It provides endpoints for user profiles, journey analysis, and location-specific behavior tracking, giving you a complete view of each user's interactions with your service.

### Data sources

#### events
Event tracking data from PostHog with optimized partitioning and sorting for location-based analytics. This datasource stores all tracking events with their associated properties, timestamps, user identifiers, and location information.

##### Ingestion Example
```bash
curl -X POST "https://api.us-east.tinybird.co/v0/events?name=events" \
  -H "Authorization: Bearer $TB_ADMIN_TOKEN" \
  -d '{
    "uuid": "0196b83e-70c5-75b8-894b-afb965d1ee80",
    "event": "pageview",
    "properties": "{\"path\":\"/products\",\"referrer\":\"https://google.com\"}",
    "timestamp": "2023-05-09 21:30:22",
    "distinct_id": "user_123",
    "elements_chain": "",
    "location_id": "store_456"
  }'
```

#### identity_mappings
Stores mappings between anonymous IDs and identified user IDs. This datasource is essential for connecting pre-login and post-login user activity.

##### Ingestion Example
```bash
curl -X POST "https://api.us-east.tinybird.co/v0/events?name=identity_mappings" \
  -H "Authorization: Bearer $TB_ADMIN_TOKEN" \
  -d '{
    "anonymous_id": "anon_789",
    "user_id": "user_123",
    "first_seen": "2023-05-09 21:00:00",
    "last_seen": "2023-05-09 21:30:22",
    "created_at": "2023-05-09 21:00:00"
  }'
```

### Materialized Views

#### sessions_mv
Materialized view of session-level metrics for faster analytics queries. This improves performance by pre-aggregating session data and maintaining an optimized index for location-based queries.

```sql
-- Generated from event data with:
SELECT
    session_id,
    min(timestamp) as session_start,
    max(timestamp) as session_end,
    -- Additional session metrics...
FROM events
WHERE session_id IS NOT NULL
GROUP BY session_id, location_id
```

#### session_stats_daily_data
Daily aggregated session metrics for reporting and dashboard use. This materialized view stores pre-calculated daily statistics to provide instantaneous access to high-level session metrics.

```sql
-- Contains daily aggregates including:
- Total sessions per day
- Identified session count/percentage
- Average session duration
- Attribution data
- Top UTM sources, mediums, and campaigns
```

### Endpoints

#### user_profile_events
Returns all events for a user profile by merging anonymous and identified sessions.

##### Usage Example
```bash
curl -X GET "https://api.us-east.tinybird.co/v0/pipes/user_profile_events.json?token=$TB_ADMIN_TOKEN&user_id=user_123&location_id=location_456&limit=1000"
```

Parameters:
- `user_id`: String (required) - The identified user ID to look up
- `location_id`: String (required) - The location/tenant ID
- `limit`: Int32 (optional) - Maximum number of events to return (default: 1000)

#### user_sessions
Returns session-level analytics data aggregated by session_id, showing session start/end, attribution data, page information, and engagement metrics.

##### Usage Example
```bash
curl -X GET "https://api.us-east.tinybird.co/v0/pipes/user_sessions.json?token=$TB_ADMIN_TOKEN&location_id=location_456&limit=50"
```

Parameters:
- `location_id`: String (required) - The location/tenant ID
- `distinct_id`: String (optional) - Filter by a specific user ID
- `session_id`: String (optional) - Filter by a specific session ID
- `date_from`: String (optional) - Start date (format: "YYYY-MM-DD HH:MM:SS")
- `date_to`: String (optional) - End date (format: "YYYY-MM-DD HH:MM:SS")
- `limit`: Int32 (optional) - Maximum number of sessions to return (default: 100)
- `offset`: Int32 (optional) - Number of sessions to skip (default: 0)

#### sessions_analytics
Returns optimized session analytics using a materialized view for improved performance.

##### Usage Example
```bash
curl -X GET "https://api.us-east.tinybird.co/v0/pipes/sessions_analytics.json?token=$TB_ADMIN_TOKEN&location_id=location_456&utm_source=google&became_identified=1&limit=20"
```

Parameters:
- `location_id`: String (required) - The location/tenant ID
- `distinct_id`: String (optional) - Filter by a specific user ID
- `session_id`: String (optional) - Filter by a specific session ID
- `date_from`: String (optional) - Start date (format: "YYYY-MM-DD HH:MM:SS")
- `date_to`: String (optional) - End date (format: "YYYY-MM-DD HH:MM:SS")
- `utm_source`: String (optional) - Filter by UTM source
- `utm_medium`: String (optional) - Filter by UTM medium
- `utm_campaign`: String (optional) - Filter by UTM campaign
- `min_duration`: Int32 (optional) - Filter by minimum session duration in seconds
- `max_duration`: Int32 (optional) - Filter by maximum session duration in seconds
- `became_identified`: UInt8 (optional) - Filter by whether the session became identified (0 or 1)
- `order_by`: String (optional) - Field to order by (default: "session_start")
- `order`: String (optional) - Order direction (default: "DESC")
- `limit`: Int32 (optional) - Maximum number of sessions to return (default: 100)
- `offset`: Int32 (optional) - Number of sessions to skip (default: 0)

#### user_attribution
Returns first and most recent attribution data for a given user (anonymous or identified), incorporating identity mapping to provide a complete view across all sessions.

##### Usage Example
```bash
curl -X GET "https://api.us-east.tinybird.co/v0/pipes/user_attribution.json?token=$TB_ADMIN_TOKEN&location_id=location_456&user_id=user_123"
```

Parameters:
- `location_id`: String (required) - The location/tenant ID
- `user_id`: String (optional) - The identified user ID to look up
- `distinct_id`: String (optional, required if user_id not provided) - The anonymous/identified ID to look up
- `date_from`: String (optional) - Start date (format: "YYYY-MM-DD HH:MM:SS")
- `date_to`: String (optional) - End date (format: "YYYY-MM-DD HH:MM:SS")

#### session_stats
Returns daily session stats for reporting and dashboards, with metrics such as identified session percentage, average session duration, and attribution data.

##### Usage Example
```bash
curl -X GET "https://api.us-east.tinybird.co/v0/pipes/session_stats.json?token=$TB_ADMIN_TOKEN&location_id=location_456&date_from=2023-01-01&date_to=2023-12-31"
```

Parameters:
- `location_id`: String (required) - The location/tenant ID
- `date_from`: String (optional) - Start date (format: "YYYY-MM-DD")
- `date_to`: String (optional) - End date (format: "YYYY-MM-DD")
- `order_by`: String (optional) - Field to order by (default: "date")
- `order`: String (optional) - Order direction (default: "DESC")
- `limit`: Int32 (optional) - Maximum number of days to return (default: 100)

## Multi-tenant Data Isolation

This Tinybird project uses a multi-tenant architecture where each tenant is identified by a unique `location_id`. All queries must include the appropriate `location_id` to ensure proper data isolation between tenants.

### Security Considerations

1. **Required Parameters**: All endpoints require `location_id` as a mandatory parameter.
2. **User Identification**: When querying user data, both user identifier and `location_id` are required.
3. **Data Isolation**: All queries filter data by `location_id` to prevent cross-tenant data access.
4. **Performance**: Materialized views are indexed by `location_id` to optimize query performance.

### Usage Example

To query session data for a specific tenant:

```
GET /endpoints/sessions_analytics?location_id=tenant123&limit=10
```

For user attribution data, both user ID and location ID are required:

```
GET /endpoints/user_attribution?location_id=tenant123&distinct_id=user456
```

## Client Integration

### JavaScript Integration

The `tinybird.js` client file in the PostHog proxy handles extracting session-level data and user attribution information from PostHog events.

```javascript
// In tinybird.js, we extract the following properties from PostHog event data:
// - Session information: session_id, session entry data
// - UTM parameters: utm_source, utm_medium, utm_campaign, etc.
// - Referrer information: referrer, referring_domain
// - Device data: browser, device_type, timezone
// - URL data: current_url, host, pathname
// - Identity tracking: is_identified, anonymous_id to user_id mappings
```

Example PostHog event with session tracking:

```javascript
posthog.capture('pageview', {
  $session_id: 'sess_12345',
  $current_url: 'https://example.com/products',
  $referrer: 'https://google.com',
  utm_source: 'google',
  utm_medium: 'cpc',
  utm_campaign: 'spring_sale'
});
```

### Using Session Analytics

The session analytics endpoints can be used to answer questions like:

1. What is the average session duration for users from a specific UTM source?
2. How many sessions result in user identification (signup/login)?
3. What are the top entry pages for sessions that convert?
4. What is the user's first and last interaction with your service?
5. What attribution channels drive the most engaged users?
