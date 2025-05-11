import { Hono } from 'hono'
import { HIGHLEVEL_CONFIG } from './highlevel-config'
import { installCompany } from './company-install'
import { installLocation } from './location-install'
import CryptoJS from 'crypto-js'

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

// Health check endpoint
app.get('/', (c) => {
    return c.text('Hello World')
})

// Embed page route
app.get('/embed', (c) => {
    return c.html(`
    <!DOCTYPE html>
    <html>
    <head>
        <title>Mythic Data Embed</title>
        <script>
        // Get user data from HighLevel using Custom Pages Implementation
        async function getUserData() {
            // Request user data from parent window
            const encryptedUserData = await new Promise((resolve) => {
                window.parent.postMessage({ message: 'REQUEST_USER_DATA' }, '*');
                
                // Listen for the response
                const messageHandler = ({ data }) => {
                    if (data.message === 'REQUEST_USER_DATA_RESPONSE') {
                        window.removeEventListener('message', messageHandler);
                        resolve(data.payload);
                    }
                };
                
                window.addEventListener('message', messageHandler);
            });
            
            if (!encryptedUserData) {
                throw new Error('No user data received from HighLevel');
            }
            
            // Send to backend for decryption
            const response = await fetch('/decrypt-sso', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({ encryptedData: encryptedUserData })
            });
            
            const result = await response.json();
            
            if (!response.ok) {
                throw new Error(result.error || 'Failed to decrypt user data');
            }
            
            return result;
        }

        // Initialize the page
        async function init() {
            try {
                // Show loading indicator
                const loadingElem = document.getElementById('loading-indicator');
                if (loadingElem) loadingElem.style.display = 'block';
                
                // Hide iframe initially
                document.getElementById('embed-iframe').style.display = 'none';
                document.getElementById('diagnostic-container').style.display = 'none';
                
                // Try to get user data
                try {
                    const userData = await getUserData();
                    
                    // Hide loading indicator
                    if (loadingElem) loadingElem.style.display = 'none';
                    
                    // Create the iframe with user data
                    const iframe = document.getElementById('embed-iframe');
                    
                    // Prepare URL with query parameters
                    const embedUrl = new URL('https://app.mythicdata.io/embed');
                    Object.entries(userData).forEach(([key, value]) => {
                        if (value !== null && value !== undefined) {
                            embedUrl.searchParams.append(key, value);
                        }
                    });
                    
                    iframe.src = embedUrl.toString();
                    iframe.style.display = 'block';
                    
                } catch (dataError) {
                    // Handle decryption errors
                    console.error('Failed to get user data:', dataError);
                    if (loadingElem) loadingElem.style.display = 'none';
                    
                    document.getElementById('diagnostic-container').style.display = 'block';
                    document.getElementById('diagnostic-title').textContent = 'Error Getting User Data';
                    document.getElementById('diagnostic-message').textContent = dataError.message;
                }
            } catch (error) {
                // Handle any other errors
                console.error('Error initializing:', error);
                document.getElementById('loading-indicator').style.display = 'none';
                document.getElementById('diagnostic-container').style.display = 'block';
                document.getElementById('diagnostic-title').textContent = 'Error Loading Data';
                document.getElementById('diagnostic-message').textContent = error.message;
            }
        }

        window.onload = init;
        </script>
        <style>
            body { font-family: Arial, sans-serif; margin: 0; padding: 0; height: 100vh; }
            .loading { 
                display: flex; 
                justify-content: center; 
                align-items: center; 
                height: 100%; 
                color: #666; 
                animation: pulse 1.5s infinite; 
            }
            @keyframes pulse { 
                0% { opacity: 0.6; }
                50% { opacity: 1; }
                100% { opacity: 0.6; }
            }
            iframe {
                width: 100%;
                height: 100%;
                border: none;
            }
            .diagnostic-panel { 
                background: #fff0f0; 
                border: 1px solid #ffcccc; 
                padding: 15px;
                margin: 20px;
                border-radius: 5px;
            }
            .diagnostic-panel h3 { 
                color: #cc0000;
                margin-top: 0;
            }
            .error-message {
                color: #cc0000;
                font-weight: bold;
            }
        </style>
    </head>
    <body>
        <div id="loading-indicator" class="loading">Loading application...</div>
        <iframe id="embed-iframe" style="display: none;" src=""></iframe>
        
        <div id="diagnostic-container" class="diagnostic-panel" style="display: none;">
            <h3 id="diagnostic-title">Error</h3>
            <p class="error-message" id="diagnostic-message">An error occurred</p>
            <p>Please ensure:</p>
            <ul>
                <li>You're loading this page from HighLevel</li>
                <li>Your account has proper permissions</li>
                <li>The shared secret key is correct</li>
            </ul>
            <p>If the problem persists, please contact support.</p>
        </div>
    </body>
    </html>
    `)
})

// Decrypt SSO endpoint
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

// OAuth endpoints
app.get('/oauth/authorize', (c) => {
    const state = crypto.randomUUID()

    const authUrl = new URL(HIGHLEVEL_CONFIG.AUTH_URL)
    authUrl.searchParams.set('client_id', HIGHLEVEL_CONFIG.CLIENT_ID)
    authUrl.searchParams.set('redirect_uri', HIGHLEVEL_CONFIG.REDIRECT_URI)
    authUrl.searchParams.set('response_type', 'code')
    authUrl.searchParams.set('state', state)

    return c.redirect(authUrl.toString())
})

app.get('/oauth/callback', async (c) => {
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

// Admin endpoints
app.get('/admin/status', async (c) => {
    // TODO: Implement status check
    return c.json({ status: 'ok' })
})

export default {
    fetch: app.fetch
} 