import { createClient } from '@supabase/supabase-js'
import { Hono } from 'hono'

// Initialize Supabase client
const supabaseUrl = process.env.SUPABASE_URL
const supabaseKey = process.env.SUPABASE_ANON_KEY

if (!supabaseUrl || !supabaseKey) {
    throw new Error('Missing Supabase credentials. Please set SUPABASE_URL and SUPABASE_ANON_KEY environment variables.')
}

const supabase = createClient(supabaseUrl, supabaseKey)

// Create a new Hono router for Supabase routes
const supabaseRouter = new Hono()

// Example route to fetch data from a table
supabaseRouter.get('/data/:table', async (c) => {
    const table = c.req.param('table')

    try {
        const { data, error } = await supabase
            .from(table)
            .select('*')
            .limit(10)

        if (error) throw error

        return c.json({ data })
    } catch (error) {
        console.error('Supabase query error:', error)
        return c.json({ error: error.message }, 500)
    }
})

// Example route to insert data
supabaseRouter.post('/data/:table', async (c) => {
    const table = c.req.param('table')
    const body = await c.req.json()

    try {
        const { data, error } = await supabase
            .from(table)
            .insert(body)
            .select()

        if (error) throw error

        return c.json({ data })
    } catch (error) {
        console.error('Supabase insert error:', error)
        return c.json({ error: error.message }, 500)
    }
})

export default supabaseRouter 