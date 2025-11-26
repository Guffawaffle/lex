/**
 * OAuth2 Provider - GitHub
 *
 * Handles GitHub OAuth2 flow for user authentication
 */

import axios from "axios";

export interface GitHubOAuthConfig {
  clientId: string;
  clientSecret: string;
  redirectUri: string;
}

export interface GitHubUser {
  id: number;
  login: string;
  email: string;
  name: string;
  avatar_url: string;
}

export interface GitHubTokenResponse {
  access_token: string;
  token_type: string;
  scope: string;
}

/**
 * Generate GitHub authorization URL
 */
export function getGitHubAuthorizationUrl(config: GitHubOAuthConfig, state: string): string {
  const params = new URLSearchParams({
    client_id: config.clientId,
    redirect_uri: config.redirectUri,
    scope: "read:user user:email",
    state: state,
  });

  return `https://github.com/login/oauth/authorize?${params.toString()}`;
}

/**
 * Exchange authorization code for access token
 */
export async function exchangeGitHubCode(
  config: GitHubOAuthConfig,
  code: string
): Promise<GitHubTokenResponse> {
  const response = await axios.post(
    "https://github.com/login/oauth/access_token",
    {
      client_id: config.clientId,
      client_secret: config.clientSecret,
      code: code,
      redirect_uri: config.redirectUri,
    },
    {
      headers: {
        Accept: "application/json",
      },
    }
  );

  if (!response.data.access_token) {
    throw new Error("Failed to obtain access token from GitHub");
  }

  return response.data;
}

/**
 * Fetch GitHub user profile
 */
export async function getGitHubUser(accessToken: string): Promise<GitHubUser> {
  // Get user profile
  const userResponse = await axios.get("https://api.github.com/user", {
    headers: {
      Authorization: `Bearer ${accessToken}`,
      Accept: "application/vnd.github.v3+json",
    },
  });

  // Get user emails (needed if email is private)
  const emailsResponse = await axios.get("https://api.github.com/user/emails", {
    headers: {
      Authorization: `Bearer ${accessToken}`,
      Accept: "application/vnd.github.v3+json",
    },
  });

  // Find primary email or first verified email
  const primaryEmail = emailsResponse.data.find((e: { primary: boolean }) => e.primary);
  const verifiedEmail = emailsResponse.data.find((e: { verified: boolean }) => e.verified);
  const email = primaryEmail?.email || verifiedEmail?.email || userResponse.data.email;

  if (!email) {
    throw new Error("GitHub user has no verified email address");
  }

  return {
    id: userResponse.data.id,
    login: userResponse.data.login,
    email: email,
    name: userResponse.data.name || userResponse.data.login,
    avatar_url: userResponse.data.avatar_url,
  };
}
