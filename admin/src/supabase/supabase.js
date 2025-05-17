import { createClient } from '@supabase/supabase-js'

let supabase = null

export function initSupabase(env) {
    if (!supabase) {
        if (!env.SUPABASE_URL || !env.SUPABASE_KEY) {
            throw new Error('Supabase environment variables are not configured')
        }
        console.log('Initializing Supabase with URL:', env.SUPABASE_URL)
        supabase = createClient(env.SUPABASE_URL, env.SUPABASE_KEY)
    }
    return supabase
}

async function createOrUpdateCompany(companyId, companyName, accessToken, refreshToken, companyDetails) {
    if (!supabase) {
        throw new Error('Supabase client not initialized. Call initSupabase first.')
    }

    const { data, error } = await supabase
        .from('company_keys')
        .upsert({
            id: companyId,
            name: companyName,
            access_token: accessToken,
            refresh_token: refreshToken,
            email: companyDetails.email,
            timezone: companyDetails.timezone,
            relationship_number: companyDetails.relationshipNumber,
            currency: companyDetails.currency,
            customer_type: companyDetails.customerType,
            date_added: companyDetails.dateAdded,
            status: companyDetails.status,
            location_count: companyDetails.locationCount,
            phone: companyDetails.phone,
            website: companyDetails.website,
            domain: companyDetails.domain,
            address: companyDetails.address,
            city: companyDetails.city,
            state: companyDetails.state,
            country: companyDetails.country,
            postal_code: companyDetails.postalCode,
            logo_url: companyDetails.logoUrl,
            subdomain: companyDetails.subdomain,
            is_reselling: companyDetails.isReselling,
            business_category: companyDetails.businessCategory,
            business_niche: companyDetails.businessNiche,
            default_sending_domain: companyDetails.defaultSendingDomain,
            stripe_connect_id: companyDetails.stripeConnectId,
            is_in_trial: companyDetails.isInTrial,
            premium_upgraded: companyDetails.premiumUpgraded,
            date_updated: companyDetails.dateUpdated
        }, {
            onConflict: 'id'
        })

    if (error) {
        console.error('Error creating company:', error)
        throw new Error('Failed to create company')
    }

    return data
}

async function createOrUpdateLocation(locationId, locationName, accessToken, refreshToken, locationDetails) {
    if (!supabase) {
        throw new Error('Supabase client not initialized. Call initSupabase first.')
    }

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

export { supabase, createOrUpdateCompany, createOrUpdateLocation }
