import pg from 'pg'
const { Pool } = pg

// Create a new pool using the connection string from environment variables
const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: {
        rejectUnauthorized: false
    }
})

// Log the connection string (masking the password)
const maskedUrl = process.env.DATABASE_URL?.replace(/:\/\/[^:]+:[^@]+@/, '://****:****@')
console.log('Database URL:', maskedUrl)

// Add event listeners to the pool
pool.on('connect', () => {
    console.log('New client connected to database')
})

pool.on('error', (err) => {
    console.error('Unexpected error on idle client', err)
    process.exit(-1)
})

// Initialize the database
export async function initDb() {
    console.log('Initializing database...')
    try {
        const client = await pool.connect()
        try {
            await client.query(`
      CREATE TABLE IF NOT EXISTS jokes (
        id SERIAL PRIMARY KEY,
        setup TEXT NOT NULL,
        punchline TEXT NOT NULL,
        created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
      )
    `)
            console.log('Database initialization completed successfully')
        } finally {
            client.release()
        }
    } catch (error) {
        console.error('Error initializing database:', error)
        throw error
    }
}

// Store a new joke
export async function storeJoke(setup, punchline) {
    const client = await pool.connect()
    try {
        const result = await client.query(
            'INSERT INTO jokes (setup, punchline) VALUES ($1, $2) RETURNING *',
            [setup, punchline]
        )
        console.log('Stored new joke:', result.rows[0])
        return result.rows[0]
    } finally {
        client.release()
    }
}

// Get all jokes
export async function getJokes() {
    const client = await pool.connect()
    try {
        const result = await client.query(
            'SELECT * FROM jokes ORDER BY created_at DESC'
        )
        return result.rows
    } finally {
        client.release()
    }
} 