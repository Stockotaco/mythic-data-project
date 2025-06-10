import pg from 'pg'
const { Pool } = pg

// Configure pool with optimized settings
const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: false,
    // Connection pool settings
    max: 20, // Maximum number of clients in the pool
    idleTimeoutMillis: 30000, // How long a client is allowed to remain idle before being closed
    connectionTimeoutMillis: 2000, // How long to wait for a connection
    maxUses: 7500, // Close a connection after it has been used this many times
})

// Log the connection string (masking the password)
const maskedUrl = process.env.DATABASE_URL?.replace(/:\/\/[^:]+:[^@]+@/, '://****:****@')
console.log('Database URL:', maskedUrl)
console.log('Database configuration:', {
    host: pool.options.host,
    port: pool.options.port,
    database: pool.options.database,
    user: pool.options.user,
    ssl: pool.options.ssl
})

// Add event listeners to the pool
pool.on('connect', () => {
    console.log('New client connected to database')
})

pool.on('error', (err) => {
    console.error('Unexpected error on idle client', err)
    process.exit(-1)
})

// Graceful shutdown
process.on('SIGINT', async () => {
    console.log('Closing database pool...')
    await pool.end()
    process.exit(0)
})

// Initialize the database
export async function initDb() {
    console.log('Initializing database...')
    let client
    try {
        console.log('Attempting to connect to database...')
        client = await pool.connect()
        console.log('Successfully connected to database')

        // Check if table exists and get its structure
        console.log('Checking existing table structure...')
        const tableExists = await client.query(`
            SELECT EXISTS (
                SELECT FROM information_schema.tables 
                WHERE table_name = 'jokes'
            )
        `)

        if (!tableExists.rows[0].exists) {
            console.log('Creating jokes table...')
            await client.query(`
                CREATE TABLE jokes (
                    id SERIAL PRIMARY KEY,
                    setup TEXT NOT NULL,
                    punchline TEXT NOT NULL,
                    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
                )
            `)
            console.log('Table created successfully')
        } else {
            // Verify table structure
            console.log('Verifying table structure...')
            const columns = await client.query(`
                SELECT column_name, data_type, is_nullable
                FROM information_schema.columns 
                WHERE table_name = 'jokes'
                ORDER BY ordinal_position
            `)

            const requiredColumns = {
                'id': { type: 'integer', nullable: 'NO' },
                'setup': { type: 'text', nullable: 'NO' },
                'punchline': { type: 'text', nullable: 'NO' },
                'created_at': { type: 'timestamp with time zone', nullable: 'YES' }
            }

            const existingColumns = columns.rows.reduce((acc, col) => {
                acc[col.column_name] = {
                    type: col.data_type,
                    nullable: col.is_nullable
                }
                return acc
            }, {})

            // Check if any required columns are missing or have wrong types
            const missingColumns = Object.keys(requiredColumns).filter(
                col => !existingColumns[col]
            )

            if (missingColumns.length > 0) {
                console.error('Missing required columns:', missingColumns)
                throw new Error(`Table structure is invalid. Missing columns: ${missingColumns.join(', ')}`)
            }

            console.log('Table structure verified successfully')
        }

        console.log('Database initialization completed successfully')
    } catch (error) {
        console.error('Error initializing database:', error)
        console.error('Error details:', {
            message: error.message,
            code: error.code,
            stack: error.stack
        })
        throw error
    } finally {
        if (client) {
            console.log('Releasing database client')
            client.release()
        }
    }
}

// Store a new joke with optimized query
export async function storeJoke(setup, punchline) {
    let client
    try {
        console.log('Connecting to database to store joke...')
        client = await pool.connect()
        console.log('Successfully connected to store joke')

        const result = await client.query(
            'INSERT INTO jokes (setup, punchline) VALUES ($1, $2) RETURNING id, setup, punchline, created_at',
            [setup, punchline]
        )
        console.log('Stored new joke:', result.rows[0])
        return result.rows[0]
    } catch (error) {
        console.error('Error storing joke:', error)
        console.error('Error details:', {
            message: error.message,
            code: error.code,
            stack: error.stack
        })
        throw error
    } finally {
        if (client) {
            console.log('Releasing database client after storing joke')
            client.release()
        }
    }
}

// Get all jokes with pagination and optimized query
export async function getJokes(page = 1, limit = 10) {
    let client
    try {
        console.log('Connecting to database to fetch jokes...')
        client = await pool.connect()
        console.log('Successfully connected to fetch jokes')

        const offset = (page - 1) * limit

        // Get total count
        const countResult = await client.query('SELECT COUNT(*) FROM jokes')
        const total = parseInt(countResult.rows[0].count)

        // Get paginated results
        const result = await client.query(
            'SELECT id, setup, punchline, created_at FROM jokes ORDER BY created_at DESC LIMIT $1 OFFSET $2',
            [limit, offset]
        )

        console.log(`Successfully fetched ${result.rows.length} jokes`)
        return {
            jokes: result.rows,
            pagination: {
                total,
                page,
                limit,
                pages: Math.ceil(total / limit)
            }
        }
    } catch (error) {
        console.error('Error fetching jokes:', error)
        console.error('Error details:', {
            message: error.message,
            code: error.code,
            stack: error.stack
        })
        throw error
    } finally {
        if (client) {
            console.log('Releasing database client after fetching jokes')
            client.release()
        }
    }
} 