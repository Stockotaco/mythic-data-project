import { Hono } from 'hono'

const embedRoutes = new Hono()

embedRoutes.get('/', (c) => {
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

export default embedRoutes