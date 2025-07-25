import { Hono } from 'hono'

const adminRoutes = new Hono()

adminRoutes.get('/status', async (c) => {
    // TODO: Implement status check
    return c.json({ status: 'ok' })
})

export default adminRoutes