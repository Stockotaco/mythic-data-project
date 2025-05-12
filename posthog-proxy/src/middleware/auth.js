import { checkLocationPermission } from '../supabase.js'
import { logError } from '../tinybird.js'

// Location authentication middleware
export const locationAuth = async (c, next) => {
    try {
        const locationId = c.req.param('locationId')

        // Check location permission
        const isAllowed = await checkLocationPermission(locationId, c.env)
        if (!isAllowed) {
            await logError(locationId, 'AUTH_ERROR', 'Location not authorized to use PostHog proxy', 'locationAuth')
            return c.text('Location not authorized to use PostHog proxy', 403)
        }

        // Attach the locationId to the context for handlers to use
        c.set('locationId', locationId)
        return next()
    } catch (error) {
        const locationId = c.req.param('locationId') || 'unknown'
        await logError(locationId, 'AUTH_ERROR', `Error in auth middleware: ${error.message}`, 'locationAuth')
        return c.text('Internal Server Error', 500)
    }
} 