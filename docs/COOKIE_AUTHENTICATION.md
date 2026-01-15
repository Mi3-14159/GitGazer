# HttpOnly Cookie Authentication

This document describes the httpOnly cookie-based authentication implementation in GitGazer.

## Overview

GitGazer uses a **hybrid authentication approach** that combines AWS Cognito/Amplify with httpOnly cookies for enhanced security:

1. **OAuth Flow**: AWS Amplify handles the OAuth flow with Cognito (GitHub provider)
2. **Token Exchange**: After successful authentication, tokens are exchanged for httpOnly cookies
3. **API Authorization**: API Gateway accepts tokens from BOTH cookies and Authorization headers
4. **Dual Storage**: Tokens stored in BOTH httpOnly cookies AND Amplify storage for compatibility

> **Note on Security Trade-offs**: This hybrid approach provides defense-in-depth security by storing tokens in httpOnly cookies (protecting the API layer from XSS) while maintaining Amplify integration. For full XSS protection following the pure AWS blog pattern, see [AWS_BLOG_COMPLIANCE.md](./AWS_BLOG_COMPLIANCE.md) for migration options.

## Security Benefits

### HttpOnly Cookies (API Layer Protection)
- **API Protection**: API Gateway validates tokens from httpOnly cookies, preventing XSS-stolen tokens from accessing APIs
- **CSRF Protection**: SameSite=Strict attribute prevents CSRF attacks
- **Secure Transport**: Secure flag ensures cookies are only sent over HTTPS in production
- **Automatic Expiration**: Cookies expire with token lifetime (1 hour for access, 30 days for refresh)

### Defense in Depth (Hybrid Approach)
This implementation uses a hybrid approach where tokens exist in BOTH httpOnly cookies AND Amplify storage:

**Amplify Storage (localStorage/sessionStorage):**
- Used by Amplify for OAuth flow and token management
- Vulnerable to XSS attacks (JavaScript can access)
- Required for Amplify API client functionality

**HttpOnly Cookies:**
- Used by API Gateway for authorization
- NOT accessible to JavaScript (XSS-protected)
- Primary defense against token theft at API layer

**Security Model:**
- Even if XSS compromises Amplify tokens, API Gateway validates from cookies
- Stolen localStorage tokens cannot be used directly against API
- Defense in depth: Multiple layers of security
- **Trade-off**: Not the pure cookie approach from AWS blog, but maintains Amplify compatibility

> **Important**: For full XSS protection (tokens ONLY in httpOnly cookies), see migration path in [AWS_BLOG_COMPLIANCE.md](./AWS_BLOG_COMPLIANCE.md).

## Architecture

### Authentication Flow

```
┌─────────────┐
│   Browser   │
└──────┬──────┘
       │ 1. Click "Login with GitHub"
       ▼
┌─────────────┐
│   Amplify   │◄──────────────────────────────┐
└──────┬──────┘                                │
       │ 2. Redirect to Cognito                │
       ▼                                        │
┌─────────────┐                                │
│   Cognito   │                                │
└──────┬──────┘                                │
       │ 3. OAuth with GitHub                  │
       ▼                                        │
┌─────────────┐                                │
│   GitHub    │                                │
└──────┬──────┘                                │
       │ 4. Authorization code                 │
       ▼                                        │
┌─────────────┐                                │
│   Backend   │                                │
│/auth/token  │                                │
└──────┬──────┘                                │
       │ 5. Exchange code for GitHub token     │
       ▼                                        │
┌─────────────┐                                │
│   Cognito   │                                │
└──────┬──────┘                                │
       │ 6. Return Cognito tokens              │
       │                                        │
       └──────────────────────────────────────►│
       7. Amplify stores tokens locally        │
       ▼                                        │
┌─────────────┐                                │
│  Frontend   │                                │
│  useAuth()  │                                │
└──────┬──────┘                                │
       │ 8. Call exchangeTokensForCookies()    │
       ▼                                        │
┌─────────────┐                                │
│   Backend   │                                │
│POST /auth/  │                                │
│   session   │                                │
└──────┬──────┘                                │
       │ 9. Set httpOnly cookies                │
       │    (accessToken, idToken, refreshToken)│
       ▼                                        │
┌─────────────┐                                │
│   Browser   │                                │
│   Cookies   │                                │
└─────────────┘                                │
```

### API Request Flow

```
┌─────────────┐
│   Browser   │
└──────┬──────┘
       │ API Request
       │ Includes: Cookies (httpOnly) + Authorization header
       ▼
┌────────────────────┐
│  API Gateway       │
│  JWT Authorizer    │
│  Checks:           │
│  1. Cookie token   │
│  2. Auth header    │
└──────┬─────────────┘
       │ Token validated
       ▼
┌─────────────┐
│   Lambda    │
│   Handler   │
└──────┬──────┘
       │ Business logic
       ▼
┌─────────────┐
│  DynamoDB   │
│     S3      │
│    etc.     │
└─────────────┘
```

## Implementation Details

### Backend Endpoints

#### POST /api/auth/session
Exchanges Amplify tokens for httpOnly cookies.

**Request:**
```json
{
  "accessToken": "eyJhbGc...",
  "idToken": "eyJhbGc...",
  "refreshToken": "eyJhbGc...",
  "expiresIn": 3600
}
```

**Response:**
```
Set-Cookie: accessToken=eyJhbGc...; HttpOnly; Secure; SameSite=Strict; Max-Age=3600; Path=/
Set-Cookie: idToken=eyJhbGc...; HttpOnly; Secure; SameSite=Strict; Max-Age=3600; Path=/
Set-Cookie: refreshToken=eyJhbGc...; HttpOnly; Secure; SameSite=Strict; Max-Age=2592000; Path=/
```

#### GET /api/auth/session
Checks if valid session cookies exist.

**Response:**
```json
{
  "authenticated": true
}
```

#### POST /api/auth/logout
Clears all authentication cookies.

**Response:**
```
Set-Cookie: accessToken=; Max-Age=0; Path=/
Set-Cookie: idToken=; Max-Age=0; Path=/
Set-Cookie: refreshToken=; Max-Age=0; Path=/
```

### Frontend Service

#### exchangeTokensForCookies()
Called after successful Amplify authentication to set httpOnly cookies.

```typescript
import {exchangeTokensForCookies} from '@/services/auth';

// After login
const user = await getUser();
await exchangeTokensForCookies(); // Set cookies
```

#### signOut()
Clears both Amplify session and backend cookies.

```typescript
import {signOut} from '@/services/auth';

await signOut(); // Clears Amplify session + cookies
```

### Cookie Configuration

```typescript
{
  httpOnly: true,           // Not accessible to JavaScript
  secure: isProduction,     // HTTPS only in production
  sameSite: 'Strict',       // CSRF protection
  maxAge: 3600,            // 1 hour for access/ID tokens
                           // 30 days for refresh token
  path: '/'                // Available to entire domain
}
```

## Migration Path

### Phase 1: Hybrid (Current)
- Amplify manages OAuth flow
- Tokens stored in httpOnly cookies + Amplify storage
- API Gateway accepts cookies OR Authorization headers
- ✅ XSS protection via httpOnly cookies
- ✅ Backward compatible

### Phase 2: Cookie-Only (Future)
- Remove Authorization header from API calls
- API Gateway only accepts cookies
- Implement refresh token flow with cookies
- Custom token storage in Amplify

### Phase 3: Full Custom Auth (Optional)
- Replace Amplify with custom auth implementation
- Direct Cognito integration
- Full control over token lifecycle

## Testing

### Manual Testing
1. Login via GitHub OAuth
2. Verify cookies are set in browser DevTools (Application > Cookies)
3. Verify httpOnly flag is set (cookies show "✓" in HttpOnly column)
4. Make API calls and verify they work
5. Logout and verify cookies are cleared

### Automated Testing
Backend unit tests cover:
- Cookie creation with correct flags
- Cookie parsing
- Token exchange endpoint
- Session check endpoint
- Logout endpoint

Run tests:
```bash
cd 02_central
npm run test:unit
```

## Troubleshooting

### Cookies Not Set
- Check CORS configuration allows credentials
- Verify API_BASE_URL in frontend is correct
- Check browser console for errors
- Verify HTTPS in production (Secure flag requires it)

### API Calls Fail After Login
- Check cookies are being sent with requests
- Verify API Gateway authorizer configuration
- Check Lambda logs for authorization errors
- Ensure both cookie and header sources are configured

### Logout Doesn't Clear Cookies
- Verify /api/auth/logout endpoint is called
- Check Set-Cookie headers in response
- Clear browser cache if persistent
- Check cookie path matches (must be "/")

## Security Considerations

### Current Implementation
- ✅ HttpOnly prevents XSS access to tokens
- ✅ SameSite=Strict prevents CSRF
- ✅ Secure flag for HTTPS-only (production)
- ✅ Short-lived access tokens (1 hour)
- ✅ Long-lived refresh tokens (30 days)

### Future Enhancements
- Implement token refresh flow using refresh cookie
- Add token rotation on refresh
- Implement session management (list active sessions, revoke sessions)
- Add device fingerprinting
- Implement suspicious activity detection

## References

- [OWASP: HttpOnly Cookie Flag](https://owasp.org/www-community/HttpOnly)
- [OWASP: SameSite Cookie Attribute](https://owasp.org/www-community/SameSite)
- [AWS Amplify Auth Documentation](https://docs.amplify.aws/javascript/build-a-backend/auth/)
- [API Gateway JWT Authorizers](https://docs.aws.amazon.com/apigateway/latest/developerguide/http-api-jwt-authorizer.html)
