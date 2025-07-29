import { Hono } from 'hono'
import { createClient } from '@supabase/supabase-js'

// Function to create Supabase client with hardcoded values
function createSupabaseClient() {
    const supabaseUrl = 'https://ggjpdbelozvvmxezdyrs.supabase.co';
    const supabaseKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImdnanBkYmVsb3p2dm14ZXpkeXJzIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc0NjA3MDMyMywiZXhwIjoyMDYxNjQ2MzIzfQ.V6E4UGvxXMqANILkhCbpSMRox4z3_zTWRLUlZnYTSFo';
    
    return createClient(supabaseUrl, supabaseKey);
}

async function createOrUpdateLocation(supabase, locationId, locationName, accessToken, refreshToken, locationDetails) {
    if (!locationId || !locationName) {
        throw new Error('Location ID and name are required')
    }

    console.log('Creating/updating location with ID:', locationId)

    // Validate and sanitize the input data
    const sanitizedData = {
        id: locationId,
        name: locationName,
        access_token: accessToken,
        refresh_token: refreshToken,
        email: locationDetails.email || null,
        timezone: locationDetails.timezone || 'UTC',
        address: locationDetails.address || null,
        city: locationDetails.city || null,
        state: locationDetails.state || null,
        postal_code: locationDetails.postalCode || null,
        country: locationDetails.country || null,
        phone: locationDetails.phone || null,
        website: locationDetails.website || null,
        first_name: locationDetails.firstName || null,
        last_name: locationDetails.lastName || null,
        company_id: locationDetails.companyId || null,
        date_added: locationDetails.dateAdded ? new Date(locationDetails.dateAdded).toISOString() : new Date().toISOString(),
        domain: locationDetails.domain || null,
        business_name: locationDetails.business?.name || locationDetails.name || null,
        business_address: locationDetails.business?.address || locationDetails.address || null,
        business_city: locationDetails.business?.city || locationDetails.city || null,
        business_state: locationDetails.business?.state || locationDetails.state || null,
        business_postal_code: locationDetails.business?.postalCode || locationDetails.postalCode || null,
        business_country: locationDetails.business?.country || locationDetails.country || null,
        business_website: locationDetails.business?.website || locationDetails.website || null,
        business_timezone: locationDetails.business?.timezone || locationDetails.timezone || 'UTC'
    }

    console.log('Sanitized location data to upsert:', JSON.stringify(sanitizedData, null, 2))

    try {
        // Attempt the upsert operation
        const { data, error } = await supabase
            .from('location_keys')
            .upsert(sanitizedData, {
                onConflict: 'id',
                returning: 'minimal' // Only return the primary key
            })

        if (error) {
            console.error('Supabase Error:', {
                message: error.message,
                details: error.details,
                hint: error.hint,
                code: error.code
            })

            // Handle specific error cases
            if (error.code === '23505') {
                throw new Error('Duplicate location ID detected')
            } else if (error.code === '23502') {
                throw new Error('Missing required fields')
            } else {
                throw new Error(`Database error: ${error.message}`)
            }
        }

        console.log('Successfully upserted location:', locationId)
        return { success: true, locationId }
    } catch (error) {
        console.error('Unexpected error during location upsert:', error)
        throw error
    }
}

async function installLocation(c, tokens) {
    const { locationId, companyId } = tokens
    const accessToken = tokens.access_token
    const refreshToken = tokens.refresh_token

    if (!locationId || !companyId || !accessToken || !refreshToken) {
        throw new Error('Missing required tokens for location installation')
    }

    try {
        // Create Supabase client
        const supabase = createSupabaseClient()

        // Step 1: Fetch location details from HighLevel API
        console.log('Fetching location details for:', locationId)
        const response = await fetch(`https://services.leadconnectorhq.com/locations/${locationId}`, {
            method: 'GET',
            headers: {
                'Accept': 'application/json',
                'Authorization': `Bearer ${accessToken}`,
                'Version': '2021-07-28'
            }
        })

        if (!response.ok) {
            const errorText = await response.text()
            console.error('HighLevel API Error:', {
                status: response.status,
                statusText: response.statusText,
                body: errorText
            })
            throw new Error(`Failed to fetch location details: ${response.status} ${response.statusText}`)
        }

        const data = await response.json()
        console.log('Full Location API Response:', JSON.stringify(data, null, 2))

        if (!data.location) {
            throw new Error('Location data not found in API response')
        }

        const locationDetails = data.location
        console.log('Location Details:', JSON.stringify(locationDetails, null, 2))

        // Step 2: Store location info in Supabase with proper field mapping
        const result = await createOrUpdateLocation(
            supabase,
            locationId,
            locationDetails.name || 'Unnamed Location',
            accessToken,
            refreshToken,
            {
                name: locationDetails.name || 'Unnamed Location',
                email: locationDetails.email || null,
                timezone: locationDetails.timezone || 'UTC',
                address: locationDetails.address || null,
                city: locationDetails.city || null,
                state: locationDetails.state || null,
                postalCode: locationDetails.zip || locationDetails.postalCode || null,
                country: locationDetails.country || 'US',
                phone: locationDetails.phone || null,
                website: locationDetails.website || null,
                status: locationDetails.status || 'active',
                companyId: companyId,
                firstName: locationDetails.firstName || null,
                lastName: locationDetails.lastName || null,
                dateAdded: new Date().toISOString(),
                domain: locationDetails.domain || null,
                business: {
                    name: locationDetails.business?.name || locationDetails.name || 'Unnamed Business',
                    address: locationDetails.business?.address || locationDetails.address || null,
                    city: locationDetails.business?.city || locationDetails.city || null,
                    state: locationDetails.business?.state || locationDetails.state || null,
                    postalCode: locationDetails.business?.postalCode || locationDetails.zip || null,
                    country: locationDetails.business?.country || locationDetails.country || 'US',
                    website: locationDetails.business?.website || locationDetails.website || null,
                    timezone: locationDetails.business?.timezone || locationDetails.timezone || 'UTC'
                }
            }
        )

        return {
            status: 'success',
            location: locationDetails,
            databaseResult: result
        }
    } catch (error) {
        console.error('Error during location installation:', error)

        // Enhanced error response
        const errorResponse = {
            status: 'error',
            message: error.message,
            timestamp: new Date().toISOString(),
            locationId,
            companyId
        }

        if (error.response) {
            errorResponse.apiError = {
                status: error.response.status,
                statusText: error.response.statusText
            }
        }

        throw errorResponse
    }
}

export { installLocation }
