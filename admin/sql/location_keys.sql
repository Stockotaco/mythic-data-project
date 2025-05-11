CREATE TABLE IF NOT EXISTS location_keys (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    access_token TEXT NOT NULL,
    refresh_token TEXT NOT NULL,
    email TEXT,
    timezone TEXT,
    address TEXT,
    city TEXT,
    state TEXT,
    postal_code TEXT,
    country TEXT,
    phone TEXT,
    website TEXT,
    first_name TEXT,
    last_name TEXT,
    company_id TEXT,
    date_added TIMESTAMP WITH TIME ZONE,
    domain TEXT,
    business_name TEXT,
    business_address TEXT,
    business_city TEXT,
    business_state TEXT,
    business_postal_code TEXT,
    business_country TEXT,
    business_website TEXT,
    business_timezone TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Create an index on the id for faster lookups
CREATE INDEX IF NOT EXISTS idx_location_keys_id ON location_keys(id);

-- Create a trigger to automatically update the updated_at column
CREATE TRIGGER update_location_keys_updated_at
    BEFORE UPDATE ON location_keys
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column(); 