import { createClient } from '@supabase/supabase-js'

const CACHE_TTL = 3600 // 1 hour in seconds

export async function checkLocationPermission(locationId, env) {
    try {
        // Check KV cache first
        const cachedPermission = await env.LOCATION_PERMISSIONS.get(locationId)
        if (cachedPermission !== null) {
            return cachedPermission === 'true'
        }

        // If not in cache, check Supabase
        const response = await fetch(`${env.SUPABASE_URL}/rest/v1/location_keys?id=eq.${locationId}&select=allow_posthog_proxy`, {
            headers: {
                'apikey': env.SUPABASE_SERVICE_KEY,
                'Authorization': `Bearer ${env.SUPABASE_SERVICE_KEY}`
            }
        })

        if (!response.ok) {
            throw new Error(`Supabase query failed: ${response.statusText}`)
        }

        const data = await response.json()
        const isAllowed = data.length > 0 && data[0].allow_posthog_proxy

        // Cache the result for 5 minutes
        await env.LOCATION_PERMISSIONS.put(locationId, isAllowed.toString(), { expirationTtl: 300 })

        return isAllowed
    } catch (error) {
        console.error('Error checking location permission:', error)
        return false
    }
} 