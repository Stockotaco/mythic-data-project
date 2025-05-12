# PostHog Proxy Worker

This Cloudflare Worker acts as a proxy for PostHog analytics requests. It forwards requests from your custom domain to PostHog's servers while maintaining all functionality, and additionally sends events to TinyBird for advanced analytics processing.

## Features

- Proxies all PostHog API requests
- Sends analytics events to TinyBird for custom analytics processing
- Location-based permission checking for security
- Error logging and monitoring
- User identity mapping with anonymous ID tracking
- Caches static assets for better performance
- Removes cookies from forwarded requests
- Supports both US and EU PostHog regions

## Setup

1. Deploy the worker to Cloudflare:
   ```bash
   wrangler deploy
   ```

2. Configure a custom domain for your worker in the Cloudflare dashboard:
   - Go to Workers & Pages > Your Worker > Settings > Triggers
   - Click "Add Custom Domain"
   - Choose a subdomain (e.g., `analytics.yourdomain.com`)
   - Save the changes

3. Update your PostHog configuration to use the new domain with location ID:
   ```javascript
   posthog.init('YOUR_PROJECT_API_KEY', {
     api_host: 'https://p.mythicdata.io/v1/YOUR_LOCATION_ID',
   })
   ```

   Full Example: 
   ```javascript
    !function(t,e){var o,n,p,r;e.__SV||(window.posthog=e,e._i=[],e.init=function(i,s,a){function g(t,e){var o=e.split(".");2==o.length&&(t=t[o[0]],e=o[1]),t[e]=function(){t.push([e].concat(Array.prototype.slice.call(arguments,0)))}}(p=t.createElement("script")).type="text/javascript",p.crossOrigin="anonymous",p.async=!0,p.src=s.api_host.replace(".i.posthog.com","-assets.i.posthog.com")+"/static/array.js",(r=t.getElementsByTagName("script")[0]).parentNode.insertBefore(p,r);var u=e;for(void 0!==a?u=e[a]=[]:a="posthog",u.people=u.people||[],u.toString=function(t){var e="posthog";return"posthog"!==a&&(e+="."+a),t||(e+=" (stub)"),e},u.people.toString=function(){return u.toString(1)+".people (stub)"},o="init capture register register_once register_for_session unregister unregister_for_session getFeatureFlag getFeatureFlagPayload isFeatureEnabled reloadFeatureFlags updateEarlyAccessFeatureEnrollment getEarlyAccessFeatures on onFeatureFlags onSessionId getSurveys getActiveMatchingSurveys renderSurvey canRenderSurvey getNextSurveyStep identify setPersonProperties group resetGroups setPersonPropertiesForFlags resetPersonPropertiesForFlags setGroupPropertiesForFlags resetGroupPropertiesForFlags reset get_distinct_id getGroups get_session_id get_session_replay_url alias set_config startSessionRecording stopSessionRecording sessionRecordingStarted captureException loadToolbar get_property getSessionProperty createPersonProfile opt_in_capturing opt_out_capturing has_opted_in_capturing has_opted_out_capturing clear_opt_in_out_capturing debug".split(" "),n=0;n<o.length;n++)g(u,o[n]);e._i.push([i,s,a])},e.__SV=1)}(document,window.posthog||[]);
posthog.init('phc_nIRoPtneNhcP3EulTas4IMPQwfFI003NEnGDaZ9RP8s', {
    api_host: 'https://p.mythicdata.io/v1/SltIjhgxa1aHG4ALqojs',
    person_profiles: 'always',
    loaded: function (posthog) {
        try {
            // Initialize dataLayer if it doesn't exist
            window.dataLayer = window.dataLayer || [];
            
            // Extract page data once to avoid duplication
            var pageData = {};
            
            if (window.__NUXT__ && window.__NUXT__.data && window.__NUXT__.data.pageData) {
                var nuxtPageData = window.__NUXT__.data.pageData;
                
                // Add each property using snake_case for dataLayer
                if (nuxtPageData.funnelId !== undefined) {
                    pageData.funnel_id = nuxtPageData.funnelId;
                }
                if (nuxtPageData.funnelName !== undefined) {
                    pageData.funnel_name = nuxtPageData.funnelName;
                }
                if (nuxtPageData.locationId !== undefined) {
                    pageData.location_id = nuxtPageData.locationId;
                }
                if (nuxtPageData.pageId !== undefined) {
                    pageData.page_id = nuxtPageData.pageId;
                }
                if (nuxtPageData.affiliateId !== undefined) {
                    pageData.affiliate_id = nuxtPageData.affiliateId;
                }
                if (nuxtPageData.stepId !== undefined) {
                    pageData.step_id = nuxtPageData.stepId;
                }
            }
            
            // Store page data globally so it can be used in before_send too
            window._mythicDataPageData = pageData;
            
            // Push to dataLayer with snake_case
            window.dataLayer.push({
                event: 'posthog_loaded',
                page_data: pageData
            });

            // Email tracking functionality
            (function() {
                // Set debug mode (change to true for debugging)
                var debugMode = false;
                
                // Function to log with consistent formatting
                function logMessage(type, message, data) {
                    var styles = {
                        info: 'color: #0066cc; font-weight: bold;',
                        success: 'color: #00cc00; font-weight: bold;',
                        warning: 'color: #ff9900; font-weight: bold;',
                        error: 'color: #cc0000; font-weight: bold;'
                    };
                    
                    debugMode ? console.log('%c[Email Tracker] ' + message, styles[type], data || '') : null;
                }

                // Function to validate email format
                function isValidEmail(email) {
                    var emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
                    return emailRegex.test(email);
                }

                // Function to handle change events
                function handleChangeEvent(event) {
                    var inputValue = event.target.value;
                    
                    logMessage('info', 'Change event detected:', {
                        element: event.target,
                        value: inputValue
                    });
                    
                    // Check if the input is a valid email
                    if (isValidEmail(inputValue)) {
                        logMessage('success', 'Valid email detected:', inputValue);
                        
                        // Check if posthog exists
                        if (typeof window.posthog === 'undefined') {
                            logMessage('warning', 'PostHog not found on page');
                            return;
                        }
                        
                        // Check if already identified
                        var isIdentified = false;
                        if (typeof window.posthog.get_distinct_id === 'function') {
                            var distinctId = window.posthog.get_distinct_id();
                            isIdentified = distinctId && distinctId !== posthog.get_property('$device_id');
                            logMessage('info', 'PostHog identification status:', isIdentified);
                        } else {
                            logMessage('warning', 'PostHog get_distinct_id method not found');
                        }
                        
                        if (!isIdentified) {
                            // First push to dataLayer using snake_case
                            window.dataLayer = window.dataLayer || [];
                            window.dataLayer.push({
                                'event': 'email_input',
                                'user_email': inputValue
                            });
                            
                            logMessage('success', 'DataLayer push successful:', {
                                event: 'email_input',
                                user_email: inputValue
                            });
                            
                            // Then identify user in PostHog
                            window.posthog.identify(inputValue, {
                                email: inputValue
                            });
                            
                            logMessage('success', 'PostHog identify called with:', inputValue);
                            
                            // Push posthog_identify event to dataLayer as well
                            window.dataLayer.push({
                                'event': 'posthog_identify',
                                'user_email': inputValue
                            });
                            
                            logMessage('success', 'DataLayer identify push successful');
                        } else {
                            logMessage('info', 'User already identified in PostHog, no action taken');
                        }
                    } else {
                        logMessage('info', 'Input not detected as email:', inputValue);
                    }
                }

                // Function to attach listeners to all input fields
                function attachInputListeners() {
                    var inputElements = document.getElementsByTagName('input');
                    var count = 0;
                    
                    for (var i = 0; i < inputElements.length; i++) {
                        inputElements[i].addEventListener('change', handleChangeEvent);
                        count++;
                    }
                    
                    logMessage('info', 'Attached listeners to existing inputs:', count + ' elements');
                }

                // Handle dynamically added inputs using MutationObserver
                var observer = new MutationObserver(function(mutations) {
                    mutations.forEach(function(mutation) {
                        var nodes = mutation.addedNodes;
                        var count = 0;
                        
                        for (var i = 0; i < nodes.length; i++) {
                            var node = nodes[i];
                            if (node.nodeName === 'INPUT') {
                                node.addEventListener('change', handleChangeEvent);
                                count++;
                            } else if (node.getElementsByTagName) {
                                var inputs = node.getElementsByTagName('input');
                                for (var j = 0; j < inputs.length; j++) {
                                    inputs[j].addEventListener('change', handleChangeEvent);
                                    count++;
                                }
                            }
                        }
                        
                        if (count > 0) {
                            logMessage('info', 'Attached listeners to dynamically added inputs:', count + ' elements');
                        }
                    });
                });

                // Start observing the document with the configured parameters
                observer.observe(document.body, {
                    childList: true,
                    subtree: true
                });
                
                logMessage('info', 'MutationObserver started');

                // Initial attachment of listeners
                if (document.readyState === 'loading') {
                    document.addEventListener('DOMContentLoaded', function() {
                        logMessage('info', 'DOM Content Loaded - initializing listeners');
                        attachInputListeners();
                    });
                } else {
                    logMessage('info', 'DOM already loaded - initializing listeners');
                    attachInputListeners();
                }
                
                logMessage('success', 'Email tracker initialization complete');
            })();
        } catch (error) {
            console.error('Error in PostHog loaded callback:', error);
        }
    },
    before_send: function(event) {
        if (event.properties.$current_url && event.properties.$current_url.indexOf("appspot") !== -1){
          return null
        }
        try {
            // Use the previously extracted page data
            if (window._mythicDataPageData) {
                // Add snake_case properties to event
                if (window._mythicDataPageData.funnel_id !== undefined) {
                    event.properties.funnel_id = window._mythicDataPageData.funnel_id;
                }
                if (window._mythicDataPageData.funnel_name !== undefined) {
                    event.properties.funnel_name = window._mythicDataPageData.funnel_name;
                }
                if (window._mythicDataPageData.location_id !== undefined) {
                    event.properties.location_id = window._mythicDataPageData.location_id;
                }
                if (window._mythicDataPageData.page_id !== undefined) {
                    event.properties.page_id = window._mythicDataPageData.page_id;
                }
                if (window._mythicDataPageData.affiliate_id !== undefined) {
                    event.properties.affiliate_id = window._mythicDataPageData.affiliate_id;
                }
                if (window._mythicDataPageData.step_id !== undefined) {
                    event.properties.step_id = window._mythicDataPageData.step_id;
                }
            }
        } catch (error) {
            console.error('Error in PostHog before_send:', error);
        }
        
        return event;
    },
    autocapture: false,
})
```

## Configuration

The worker is configured to use PostHog's US region by default. To use the EU region, modify the `API_HOST` and `ASSET_HOST` variables in `src/worker.js`:

```javascript
const API_HOST = "eu.i.posthog.com"
const ASSET_HOST = "eu-assets.i.posthog.com"
```

## Location Permissions

For security, each location requires authorization. Locations are authenticated through the Supabase integration. Ensure your location ID is properly registered before using the proxy.

## TinyBird Integration

Events captured by PostHog are automatically forwarded to TinyBird for advanced analytics processing. The worker extracts relevant properties and transforms them into a format optimized for TinyBird's data processing capabilities.

Event data is enriched with:
- Session information
- UTM parameters
- Referrer data
- User identification
- Device and browser information 