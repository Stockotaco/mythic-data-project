import { Hono } from 'hono'
import { initSupabase, createOrUpdateCompany } from './supabase/supabase.js'

async function installCompany(c, tokens) {
    const { companyId } = tokens
    const accessToken = tokens.access_token
    const refreshToken = tokens.refresh_token

    try {
        // Initialize Supabase
        initSupabase(c.env)

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
                status: companyDetails.status,
                locationCount: companyDetails.locationCount
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

