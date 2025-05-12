import { logError } from '../tinybird.js'
import { forwardToPostHog } from '../postHogClient.js'

// Generic proxy handler for forwarding requests to PostHog
export const forwardRequest = async (c) => {
    try {
        const locationId = c.get('locationId')
        const request = c.req.raw
        const url = new URL(request.url)

        // Extract the remaining path (everything after the locationId)
        const fullPath = url.pathname
        const pathParts = fullPath.split('/').filter(Boolean)
        const pathIndex = pathParts.indexOf(locationId)
        const remainingPath = '/' + pathParts.slice(pathIndex + 1).join('/')
        const search = url.search
        const pathWithParams = remainingPath + search

        // Forward to PostHog
        const response = await forwardToPostHog(request, pathWithParams, locationId)
        return new Response(await response.blob(), {
            status: response.status,
            headers: response.headers
        })
    } catch (error) {
        const locationId = c.get('locationId') || 'unknown'
        await logError(locationId, 'FORWARD_ERROR', `Error forwarding request: ${error.message}`, 'forwardRequest')
        return c.text('Error forwarding request to PostHog', 502)
    }
} 