import { Hono } from 'hono'
import { initSupabase, createOrUpdateLocation } from './supabase/supabase.js'

async function installLocation(c, tokens) {
    const { locationId, companyId } = tokens
    const accessToken = tokens.access_token
    const refreshToken = tokens.refresh_token

    if (!locationId || !companyId || !accessToken || !refreshToken) {
        throw new Error('Missing required tokens for location installation')
    }

    try {
        // Initialize Supabase
        initSupabase(c.env)

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
