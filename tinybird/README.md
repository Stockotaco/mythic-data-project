# Tinybird Analytics Platform

A comprehensive multi-tenant analytics platform built on Tinybird for real-time event tracking, user attribution, and session analytics. This platform is optimized for high-performance queries with location-based isolation.

## 🏗️ Architecture Overview

### Core Data Sources

#### **Landing Data Sources**
- **`events`** - Primary event tracking data from PostHog with optimized partitioning and sorting
- **`identity_mappings`** - Maps anonymous IDs to identified user IDs with location-based isolation  
- **`errors`** - Error tracking data with location-based context for monitoring

#### **Materialized Data Sources**
- **`sessions_mv`** - Pre-aggregated session metrics for faster analytics
- **`user_profiles_mv`** - User profile data with first/last touch attribution
- **`user_attribution_summary_mv`** - Complete attribution data for all users with all click IDs
- **`identified_users_attribution_mv`** - Attribution data specifically for identified users
- **`location_metrics_mv`** - Daily location-level metrics aggregation
- **`session_stats_daily_data`** - Daily session statistics for reporting

## 📊 API Endpoints

### **User Attribution APIs**

#### **`user_attribution_optimized`** - Single User Attribution (⚡ Ultra-Fast)
High-performance endpoint for individual user attribution with identity mapping.
- **Performance**: ~25ms response time
- **Use Case**: Real-time user lookups, profile pages, single user analysis
- **Features**: Complete click ID coverage, Facebook timestamp tracking, channel classification

**Parameters:**
- `location_id` (required) - Multi-tenant isolation
- `distinct_id` (optional) - Specific user lookup
- `limit` (default: 100) - Result pagination

**Example:**
```bash
GET /v0/pipes/user_attribution_optimized.json?location_id=loc123&distinct_id=user456
```

#### **`identified_users_attribution`** - Bulk Identified Users (🚀 Fast Bulk)
Optimized for retrieving attribution data for multiple identified users.
- **Performance**: Sub-second for 1000+ users
- **Use Case**: Cohort analysis, attribution reporting, user segmentation
- **Features**: Advanced filtering, channel-based segmentation, campaign analysis

**Parameters:**
- `location_id` (required) - Multi-tenant isolation
- `user_id` (optional) - Specific identified user
- `first_touch_channel_filter` - Filter by acquisition channel
- `last_touch_channel_filter` - Filter by last interaction channel
- `first_utm_source/campaign` - UTM-based filtering
- `min_session_count` - Filter by engagement level
- `first_seen_after/before` - Date range filtering
- `order_by`, `limit`, `offset` - Sorting and pagination

**Example:**
```bash
GET /v0/pipes/identified_users_attribution.json?location_id=loc123&first_touch_channel_filter=google_ads&limit=500
```

#### **`user_attribution`** - Legacy Attribution API
Basic attribution endpoint without materialized view optimization.
- **Use Case**: Backward compatibility, custom date ranges
- **Features**: Raw event analysis, flexible date filtering

### **Session Analytics APIs**

#### **`sessions_analytics`** - Session Data Analysis
Comprehensive session analytics using materialized views.
- **Features**: Session duration, pageview analysis, attribution tracking
- **Performance**: Fast queries on pre-aggregated session data

**Parameters:**
- `location_id` (required)
- `distinct_id` - User-specific sessions
- `date_from/date_to` - Date range filtering
- `utm_source/medium/campaign` - Attribution filtering
- `funnel_id/name` - Funnel-specific analysis

#### **`user_sessions`** - Real-time Session Building
Session-level analytics aggregated from raw events.
- **Features**: Real-time session metrics, engagement analysis

#### **`session_stats`** - Daily Session Statistics
Daily aggregated session metrics for reporting and dashboards.
- **Features**: Session counts, identification rates, attribution percentages

### **User Profile APIs**

#### **`user_profiles_api`** - Complete User Profiles
Comprehensive user profile data with attribution merging.
- **Features**: Anonymous/identified profile merging, complete attribution history

#### **`user_profile_events`** - User Event History
All events for a specific user across anonymous and identified sessions.
- **Features**: Complete event timeline, session context

### **Location & Error Monitoring**

#### **`location_metrics`** - Location-level KPIs
Daily metrics aggregated by location for multi-tenant monitoring.
- **Features**: Event counts, user metrics, engagement tracking

#### **`error_monitoring`** - Error Tracking & Analysis
Error monitoring across locations with sampling and aggregation.
- **Features**: Error rate tracking, component-level analysis

## 🎯 Attribution Features

### **Click ID Support (15+ Platforms)**
- **Google Ads**: `gclid`, `gbraid` (privacy-safe), `wbraid` (iOS 14+)
- **Facebook/Meta**: `fbclid` with detection timestamp
- **Microsoft Ads**: `msclkid`
- **Twitter**: `twclid`
- **TikTok**: `ttclid`
- **LinkedIn**: `li_fat_id`
- **Instagram**: `igshid`
- **Reddit**: `rdt_cid`
- **Pinterest**: `epik`
- **Quora**: `qclid`
- **Snapchat**: `sccid`
- **Impact Radius**: `irclid`
- **Klaviyo**: `_kx`

### **Attribution Models**
- **First Touch**: Session entry data preferred for accuracy
- **Last Touch**: Most recent interaction before conversion
- **Facebook Timestamp**: Millisecond precision for Facebook click detection

### **Channel Classification**
Automatic channel detection based on attribution data:
- `utm` - UTM parameter tracking
- `google_ads` - Google Ads (gclid)
- `google_ads_privacy` - Google Ads privacy-safe (gbraid)
- `google_ads_ios14` - Google Ads iOS 14+ (wbraid)
- `facebook_ads` - Facebook advertising (fbclid)
- `microsoft_ads` - Microsoft Advertising (msclkid)
- `twitter_ads` - Twitter advertising (twclid)
- `tiktok_ads` - TikTok advertising (ttclid)
- `referral` - Organic referral traffic
- `direct` - Direct traffic

## 🚀 Performance Optimizations

### **Materialized Views**
All attribution and session data is pre-aggregated using ClickHouse's AggregatingMergeTree engine for sub-second query performance.

### **Multi-Tenant Architecture**
- Location-based partitioning ensures optimal performance
- Tenant isolation prevents data leakage
- Efficient resource utilization across locations

### **Query Optimization**
- Pre-computed aggregations reduce query-time processing
- Strategic sorting keys for fast filtering
- Efficient JOIN strategies for identity resolution

## 🔧 Data Pipeline

### **Materialization Pipelines**
- **`user_attribution_summary`** - Processes events into user-level attribution
- **`identified_users_attribution`** - Creates identified user attribution with identity resolution
- **`user_profiles`** - Builds comprehensive user profiles
- **`sessions_summary`** - Aggregates session-level metrics
- **`session_stats_daily_mv`** - Creates daily session statistics
- **`location_metrics_daily`** - Generates location-level daily metrics

### **Real-time Processing**
All materialized views update in real-time as new events arrive, ensuring fresh data for analytics queries.

## 📈 Use Cases

### **Marketing Attribution**
- Track user acquisition across all major advertising platforms
- Measure first-touch vs last-touch attribution
- Analyze campaign performance with click ID precision
- Calculate customer acquisition costs by channel

### **User Analytics**
- Build comprehensive user profiles with identity resolution
- Track user journeys across anonymous and identified sessions
- Analyze user engagement and session patterns
- Segment users by attribution and behavior

### **Product Analytics**
- Monitor feature usage and user flows
- Track conversion funnels with attribution context
- Analyze session quality and engagement metrics
- Measure product performance across locations

### **Operational Monitoring**
- Track errors and system health by location
- Monitor data quality and ingestion rates
- Analyze API performance and usage patterns
- Generate real-time operational dashboards

## 🛠️ Getting Started

1. **Set up data ingestion** to the `events` datasource
2. **Configure identity mapping** in the `identity_mappings` datasource
3. **Query user attribution** using the optimized endpoints
4. **Build dashboards** using the pre-aggregated data sources
5. **Monitor performance** with location and error tracking

## 📚 API Reference

For detailed API documentation including parameters, response schemas, and examples, see the individual endpoint documentation or use the OpenAPI definitions available for each endpoint.

## 🔐 Security & Compliance

- Multi-tenant data isolation by `location_id`
- No cross-tenant data leakage
- Efficient resource utilization
- GDPR-compliant user identification and data handling