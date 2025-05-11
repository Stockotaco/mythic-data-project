# PostHog Proxy Worker

This Cloudflare Worker acts as a proxy for PostHog analytics requests. It forwards requests from your custom domain to PostHog's servers while maintaining all functionality.

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

3. Update your PostHog configuration to use the new domain:
   ```javascript
   posthog.init('YOUR_PROJECT_API_KEY', {
     api_host: 'https://analytics.yourdomain.com',
     ui_host: 'https://app.posthog.com' // or your self-hosted instance
   })
   ```

## Configuration

The worker is configured to use PostHog's US region by default. To use the EU region, modify the `API_HOST` and `ASSET_HOST` variables in `src/worker.js`:

```javascript
const API_HOST = "eu.i.posthog.com"
const ASSET_HOST = "eu-assets.i.posthog.com"
```

## Features

- Proxies all PostHog API requests
- Caches static assets for better performance
- Removes cookies from forwarded requests
- Supports both US and EU PostHog regions 