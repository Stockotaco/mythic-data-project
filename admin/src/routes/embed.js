import { Hono } from 'hono'
import { createClient } from '@supabase/supabase-js'
import CryptoJS from 'crypto-js'

const embedRoutes = new Hono()

// Function to create Supabase client with secrets from context
function createSupabaseClient(c) {
    const supabaseUrl = c.env?.SUPABASE_URL;
    const supabaseKey = c.env?.SUPABASE_SERVICE_ROLE_KEY;
    
    // Use environment variables or fallback (for now until secrets work properly)
    const finalUrl = supabaseUrl || 'https://ggjpdbelozvvmxezdyrs.supabase.co';
    const finalKey = supabaseKey || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImdnanBkYmVsb3p2dm14ZXpkeXJzIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc0NjA3MDMyMywiZXhwIjoyMDYxNjQ2MzIzfQ.V6E4UGvxXMqANILkhCbpSMRox4z3_zTWRLUlZnYTSFo';
    
    if (!supabaseUrl || !supabaseKey) {
        console.warn('Supabase secrets not properly configured, using fallback values');
    }
    
    return createClient(finalUrl, finalKey);
}

// Function to sign JWT using HMAC SHA256
async function signJWT(payload, secret) {
    if (!secret || secret.length === 0) {
        console.error('JWT secret is empty or undefined');
        // Return a basic signature as fallback
        return 'fallback-signature';
    }

    try {
        const encoder = new TextEncoder();
        const data = encoder.encode(payload);
        
        // Decode the base64 secret key
        const secretBytes = Uint8Array.from(atob(secret), c => c.charCodeAt(0));
        
        // Import the key for HMAC
        const cryptoKey = await crypto.subtle.importKey(
            'raw',
            secretBytes,
            { name: 'HMAC', hash: 'SHA-256' },
            false,
            ['sign']
        );
        
        // Sign the payload
        const signature = await crypto.subtle.sign('HMAC', cryptoKey, data);
        
        // Convert to base64url
        const signatureArray = new Uint8Array(signature);
        return btoa(String.fromCharCode(...signatureArray))
            .replace(/\+/g, '-')
            .replace(/\//g, '_')
            .replace(/=/g, '');
    } catch (error) {
        console.error('JWT signing error:', error);
        return 'error-signature';
    }
}

// Shared key for decryption (from HighLevel)
const SHARED_SECRET_KEY = '54d3b813-5e81-4704-a60b-5a4a6c9fa817'

// Function to decrypt user data
function decryptUserData(encryptedUserData) {
    try {
        // Process the hash: URL decode if needed, then fix base64 padding
        let processedHash = encryptedUserData;
        try {
            processedHash = decodeURIComponent(encryptedUserData);
        } catch (e) {
            // Hash is not URL encoded, use original
        }
        
        // Replace spaces with + signs for proper base64 format
        processedHash = processedHash.replace(/\s/g, '+');

        const decrypted = CryptoJS.AES.decrypt(processedHash, SHARED_SECRET_KEY).toString(CryptoJS.enc.Utf8)
        const userData = JSON.parse(decrypted)
        return userData;
    } catch (error) {
        throw new Error('Failed to decrypt user data: ' + error.message)
    }
}

// Simple rate limiting store (in-memory, resets on worker restart)
const rateLimitStore = new Map();

// POST route for server-side authentication
embedRoutes.post('/authenticate', async (c) => {
    try {
        // Basic rate limiting by IP
        const clientIP = c.req.header('cf-connecting-ip') || c.req.header('x-forwarded-for') || 'unknown';
        const now = Date.now();
        const windowMs = 60000; // 1 minute
        const maxRequests = 10; // 10 requests per minute per IP

        const key = `auth_${clientIP}`;
        const current = rateLimitStore.get(key) || { count: 0, resetTime: now + windowMs };

        if (now > current.resetTime) {
            current.count = 1;
            current.resetTime = now + windowMs;
        } else {
            current.count++;
        }

        rateLimitStore.set(key, current);

        if (current.count > maxRequests) {
            console.warn(`Rate limit exceeded for IP: ${clientIP}`);
            return c.json({ error: 'Too many authentication requests. Please try again later.' }, 429);
        }
        const { encryptedUserData } = await c.req.json();

        if (!encryptedUserData) {
            return c.json({ error: 'Missing encrypted user data' }, 400);
        }

        // Validate encrypted data format
        if (typeof encryptedUserData !== 'string' || encryptedUserData.length < 10) {
            console.error('Invalid encrypted data format');
            return c.json({ error: 'Invalid encrypted data format' }, 400);
        }

        // Basic validation for base64-like structure
        if (!/^[A-Za-z0-9+/\s]+=*$/.test(encryptedUserData)) {
            console.error('Encrypted data does not appear to be valid base64');
            return c.json({ error: 'Invalid encrypted data encoding' }, 400);
        }

        // Environment check (non-sensitive logging only)
        if (!c.env?.SUPABASE_URL || !c.env?.SUPABASE_SERVICE_ROLE_KEY) {
            console.log('Using fallback Supabase configuration');
        }

        // Create Supabase client with secrets from environment
        const supabase = createSupabaseClient(c);

        // Decrypt the user data
        const userData = decryptUserData(encryptedUserData);
        
        if (!userData.email) {
            return c.json({ error: 'No email found in user data' }, 400);
        }

        // Normalize email address
        const normalizedEmail = userData.email.toString().trim().toLowerCase();
        
        if (!normalizedEmail || !normalizedEmail.includes('@')) {
            return c.json({ error: 'Invalid email address format' }, 400);
        }

        // Update userData with normalized email
        userData.email = normalizedEmail;

        // Try to create user first (will fail if user exists)
        let userId;
        const { data: newUser, error: createError } = await supabase.auth.admin.createUser({
            email: userData.email,
            email_confirm: true,
            user_metadata: {
                source: 'highlevel',
                ...userData
            }
        });

        if (createError) {
            // User might already exist, try to get existing user
            console.log('User creation failed, trying to get existing user:', createError.message);
            
            const { data: { users }, error: listError } = await supabase.auth.admin.listUsers();
            
            if (listError) {
                console.error('Error listing users:', listError);
                return c.json({ error: 'Failed to check existing users' }, 500);
            }
            
            const existingUser = users.find(user => user.email === userData.email);
            
            if (existingUser) {
                userId = existingUser.id;
                console.log('Found existing user:', userId);
            } else {
                console.error('User creation failed and user not found:', createError);
                return c.json({ error: 'Failed to create or find user' }, 500);
            }
        } else {
            userId = newUser.user.id;
            console.log('Created new user:', userId);
        }

        // Skip the duplicate user creation since we already handled it above
        console.log('Using existing userId:', userId);

        // Use Supabase admin to generate a session token directly
        const { data: sessionData, error: sessionError } = await supabase.auth.admin.generateLink({
            type: 'magiclink',
            email: normalizedEmail
        });

        if (sessionError) {
            console.error('Error generating session:', sessionError);
            return c.json({ error: 'Failed to generate session' }, 500);
        }

        // Extract the access and refresh tokens from the magic link
        const magicLink = sessionData.properties?.action_link;
        if (!magicLink) {
            console.error('No magic link generated');
            return c.json({ error: 'Failed to generate authentication link' }, 500);
        }

        const url = new URL(magicLink);
        
        // Get the verification token from the magic link
        const verificationToken = url.searchParams.get('token');
        
        if (!verificationToken) {
            console.error('No verification token found in magic link');
            return c.json({ error: 'Failed to extract verification token' }, 500);
        }

        // Use the verification token to create a session
        const { data: verifyData, error: verifyError } = await supabase.auth.verifyOtp({
            token_hash: verificationToken,
            type: 'magiclink'
        });

        if (verifyError) {
            console.error('Error verifying token:', verifyError);
            return c.json({ error: 'Failed to verify authentication token' }, 500);
        }

        if (!verifyData.session) {
            console.error('No session created from token verification');
            return c.json({ error: 'Failed to create session from token' }, 500);
        }

        const accessToken = verifyData.session.access_token;
        const refreshToken = verifyData.session.refresh_token;

        // Set the redirect URL
        const redirectUrl = new URL('https://app.mythicdata.io/');
        redirectUrl.searchParams.append('embed', 'true');

        // Create response
        const response = c.json({ 
            success: true, 
            redirectUrl: redirectUrl.toString()
        });

        // Extract expiration from JWT to set proper cookie expiration
        let accessTokenExpiry = 3600; // Default 1 hour
        let refreshTokenExpiry = 2592000; // Default 30 days

        try {
            // Decode JWT to get actual expiration
            const accessPayload = JSON.parse(atob(accessToken.split('.')[1]));
            if (accessPayload.exp) {
                const now = Math.floor(Date.now() / 1000);
                accessTokenExpiry = Math.max(accessPayload.exp - now, 0);
            }
        } catch (e) {
            console.warn('Could not decode access token expiration, using default');
        }

        // Set cookies with proper expiration matching JWT
        const cookieOptions = `Domain=.mythicdata.io; Path=/; Max-Age=${accessTokenExpiry}; HttpOnly; Secure; SameSite=None`;
        const refreshCookieOptions = `Domain=.mythicdata.io; Path=/; Max-Age=${refreshTokenExpiry}; HttpOnly; Secure; SameSite=None`;
        
        // Set separate cookies for access_token and refresh_token
        response.headers.append('Set-Cookie', `access_token=${accessToken}; ${cookieOptions}`);
        response.headers.append('Set-Cookie', `refresh_token=${refreshToken}; ${refreshCookieOptions}`);

        return response;

    } catch (error) {
        console.error('Authentication error:', error);
        return c.json({ error: error.message }, 500);
    }
})

embedRoutes.get('/', (c) => {
    return c.html(`
    <!DOCTYPE html>
    <html>
    <head>
        <title>Mythic Data Embed</title>
        <script>
        // Get encrypted user data from HighLevel using Custom Pages Implementation
        async function getEncryptedUserData() {
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
            return encryptedUserData;
        }
        // Initialize the page and redirect
        async function init() {
            try {
                // Show loading indicator
                const loadingElem = document.getElementById('loading-indicator');
                if (loadingElem) loadingElem.style.display = 'block';
                
                // Try to get encrypted user data
                try {
                    const encryptedUserData = await getEncryptedUserData();
                    
                    // Send encrypted data to server for authentication
                    const response = await fetch('/embed/authenticate', {
                        method: 'POST',
                        headers: {
                            'Content-Type': 'application/json'
                        },
                        body: JSON.stringify({ encryptedUserData })
                    });

                    const result = await response.json();

                    if (!response.ok) {
                        throw new Error(result.error || 'Authentication failed');
                    }

                    // Redirect to the main app with the session token
                    window.location.href = result.redirectUrl;
                } catch (dataError) {
                    // Handle data retrieval errors
                    console.error('Failed to get encrypted user data:', dataError);
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
            body { font-family: Arial, sans-serif; margin: 0; padding: 0; height: 100vh; overflow: hidden; }
            
            .loading-container { 
                position: fixed;
                top: 0;
                left: 0;
                width: 100%;
                height: 100%;
                background: radial-gradient(ellipse at bottom, #1b2735 0%, #090a0f 100%);
                display: flex; 
                flex-direction: column;
                justify-content: center; 
                align-items: center; 
                z-index: 9999;
                overflow: hidden;
            }
            
            .stars {
                position: absolute;
                top: 0;
                left: 0;
                width: 100%;
                height: 100%;
                background-image: 
                    radial-gradient(2px 2px at 20px 30px, #eee, transparent),
                    radial-gradient(2px 2px at 40px 70px, rgba(255,255,255,0.8), transparent),
                    radial-gradient(1px 1px at 90px 40px, #fff, transparent),
                    radial-gradient(1px 1px at 130px 80px, rgba(255,255,255,0.6), transparent),
                    radial-gradient(2px 2px at 160px 30px, #ddd, transparent);
                background-repeat: repeat;
                background-size: 200px 100px;
                animation: sparkle 3s linear infinite;
            }
            
            @keyframes sparkle {
                from { transform: translateX(0); }
                to { transform: translateX(-200px); }
            }
            
            .cosmic-loader {
                position: relative;
                width: 120px;
                height: 120px;
                margin-bottom: 40px;
            }
            
            .orbit {
                position: absolute;
                border: 2px solid transparent;
                border-top: 2px solid rgba(255, 255, 255, 0.6);
                border-radius: 50%;
                animation: orbit 2s linear infinite;
            }
            
            .orbit:nth-child(1) {
                width: 120px;
                height: 120px;
                top: 0;
                left: 0;
                animation-duration: 2s;
            }
            
            .orbit:nth-child(2) {
                width: 80px;
                height: 80px;
                top: 20px;
                left: 20px;
                animation-duration: 1.5s;
                animation-direction: reverse;
                border-top-color: rgba(100, 200, 255, 0.7);
            }
            
            .orbit:nth-child(3) {
                width: 40px;
                height: 40px;
                top: 40px;
                left: 40px;
                animation-duration: 1s;
                border-top-color: rgba(255, 100, 200, 0.8);
            }
            
            .center-dot {
                position: absolute;
                width: 8px;
                height: 8px;
                background: radial-gradient(circle, #fff 0%, #64c8ff 100%);
                border-radius: 50%;
                top: 56px;
                left: 56px;
                animation: pulse 1.5s ease-in-out infinite;
            }
            
            @keyframes orbit {
                0% { transform: rotate(0deg); }
                100% { transform: rotate(360deg); }
            }
            
            @keyframes pulse {
                0%, 100% { transform: scale(1); opacity: 1; }
                50% { transform: scale(1.5); opacity: 0.7; }
            }
            
            .loading-text {
                color: #ffffff;
                font-size: 24px;
                font-weight: 300;
                text-align: center;
                animation: fadeInOut 2s ease-in-out infinite;
                margin-bottom: 20px;
            }
            
            .loading-subtext {
                color: rgba(255, 255, 255, 0.8);
                font-size: 16px;
                font-weight: 300;
                text-align: center;
                animation: fadeInOut 2s ease-in-out infinite 0.5s;
            }
            
            @keyframes fadeInOut {
                0%, 100% { opacity: 0.6; }
                50% { opacity: 1; }
            }
            
            .dots {
                display: inline-block;
                animation: dots 1.5s infinite;
            }
            
            @keyframes dots {
                0%, 20% { content: ''; }
                40% { content: '.'; }
                60% { content: '..'; }
                80%, 100% { content: '...'; }
            }
            
            .nebula {
                position: absolute;
                width: 300px;
                height: 300px;
                background: radial-gradient(circle at 30% 40%, rgba(120, 119, 198, 0.3), transparent 70%),
                           radial-gradient(circle at 80% 20%, rgba(255, 119, 198, 0.15), transparent 50%),
                           radial-gradient(circle at 40% 80%, rgba(255, 206, 84, 0.1), transparent 50%);
                border-radius: 50%;
                animation: nebulaSpin 20s linear infinite;
                top: 10%;
                right: 10%;
            }
            
            .nebula:nth-child(2) {
                width: 200px;
                height: 200px;
                top: 60%;
                left: 5%;
                animation-duration: 25s;
                animation-direction: reverse;
            }
            
            @keyframes nebulaSpin {
                0% { transform: rotate(0deg) scale(1); }
                50% { transform: rotate(180deg) scale(1.1); }
                100% { transform: rotate(360deg) scale(1); }
            }
            
            .diagnostic-panel { 
                position: fixed;
                top: 50%;
                left: 50%;
                transform: translate(-50%, -50%);
                background: rgba(255, 255, 255, 0.95);
                backdrop-filter: blur(10px);
                border: 1px solid rgba(255, 204, 204, 0.3);
                padding: 30px;
                border-radius: 15px;
                box-shadow: 0 20px 40px rgba(0, 0, 0, 0.1);
                max-width: 500px;
                width: 90%;
                z-index: 10000;
            }
            
            .diagnostic-panel h3 { 
                color: #cc0000;
                margin-top: 0;
                font-size: 20px;
            }
            
            .error-message {
                color: #cc0000;
                font-weight: bold;
                margin-bottom: 20px;
            }
        </style>
    </head>
    <body>
        <div id="loading-indicator" class="loading-container">
            <div class="stars"></div>
            <div class="nebula"></div>
            <div class="nebula"></div>
            <div class="cosmic-loader">
                <div class="orbit"></div>
                <div class="orbit"></div>
                <div class="orbit"></div>
                <div class="center-dot"></div>
            </div>
            <div class="loading-text">Initializing Connection</div>
            <div class="loading-subtext">Preparing your workspace<span class="dots"></span></div>
        </div>
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

export default embedRoutes