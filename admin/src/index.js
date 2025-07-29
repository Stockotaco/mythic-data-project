import { Hono } from 'hono'
import { HIGHLEVEL_CONFIG } from './highlevel-config'
import { installCompany } from './company-install'
import { installLocation } from './location-install'

// Import new route modules
import embedRoutes from './routes/embed'
import oauthRoutes from './routes/oauth'
import adminRoutes from './routes/admin'
import apiRoutes from './routes/api'
import authRoutes from './routes/auth'

const app = new Hono()


// Mount new route modules
app.route('/embed', embedRoutes)
app.route('/oauth', oauthRoutes)
app.route('/admin', adminRoutes)
app.route('/api', apiRoutes)
app.route('/auth', authRoutes)

// Health check endpoint
app.get('/', (c) => {
    return c.text('Hello World')
})


export default {
    fetch: app.fetch
} 