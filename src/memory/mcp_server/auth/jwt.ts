/**
 * JWT Token Management
 *
 * Handles JWT signing, verification, and key management for OAuth2 authentication
 */

import jwt from "jsonwebtoken";
import { randomBytes, createHash } from "crypto";

export interface JwtPayload {
  sub: string; // user_id
  email: string;
  name?: string;
  provider: "github" | "google";
  iat?: number; // issued at
  exp?: number; // expiration
}

export interface TokenPair {
  accessToken: string;
  refreshToken: string;
  expiresIn: number;
}

export interface JwtKeys {
  publicKey: string;
  privateKey: string;
}

/**
 * Token expiration times
 */
export const TOKEN_EXPIRATION = {
  ACCESS_TOKEN: 60 * 60, // 1 hour in seconds
  REFRESH_TOKEN: 30 * 24 * 60 * 60, // 30 days in seconds
};

/**
 * Sign a JWT access token with RS256 algorithm
 */
export function signAccessToken(payload: JwtPayload, privateKey: string): string {
  const tokenPayload = {
    sub: payload.sub,
    email: payload.email,
    name: payload.name,
    provider: payload.provider,
  };

  return jwt.sign(tokenPayload, privateKey, {
    algorithm: "RS256",
    expiresIn: TOKEN_EXPIRATION.ACCESS_TOKEN,
    issuer: "lex-memory-server",
    audience: "lex-api",
  });
}

/**
 * Sign a JWT refresh token
 */
export function signRefreshToken(userId: string, privateKey: string): string {
  return jwt.sign(
    { sub: userId, type: "refresh" },
    privateKey,
    {
      algorithm: "RS256",
      expiresIn: TOKEN_EXPIRATION.REFRESH_TOKEN,
      issuer: "lex-memory-server",
      audience: "lex-api",
    }
  );
}

/**
 * Create a token pair (access + refresh tokens)
 */
export function createTokenPair(payload: JwtPayload, privateKey: string): TokenPair {
  const accessToken = signAccessToken(payload, privateKey);
  const refreshToken = signRefreshToken(payload.sub, privateKey);

  return {
    accessToken,
    refreshToken,
    expiresIn: TOKEN_EXPIRATION.ACCESS_TOKEN,
  };
}

/**
 * Verify a JWT token and return the payload
 * @throws Error if token is invalid or expired
 */
export function verifyToken(token: string, publicKey: string): JwtPayload {
  try {
    const decoded = jwt.verify(token, publicKey, {
      algorithms: ["RS256"],
      issuer: "lex-memory-server",
      audience: "lex-api",
    }) as JwtPayload;

    return decoded;
  } catch (error) {
    if (error instanceof jwt.JsonWebTokenError) {
      throw new Error(`Invalid token: ${error.message}`);
    }
    if (error instanceof jwt.TokenExpiredError) {
      throw new Error("Token expired");
    }
    throw error;
  }
}

/**
 * Decode a JWT token without verification (for debugging)
 */
export function decodeToken(token: string): JwtPayload | null {
  try {
    const decoded = jwt.decode(token) as JwtPayload;
    return decoded;
  } catch {
    return null;
  }
}

/**
 * Generate a random state parameter for CSRF protection
 */
export function generateState(): string {
  return randomBytes(32).toString("hex");
}

/**
 * Generate a random PKCE code verifier
 */
export function generateCodeVerifier(): string {
  return randomBytes(32).toString("base64url");
}

/**
 * Generate PKCE code challenge from verifier
 */
export function generateCodeChallenge(verifier: string): string {
  return createHash("sha256").update(verifier).digest("base64url");
}
