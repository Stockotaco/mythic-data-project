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
import supabaseProxyRoutes from './routes/supabase-proxy'

const app = new Hono()


// Add global request logging to debug routing
app.use('*', async (c, next) => {
    console.log(`=== INCOMING REQUEST ===`);
    console.log(`Method: ${c.req.method}`);
    console.log(`Path: ${c.req.path}`);
    console.log(`URL: ${c.req.url}`);
    await next();
});

// Mount new route modules
app.route('/embed', embedRoutes)
app.route('/oauth', oauthRoutes)
app.route('/admin', adminRoutes)
app.route('/api', apiRoutes)
app.route('/auth', authRoutes)
app.route('/auth/supabase', supabaseProxyRoutes)

// Health check endpoint
app.get('/', (c) => {
    return c.text('Hello World')
})


export default {
    fetch: app.fetch
} 