# OAuth2/JWT Authentication Guide

This guide explains how to configure and use OAuth2/JWT authentication in Lex for multi-user deployments.

## Table of Contents

- [Overview](#overview)
- [Quick Start](#quick-start)
- [GitHub OAuth Setup](#github-oauth-setup)
- [Configuration](#configuration)
- [Authentication Flow](#authentication-flow)
- [Token Management](#token-management)
- [Migration from API Keys](#migration-from-api-keys)
- [Security Best Practices](#security-best-practices)
- [Troubleshooting](#troubleshooting)

---

## Overview

Lex supports two authentication methods:

1. **JWT Tokens (Recommended)** - OAuth2 code flow with RS256-signed JWT tokens
2. **API Keys (Deprecated)** - Legacy authentication for backward compatibility

**Use OAuth2/JWT for:**
- Multi-user deployments
- Production environments
- Enhanced security with token expiration
- User isolation (frames scoped to user_id)

**Use API Keys for:**
- Single-user local development
- Backward compatibility during migration

---

## Quick Start

### 1. Generate JWT Keys

On first startup with OAuth enabled, Lex automatically generates RSA key pairs:

```bash
# Keys are stored in:
.smartergpt/lex/keys/jwt-private.pem  # Keep this secret!
.smartergpt/lex/keys/jwt-public.pem   # Can be shared
```

**IMPORTANT:** Add `.smartergpt/lex/keys/` to your `.gitignore` to prevent committing private keys.

### 2. Set Environment Variables

```bash
# OAuth2 Configuration
export LEX_OAUTH_ENABLED=true
export LEX_GITHUB_CLIENT_ID=your_github_client_id
export LEX_GITHUB_CLIENT_SECRET=your_github_client_secret
export LEX_GITHUB_REDIRECT_URI=https://your-domain.com/auth/callback

# Optional: API Key (deprecated, for backward compatibility)
export LEX_HTTP_API_KEY=your_legacy_api_key
```

### 3. Start the Server

```typescript
import { createDatabase } from "@smartergpt/lex/memory/store";
import { startHttpServer } from "@smartergpt/lex/memory/mcp_server/http-server";

const db = createDatabase();

await startHttpServer(db, {
  port: 3000,
  enableOAuth: true,
  github: {
    clientId: process.env.LEX_GITHUB_CLIENT_ID!,
    clientSecret: process.env.LEX_GITHUB_CLIENT_SECRET!,
    redirectUri: process.env.LEX_GITHUB_REDIRECT_URI!,
  },
  // Optional: Legacy API key support
  apiKey: process.env.LEX_HTTP_API_KEY,
});
```

---

## GitHub OAuth Setup

### 1. Create a GitHub OAuth App

1. Go to GitHub Settings → Developer settings → OAuth Apps
2. Click "New OAuth App"
3. Fill in the details:
   - **Application name:** Your app name (e.g., "Lex Memory Server")
   - **Homepage URL:** `https://your-domain.com`
   - **Authorization callback URL:** `https://your-domain.com/auth/callback`
4. Save the **Client ID** and generate a **Client Secret**

### 2. Configure Scopes

Lex requires the following GitHub scopes:

- `read:user` - Read user profile information
- `user:email` - Access user email addresses

These are automatically requested during the OAuth flow.

### 3. Security Considerations

- Use HTTPS for your redirect URI in production
- Keep your Client Secret secure (never commit to git)
- Use environment variables or a secrets manager
- Rotate Client Secrets regularly

---

## Configuration

### HTTP Server Options

```typescript
interface HttpServerOptions {
  port?: number;                  // Default: 3000
  apiKey?: string;                // Legacy API key (deprecated)
  rateLimitWindowMs?: number;     // Default: 15 minutes
  rateLimitMaxRequests?: number;  // Default: 100

  // OAuth2/JWT Configuration
  enableOAuth?: boolean;          // Enable OAuth2 authentication
  github?: {
    clientId: string;
    clientSecret: string;
    redirectUri: string;
  };
  jwtPublicKey?: string;          // Auto-generated if not provided
  jwtPrivateKey?: string;         // Auto-generated if not provided
}
```

### Example: Production Configuration

```typescript
import { initializeKeys } from "@smartergpt/lex/memory/mcp_server/auth/keys";

const keys = initializeKeys();

await startHttpServer(db, {
  port: 3000,
  enableOAuth: true,
  github: {
    clientId: process.env.LEX_GITHUB_CLIENT_ID!,
    clientSecret: process.env.LEX_GITHUB_CLIENT_SECRET!,
    redirectUri: "https://api.example.com/auth/callback",
  },
  jwtPublicKey: keys.publicKey,
  jwtPrivateKey: keys.privateKey,
  rateLimitWindowMs: 15 * 60 * 1000,  // 15 minutes
  rateLimitMaxRequests: 100,
});
```

---

## Authentication Flow

### 1. Authorization Request

**Client:** Redirect user to GitHub authorization:

```
GET /auth/github
```

This redirects to:
```
https://github.com/login/oauth/authorize?client_id=...&state=...&scope=read:user user:email
```

### 2. Authorization Callback

**GitHub:** Redirects back with authorization code:

```
GET /auth/callback?code=...&state=...
```

**Server:** Exchanges code for tokens and creates user:

```json
{
  "access_token": "eyJhbGciOiJSUzI1NiIs...",
  "refresh_token": "eyJhbGciOiJSUzI1NiIs...",
  "expires_in": 3600,
  "token_type": "Bearer",
  "user": {
    "id": "github-12345",
    "email": "user@example.com",
    "name": "John Doe"
  }
}
```

### 3. API Access

**Client:** Use access token in API requests:

```bash
curl -H "Authorization: Bearer eyJhbGciOiJSUzI1NiIs..." \
  https://api.example.com/api/frames
```

### 4. Token Refresh

**Client:** When access token expires, refresh it:

```bash
POST /auth/refresh
Content-Type: application/json

{
  "refresh_token": "eyJhbGciOiJSUzI1NiIs..."
}
```

**Response:**

```json
{
  "access_token": "eyJhbGciOiJSUzI1NiIs...",
  "expires_in": 3600,
  "token_type": "Bearer"
}
```

---

## Token Management

### Token Lifetimes

- **Access Token:** 1 hour (short-lived, stateless)
- **Refresh Token:** 30 days (long-lived, stored in database)

### Token Format

Access tokens are JWT tokens with the following payload:

```json
{
  "sub": "github-12345",        // User ID
  "email": "user@example.com",  // User email
  "name": "John Doe",           // User name
  "provider": "github",         // OAuth provider
  "iat": 1234567890,            // Issued at (Unix timestamp)
  "exp": 1234571490,            // Expires at (Unix timestamp)
  "iss": "lex-memory-server",   // Issuer
  "aud": "lex-api"              // Audience
}
```

### Token Verification

Tokens are verified using RS256 asymmetric cryptography:

```typescript
import { verifyToken } from "@smartergpt/lex/memory/mcp_server/auth/jwt";

try {
  const payload = verifyToken(token, publicKey);
  console.log("User:", payload.sub);
} catch (error) {
  console.error("Invalid token:", error.message);
}
```

### Token Revocation

**Logout / Revoke refresh token:**

```bash
POST /auth/revoke
Content-Type: application/json

{
  "refresh_token": "eyJhbGciOiJSUzI1NiIs..."
}
```

This marks the refresh token as revoked in the database. The access token remains valid until expiration (max 1 hour).

---

## Migration from API Keys

### Step 1: Enable OAuth Alongside API Keys

```typescript
await startHttpServer(db, {
  enableOAuth: true,
  github: { /* ... */ },
  apiKey: process.env.LEX_HTTP_API_KEY, // Keep for backward compat
});
```

### Step 2: Update Clients Gradually

- New clients: Use OAuth2/JWT flow
- Existing clients: Continue using API keys

You'll see deprecation warnings in logs:

```
[WARN] API key authentication is deprecated. Please migrate to OAuth2/JWT.
```

### Step 3: Disable API Keys

Once all clients are migrated, remove the `apiKey` option:

```typescript
await startHttpServer(db, {
  enableOAuth: true,
  github: { /* ... */ },
  // apiKey: removed
});
```

### Data Migration

All existing frames are automatically assigned to a system default user during database migration:

- User ID: `system-default`
- Email: `system@localhost`
- Provider: `system`

This ensures backward compatibility and prevents data loss.

---

## Security Best Practices

### 1. TLS/HTTPS

**Always use HTTPS in production.** Never expose the HTTP server directly to the internet.

```nginx
server {
  listen 443 ssl http2;
  server_name api.example.com;

  ssl_certificate /path/to/cert.pem;
  ssl_certificate_key /path/to/key.pem;

  location / {
    proxy_pass http://localhost:3000;
    proxy_set_header Host $host;
    proxy_set_header X-Real-IP $remote_addr;
  }
}
```

### 2. Key Management

- **Never commit private keys to git**
- Use environment variables or secrets managers (AWS Secrets Manager, HashiCorp Vault)
- Rotate keys periodically (regenerate and update clients)
- Set restrictive file permissions: `chmod 600 jwt-private.pem`

### 3. Token Security

- **Access tokens** are short-lived (1 hour) - minimize damage if leaked
- **Refresh tokens** are stored hashed in database - cannot be recovered if database is compromised
- Tokens are never logged (only hashes)
- Use HTTP-only cookies for web clients (not implemented yet, use localStorage with caution)

### 4. Rate Limiting

Default rate limits:

- API endpoints: 100 requests / 15 minutes per IP
- Auth failures: 5 attempts / 15 minutes per IP

Adjust based on your needs:

```typescript
{
  rateLimitWindowMs: 15 * 60 * 1000,
  rateLimitMaxRequests: 100,
}
```

### 5. CSRF Protection

OAuth2 flow uses state parameter for CSRF protection:

- Random 32-byte state generated per authorization request
- State validated on callback
- State is single-use (deleted after validation)
- State expires after 10 minutes

### 6. Audit Logging

All authentication events are logged to the audit logger:

```json
{
  "event": "oauth_login_success",
  "provider": "github",
  "user_id": "github-12345",
  "email": "user@example.com"
}
```

Review audit logs regularly for suspicious activity.

---

## Troubleshooting

### "Invalid or expired token"

**Cause:** Token has expired or signature is invalid.

**Solution:**
- For access tokens: Refresh using `/auth/refresh`
- For refresh tokens: Re-authenticate via OAuth flow

### "Invalid state parameter"

**Cause:** CSRF state validation failed.

**Possible reasons:**
- Callback URL doesn't match redirect URI in GitHub OAuth app
- State expired (10 minute timeout)
- State already used (single-use)

**Solution:**
- Verify redirect URI matches exactly
- Complete OAuth flow quickly
- Don't reuse callback URLs

### "GitHub user has no verified email"

**Cause:** User hasn't verified their email on GitHub.

**Solution:**
- Ask user to verify their email on GitHub
- Or update code to accept unverified emails (security risk)

### "HTTP server requires authentication"

**Cause:** Neither OAuth nor API key is configured.

**Solution:**
- Enable OAuth: `enableOAuth: true` + GitHub config
- Or provide API key: `apiKey: "..."`

### Rate Limit Exceeded

**Cause:** Too many requests from one IP.

**Solution:**
- Wait for rate limit window to reset (15 minutes)
- Implement client-side backoff
- Increase rate limits if legitimate traffic

---

## Advanced Topics

### Custom JWT Claims

To add custom claims to JWT tokens, modify the token signing:

```typescript
import { signAccessToken } from "@smartergpt/lex/memory/mcp_server/auth/jwt";

const token = signAccessToken(
  {
    sub: userId,
    email: user.email,
    provider: "github",
    // Custom claims:
    role: "admin",
    teams: ["engineering", "devops"],
  },
  privateKey
);
```

### User Isolation Queries

Frames are automatically isolated by user_id:

```typescript
// All frames created via JWT auth have user_id set
const frames = db.prepare(`
  SELECT * FROM frames
  WHERE user_id = ?
  ORDER BY timestamp DESC
`).all(userId);
```

### Google OAuth (Future)

To add Google OAuth support:

1. Create a Google OAuth2 client
2. Implement `google-provider.ts` similar to GitHub
3. Add Google config to `OAuthConfig`
4. Add `/auth/google` route

---

## References

- [OAuth 2.0 RFC](https://tools.ietf.org/html/rfc6749)
- [JWT RFC](https://tools.ietf.org/html/rfc7519)
- [GitHub OAuth Documentation](https://docs.github.com/en/apps/oauth-apps/building-oauth-apps)
- [PKCE Extension](https://tools.ietf.org/html/rfc7636)

---

**Questions or issues?** Please open an issue on GitHub: https://github.com/Guffawaffle/lex/issues
