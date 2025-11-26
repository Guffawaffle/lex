# ADR 0002: OAuth2/JWT Authentication for Multi-User Deployments

**Status:** Accepted

**Date:** 2025-01-24

**Deciders:** Guffawaffle, GitHub Copilot

## Context

Lex initially supported only API key authentication for HTTP server mode, which had significant limitations:

1. **No user isolation** - All frames were shared across all clients
2. **No token expiration** - API keys were long-lived secrets that didn't expire
3. **Limited audit trail** - No way to track which user created which frames
4. **Not suitable for multi-user deployments** - Single API key shared across users

As Lex moves toward production hardening (v0.5.0), we need a robust authentication system that supports:
- Multi-user deployments
- User-specific data isolation
- Token expiration and refresh
- Industry-standard security practices

## Decision

We will implement **OAuth2 code flow with JWT tokens** as the primary authentication method for Lex HTTP server, while maintaining backward compatibility with API keys.

### Architecture

1. **OAuth2 Providers**
   - Initial: GitHub OAuth2 (most common for developers)
   - Future: Google, potentially others

2. **JWT Token Structure**
   - **Access tokens**: RS256-signed, 1-hour expiration, stateless
   - **Refresh tokens**: RS256-signed, 30-day expiration, stored hashed in database
   - **Key management**: 2048-bit RSA key pairs, auto-generated on first run

3. **User Isolation**
   - Database schema: `user_id` column in `frames` table
   - All frames scoped to authenticated user
   - System default user (`system-default`) for legacy API key frames

4. **Security Features**
   - CSRF protection via state parameter
   - Rate limiting on auth failures
   - Audit logging for all auth events
   - No tokens logged (only hashes)

### API Endpoints

```
GET  /auth/github          - Initiate OAuth2 flow
GET  /auth/callback        - Handle OAuth2 callback
POST /auth/refresh         - Refresh access token
POST /auth/revoke          - Revoke refresh token (logout)
```

### Migration Path

1. **Phase 1**: OAuth2 runs alongside API keys (both supported)
2. **Phase 2**: Deprecation warnings for API key usage
3. **Phase 3**: API keys removed in future major version

## Alternatives Considered

### Alternative 1: Stick with API Keys Only

**Pros:**
- Simple implementation
- No OAuth complexity
- No external dependencies (GitHub API)

**Cons:**
- No user isolation
- No token expiration
- Not industry standard
- Poor security for multi-user deployments

**Verdict:** Rejected - doesn't meet production requirements

### Alternative 2: Session-based Authentication (Cookies)

**Pros:**
- Simpler than OAuth2
- Built-in browser support
- No token management needed

**Cons:**
- Requires session storage (Redis, database)
- Not suitable for API clients
- CSRF vulnerabilities
- Doesn't scale well

**Verdict:** Rejected - not suitable for API-first design

### Alternative 3: API Keys with User Isolation

**Pros:**
- Simpler than OAuth2
- No external dependencies

**Cons:**
- Still requires manual user management
- No standard flow for obtaining keys
- Poor UX (users must generate keys manually)
- No built-in token refresh

**Verdict:** Rejected - doesn't meet UX requirements

### Alternative 4: Auth0 / Third-Party Auth Service

**Pros:**
- Handles OAuth2 complexity
- Supports multiple providers
- Built-in user management

**Cons:**
- External dependency
- Vendor lock-in
- Cost considerations
- Overkill for Lex's needs

**Verdict:** Rejected - prefer self-hosted solution

## Consequences

### Positive

1. **User Isolation** - Each user can only access their own frames
2. **Token Expiration** - Short-lived access tokens minimize blast radius
3. **Standard Flow** - OAuth2 is industry standard, well-understood
4. **Audit Trail** - All auth events logged with user context
5. **Backward Compatible** - API keys still work during migration
6. **Scalable** - Supports multi-user, multi-tenant deployments

### Negative

1. **Complexity** - OAuth2 flow is more complex than API keys
2. **External Dependency** - Requires GitHub (or other provider) API
3. **Setup Required** - Users must create GitHub OAuth app
4. **Key Management** - RSA key pairs must be securely stored

### Neutral

1. **In-Memory State Store** - Current implementation uses in-memory state storage for OAuth flow, suitable for single-instance deployments. Production multi-instance deployments should use database-backed storage (helper functions provided).

2. **Token Storage** - Refresh tokens stored hashed in database. Consider encryption at rest for additional security (tracked in issue #273).

## Implementation Notes

### Database Schema

```sql
-- Users table
CREATE TABLE users (
  user_id TEXT PRIMARY KEY,
  email TEXT NOT NULL UNIQUE,
  name TEXT,
  provider TEXT NOT NULL,
  provider_user_id TEXT NOT NULL,
  created_at TEXT NOT NULL,
  last_login TEXT,
  UNIQUE(provider, provider_user_id)
);

-- Refresh tokens table
CREATE TABLE refresh_tokens (
  token_id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  token_hash TEXT NOT NULL,
  expires_at TEXT NOT NULL,
  created_at TEXT NOT NULL,
  revoked_at TEXT,
  FOREIGN KEY (user_id) REFERENCES users(user_id) ON DELETE CASCADE
);

-- Add user_id to frames
ALTER TABLE frames ADD COLUMN user_id TEXT;
CREATE INDEX idx_frames_user_id ON frames(user_id);
```

### Environment Variables

```bash
# OAuth2 Configuration
export LEX_OAUTH_ENABLED=true
export LEX_GITHUB_CLIENT_ID="your_github_client_id"
export LEX_GITHUB_CLIENT_SECRET="your_github_client_secret"
export LEX_GITHUB_REDIRECT_URI="https://api.example.com/auth/callback"

# Optional: Legacy API key
export LEX_HTTP_API_KEY="your_legacy_api_key"
```

## Security Considerations

1. **Private Key Storage** - JWT private keys stored in `.smartergpt/lex/keys/` with 0600 permissions, excluded from git
2. **Token Security** - Access tokens short-lived (1h), refresh tokens hashed in database
3. **CSRF Protection** - State parameter validated on OAuth callback
4. **Rate Limiting** - Auth failures rate-limited separately (5 attempts / 15min)
5. **TLS Required** - OAuth2 must run over HTTPS in production

## Testing Strategy

1. **Unit Tests** - JWT signing/verification, PKCE, state generation
2. **Integration Tests** - Full OAuth2 flow, token refresh, revocation
3. **Security Tests** - CSRF, token leakage, user isolation
4. **Migration Tests** - Existing frames assigned to default user

## Documentation

1. `docs/AUTH.md` - Complete OAuth2 setup guide
2. `SECURITY.md` - Token security best practices
3. Code comments - Inline documentation for key functions

## Future Work

1. **Google OAuth** - Add Google as second provider
2. **Database-Backed State** - Migrate from in-memory to database for multi-instance support
3. **Token Blacklist** - Immediate access token revocation (optional)
4. **Encryption at Rest** - Encrypt refresh tokens in database (see issue #273)
5. **Admin Override** - Optional flag to allow admins to access all frames (document security implications)

## References

- [OAuth 2.0 RFC 6749](https://tools.ietf.org/html/rfc6749)
- [JWT RFC 7519](https://tools.ietf.org/html/rfc7519)
- [GitHub OAuth Documentation](https://docs.github.com/en/apps/oauth-apps/building-oauth-apps)
- [PKCE RFC 7636](https://tools.ietf.org/html/rfc7636)
- Issue #274 (this implementation)
- Issue #237 (Production Hardening Epic)
- Issue #273 (Encryption at Rest)

## Approval

**Approved by:** Guffawaffle
**Date:** 2025-01-24
**Implementation PR:** #[PR number will be filled in after PR creation]
