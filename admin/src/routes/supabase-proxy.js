import { Hono } from 'hono'

const supabaseProxyRoutes = new Hono()

// Function to get Supabase URL from context
function getSupabaseUrl(c) {
    const supabaseUrl = c.env?.SUPABASE_URL;
    if (!supabaseUrl) {
        throw new Error('SUPABASE_URL environment variable not configured');
    }
    return supabaseUrl;
}

// Proxy route for all Supabase auth requests
supabaseProxyRoutes.all('/auth/supabase/auth/v1/*', async (c) => {
    console.log('=== SUPABASE PROXY REQUEST HIT ===');
    console.log('Request path:', c.req.path);
    console.log('Request method:', c.req.method);
    console.log('Request URL:', c.req.url);
    console.log('Original URL:', c.req.raw.url);
    console.log('Headers:', Object.fromEntries(c.req.raw.headers.entries()));
    console.log('Query params:', c.req.query());
    
    try {
        const supabaseUrl = getSupabaseUrl(c)
        
        // Extract the path after /auth/supabase/auth/v1/
        const path = c.req.path.replace('/auth/supabase/auth/v1/', '')
        const targetUrl = `${supabaseUrl}/auth/v1/${path}`
        
        console.log('Target URL:', targetUrl);
        
        // Get query parameters
        const url = new URL(c.req.url)
        const searchParams = url.searchParams
        
        // Build target URL with query parameters
        const finalUrl = new URL(targetUrl)
        searchParams.forEach((value, key) => {
            finalUrl.searchParams.set(key, value)
        })
        
        // Forward headers (excluding problematic ones)
        const forwardHeaders = new Headers()
        const requestHeaders = c.req.raw.headers
        for (const [key, value] of requestHeaders.entries()) {
            // Skip host and origin headers that might cause issues
            if (!['host', 'cf-connecting-ip', 'cf-ray', 'cf-visitor'].includes(key.toLowerCase())) {
                forwardHeaders.set(key, value)
            }
        }
        
        // Add apikey header if not already present (use anon key for client requests)
        const supabaseKey = c.env?.SUPABASE_ANON_KEY;
        if (!supabaseKey) {
            throw new Error('SUPABASE_ANON_KEY environment variable not configured. Please set using "wrangler secret put SUPABASE_ANON_KEY"');
        }
        if (!forwardHeaders.has('apikey')) {
            forwardHeaders.set('apikey', supabaseKey)
        }
        
        // Prepare request options
        const requestOptions = {
            method: c.req.method,
            headers: forwardHeaders,
        }
        
        // Add body for non-GET requests
        if (c.req.method !== 'GET' && c.req.method !== 'HEAD') {
            requestOptions.body = await c.req.raw.clone().arrayBuffer()
        }
        
        // Make the request to Supabase
        console.log('Making request to:', finalUrl.toString());
        console.log('Request options:', {
            method: requestOptions.method,
            headers: Object.fromEntries(requestOptions.headers.entries()),
            hasBody: !!requestOptions.body
        });
        
        const response = await fetch(finalUrl.toString(), requestOptions)
        
        console.log('Response status:', response.status);
        console.log('Response headers:', Object.fromEntries(response.headers.entries()));
        
        // Clone response to read headers and body
        const responseClone = response.clone()
        const responseBody = await responseClone.arrayBuffer()
        
        // Create new response
        const newResponse = new Response(responseBody, {
            status: response.status,
            statusText: response.statusText,
        })
        
        // Copy ALL headers from Supabase response to ensure complete proxying
        for (const [key, value] of response.headers.entries()) {
            // Skip set-cookie headers - we'll handle those specially
            // Also skip headers that might conflict with our CORS setup
            if (key.toLowerCase() !== 'set-cookie' && 
                !key.toLowerCase().startsWith('access-control-')) {
                newResponse.headers.set(key, value)
            }
        }
        
        // Handle Set-Cookie headers with proper domain
        const setCookieHeaders = response.headers.getSetCookie?.() || []
        setCookieHeaders.forEach(cookieHeader => {
            // Parse and modify cookie to use app.mythicdata.io domain
            if (cookieHeader.includes('supabase')) {
                // Replace any existing domain or add app.mythicdata.io domain
                let modifiedCookie = cookieHeader.replace(/Domain=[^;]+;?/i, '')
                modifiedCookie = modifiedCookie.replace(/SameSite=Strict/i, 'SameSite=None')
                
                // Ensure Secure flag is present for SameSite=None
                if (!modifiedCookie.includes('Secure')) {
                    modifiedCookie += '; Secure'
                }
                
                // Add the correct domain
                modifiedCookie += '; Domain=.app.mythicdata.io'
                
                newResponse.headers.append('Set-Cookie', modifiedCookie)
            } else {
                // For non-supabase cookies, pass through as-is
                newResponse.headers.append('Set-Cookie', cookieHeader)
            }
        })
        
        // Add CORS headers for iframe compatibility
        newResponse.headers.set('Access-Control-Allow-Origin', 'https://app.mythicdata.io')
        newResponse.headers.set('Access-Control-Allow-Credentials', 'true')
        newResponse.headers.set('Access-Control-Allow-Headers', 'authorization, x-client-info, apikey, content-type')
        newResponse.headers.set('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS')
        
        return newResponse
        
    } catch (error) {
        console.error('Supabase proxy error:', error)
        return c.json({ error: 'Proxy request failed', details: error.message }, 500)
    }
})

// Handle preflight OPTIONS requests
supabaseProxyRoutes.options('/auth/supabase/auth/v1/*', (c) => {
    return new Response(null, {
        status: 200,
        headers: {
            'Access-Control-Allow-Origin': 'https://app.mythicdata.io',
            'Access-Control-Allow-Credentials': 'true',
            'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
            'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
            'Access-Control-Max-Age': '86400'
        }
    })
})

// Test endpoint to verify routing is working
supabaseProxyRoutes.get('/test', (c) => {
    console.log('=== SUPABASE PROXY TEST ENDPOINT HIT ===');
    console.log('Request path:', c.req.path);
    console.log('Request URL:', c.req.url);
    return c.json({ 
        message: 'Supabase proxy test endpoint working!',
        path: c.req.path,
        url: c.req.url,
        timestamp: new Date().toISOString()
    })
})

export default supabaseProxyRoutes