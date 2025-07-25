import { Hono } from 'hono'
import { HIGHLEVEL_CONFIG } from '../highlevel-config'
import { installCompany } from '../company-install'
import { installLocation } from '../location-install'

const oauthRoutes = new Hono()

oauthRoutes.get('/authorize', (c) => {
    const state = crypto.randomUUID()
    const authUrl = new URL(HIGHLEVEL_CONFIG.AUTH_URL)
    authUrl.searchParams.set('client_id', HIGHLEVEL_CONFIG.CLIENT_ID)
    authUrl.searchParams.set('redirect_uri', HIGHLEVEL_CONFIG.REDIRECT_URI)
    authUrl.searchParams.set('response_type', 'code')
    authUrl.searchParams.set('state', state)
    authUrl.searchParams.set('scope', HIGHLEVEL_CONFIG.SCOPES)
    return c.redirect(authUrl.toString())
})

oauthRoutes.get('/callback', async (c) => {
    const { code, state } = c.req.query()
    const { CLIENT_ID, CLIENT_SECRET, REDIRECT_URI } = HIGHLEVEL_CONFIG
    try {
        // Exchange code for tokens
        console.log('Exchanging code for tokens...')
        const response = await fetch(HIGHLEVEL_CONFIG.TOKEN_URL, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/x-www-form-urlencoded',
            },
            body: new URLSearchParams({
                grant_type: 'authorization_code',
                code,
                client_id: CLIENT_ID,
                client_secret: CLIENT_SECRET,
                redirect_uri: REDIRECT_URI,
            }),
        })
        const tokens = await response.json()
        console.log('OAuth Response:', JSON.stringify(tokens, null, 2))
        let result = null;
        if (tokens.userType === 'Company') {
            console.log('Installing company...')
            result = await installCompany(c, tokens)
        }
        if (tokens.userType === 'Location') {
            console.log('Installing location...')
            result = await installLocation(c, tokens)
        }
        return c.json(result)
    } catch (error) {
        console.error('Error exchanging code for tokens:', error)
        return c.json({ error: error.message }, 500)
    }
})

export default oauthRoutes