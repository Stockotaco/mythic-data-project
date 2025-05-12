import { Hono } from 'hono'
import { cors } from './middleware/cors.js'
import { locationAuth } from './middleware/auth.js'
import { handlePostHogEvent } from './routes/events.js'
import { handleStatic } from './routes/static.js'
import { forwardRequest } from './routes/proxy.js'

const app = new Hono()

// Apply CORS middleware globally
app.use('*', cors())

// Auth middleware for location verification
app.use('/v1/:locationId/*', locationAuth)

// Route for PostHog events
app.all('/v1/:locationId/e', handlePostHogEvent)
app.all('/v1/:locationId/e/', handlePostHogEvent)
app.all('/v1/:locationId/i/v0/e', handlePostHogEvent)
app.all('/v1/:locationId/i/v0/e/', handlePostHogEvent)

// Route for static assets
app.get('/v1/:locationId/static/*', handleStatic)

// Catch-all route for other PostHog API endpoints
app.all('/v1/:locationId/*', forwardRequest)

// 404 for unmatched routes
app.all('*', (c) => c.text('Not Found', 404))

export default {
    fetch: app.fetch
}
