import { env } from "../../config/env.js";
import { HttpError } from "../../utils/http-error.js";

export type OAuthProvider = "google" | "github";

export interface OAuthProfile {
  providerSubjectId: string;
  email?: string;
  emailVerified: boolean;
  name?: string;
}

interface GoogleTokenResponse {
  access_token?: string;
  error?: string;
  error_description?: string;
}

interface GoogleUserInfoResponse {
  sub?: string;
  email?: string;
  email_verified?: boolean;
  name?: string;
}

interface GitHubTokenResponse {
  access_token?: string;
  error?: string;
  error_description?: string;
}

interface GitHubUserResponse {
  id: number;
  login?: string;
  name?: string;
}

interface GitHubEmailResponse {
  email: string;
  verified: boolean;
  primary: boolean;
}

function assertOAuthConfig(provider: OAuthProvider): void {
  if (provider === "google" && (!env.GOOGLE_CLIENT_ID || !env.GOOGLE_CLIENT_SECRET)) {
    throw new HttpError(500, "Google OAuth is not configured");
  }

  if (provider === "github" && (!env.GITHUB_CLIENT_ID || !env.GITHUB_CLIENT_SECRET)) {
    throw new HttpError(500, "GitHub OAuth is not configured");
  }
}

export function buildAuthorizationUrl(provider: OAuthProvider, state?: string): string {
  assertOAuthConfig(provider);

  if (provider === "google") {
    const params = new URLSearchParams({
      client_id: env.GOOGLE_CLIENT_ID as string,
      redirect_uri: `${env.OAUTH_CALLBACK_BASE_URL}/auth/google/callback`,
      response_type: "code",
      scope: "openid email profile",
      access_type: "offline",
      prompt: "consent"
    });

    if (state) {
      params.set("state", state);
    }

    return `https://accounts.google.com/o/oauth2/v2/auth?${params.toString()}`;
  }

  const params = new URLSearchParams({
    client_id: env.GITHUB_CLIENT_ID as string,
    redirect_uri: `${env.OAUTH_CALLBACK_BASE_URL}/auth/github/callback`,
    scope: "read:user user:email"
  });

  if (state) {
    params.set("state", state);
  }

  return `https://github.com/login/oauth/authorize?${params.toString()}`;
}

async function exchangeGoogleCode(code: string): Promise<string> {
  const body = new URLSearchParams({
    code,
    client_id: env.GOOGLE_CLIENT_ID as string,
    client_secret: env.GOOGLE_CLIENT_SECRET as string,
    redirect_uri: `${env.OAUTH_CALLBACK_BASE_URL}/auth/google/callback`,
    grant_type: "authorization_code"
  });

  const response = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded"
    },
    body: body.toString()
  });

  const payload = (await response.json()) as GoogleTokenResponse;
  if (!response.ok || !payload.access_token) {
    throw new HttpError(401, "Google token exchange failed", payload);
  }

  return payload.access_token;
}

async function getGoogleProfile(accessToken: string): Promise<OAuthProfile> {
  const response = await fetch("https://www.googleapis.com/oauth2/v3/userinfo", {
    headers: {
      Authorization: `Bearer ${accessToken}`
    }
  });

  const profile = (await response.json()) as GoogleUserInfoResponse;
  if (!response.ok || !profile.sub) {
    throw new HttpError(401, "Failed to fetch Google profile", profile);
  }

  return {
    providerSubjectId: profile.sub,
    email: profile.email,
    emailVerified: Boolean(profile.email_verified),
    name: profile.name
  };
}

async function exchangeGithubCode(code: string): Promise<string> {
  const body = new URLSearchParams({
    code,
    client_id: env.GITHUB_CLIENT_ID as string,
    client_secret: env.GITHUB_CLIENT_SECRET as string,
    redirect_uri: `${env.OAUTH_CALLBACK_BASE_URL}/auth/github/callback`
  });

  const response = await fetch("https://github.com/login/oauth/access_token", {
    method: "POST",
    headers: {
      Accept: "application/json",
      "Content-Type": "application/x-www-form-urlencoded"
    },
    body: body.toString()
  });

  const payload = (await response.json()) as GitHubTokenResponse;
  if (!response.ok || !payload.access_token) {
    throw new HttpError(401, "GitHub token exchange failed", payload);
  }

  return payload.access_token;
}

async function getGithubProfile(accessToken: string): Promise<OAuthProfile> {
  const userResponse = await fetch("https://api.github.com/user", {
    headers: {
      Authorization: `Bearer ${accessToken}`,
      Accept: "application/vnd.github+json"
    }
  });

  const user = (await userResponse.json()) as GitHubUserResponse;
  if (!userResponse.ok || !user.id) {
    throw new HttpError(401, "Failed to fetch GitHub profile", user);
  }

  const emailsResponse = await fetch("https://api.github.com/user/emails", {
    headers: {
      Authorization: `Bearer ${accessToken}`,
      Accept: "application/vnd.github+json"
    }
  });

  const emails = (await emailsResponse.json()) as GitHubEmailResponse[];
  if (!emailsResponse.ok || !Array.isArray(emails)) {
    throw new HttpError(401, "Failed to fetch GitHub emails", emails);
  }

  const verifiedPrimary = emails.find((item) => item.verified && item.primary) ?? emails.find((item) => item.verified);

  return {
    providerSubjectId: String(user.id),
    email: verifiedPrimary?.email,
    emailVerified: Boolean(verifiedPrimary?.verified),
    name: user.name || user.login
  };
}

export async function fetchProfileFromCode(provider: OAuthProvider, code: string): Promise<OAuthProfile> {
  assertOAuthConfig(provider);

  if (provider === "google") {
    const accessToken = await exchangeGoogleCode(code);
    return getGoogleProfile(accessToken);
  }

  const accessToken = await exchangeGithubCode(code);
  return getGithubProfile(accessToken);
}

export async function fetchProfileFromAccessToken(provider: OAuthProvider, accessToken: string): Promise<OAuthProfile> {
  assertOAuthConfig(provider);

  if (provider === "google") {
    return getGoogleProfile(accessToken);
  }

  return getGithubProfile(accessToken);
}
