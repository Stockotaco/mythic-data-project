# Mythic Data Admin - HighLevel Integration

A secure authentication service for embedding Mythic Data applications within HighLevel's iframe environment. This service handles server-side user authentication using encrypted data from HighLevel and provides seamless SSO integration.

## 🚀 Features

- **Server-side Authentication** - Secure user creation and login using Supabase
- **HighLevel Integration** - Decrypts user data from HighLevel's encrypted payload
- **Real JWT Tokens** - Generates authentic Supabase JWT access and refresh tokens
- **Cross-domain Cookies** - Sets HttpOnly cookies accessible across `*.mythicdata.io`
- **Security Controls** - Rate limiting, input validation, and secure cookie handling
- **Space-themed Loading** - Beautiful animated loading screen for embedded users

## 🏗️ Architecture

```
HighLevel CRM
    ↓ (iframe embed)
admin.mythicdata.io/embed
    ↓ (encrypted user data)
Authentication Service
    ↓ (JWT cookies)
app.mythicdata.io
```

## 🔐 Security Features

- **HttpOnly Cookies** - Prevents XSS token theft
- **Rate Limiting** - 10 requests per minute per IP
- **Input Validation** - Validates encrypted data format
- **Secure Headers** - `Secure`, `SameSite=None` for cross-site embedding
- **No Sensitive Logging** - Tokens and credentials not exposed in logs
- **JWT Expiration Sync** - Cookie expiration matches JWT expiration

## 📁 Project Structure

```
src/
├── index.js                 # Main Hono app entry point
├── routes/
│   ├── embed.js            # Embed route with authentication logic
│   ├── oauth.js            # OAuth handlers (existing)
│   ├── admin.js            # Admin routes (existing)
│   └── api.js              # API endpoints for user details
├── company-install.js      # Company installation logic
└── location-install.js     # Location installation logic
```

## 🛠️ Setup

### Prerequisites

- Node.js 18+
- Cloudflare Workers account
- Supabase project
- HighLevel app/integration

### Environment Variables

Set these as Wrangler secrets:

```bash
# Supabase Configuration
npx wrangler secret put SUPABASE_URL
npx wrangler secret put SUPABASE_SERVICE_ROLE_KEY

# JWT Signing (for fallback, uses Supabase's built-in)
npx wrangler secret put JWT_SECRET
```

### Installation

```bash
# Install dependencies
npm install

# Deploy to Cloudflare Workers
npm run deploy

# Development server
npm run dev
```

## 🔧 Configuration

### Supabase Setup

1. Create a Supabase project
2. Note your project URL and service role key
3. Configure RLS policies for your tables
4. Set up authentication providers as needed

### HighLevel Integration

1. Configure your HighLevel app to embed `https://admin.mythicdata.io/embed`
2. Ensure encrypted user data is passed via Custom Pages Implementation
3. The service expects encrypted data containing at least an `email` field

### Cloudflare Workers

The app is configured to run on the custom domain `admin.mythicdata.io`. Update `wrangler.toml` for your domain:

```toml
routes = [
  { pattern = "your-domain.com", custom_domain = true }
]
```

## 🔄 Authentication Flow

1. **User loads HighLevel page** containing the embedded iframe
2. **Embed route serves** space-themed loading screen
3. **JavaScript requests** encrypted user data from HighLevel parent window
4. **POST to `/embed/authenticate`** with encrypted payload
5. **Server decrypts** user data and extracts email
6. **User created/found** in Supabase database
7. **Magic link generated** by Supabase admin API
8. **Verification token extracted** and verified to create session
9. **JWT tokens obtained** from verified Supabase session
10. **HttpOnly cookies set** with `access_token` and `refresh_token`
11. **User redirected** to `https://app.mythicdata.io/embed?embed=true`
12. **Main app reads cookies** and user is automatically authenticated

## 📊 Monitoring

### Rate Limiting

- **Limit**: 10 requests per minute per IP
- **Response**: `429 Too Many Requests`
- **Reset**: Rolling window, resets every minute

### Error Handling

Common error responses:
- `400` - Missing or invalid encrypted data
- `429` - Rate limit exceeded
- `500` - Server error (Supabase issues, decryption failures)

### Logging

The service logs:
- Authentication attempts (success/failure)
- Rate limit violations
- Configuration warnings
- Non-sensitive error information

## 🔐 Encryption Details

### HighLevel Data Decryption

- **Algorithm**: AES encryption via CryptoJS
- **Key**: `54d3b813-5e81-4704-a60b-5a4a6c9fa817`
- **Format**: Base64 encoded with spaces replaced by `+`
- **Expected payload**: JSON with `email` field

### JWT Token Structure

Tokens follow standard Supabase JWT format:

```json
{
  "iss": "https://your-project.supabase.co/auth/v1",
  "sub": "user-uuid",
  "aud": "authenticated",
  "exp": 1234567890,
  "iat": 1234567890,
  "email": "user@example.com",
  "role": "authenticated",
  "session_id": "session-uuid"
}
```

## 🚀 API Endpoints

### `GET /embed`
- **Purpose**: Serves the embedded page with space-themed loader
- **Response**: HTML page with authentication JavaScript

### `POST /embed/authenticate`
- **Purpose**: Handles server-side authentication
- **Body**: `{ "encryptedUserData": "base64-encrypted-data" }`
- **Response**: `{ "success": true, "redirectUrl": "..." }`
- **Cookies**: Sets `access_token` and `refresh_token`

### `POST /api/user-details`
- **Purpose**: Decrypts user data and returns details
- **Body**: `{ "hash": "encrypted-data" }`
- **Response**: Decrypted user object

## 🎨 UI Components

### Space-themed Loader

The embed page features a beautiful space-themed loading animation:
- **Starfield background** with moving stars
- **Orbital loader** with multiple spinning rings
- **Nebula effects** with colorful gradients
- **Animated text** with fading effects

## 🐛 Troubleshooting

### Common Issues

**"Error Getting User Data"**
- Check HighLevel is sending encrypted data
- Verify decryption key is correct
- Ensure Supabase credentials are configured

**"Rate limit exceeded"**
- Wait 1 minute and try again
- Check for automated requests

**Cookies not being set**
- Verify domain configuration (`.mythicdata.io`)
- Check HTTPS is being used
- Ensure browser allows cross-site cookies

### Debug Mode

For debugging, temporarily enable logging in the code:
```javascript
console.log('Debug info:', data);
```

Remember to remove debug logs before production deployment.

## 📝 Development

### Local Development

```bash
# Start development server
npm run dev

# Tail live logs
npx wrangler tail

# Deploy
npm run deploy
```

### Testing

Test the authentication flow:
1. Load the embed page in an iframe
2. Mock HighLevel's encrypted data
3. Verify cookies are set correctly
4. Check redirect behavior

## 🤝 Contributing

1. Fork the repository
2. Create a feature branch
3. Make your changes
4. Test thoroughly
5. Submit a pull request

## 📄 License

[Add your license information here]

## 🆘 Support

For issues or questions:
- Check the troubleshooting section
- Review Cloudflare Workers logs
- Check Supabase dashboard for auth issues
- Verify HighLevel integration setup

---

Built with [Hono](https://hono.dev/) and deployed on [Cloudflare Workers](https://workers.cloudflare.com/).