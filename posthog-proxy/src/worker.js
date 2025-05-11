import { handleCorsRequest, extractPostHogData } from './utils.js'
import { sendToTinyBird, logError } from './tinybird.js'
import { checkLocationPermission } from './supabase.js'

const API_HOST = "us.i.posthog.com" // Change to "eu.i.posthog.com" for the EU region
const ASSET_HOST = "us-assets.i.posthog.com" // Change to "eu-assets.i.posthog.com" for the EU region

function withCORS(response) {
    const newHeaders = new Headers(response.headers)
    newHeaders.set('Access-Control-Allow-Origin', '*')
    newHeaders.set('Access-Control-Allow-Methods', 'GET, POST, OPTIONS')
    newHeaders.set('Access-Control-Allow-Headers', 'Content-Type, Content-Encoding')
    newHeaders.set('Access-Control-Max-Age', '86400')
    return new Response(response.body, {
        status: response.status,
        statusText: response.statusText,
        headers: newHeaders
    })
}

async function handleRequest(request, env, ctx) {
    try {
        const url = new URL(request.url)
        const pathname = url.pathname
        const search = url.search
        const pathWithParams = pathname + search

        // Extract location_id from path
        const pathParts = pathname.split('/').filter(Boolean)
        if (pathParts.length < 2 || pathParts[0] !== 'v1') {
            return withCORS(new Response('Not Found', { status: 404 }))
        }

        const locationId = pathParts[1]
        const remainingPath = '/' + pathParts.slice(2).join('/')

        // Check location permission for all requests, including OPTIONS
        const isAllowed = await checkLocationPermission(locationId, env)
        if (!isAllowed) {
            await logError(locationId, 'AUTH_ERROR', 'Location not authorized to use PostHog proxy', 'handleRequest')
            return withCORS(new Response('Location not authorized to use PostHog proxy', { status: 403 }))
        }

        // Handle OPTIONS requests for CORS
        if (request.method === 'OPTIONS') {
            return handleCorsRequest()
        }

        // Check if this is a PostHog event route
        if (remainingPath === '/e' || remainingPath === '/e/' ||
            remainingPath === '/i/v0/e' || remainingPath === '/i/v0/e/') {
            return handlePostHogEvent(request, env, ctx, locationId, remainingPath)
        } else if (remainingPath.startsWith("/static/")) {
            return retrieveStatic(request, remainingPath + search, env, ctx)
        } else {
            return forwardRequest(request, remainingPath + search, locationId)
        }
    } catch (error) {
        const url = new URL(request.url)
        const pathParts = url.pathname.split('/').filter(Boolean)
        const locationId = pathParts.length >= 2 ? pathParts[1] : 'unknown'

        await logError(locationId, 'WORKER_ERROR', `Fatal error in handleRequest: ${error.message}`, 'handleRequest')
        return withCORS(new Response('Internal Server Error', { status: 500 }))
    }
}

async function retrieveStatic(request, pathname, env, ctx) {
    try {
        // Extract location for error logging
        const url = new URL(request.url)
        const pathParts = url.pathname.split('/').filter(Boolean)
        const locationId = pathParts.length >= 2 ? pathParts[1] : 'unknown'

        // Check cache first
        let response = await caches.default.match(request)
        if (!response) {
            // Fetch from PostHog
            response = await fetch(`https://${ASSET_HOST}${pathname}`)

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
            ctx.waitUntil(caches.default.put(request, responseWithHeaders))

            // Return the original response
            return withCORS(response)
        }

        // Return cached response
        return withCORS(response)
    } catch (error) {
        const url = new URL(request.url)
        const pathParts = url.pathname.split('/').filter(Boolean)
        const locationId = pathParts.length >= 2 ? pathParts[1] : 'unknown'

        await logError(locationId, 'STATIC_ERROR', `Error retrieving static file: ${error.message}`, 'retrieveStatic')
        return withCORS(new Response('Error retrieving static file', { status: 500 }))
    }
}

async function forwardRequest(request, pathWithSearch, locationId) {
    try {
        const originRequest = new Request(request)
        originRequest.headers.delete("cookie")
        console.log(`Forwarding request to PostHog: ${API_HOST}${pathWithSearch}`)
        const response = await fetch(`https://${API_HOST}${pathWithSearch}`, originRequest)
        console.log(`PostHog response status: ${response.status}`)

        if (response.status >= 400) {
            await logError(locationId, 'POSTHOG_ERROR', `PostHog API error: ${response.status} ${response.statusText}`, 'forwardRequest')
        }

        return withCORS(response)
    } catch (error) {
        await logError(locationId, 'FORWARD_ERROR', `Error forwarding request to PostHog: ${error.message}`, 'forwardRequest')
        return withCORS(new Response('Error forwarding request to PostHog', { status: 502 }))
    }
}

/**
 * Handle PostHog event - forward to PostHog and also send to TinyBird
 */
async function handlePostHogEvent(request, env, ctx, locationId, remainingPath) {
    try {
        // Clone the request so we can use it multiple times
        const requestForPostHog = request.clone()
        const requestForProcessing = request.clone()

        // 1. Forward the original request to PostHog
        console.log('Starting PostHog forwarding...')
        const postHogPromise = forwardRequest(requestForPostHog, remainingPath + new URL(request.url).search, locationId)

        // 2. Process the request to extract the data
        let extractedData
        try {
            console.log('Extracting PostHog data...')
            extractedData = await extractPostHogData(requestForProcessing)
            console.log('Successfully extracted data:', {
                eventCount: extractedData.jsonData.length,
                firstEvent: extractedData.jsonData[0]?.event,
                timestamp: extractedData.timestamp
            })
        } catch (extractError) {
            await logError(locationId, 'EXTRACT_ERROR', `Error extracting PostHog data: ${extractError.message}`, 'handlePostHogEvent')
            console.error('Error extracting PostHog data:', extractError)
            // Even if extraction fails, we still want to forward to PostHog
            return await postHogPromise
        }

        // 3. Send the extracted data to TinyBird
        console.log('Sending data to TinyBird...')
        ctx.waitUntil(
            sendToTinyBird(extractedData.jsonData, {
                timestamp: extractedData.timestamp,
                url: extractedData.url,
                queryParams: extractedData.queryParams,
                headers: extractedData.headers
            }).then(tinyBirdResponse => {
                console.log('TinyBird response:', tinyBirdResponse)
            }).catch(tinyBirdError => {
                logError(locationId, 'TINYBIRD_ERROR', `Error sending to TinyBird: ${tinyBirdError.message}`, 'handlePostHogEvent')
                console.error('Error sending to TinyBird:', tinyBirdError)
            })
        )

        // 4. Return the PostHog response to the client
        const postHogResponse = await postHogPromise
        console.log('PostHog forwarding complete')
        return postHogResponse
    } catch (error) {
        await logError(locationId, 'EVENT_ERROR', `Error in handlePostHogEvent: ${error.message}`, 'handlePostHogEvent')
        console.error('Error in handlePostHogEvent:', error)

        // If something goes wrong, still try to forward to PostHog
        return forwardRequest(request, remainingPath + new URL(request.url).search, locationId)
    }
}

export default {
    async fetch(request, env, ctx) {
        return handleRequest(request, env, ctx)
    }
}
