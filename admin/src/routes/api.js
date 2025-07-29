import { Hono } from 'hono'
import CryptoJS from 'crypto-js'

const apiRoutes = new Hono()

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

// Get user details from encrypted hash endpoint
apiRoutes.post('/user-details', async (c) => {
    try {
        const { hash } = await c.req.json();

        if (!hash) {
            return c.json({ error: 'Missing hash parameter' }, 400);
        }

        // Process the hash: URL decode if needed, then fix base64 padding
        let processedHash = hash;
        try {
            processedHash = decodeURIComponent(hash);
        } catch (e) {
            // Hash is not URL encoded, use original
        }
        
        // Replace spaces with + signs for proper base64 format
        processedHash = processedHash.replace(/\s/g, '+');

        // Decrypt the user data
        const userData = decryptUserData(processedHash);

        // Normalize email if present
        if (userData.email) {
            userData.email = userData.email.toString().trim().toLowerCase();
        }

        return c.json(userData);
    } catch (error) {
        return c.json({ error: error.message }, 400);
    }
})

// Decrypt user data endpoint for custom JS (HighLevel marketplace app context)
apiRoutes.post('/decrypt-user-data', async (c) => {
    try {
        const { encryptedData } = await c.req.json();

        if (!encryptedData) {
            return c.json({ error: 'Missing encryptedData parameter' }, 400);
        }

        console.log('Decrypt request received');
        console.log('Encrypted data type:', typeof encryptedData);
        console.log('Encrypted data length:', encryptedData.length);

        // Decrypt the user data using the same function
        const userData = decryptUserData(encryptedData);

        // Normalize email if present
        if (userData.email) {
            userData.email = userData.email.toString().trim().toLowerCase();
        }

        console.log('Successfully decrypted user data:', {
            userId: userData.userId,
            email: userData.email,
            type: userData.type,
            hasActiveLocation: !!userData.activeLocation
        });

        return c.json({
            success: true,
            userData: userData,
            context: userData.activeLocation ? 'location' : 'agency',
            timestamp: new Date().toISOString()
        });
    } catch (error) {
        console.error('Decryption endpoint error:', error);
        return c.json({ 
            success: false,
            error: error.message,
            timestamp: new Date().toISOString()
        }, 400);
    }
})

export default apiRoutes