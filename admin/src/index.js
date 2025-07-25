import { Hono } from 'hono'
import { HIGHLEVEL_CONFIG } from './highlevel-config'
import { installCompany } from './company-install'
import { installLocation } from './location-install'
import CryptoJS from 'crypto-js'

// Import new route modules
import embedRoutes from './routes/embed'
import oauthRoutes from './routes/oauth'
import adminRoutes from './routes/admin'

const app = new Hono()

// Shared key for decryption (from HighLevel)
const SHARED_SECRET_KEY = '54d3b813-5e81-4704-a60b-5a4a6c9fa817'

// Simple function to decrypt user data using CryptoJS
function decryptUserData(encryptedUserData) {
    try {
        console.log('Attempting to decrypt data with CryptoJS');
        console.log('Encrypted data type:', typeof encryptedUserData);
        console.log('Encrypted data length:', encryptedUserData.length);
        console.log('Using shared key:', SHARED_SECRET_KEY);

        const decrypted = CryptoJS.AES.decrypt(encryptedUserData, SHARED_SECRET_KEY).toString(CryptoJS.enc.Utf8)

        console.log('Decryption successful, decrypted length:', decrypted.length);

        const userData = JSON.parse(decrypted)
        console.log('Successfully parsed decrypted data');

        return userData;
    } catch (error) {
        console.error('Decryption error:', error)
        throw new Error('Failed to decrypt user data: ' + error.message)
    }
}

// Mount new route modules
app.route('/embed', embedRoutes)
app.route('/oauth', oauthRoutes)
app.route('/admin', adminRoutes)

// Health check endpoint
app.get('/', (c) => {
    return c.text('Hello World')
})

// Decrypt SSO endpoint (remains here for now, or can be moved if desired)
app.post('/decrypt-sso', async (c) => {
    try {
        const { encryptedData } = await c.req.json();

        console.log('Received request to decrypt data');

        if (!encryptedData) {
            console.log('Missing encrypted data in request');
            return c.json({ error: 'Missing encrypted data' }, 400);
        }

        console.log('Encrypted data received (first 20 chars):', encryptedData.substring(0, 20) + '...');

        // Decrypt the user data
        const userData = decryptUserData(encryptedData);

        console.log('Successfully returned decrypted user data');

        return c.json(userData);
    } catch (error) {
        console.error('Decryption failed:', error);
        return c.json({ error: error.message }, 400);
    }
})

export default {
    fetch: app.fetch
} 