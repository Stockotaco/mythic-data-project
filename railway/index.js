import 'dotenv/config'
import { Hono } from 'hono'
import { serve } from '@hono/node-server'
import { serveStatic } from '@hono/node-server/serve-static'
import { initDb, storeJoke, getJokes } from './db.js'
import supabaseRouter from './supabase.js'

const app = new Hono()
const port = process.env.PORT || 3000

// Initialize database
let dbInitialized = false

// Mount Supabase router
app.route('/supabase', supabaseRouter)

// Serve static files
app.use('/*', serveStatic({ root: './public' }))

// Route to get a random joke
app.get('/joke', async (c) => {
    if (!dbInitialized) {
        return c.json({ error: 'Database not initialized' }, 503)
    }

    try {
        const response = await fetch('https://official-joke-api.appspot.com/random_joke')
        const joke = await response.json()

        try {
            await storeJoke(joke.setup, joke.punchline)
        } catch (error) {
            console.error('Failed to store joke:', error)
            // Continue even if storage fails, but log the error
        }

        return c.json({
            setup: joke.setup,
            punchline: joke.punchline
        })
    } catch (error) {
        console.error('Error fetching joke:', error)
        return c.json({ error: 'Failed to fetch joke' }, 500)
    }
})

// Route to get joke history
app.get('/jokes', async (c) => {
    if (!dbInitialized) {
        return c.json({ error: 'Database not initialized' }, 503)
    }

    try {
        const page = parseInt(c.req.query('page')) || 1
        const limit = parseInt(c.req.query('limit')) || 10

        // Validate pagination parameters
        if (page < 1 || limit < 1 || limit > 100) {
            return c.json({
                error: 'Invalid pagination parameters. Page must be >= 1, limit must be between 1 and 100'
            }, 400)
        }

        const result = await getJokes(page, limit)
        return c.json(result)
    } catch (error) {
        console.error('Error fetching joke history:', error)
        return c.json({ error: 'Failed to fetch joke history' }, 500)
    }
})

// Health check route
app.get('/health', (c) => {
    return c.json({
        status: 'ok',
        message: 'Joke API is running',
        database: dbInitialized ? 'connected' : 'disconnected'
    })
})

// Default route
app.get('/', (c) => {
    return c.text('Joke API is running')
})

// Initialize database and start server
async function startServer() {
    try {
        await initDb()
        console.log('Database initialization completed')
        dbInitialized = true

        serve({
            fetch: app.fetch,
            port
        }, (info) => {
            console.log(`Server is running on port ${info.port}`)
        })
    } catch (error) {
        console.error('Failed to initialize database:', error)
        process.exit(1)
    }
}

startServer()