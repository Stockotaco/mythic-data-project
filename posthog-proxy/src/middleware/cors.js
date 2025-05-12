// CORS middleware for Hono
export const cors = () => {
    return async (c, next) => {
        // Handle preflight OPTIONS request
        if (c.req.method === 'OPTIONS') {
            return new Response(null, {
                status: 204,
                headers: {
                    'Access-Control-Allow-Origin': '*',
                    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
                    'Access-Control-Allow-Headers': 'Content-Type, Content-Encoding',
                    'Access-Control-Max-Age': '86400'
                }
            })
        }

        // Process the request
        await next()

        // Add CORS headers to the response
        if (c.res) {
            const headers = c.res.headers
            headers.set('Access-Control-Allow-Origin', '*')
            headers.set('Access-Control-Allow-Methods', 'GET, POST, OPTIONS')
            headers.set('Access-Control-Allow-Headers', 'Content-Type, Content-Encoding')
            headers.set('Access-Control-Max-Age', '86400')
        }
    }
} 