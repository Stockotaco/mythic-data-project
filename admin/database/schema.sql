-- Note: public.users table already exists with basic structure
-- This schema assumes it exists with: id, email, full_name, avatar_url, bio, created_at, updated_at
-- Additional fields needed for HighLevel integration:
-- 
-- ALTER TABLE public.users 
-- ADD COLUMN IF NOT EXISTS preferences JSONB DEFAULT '{}',
-- ADD COLUMN IF NOT EXISTS highlight_user_name TEXT,
-- ADD COLUMN IF NOT EXISTS metadata JSONB DEFAULT '{}',
-- ADD COLUMN IF NOT EXISTS last_login_at TIMESTAMP WITH TIME ZONE,
-- ADD COLUMN IF NOT EXISTS first_login_at TIMESTAMP WITH TIME ZONE;
--
-- See alter_users_table.sql for the complete migration script

-- Create public.user_locations junction table
-- This table handles the many-to-many relationship between users and locations
-- One user can have access to multiple locations with different roles/permissions
CREATE TABLE IF NOT EXISTS public.user_locations (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    location_id TEXT NOT NULL,
    email TEXT NOT NULL, -- Denormalized for easier queries
    
    -- Location-specific HighLevel data
    highlevel_user_id TEXT, -- User ID within this specific location context
    highlevel_company_id TEXT, -- Company/Agency ID
    highlevel_role TEXT, -- Role within this location (admin, user, etc.)
    highlevel_type TEXT, -- Type within this location (agency, location, etc.)
    
    -- Location-specific metadata
    location_metadata JSONB DEFAULT '{}',
    
    -- Access control
    is_active BOOLEAN DEFAULT TRUE,
    permissions JSONB DEFAULT '{}', -- Location-specific permissions
    
    -- Timestamps
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    last_accessed_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    
    -- Ensure unique combination of user and location
    UNIQUE(user_id, location_id)
);

-- Create public.user_companies junction table
-- This table handles the many-to-many relationship between users and companies
-- One user can have access to multiple companies with different roles/permissions
CREATE TABLE IF NOT EXISTS public.user_companies (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    company_id TEXT NOT NULL,
    email TEXT NOT NULL, -- Denormalized for easier queries
    
    -- Company-specific HighLevel data
    highlevel_user_id TEXT, -- User ID within this specific company context
    highlevel_role TEXT, -- Role within this company (admin, user, etc.)
    highlevel_type TEXT, -- Type within this company (agency, etc.)
    
    -- Company-specific metadata
    company_metadata JSONB DEFAULT '{}',
    
    -- Access control
    is_active BOOLEAN DEFAULT TRUE,
    permissions JSONB DEFAULT '{}', -- Company-specific permissions
    
    -- Timestamps
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    last_accessed_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    
    -- Ensure unique combination of user and company
    UNIQUE(user_id, company_id)
);

-- Create indexes for better performance on user_locations table
CREATE INDEX IF NOT EXISTS idx_user_locations_user_id ON public.user_locations(user_id);
CREATE INDEX IF NOT EXISTS idx_user_locations_location_id ON public.user_locations(location_id);
CREATE INDEX IF NOT EXISTS idx_user_locations_email ON public.user_locations(email);
CREATE INDEX IF NOT EXISTS idx_user_locations_highlevel_user_id ON public.user_locations(highlevel_user_id);
CREATE INDEX IF NOT EXISTS idx_user_locations_active ON public.user_locations(is_active);
CREATE INDEX IF NOT EXISTS idx_user_locations_email_location ON public.user_locations(email, location_id);

-- Create indexes for better performance on user_companies table
CREATE INDEX IF NOT EXISTS idx_user_companies_user_id ON public.user_companies(user_id);
CREATE INDEX IF NOT EXISTS idx_user_companies_company_id ON public.user_companies(company_id);
CREATE INDEX IF NOT EXISTS idx_user_companies_email ON public.user_companies(email);
CREATE INDEX IF NOT EXISTS idx_user_companies_highlevel_user_id ON public.user_companies(highlevel_user_id);
CREATE INDEX IF NOT EXISTS idx_user_companies_active ON public.user_companies(is_active);
CREATE INDEX IF NOT EXISTS idx_user_companies_email_company ON public.user_companies(email, company_id);

-- Create updated_at trigger function
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ language 'plpgsql';

-- Add triggers to automatically update updated_at (with DROP IF EXISTS to handle re-runs)
DROP TRIGGER IF EXISTS update_users_updated_at ON public.users;
CREATE TRIGGER update_users_updated_at BEFORE UPDATE ON public.users
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

DROP TRIGGER IF EXISTS update_user_locations_updated_at ON public.user_locations;
CREATE TRIGGER update_user_locations_updated_at BEFORE UPDATE ON public.user_locations
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

DROP TRIGGER IF EXISTS update_user_companies_updated_at ON public.user_companies;
CREATE TRIGGER update_user_companies_updated_at BEFORE UPDATE ON public.user_companies
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- Row Level Security (RLS) policies
ALTER TABLE public.users ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.user_locations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.user_companies ENABLE ROW LEVEL SECURITY;

-- Drop existing policies to handle re-runs
DROP POLICY IF EXISTS "Users can view own record" ON public.users;
DROP POLICY IF EXISTS "Users can update own record" ON public.users;
DROP POLICY IF EXISTS "Users can view own locations" ON public.user_locations;
DROP POLICY IF EXISTS "Users can view own companies" ON public.user_companies;
DROP POLICY IF EXISTS "Service role can manage users" ON public.users;
DROP POLICY IF EXISTS "Service role can manage user_locations" ON public.user_locations;
DROP POLICY IF EXISTS "Service role can manage user_companies" ON public.user_companies;

-- Policy: Users can read/update their own record
CREATE POLICY "Users can view own record" ON public.users
    FOR SELECT USING (auth.uid() = id);

CREATE POLICY "Users can update own record" ON public.users
    FOR UPDATE USING (auth.uid() = id);

-- Policy: Users can view their own location associations
CREATE POLICY "Users can view own locations" ON public.user_locations
    FOR SELECT USING (auth.uid() = user_id);

-- Policy: Users can view their own company associations
CREATE POLICY "Users can view own companies" ON public.user_companies
    FOR SELECT USING (auth.uid() = user_id);

-- Policy: Service role can manage all records (for server-side operations)
CREATE POLICY "Service role can manage users" ON public.users
    FOR ALL USING (auth.role() = 'service_role');

CREATE POLICY "Service role can manage user_locations" ON public.user_locations
    FOR ALL USING (auth.role() = 'service_role');

CREATE POLICY "Service role can manage user_companies" ON public.user_companies
    FOR ALL USING (auth.role() = 'service_role');

-- Grant necessary permissions
GRANT ALL ON public.users TO service_role;
GRANT ALL ON public.user_locations TO service_role;
GRANT ALL ON public.user_companies TO service_role;
GRANT SELECT, UPDATE ON public.users TO authenticated;
GRANT SELECT ON public.user_locations TO authenticated;
GRANT SELECT ON public.user_companies TO authenticated;