import 'dotenv/config'
import { Hono } from 'hono'
import { serve } from '@hono/node-server'
import { serveStatic } from '@hono/node-server/serve-static'
import { initDb, storeJoke, getJokes } from './db.js'

const app = new Hono()
const port = process.env.PORT || 3000

// Initialize database
let dbInitialized = false
initDb()
    .then(() => {
        console.log('Database initialization completed')
        dbInitialized = true
    })
    .catch(error => {
        console.error('Failed to initialize database:', error)
    })

// Serve static files
app.use('/*', serveStatic({ root: './public' }))

// Route to get a random joke
app.get('/joke', async (c) => {
    try {
        const response = await fetch('https://official-joke-api.appspot.com/random_joke')
        const joke = await response.json()

        if (dbInitialized) {
            try {
                await storeJoke(joke.setup, joke.punchline)
            } catch (error) {
                console.error('Failed to store joke:', error)
            }
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
        const jokes = await getJokes()
        return c.json(jokes)
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

serve({
    fetch: app.fetch,
    port
}, (info) => {
    console.log(`Server is running on port ${info.port}`)
})