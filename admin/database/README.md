# Database Schema

This directory contains the database schema and migration files for the Mythic Data Admin service.

## Tables

### `public.users`
Stores user preferences and HighLevel-specific data linked to Supabase auth users.

**Columns:**
- `id` - UUID, references `auth.users(id)`
- `email` - Normalized email address
- `preferences` - JSONB for user settings
- `highlevel_user_id` - HighLevel user identifier
- `highlevel_company_id` - HighLevel company identifier
- `highlevel_user_name` - User's display name from HighLevel
- `highlevel_role` - User's role (admin, user, etc.)
- `highlevel_type` - Account type (agency, location, etc.)
- `metadata` - Full HighLevel user data as JSONB
- `first_login_at` - When user first authenticated
- `last_login_at` - Most recent authentication
- `created_at` / `updated_at` - Standard timestamps

### `public.user_locations`
Junction table linking users to HighLevel locations.

**Columns:**
- `id` - UUID primary key
- `user_id` - References `auth.users(id)`
- `location_id` - HighLevel location identifier
- `email` - User's email (denormalized for easier queries)
- `created_at` / `updated_at` - Standard timestamps

**Unique constraint:** `(user_id, location_id)`

## Security

Both tables have Row Level Security (RLS) enabled with policies:

- **Users can view/update their own records**
- **Service role has full access** (for server-side operations)
- **Authenticated users** can read their own data

## Setup Instructions

1. **Run the schema migration** in your Supabase SQL editor:
   ```sql
   -- Copy and paste the contents of schema.sql
   ```

2. **Verify tables created:**
   ```sql
   SELECT table_name FROM information_schema.tables 
   WHERE table_schema = 'public' 
   AND table_name IN ('users', 'user_locations');
   ```

3. **Test RLS policies:**
   ```sql
   -- As authenticated user, should only see own records
   SELECT * FROM public.users;
   SELECT * FROM public.user_locations;
   ```

## Usage in Code

The authentication flow automatically:

1. **Creates/updates user record** with HighLevel data
2. **Associates user with location** (if `locationId` present)
3. **Updates login timestamps**
4. **Preserves user preferences**

## Utility Functions

Use the functions in `src/utils/database.js`:

```javascript
import { upsertUserData, upsertUserLocation, getUserData } from './utils/database.js';

// Upsert user data during authentication
await upsertUserData(supabase, userId, email, userData);

// Associate user with location
await upsertUserLocation(supabase, userId, email, locationId);

// Get user data with locations
const user = await getUserData(supabase, userId);
```

## Indexes

Optimized indexes are created for:
- Email lookups
- HighLevel user ID searches
- User-location associations
- Location-based queries

## Triggers

Automatic `updated_at` timestamp updates on record changes.