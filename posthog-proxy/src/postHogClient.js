import { logError } from './tinybird.js'

const API_HOST = "us.i.posthog.com" // Change to "eu.i.posthog.com" for the EU region

// Helper function to forward requests to PostHog
export async function forwardToPostHog(request, pathWithSearch, locationId) {
    try {
        const originRequest = new Request(request)
        originRequest.headers.delete("cookie")
        console.log(`Forwarding request to PostHog: ${API_HOST}${pathWithSearch}`)
        const response = await fetch(`https://${API_HOST}${pathWithSearch}`, originRequest)
        console.log(`PostHog response status: ${response.status}`)

        if (response.status >= 400) {
            await logError(locationId, 'POSTHOG_ERROR', `PostHog API error: ${response.status} ${response.statusText}`, 'forwardToPostHog')
        }

        return response
    } catch (error) {
        await logError(locationId, 'FORWARD_ERROR', `Error forwarding request to PostHog: ${error.message}`, 'forwardToPostHog')
        throw error
    }
} 