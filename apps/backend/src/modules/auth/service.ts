import { AuthProvider, type User } from "@prisma/client";
import { HttpError } from "../../utils/http-error.js";
import { AuthRepository } from "./repository.js";
import {
  buildAuthorizationUrl,
  fetchProfileFromAccessToken,
  fetchProfileFromCode,
  type OAuthProvider,
  type OAuthProfile
} from "./oauth-clients.js";

export interface OAuthSignInInput {
  provider: OAuthProvider;
  providerSubjectId: string;
  email?: string;
  emailVerified: boolean;
  name?: string;
}

export class AuthService {
  constructor(private readonly repository: AuthRepository) {}

  getAuthorizationUrl(provider: OAuthProvider, state?: string): string {
    return buildAuthorizationUrl(provider, state);
  }

  async authenticateWithCode(provider: OAuthProvider, code: string): Promise<User> {
    const profile = await fetchProfileFromCode(provider, code);
    return this.signInWithProfile(provider, profile);
  }

  async authenticateWithAccessToken(provider: OAuthProvider, accessToken: string): Promise<User> {
    const profile = await fetchProfileFromAccessToken(provider, accessToken);
    return this.signInWithProfile(provider, profile);
  }

  private signInWithProfile(provider: OAuthProvider, profile: OAuthProfile): Promise<User> {
    return this.signInWithOAuth({
      provider,
      providerSubjectId: profile.providerSubjectId,
      email: profile.email,
      emailVerified: profile.emailVerified,
      name: profile.name
    });
  }

  async signInWithOAuth(input: OAuthSignInInput): Promise<User> {
    if (!input.email || !input.emailVerified) {
      throw new HttpError(401, "OAuth provider must return a verified email");
    }

    const provider: AuthProvider = input.provider === "google" ? "GOOGLE" : "GITHUB";

    return this.repository.upsertUserAndIdentity({
      provider,
      providerSubjectId: input.providerSubjectId,
      email: input.email.toLowerCase(),
      name: input.name
    });
  }
}
