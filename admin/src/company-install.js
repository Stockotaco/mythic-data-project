import { Hono } from 'hono'
import { createClient } from '@supabase/supabase-js'

// Function to create Supabase client with environment variables
function createSupabaseClient(env) {
    const supabaseUrl = env?.SUPABASE_URL;
    const supabaseKey = env?.SUPABASE_SERVICE_ROLE_KEY;
    
    if (!supabaseUrl || !supabaseKey) {
        throw new Error('Supabase environment variables not configured. Please set SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY using "wrangler secret put"');
    }
    
    return createClient(supabaseUrl, supabaseKey);
}

async function createOrUpdateCompany(supabase, companyId, companyName, accessToken, refreshToken, companyDetails) {
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

async function installCompany(c, tokens) {
    const { companyId } = tokens
    const accessToken = tokens.access_token
    const refreshToken = tokens.refresh_token

    try {
        // Create Supabase client
        const supabase = createSupabaseClient(c.env)

        // Step 1: Fetch company details from HighLevel API
        const response = await fetch(`https://services.leadconnectorhq.com/companies/${companyId}`, {
            method: 'GET',
            headers: {
                'Accept': 'application/json',
                'Authorization': `Bearer ${accessToken}`,
                'Version': '2021-07-28'
            }
        })

        if (!response.ok) {
            throw new Error(`Failed to fetch company details: ${response.statusText}`)
        }

        const data = await response.json()
        const companyDetails = data.company

        // Step 2: Store company info in Supabase
        await createOrUpdateCompany(
            supabase,
            companyId,
            companyDetails.name,
            accessToken,
            refreshToken,
            {
                name: companyDetails.name,
                email: companyDetails.email,
                timezone: companyDetails.timezone,
                relationshipNumber: companyDetails.relationshipNumber,
                currency: companyDetails.currency,
                customerType: companyDetails.customerType,
                dateAdded: companyDetails.dateAdded,
                status: true,
                locationCount: companyDetails.locationCount,
                // Additional fields
                phone: companyDetails.phone,
                website: companyDetails.website,
                domain: companyDetails.domain,
                address: companyDetails.address,
                city: companyDetails.city,
                state: companyDetails.state,
                country: companyDetails.country,
                postalCode: companyDetails.postalCode,
                logoUrl: companyDetails.logoUrl,
                subdomain: companyDetails.subdomain,
                isReselling: companyDetails.isReselling,
                businessCategory: companyDetails.businessCategory,
                businessNiche: companyDetails.businessNiche,
                defaultSendingDomain: companyDetails.defaultSendingDomain,
                stripeConnectId: companyDetails.stripeConnectId,
                isInTrial: companyDetails.isInTrial,
                premiumUpgraded: companyDetails.premiumUpgraded,
                dateUpdated: companyDetails.dateUpdated
            }
        )

        return {
            status: 'success',
            company: companyDetails
        }
    } catch (error) {
        console.error('Error during company installation:', error)
        throw new Error('Failed to install company: ' + error.message)
    }
}

export { installCompany }

