// HighLevel Custom JS - Comprehensive User Data Logger
// This script logs all available user data using both HighLevel's AppUtils API and Secure Token Context

(function() {
    'use strict';
    
    // Configuration
    const CONFIG = {
        logPrefix: '[HighLevel User Data]',
        retryDelay: 1000,
        maxRetries: 5,
        // Replace with your actual APP_ID from HighLevel marketplace app settings
        APP_ID: '67c76e4d9eab9a839cb4f2c5',
        // Replace with your backend endpoint for decrypting user data
        backendEndpoint: 'https://admin.mythicdata.io/api/decrypt-user-data'
    };
    
    // Utility function for formatted logging
    function logData(label, data, isError = false) {
        const prefix = `${CONFIG.logPrefix} ${label}:`;
        if (isError) {
            console.error(prefix, data);
        } else {
            console.log(prefix, data);
        }
    }
    
    // Check if AppUtils is available
    function isAppUtilsAvailable() {
        return typeof window.AppUtils !== 'undefined' && 
               window.AppUtils && 
               window.AppUtils.Utilities;
    }
    
    // Get current user data
    async function logCurrentUser() {
        try {
            if (!isAppUtilsAvailable()) {
                throw new Error('AppUtils not available');
            }
            
            const userInfo = await AppUtils.Utilities.getCurrentUser();
            logData('Current User', {
                id: userInfo?.id,
                name: userInfo?.name,
                firstName: userInfo?.firstName,
                lastName: userInfo?.lastName,
                email: userInfo?.email,
                type: userInfo?.type,
                role: userInfo?.role,
                fullData: userInfo
            });
            
            return userInfo;
        } catch (error) {
            logData('Current User Error', error.message, true);
            return null;
        }
    }
    
    // Get current location data
    async function logCurrentLocation() {
        try {
            if (!isAppUtilsAvailable()) {
                throw new Error('AppUtils not available');
            }
            
            const locationInfo = await AppUtils.Utilities.getCurrentLocation();
            logData('Current Location', {
                id: locationInfo?.id,
                name: locationInfo?.name,
                address: locationInfo?.address?.address,
                city: locationInfo?.address?.city,
                country: locationInfo?.address?.country,
                fullAddress: locationInfo?.address,
                fullData: locationInfo
            });
            
            return locationInfo;
        } catch (error) {
            logData('Current Location Error', error.message, true);
            return null;
        }
    }
    
    // Get company data
    async function logCompanyInfo() {
        try {
            if (!isAppUtilsAvailable()) {
                throw new Error('AppUtils not available');
            }
            
            const companyInfo = await AppUtils.Utilities.getCompany();
            logData('Company Info', {
                id: companyInfo?.id,
                name: companyInfo?.name,
                fullData: companyInfo
            });
            
            return companyInfo;
        } catch (error) {
            logData('Company Info Error', error.message, true);
            return null;
        }
    }
    
    // Get current route information
    async function logCurrentRoute() {
        try {
            if (!window.AppUtils?.RouteHelper) {
                throw new Error('RouteHelper not available');
            }
            
            const routeInfo = await AppUtils.RouteHelper.getCurrentRoute();
            logData('Current Route', {
                fullPath: routeInfo?.fullPath,
                name: routeInfo?.name,
                params: routeInfo?.params,
                path: routeInfo?.path,
                query: routeInfo?.query,
                fullData: routeInfo
            });
            
            return routeInfo;
        } catch (error) {
            logData('Current Route Error', error.message, true);
            return null;
        }
    }
    
    // ============ SECURE USER CONTEXT METHODS ============
    
    // Method 1: Custom JavaScript Implementation (using exposeSessionDetails)
    async function getSecureUserDataJS() {
        try {
            if (typeof window.exposeSessionDetails !== 'function') {
                throw new Error('exposeSessionDetails not available');
            }
            
            logData('Secure Context (JS)', 'Requesting encrypted user data...');
            const encryptedUserData = await window.exposeSessionDetails(CONFIG.APP_ID);
            
            logData('Encrypted Data (JS)', {
                hasData: !!encryptedUserData,
                dataLength: encryptedUserData ? encryptedUserData.length : 0,
                preview: encryptedUserData ? encryptedUserData.substring(0, 50) + '...' : null
            });
            
            // Send encrypted data to backend for decryption
            logData('Backend Request (JS)', {
                endpoint: CONFIG.backendEndpoint,
                method: 'POST',
                payload: {
                    encryptedData: encryptedUserData
                }
            });

            try {
                const response = await fetch(CONFIG.backendEndpoint, {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json'
                    },
                    body: JSON.stringify({ encryptedData: encryptedUserData })
                });

                const result = await response.json();
                
                if (result.success) {
                    logData('Decrypted User Data (JS)', result.userData);
                    logData('User Context (JS)', {
                        context: result.context,
                        timestamp: result.timestamp,
                        userId: result.userData.userId,
                        email: result.userData.email,
                        role: result.userData.role,
                        type: result.userData.type,
                        companyId: result.userData.companyId,
                        activeLocation: result.userData.activeLocation || null
                    });
                } else {
                    logData('Backend Decryption Error (JS)', result.error, true);
                }
            } catch (fetchError) {
                logData('Backend Request Failed (JS)', fetchError.message, true);
            }
            
            return {
                method: 'exposeSessionDetails',
                encryptedData: encryptedUserData,
                status: 'encrypted_data_obtained'
            };
            
        } catch (error) {
            logData('Secure Context (JS) Error', error.message, true);
            return null;
        }
    }
    
    // Method 2: Custom Pages Implementation (using postMessage)
    async function getSecureUserDataPostMessage() {
        try {
            logData('Secure Context (PostMessage)', 'Requesting user data from parent...');
            
            const encryptedUserData = await new Promise((resolve, reject) => {
                const timeout = setTimeout(() => {
                    window.removeEventListener('message', messageHandler);
                    reject(new Error('Timeout waiting for parent response'));
                }, 10000); // 10 second timeout
                
                // Request user data from parent window
                window.parent.postMessage({ message: 'REQUEST_USER_DATA' }, '*');
                
                // Listen for the response
                const messageHandler = ({ data }) => {
                    if (data.message === 'REQUEST_USER_DATA_RESPONSE') {
                        clearTimeout(timeout);
                        window.removeEventListener('message', messageHandler);
                        resolve(data.payload);
                    }
                };
                
                window.addEventListener('message', messageHandler);
            });
            
            logData('Encrypted Data (PostMessage)', {
                hasData: !!encryptedUserData,
                dataLength: encryptedUserData ? encryptedUserData.length : 0,
                preview: encryptedUserData ? encryptedUserData.substring(0, 50) + '...' : null
            });
            
            // Send encrypted data to backend for decryption
            logData('Backend Request (PostMessage)', {
                endpoint: CONFIG.backendEndpoint,
                method: 'POST',
                payload: {
                    encryptedData: encryptedUserData
                }
            });

            try {
                const response = await fetch(CONFIG.backendEndpoint, {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json'
                    },
                    body: JSON.stringify({ encryptedData: encryptedUserData })
                });

                const result = await response.json();
                
                if (result.success) {
                    logData('Decrypted User Data (PostMessage)', result.userData);
                    logData('User Context (PostMessage)', {
                        context: result.context,
                        timestamp: result.timestamp,
                        userId: result.userData.userId,
                        email: result.userData.email,
                        role: result.userData.role,
                        type: result.userData.type,
                        companyId: result.userData.companyId,
                        activeLocation: result.userData.activeLocation || null
                    });
                } else {
                    logData('Backend Decryption Error (PostMessage)', result.error, true);
                }
            } catch (fetchError) {
                logData('Backend Request Failed (PostMessage)', fetchError.message, true);
            }
            
            return {
                method: 'postMessage',
                encryptedData: encryptedUserData,
                status: 'encrypted_data_obtained'
            };
            
        } catch (error) {
            logData('Secure Context (PostMessage) Error', error.message, true);
            return null;
        }
    }
    
    // Simulate backend decryption (for testing purposes only)
    // NOTE: In production, this MUST be done on your secure backend!
    function simulateBackendDecryption(encryptedData) {
        logData('Backend Simulation', 'This would decrypt the data on your secure backend');
        logData('Expected Decrypted Structure', {
            agency: {
                userId: 'MKQJ7wOVVmNOMvrnKKKK',
                companyId: 'GNb7aIv4rQFVb9iwNl5K',
                role: 'admin',
                type: 'agency',
                userName: 'John Doe',
                email: 'johndoe@gmail.com'
            },
            location: {
                userId: 'MKQJ7wOVVmNOMvrnKKKK',
                companyId: 'GNb7aIv4rQFVb9iwNl5K',
                role: 'admin',
                type: 'agency',
                activeLocation: 'yLKVZpNppIdYpah4RjNE',
                userName: 'John Doe',
                email: 'johndoe@gmail.com'
            }
        });
        
        return {
            note: 'This is simulated data - real decryption happens on backend',
            encryptedLength: encryptedData ? encryptedData.length : 0
        };
    }
    
    // Get secure user context using both methods
    async function logSecureUserContext() {
        logData('=== Secure User Context Collection ===', '');
        
        // Try both methods
        const results = await Promise.allSettled([
            getSecureUserDataJS(),
            getSecureUserDataPostMessage()
        ]);
        
        const jsResult = results[0].status === 'fulfilled' ? results[0].value : null;
        const postMessageResult = results[1].status === 'fulfilled' ? results[1].value : null;
        
        // Simulate backend processing for any successful results
        if (jsResult?.encryptedData) {
            simulateBackendDecryption(jsResult.encryptedData);
        }
        if (postMessageResult?.encryptedData) {
            simulateBackendDecryption(postMessageResult.encryptedData);
        }
        
        const summary = {
            exposeSessionDetails: {
                available: typeof window.exposeSessionDetails === 'function',
                success: !!jsResult,
                hasEncryptedData: !!(jsResult?.encryptedData)
            },
            postMessage: {
                attempted: true,
                success: !!postMessageResult,
                hasEncryptedData: !!(postMessageResult?.encryptedData)
            }
        };
        
        logData('Secure Context Summary', summary);
        
        return { jsResult, postMessageResult, summary };
    }
    
    // Comprehensive data logging function
    async function logAllUserData() {
        logData('=== Starting User Data Collection ===', '');
        
        const timestamp = new Date().toISOString();
        logData('Timestamp', timestamp);
        
        // Check AppUtils availability
        logData('AppUtils Available', isAppUtilsAvailable());
        
        if (isAppUtilsAvailable()) {
            logData('AppUtils Methods', {
                utilities: typeof AppUtils.Utilities,
                storage: typeof AppUtils.Storage,
                routeHelper: typeof AppUtils.RouteHelper
            });
        }
        
        // Collect all data (AppUtils + Secure Context)
        const results = await Promise.allSettled([
            logCurrentUser(),
            logCurrentLocation(),
            logCompanyInfo(),
            logCurrentRoute(),
            logSecureUserContext()
        ]);
        
        // Summary
        const summary = {
            timestamp,
            dataCollected: {
                user: results[0].status === 'fulfilled' && results[0].value !== null,
                location: results[1].status === 'fulfilled' && results[1].value !== null,
                company: results[2].status === 'fulfilled' && results[2].value !== null,
                route: results[3].status === 'fulfilled' && results[3].value !== null,
                secureContext: results[4].status === 'fulfilled' && results[4].value !== null
            },
            errors: results.filter(r => r.status === 'rejected').map(r => r.reason),
            secureContextDetails: results[4].status === 'fulfilled' ? results[4].value?.summary : null
        };
        
        logData('=== Collection Summary ===', summary);
        logData('=== End User Data Collection ===', '');
        
        return summary;
    }
    
    // Wait for AppUtils to be available with retry mechanism
    function waitForAppUtils(retryCount = 0) {
        if (isAppUtilsAvailable()) {
            logData('AppUtils Ready', 'Starting data collection...');
            logAllUserData();
            return;
        }
        
        if (retryCount < CONFIG.maxRetries) {
            logData('Waiting for AppUtils', `Retry ${retryCount + 1}/${CONFIG.maxRetries}`);
            setTimeout(() => waitForAppUtils(retryCount + 1), CONFIG.retryDelay);
        } else {
            logData('AppUtils Timeout', 'Failed to load AppUtils after maximum retries', true);
        }
    }
    
    // Route change event handlers
    function setupEventListeners() {
        // Listen for initial route load
        window.addEventListener('routeLoaded', function(event) {
            logData('Route Loaded Event', event);
            setTimeout(logAllUserData, 500); // Small delay to ensure data is ready
        });
        
        // Listen for route changes
        window.addEventListener('routeChangeEvent', function(event) {
            logData('Route Change Event', event);
            setTimeout(logAllUserData, 500); // Small delay to ensure data is ready
        });
        
        logData('Event Listeners', 'Route event listeners registered');
    }
    
    // Initialize the script
    function initialize() {
        logData('Initialization', 'Starting HighLevel Custom JS User Data Logger');
        
        // Set up event listeners
        setupEventListeners();
        
        // Start waiting for AppUtils
        waitForAppUtils();
        
        // Also try immediate execution in case AppUtils is already available
        if (isAppUtilsAvailable()) {
            logAllUserData();
        }
    }
    
    // Start when DOM is ready
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', initialize);
    } else {
        initialize();
    }
    
    // Also expose functions globally for manual testing
    window.HighLevelUserDataLogger = {
        logAllUserData,
        logCurrentUser,
        logCurrentLocation,
        logCompanyInfo,
        logCurrentRoute,
        logSecureUserContext,
        getSecureUserDataJS,
        getSecureUserDataPostMessage,
        isAppUtilsAvailable
    };
    
})();