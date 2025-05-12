/**
 * Send data to TinyBird
 * @param {Object} jsonData - The decoded JSON data
 * @param {Object} metadata - Additional metadata (query params, headers, etc.)
 * @returns {Promise<Object>} - The response from TinyBird
 */

// Events to exclude from Tinybird tracking
const EXCLUDED_EVENTS = [
    '$pageleave',
    '$$heatmap',
    '$web_vitals',
    '$autocapture'
]

// TinyBird configuration
const TINYBIRD_ENDPOINT = "https://api.us-east.tinybird.co/v0/events"
const TINYBIRD_TOKEN = "p.eyJ1IjogIjIxOGE1NmFkLWZjZGQtNDkxMy1hODI4LWI5YmFiOTY1ZGFjZCIsICJpZCI6ICIzZGE1YWI1OS00MDBhLTQxZTMtOTcwNC01MTc2NjFmZTE3NTYiLCAiaG9zdCI6ICJ1c19lYXN0In0.qUOvPcWcb3Zg4KWikAXbOVGE3ddh9XA7vNzJrLugQcE"

/**
 * Log an error to TinyBird with location context
 * @param {String} locationId - The location ID
 * @param {String} errorType - Type of error
 * @param {String} message - Error message
 * @param {String} component - Component where error occurred
 * @param {String} userId - Optional user ID
 * @returns {Promise<void>}
 */
export async function logError(locationId, errorType, message, component, userId = null) {
    const errorPayload = {
        timestamp: new Date().toISOString(),
        location_id: locationId,
        error_type: errorType,
        message: message,
        component: component,
        user_id: userId,
        request_id: crypto.randomUUID()
    };

    // Log locally
    console.error(`[ERROR][${locationId}][${component}] ${message}`);

    try {
        // Send to TinyBird errors datasource
        const response = await fetch(`${TINYBIRD_ENDPOINT}?name=errors&token=${TINYBIRD_TOKEN}`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(errorPayload)
        });

        if (!response.ok) {
            console.error(`Failed to log error to TinyBird: ${await response.text()}`);
        }
    } catch (err) {
        console.error(`Failed to log error to TinyBird: ${err.message}`);
    }
}

export async function sendToTinyBird(jsonData, metadata) {
    try {
        // Ensure jsonData is an array and filter out invalid events
        const events = Array.isArray(jsonData) ? jsonData : [jsonData]
        const validEvents = events.filter(event =>
            event &&
            typeof event === 'object' &&
            event.event &&
            event.properties &&
            event.properties.$time
        )

        // Filter out excluded events
        const filteredEvents = validEvents.filter(event =>
            !EXCLUDED_EVENTS.includes(event.event)
        )

        if (filteredEvents.length === 0) {
            return { message: 'No events to send after filtering' }
        }

        // Extract location_id from the page path
        const url = new URL(metadata.url)
        const pathParts = url.pathname.split('/').filter(Boolean)
        const locationId = pathParts[1]

        // Check for identify events
        const identifyEvents = []

        // Transform events in batches of 100
        const BATCH_SIZE = 100
        const results = []

        for (let i = 0; i < filteredEvents.length; i += BATCH_SIZE) {
            const batch = filteredEvents.slice(i, i + BATCH_SIZE)

            // Only log identify events
            const identifyEventsInBatch = batch.filter(event => event.event === '$identify')
            if (identifyEventsInBatch.length > 0) {
                console.log(`[IDENTITY] Found ${identifyEventsInBatch.length} identify events`)
            }

            const transformedData = batch.map(event => {
                // Check if this is an identify event and has anonymous_id in properties
                if (event.event === '$identify' &&
                    event.properties &&
                    event.properties.$anon_distinct_id) {

                    console.log(`[IDENTITY] Processing $identify event: distinct_id=${event.properties.distinct_id}, anon_id=${event.properties.$anon_distinct_id}`)

                    // Add to identify events for later processing
                    identifyEvents.push({
                        anonymous_id: event.properties.$anon_distinct_id,
                        user_id: event.properties.distinct_id,
                        timestamp: new Date(event.properties.$time * 1000).toISOString(),
                        location_id: locationId
                    })
                }

                // Extract the properties we want to elevate to top-level fields
                const props = event.properties || {}

                return {
                    uuid: event.uuid || crypto.randomUUID(),
                    event: event.event,
                    properties: JSON.stringify(props), // Store the properties as a JSON string
                    timestamp: new Date(event.properties.$time * 1000).toISOString(),
                    distinct_id: event.properties.distinct_id || 'anonymous',
                    location_id: locationId,
                    // Funnel tracking fields
                    funnel_id: props.funnel_id || null,
                    step_id: props.step_id || null,
                    funnel_name: props.funnel_name || null,
                    page_id: props.page_id || null,
                    affiliate_id: props.affiliate_id || null,
                    // New fields extracted from properties
                    session_id: props.$session_id || null,
                    session_entry_referrer: props.$session_entry_referrer || null,
                    session_entry_referring_domain: props.$session_entry_referring_domain || null,
                    session_entry_url: props.$session_entry_url || null,
                    session_entry_host: props.$session_entry_host || null,
                    session_entry_pathname: props.$session_entry_pathname || null,
                    utm_source: props.utm_source || null,
                    utm_medium: props.utm_medium || null,
                    utm_campaign: props.utm_campaign || null,
                    utm_content: props.utm_content || null,
                    utm_term: props.utm_term || null,
                    gad_source: props.gad_source || null,
                    mc_cid: props.mc_cid || null,
                    gclid: props.gclid || null,
                    gclsrc: props.gclsrc || null,
                    dclid: props.dclid || null,
                    gbraid: props.gbraid || null,
                    wbraid: props.wbraid || null,
                    fbclid: props.fbclid || null,
                    msclkid: props.msclkid || null,
                    twclid: props.twclid || null,
                    li_fat_id: props.li_fat_id || null,
                    igshid: props.igshid || null,
                    ttclid: props.ttclid || null,
                    rdt_cid: props.rdt_cid || null,
                    epik: props.epik || null,
                    qclid: props.qclid || null,
                    sccid: props.sccid || null,
                    irclid: props.irclid || null,
                    _kx: props._kx || null,
                    referrer: props.$referrer || null,
                    referring_domain: props.$referring_domain || null,
                    pageview_id: props.$pageview_id || null,
                    is_identified: props.$is_identified === true ? 1 : 0,
                    // Session entry tracking parameters
                    session_entry_utm_source: props.$session_entry_utm_source || null,
                    session_entry_utm_medium: props.$session_entry_utm_medium || null,
                    session_entry_utm_campaign: props.$session_entry_utm_campaign || null,
                    session_entry_utm_content: props.$session_entry_utm_content || null,
                    session_entry_utm_term: props.$session_entry_utm_term || null,
                    session_entry_gad_source: props.$session_entry_gad_source || null,
                    session_entry_mc_cid: props.$session_entry_mc_cid || null,
                    session_entry_gclid: props.$session_entry_gclid || null,
                    session_entry_gclsrc: props.$session_entry_gclsrc || null,
                    session_entry_dclid: props.$session_entry_dclid || null,
                    session_entry_gbraid: props.$session_entry_gbraid || null,
                    session_entry_wbraid: props.$session_entry_wbraid || null,
                    session_entry_fbclid: props.$session_entry_fbclid || null,
                    session_entry_msclkid: props.$session_entry_msclkid || null,
                    session_entry_twclid: props.$session_entry_twclid || null,
                    session_entry_li_fat_id: props.$session_entry_li_fat_id || null,
                    session_entry_igshid: props.$session_entry_igshid || null,
                    session_entry_ttclid: props.$session_entry_ttclid || null,
                    session_entry_rdt_cid: props.$session_entry_rdt_cid || null,
                    session_entry_epik: props.$session_entry_epik || null,
                    session_entry_qclid: props.$session_entry_qclid || null,
                    session_entry_sccid: props.$session_entry_sccid || null,
                    session_entry_irclid: props.$session_entry_irclid || null,
                    session_entry__kx: props.$session_entry__kx || null,
                    // Browser and device fields
                    browser: props.$browser || null,
                    device_type: props.$device_type || null,
                    timezone: props.$timezone || null,
                    current_url: props.$current_url || null,
                    host: props.$host || null,
                    pathname: props.$pathname || null
                }
            })

            // Format each object as JSON, then join with newlines for ndjson format
            const ndjsonPayload = transformedData.map(obj => JSON.stringify(obj)).join('\n')

            // Send batch to TinyBird
            const response = await fetch(`${TINYBIRD_ENDPOINT}?name=events&token=${TINYBIRD_TOKEN}`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: ndjsonPayload
            })

            if (!response.ok) {
                const errorText = await response.text()
                await logError(locationId, 'API_ERROR', `TinyBird API error (${response.status}): ${errorText}`, 'sendToTinyBird')
                throw new Error(`TinyBird API error (${response.status}): ${errorText}`)
            }

            results.push(await response.json())
        }

        // Process identity mappings if any were detected
        if (identifyEvents.length > 0) {
            console.log(`[IDENTITY] Sending ${identifyEvents.length} identity mappings to TinyBird`)
            await processIdentityMappings(identifyEvents, TINYBIRD_TOKEN, locationId)
        }

        // Combine results
        return {
            successful_rows: results.reduce((sum, r) => sum + (r.successful_rows || 0), 0),
            quarantined_rows: results.reduce((sum, r) => sum + (r.quarantined_rows || 0), 0)
        }
    } catch (error) {
        // Extract location_id from the page path for error reporting
        const url = new URL(metadata.url)
        const pathParts = url.pathname.split('/').filter(Boolean)
        const locationId = pathParts[1] || 'unknown'

        await logError(locationId, 'PROCESSING_ERROR', error.message, 'sendToTinyBird')
        return { error: error.message }
    }
}

/**
 * Process identity mappings for user identification
 * @param {Array} identifyEvents - Array of identify events
 * @param {String} token - Tinybird API token
 * @param {String} locationId - Location ID
 * @returns {Promise<void>}
 */
async function processIdentityMappings(identifyEvents, token, locationId) {
    if (!identifyEvents.length) return

    try {
        for (const mapping of identifyEvents) {
            const payload = {
                anonymous_id: mapping.anonymous_id,
                user_id: mapping.user_id,
                first_seen: mapping.timestamp,
                last_seen: mapping.timestamp,
                location_id: mapping.location_id
            }

            console.log(`[IDENTITY] Sending mapping: anon=${mapping.anonymous_id}, user=${mapping.user_id}, location=${mapping.location_id}`)

            const mappingsResponse = await fetch(`${TINYBIRD_ENDPOINT}?name=identity_mappings&token=${token}`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify(payload)
            })

            if (!mappingsResponse.ok) {
                const errorText = await mappingsResponse.text()
                console.error(`[IDENTITY] Error: ${errorText}`)
                await logError(locationId, 'IDENTITY_MAPPING_ERROR', errorText, 'processIdentityMappings', mapping.user_id)
            } else {
                const responseData = await mappingsResponse.json()
                console.log(`[IDENTITY] Success: ${JSON.stringify(responseData)}`)
            }
        }
    } catch (error) {
        console.error(`[IDENTITY] Error: ${error.message}`)
        await logError(locationId, 'IDENTITY_MAPPING_EXCEPTION', error.message, 'processIdentityMappings')
    }
}
