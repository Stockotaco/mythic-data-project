import { extractPostHogData } from '../utils.js'
import { sendToTinyBird, logError } from '../tinybird.js'
import { forwardToPostHog } from '../postHogClient.js'

// Handle PostHog event tracking
export const handlePostHogEvent = async (c) => {
    try {
        const locationId = c.get('locationId')
        const request = c.req.raw
        const url = new URL(request.url)
        const search = url.search

        // Extract the remaining path (everything after the locationId)
        const fullPath = url.pathname
        const pathParts = fullPath.split('/').filter(Boolean)
        const pathIndex = pathParts.indexOf(locationId)
        const remainingPath = '/' + pathParts.slice(pathIndex + 1).join('/')

        // Clone the request so we can use it multiple times
        const requestForPostHog = request.clone()
        const requestForProcessing = request.clone()

        // 1. Forward the original request to PostHog
        console.log('Starting PostHog forwarding...')
        const postHogPromise = forwardToPostHog(requestForPostHog, remainingPath + search, locationId)

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
            return new Response(await (await postHogPromise).blob(), {
                status: (await postHogPromise).status,
                headers: (await postHogPromise).headers
            })
        }

        // 3. Send the extracted data to TinyBird
        console.log('Sending data to TinyBird...')
        c.executionCtx.waitUntil(
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
        return new Response(await postHogResponse.blob(), {
            status: postHogResponse.status,
            headers: postHogResponse.headers
        })
    } catch (error) {
        const locationId = c.get('locationId') || 'unknown'
        await logError(locationId, 'EVENT_ERROR', `Error in event handler: ${error.message}`, 'handlePostHogEvent')
        console.error('Error in event handler:', error)
        return c.text('Internal Server Error', 500)
    }
} 