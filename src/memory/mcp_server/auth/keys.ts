/**
 * RSA Key Generation for JWT
 *
 * Generates RS256 key pairs for JWT signing
 */

import { generateKeyPairSync } from "crypto";
import { writeFileSync, readFileSync, existsSync, mkdirSync } from "fs";
import { join, dirname } from "path";
import { JwtKeys } from "./jwt.js";
import { AXErrorException } from "../../../shared/errors/ax-error.js";

export interface KeyPairPaths {
  privateKeyPath: string;
  publicKeyPath: string;
}

/**
 * Generate a new RSA key pair for JWT signing (RS256)
 */
export function generateKeyPair(): JwtKeys {
  const { privateKey, publicKey } = generateKeyPairSync("rsa", {
    modulusLength: 2048,
    publicKeyEncoding: {
      type: "spki",
      format: "pem",
    },
    privateKeyEncoding: {
      type: "pkcs8",
      format: "pem",
    },
  });

  return {
    publicKey,
    privateKey,
  };
}

/**
 * Save key pair to files
 */
export function saveKeyPair(keys: JwtKeys, paths: KeyPairPaths): void {
  // Ensure directories exist
  const privateDir = dirname(paths.privateKeyPath);
  const publicDir = dirname(paths.publicKeyPath);

  if (!existsSync(privateDir)) {
    mkdirSync(privateDir, { recursive: true, mode: 0o700 });
  }
  if (!existsSync(publicDir)) {
    mkdirSync(publicDir, { recursive: true, mode: 0o755 });
  }

  // Write keys with appropriate permissions
  writeFileSync(paths.privateKeyPath, keys.privateKey, { mode: 0o600 });
  writeFileSync(paths.publicKeyPath, keys.publicKey, { mode: 0o644 });
}

/**
 * Load key pair from files
 */
export function loadKeyPair(paths: KeyPairPaths): JwtKeys {
  if (!existsSync(paths.privateKeyPath)) {
    throw new AXErrorException(
      "JWT_PRIVATE_KEY_NOT_FOUND",
      `Private key not found at ${paths.privateKeyPath}`,
      [
        "Run initializeKeys() to generate a new key pair",
        "Verify the path is correct",
        "Check file permissions on the keys directory",
      ],
      { privateKeyPath: paths.privateKeyPath }
    );
  }
  if (!existsSync(paths.publicKeyPath)) {
    throw new AXErrorException(
      "JWT_PUBLIC_KEY_NOT_FOUND",
      `Public key not found at ${paths.publicKeyPath}`,
      [
        "Run initializeKeys() to generate a new key pair",
        "Verify the path is correct",
        "Check file permissions on the keys directory",
      ],
      { publicKeyPath: paths.publicKeyPath }
    );
  }

  const privateKey = readFileSync(paths.privateKeyPath, "utf-8");
  const publicKey = readFileSync(paths.publicKeyPath, "utf-8");

  return {
    privateKey,
    publicKey,
  };
}

/**
 * Get default key paths based on workspace root
 */
export function getDefaultKeyPaths(): KeyPairPaths {
  const workspaceRoot = process.env.LEX_WORKSPACE_ROOT || process.cwd();
  const keysDir = join(workspaceRoot, ".smartergpt", "lex", "keys");

  return {
    privateKeyPath: join(keysDir, "jwt-private.pem"),
    publicKeyPath: join(keysDir, "jwt-public.pem"),
  };
}

/**
 * Initialize JWT keys (generate if not exist, otherwise load)
 */
export function initializeKeys(): JwtKeys {
  const paths = getDefaultKeyPaths();

  // If keys don't exist, generate them
  if (!existsSync(paths.privateKeyPath) || !existsSync(paths.publicKeyPath)) {
    const keys = generateKeyPair();
    saveKeyPair(keys, paths);
    return keys;
  }

  // Load existing keys
  return loadKeyPair(paths);
}
