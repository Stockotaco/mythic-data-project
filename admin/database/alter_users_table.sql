-- Alter existing public.users table to add HighLevel integration fields
-- This assumes the table already exists with basic fields (id, email, full_name, avatar_url, bio, timestamps)

-- Add HighLevel-specific fields
ALTER TABLE public.users 
ADD COLUMN IF NOT EXISTS preferences JSONB DEFAULT '{}',
ADD COLUMN IF NOT EXISTS highlight_user_name TEXT,
ADD COLUMN IF NOT EXISTS metadata JSONB DEFAULT '{}',
ADD COLUMN IF NOT EXISTS last_login_at TIMESTAMP WITH TIME ZONE,
ADD COLUMN IF NOT EXISTS first_login_at TIMESTAMP WITH TIME ZONE;

-- Add indexes for performance
CREATE INDEX IF NOT EXISTS idx_users_email ON public.users(email);
CREATE INDEX IF NOT EXISTS idx_users_last_login ON public.users(last_login_at);
CREATE INDEX IF NOT EXISTS idx_users_first_login ON public.users(first_login_at);

-- Update trigger for updated_at (if not already exists)
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ language 'plpgsql';

-- Add trigger to automatically update updated_at (if not already exists)
DROP TRIGGER IF EXISTS update_users_updated_at ON public.users;
CREATE TRIGGER update_users_updated_at 
    BEFORE UPDATE ON public.users
    FOR EACH ROW 
    EXECUTE FUNCTION update_updated_at_column();

-- Ensure RLS is enabled and proper policies exist
ALTER TABLE public.users ENABLE ROW LEVEL SECURITY;

-- Drop existing policies if they exist (to avoid conflicts)
DROP POLICY IF EXISTS "Users can view own record" ON public.users;
DROP POLICY IF EXISTS "Users can update own record" ON public.users;
DROP POLICY IF EXISTS "Service role can manage users" ON public.users;

-- Create policies for user access
CREATE POLICY "Users can view own record" ON public.users
    FOR SELECT USING (auth.uid() = id);

CREATE POLICY "Users can update own record" ON public.users
    FOR UPDATE USING (auth.uid() = id);

-- Policy for service role (server-side operations)
CREATE POLICY "Service role can manage users" ON public.users
    FOR ALL USING (auth.role() = 'service_role');

-- Grant necessary permissions
GRANT ALL ON public.users TO service_role;
GRANT SELECT, UPDATE ON public.users TO authenticated;

-- Comment on new columns
COMMENT ON COLUMN public.users.preferences IS 'User preferences and settings as JSONB';
COMMENT ON COLUMN public.users.highlight_user_name IS 'Display name from HighLevel (most recent)';
COMMENT ON COLUMN public.users.metadata IS 'Additional user metadata from HighLevel';
COMMENT ON COLUMN public.users.last_login_at IS 'Timestamp of most recent login';
COMMENT ON COLUMN public.users.first_login_at IS 'Timestamp of first login';

-- Set first_login_at for existing users who don't have it set
UPDATE public.users 
SET first_login_at = created_at 
WHERE first_login_at IS NULL;