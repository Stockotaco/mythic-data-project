#!/bin/bash

# Deploy the session and attribution analytics endpoints
echo "Deploying session and attribution analytics to Tinybird..."

# Deploy datasources first
echo "Deploying datasources..."
tb deploy --no-version materializations/sessions_mv.datasource
tb deploy --no-version materializations/session_stats_daily_data.datasource

# Deploy the session materialized view
echo "Deploying the materialized view for sessions..."
tb deploy --no-version pipes/sessions_summary.pipe

# Deploy session stats materialization pipeline
echo "Deploying session stats materialization..."
tb deploy --no-version pipes/session_stats_daily_mv.pipe

# Deploy the endpoints
echo "Deploying the session analytics endpoints..."
tb deploy --no-version endpoints/user_sessions.pipe
tb deploy --no-version endpoints/sessions_analytics.pipe
tb deploy --no-version endpoints/user_attribution.pipe
tb deploy --no-version endpoints/session_stats.pipe

echo "Deployment complete!" 