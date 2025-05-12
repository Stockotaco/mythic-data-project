import { logError } from '../tinybird.js'

const ASSET_HOST = "us-assets.i.posthog.com" // Change to "eu-assets.i.posthog.com" for the EU region

// Handle static asset requests
export const handleStatic = async (c) => {
    try {
        const locationId = c.get('locationId')
        const request = c.req.raw
        const url = new URL(request.url)

        // Extract the path for static assets
        const fullPath = url.pathname
        const pathParts = fullPath.split('/').filter(Boolean)
        const locationIdIndex = pathParts.indexOf(locationId)
        const remainingPath = '/' + pathParts.slice(locationIdIndex + 1).join('/')
        const search = url.search
        const pathWithParams = remainingPath + search

        // Check cache first
        let response = await caches.default.match(request)
        if (!response) {
            // Fetch from PostHog
            response = await fetch(`https://${ASSET_HOST}${pathWithParams}`)

            // Clone the response before caching
            const responseToCache = response.clone()

            // Add cache control headers
            const newHeaders = new Headers(responseToCache.headers)
            newHeaders.set('Cache-Control', 'public, max-age=86400') // Cache for 24 hours
            newHeaders.set('Vary', 'Accept-Encoding')

            // Create new response with cache headers
            const responseWithHeaders = new Response(responseToCache.body, {
                status: responseToCache.status,
                statusText: responseToCache.statusText,
                headers: newHeaders
            })

            // Cache the response
            c.executionCtx.waitUntil(caches.default.put(request, responseWithHeaders))
        }

        // Return response
        return new Response(await response.blob(), {
            status: response.status,
            headers: response.headers
        })
    } catch (error) {
        const locationId = c.get('locationId') || 'unknown'
        await logError(locationId, 'STATIC_ERROR', `Error retrieving static file: ${error.message}`, 'handleStatic')
        return c.text('Error retrieving static file', 500)
    }
} 