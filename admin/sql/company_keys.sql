CREATE TABLE IF NOT EXISTS company_keys (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    access_token TEXT NOT NULL,
    refresh_token TEXT NOT NULL,
    email TEXT,
    timezone TEXT,
    relationship_number TEXT,
    currency TEXT,
    customer_type TEXT,
    date_added TIMESTAMP WITH TIME ZONE,
    status TEXT,
    location_count INTEGER,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Create an index on the relationship_number for faster lookups
CREATE INDEX IF NOT EXISTS idx_company_keys_id ON company_keys(id);

-- Create a function to update the updated_at timestamp
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = CURRENT_TIMESTAMP;
    RETURN NEW;
END;
$$ language 'plpgsql';

-- Create a trigger to automatically update the updated_at column
CREATE TRIGGER update_company_keys_updated_at
    BEFORE UPDATE ON company_keys
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column(); 