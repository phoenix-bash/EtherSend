import { createHash, randomBytes } from "node:crypto";
import { AuthProvider, type User } from "@prisma/client";
import { compare, hash } from "bcryptjs";
import { env } from "../../config/env.js";
import type { EmailProvider } from "../../providers/email/email-provider.js";
import { LocalStorageProvider } from "../../providers/storage/local-storage.provider.js";
import { HttpError } from "../../utils/http-error.js";
import { AuthRepository } from "./repository.js";
import {
  buildAuthorizationUrl,
  fetchProfileFromAccessToken,
  fetchProfileFromCode,
  type OAuthProvider,
  type OAuthProfile
} from "./oauth-clients.js";

const PASSWORD_SALT_ROUNDS = 12;
const VERIFICATION_TOKEN_TTL_MS = 1000 * 60 * 60 * 24;
const RESET_TOKEN_TTL_MS = 1000 * 60 * 30;
const SESSION_TTL_MS = 1000 * 60 * 60 * 24 * 7;
const MAX_ACTIVE_SESSIONS = 5;

const storage = new LocalStorageProvider();

export interface OAuthSignInInput {
  provider: OAuthProvider;
  providerSubjectId: string;
  email?: string;
  emailVerified: boolean;
  name?: string;
}

export interface EmailSignUpInput {
  email: string;
  password: string;
  name?: string;
}

export interface EmailSignInInput {
  email: string;
  password: string;
}

export interface LoginSessionMetadata {
  ipAddress?: string;
  userAgent?: string;
  browser?: string;
  os?: string;
  deviceType?: string;
  deviceModel?: string;
}

export interface ActiveSessionView {
  id: string;
  ipAddress?: string | null;
  userAgent?: string | null;
  browser?: string | null;
  os?: string | null;
  deviceType?: string | null;
  deviceModel?: string | null;
  createdAt: string;
  lastActivityAt: string;
  expiresAt: string;
  current: boolean;
}

function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

function normalizeName(name?: string): string | undefined {
  if (!name) {
    return undefined;
  }

  const trimmed = name.trim();
  return trimmed.length > 0 ? trimmed : undefined;
}

function createTokenHash(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

function createTokenValue(): string {
  return randomBytes(32).toString("hex");
}

export class AuthService {
  constructor(
    private readonly repository: AuthRepository,
    private readonly emailProvider: EmailProvider | null
  ) {}

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

    const user = await this.repository.upsertUserAndIdentity({
      provider,
      providerSubjectId: input.providerSubjectId,
      email: input.email.toLowerCase(),
      name: input.name
    });

    this.assertPasswordResetNotRequired(user);
    return user;
  }

  async signUpWithEmail(input: EmailSignUpInput): Promise<{ requiresVerification: true }> {
    const email = normalizeEmail(input.email);
    const name = normalizeName(input.name);
    const emailProvider = this.requireEmailProvider();
    const existingUser = await this.repository.findUserByEmail(email);

    if (existingUser?.emailVerifiedAt) {
      throw new HttpError(409, "Account already exists. Please sign in.");
    }

    if (existingUser && !existingUser.passwordHash) {
      throw new HttpError(409, "Account already exists with social sign-in.");
    }

    const passwordHash = await hash(input.password, PASSWORD_SALT_ROUNDS);
    const verificationToken = createTokenValue();
    const verificationTokenHash = createTokenHash(verificationToken);
    const verificationTokenExpiresAt = new Date(Date.now() + VERIFICATION_TOKEN_TTL_MS);

    if (existingUser) {
      await this.repository.updateEmailSignupForUser({
        userId: existingUser.id,
        email,
        name: name ?? existingUser.name ?? undefined,
        passwordHash,
        emailVerificationTokenHash: verificationTokenHash,
        emailVerificationTokenExpiresAt: verificationTokenExpiresAt
      });
    } else {
      await this.repository.createEmailUser({
        email,
        name,
        passwordHash,
        emailVerificationTokenHash: verificationTokenHash,
        emailVerificationTokenExpiresAt: verificationTokenExpiresAt
      });
    }

    await emailProvider.sendEmail({
      to: email,
      subject: "Verify your EtherSend account",
      html: this.buildVerificationEmailHtml({
        recipientName: name,
        verificationUrl: this.buildVerificationUrl(verificationToken)
      }),
      text: this.buildVerificationEmailText({
        recipientName: name,
        verificationUrl: this.buildVerificationUrl(verificationToken)
      })
    });

    return { requiresVerification: true };
  }

  async signInWithEmail(input: EmailSignInInput): Promise<User> {
    const email = normalizeEmail(input.email);
    const user = await this.repository.findUserByEmail(email);

    if (!user?.passwordHash) {
      throw new HttpError(401, "Invalid email or password.");
    }

    const matches = await compare(input.password, user.passwordHash);
    if (!matches) {
      throw new HttpError(401, "Invalid email or password.");
    }

    if (!user.emailVerifiedAt) {
      throw new HttpError(403, "Please verify your email before signing in.");
    }

    this.assertPasswordResetNotRequired(user);

    return user;
  }

  async enforceSessionPolicyForLogin(userId: string): Promise<void> {
    const activeSessionCount = await this.repository.countActiveSessions(userId);

    if (activeSessionCount < MAX_ACTIVE_SESSIONS) {
      return;
    }

    await this.repository.markPasswordResetRequired(userId);
    await this.repository.revokeAllActiveSessions(userId, "session_limit_exceeded");
    throw new HttpError(403, "Too many active sessions. Reset your password to continue.", {
      code: "PASSWORD_RESET_REQUIRED"
    });
  }

  async createLoginSession(input: {
    sessionId: string;
    userId: string;
    refreshToken: string;
    metadata?: LoginSessionMetadata;
  }): Promise<void> {
    const refreshTokenHash = createTokenHash(input.refreshToken);
    const expiresAt = new Date(Date.now() + SESSION_TTL_MS);

    await this.repository.createLoginSession({
      id: input.sessionId,
      userId: input.userId,
      refreshTokenHash,
      expiresAt,
      ipAddress: input.metadata?.ipAddress,
      userAgent: input.metadata?.userAgent,
      browser: input.metadata?.browser,
      os: input.metadata?.os,
      deviceType: input.metadata?.deviceType,
      deviceModel: input.metadata?.deviceModel
    });
  }

  async validateRefreshSession(userId: string, sessionId: string, refreshToken: string): Promise<boolean> {
    const session = await this.repository.findActiveSessionById(sessionId);
    if (!session || session.userId !== userId) {
      return false;
    }

    const refreshTokenHash = createTokenHash(refreshToken);
    return session.refreshTokenHash === refreshTokenHash;
  }

  async touchSession(sessionId: string): Promise<void> {
    await this.repository.touchSession(sessionId);
  }

  async listActiveSessions(userId: string, currentSessionId?: string): Promise<ActiveSessionView[]> {
    const sessions = await this.repository.listActiveSessionsByUser(userId);

    return sessions.map((session) => ({
      id: session.id,
      ipAddress: session.ipAddress,
      userAgent: session.userAgent,
      browser: session.browser,
      os: session.os,
      deviceType: session.deviceType,
      deviceModel: session.deviceModel,
      createdAt: session.createdAt.toISOString(),
      lastActivityAt: session.lastActivityAt.toISOString(),
      expiresAt: session.expiresAt.toISOString(),
      current: currentSessionId === session.id
    }));
  }

  async revokeSession(userId: string, sessionId: string): Promise<void> {
    const revoked = await this.repository.revokeSession(userId, sessionId, "session_revoked_by_user");
    if (!revoked) {
      throw new HttpError(404, "Session not found");
    }
  }

  async revokeSessionByToken(userId: string, sessionId: string, reason = "logout"): Promise<void> {
    await this.repository.revokeSession(userId, sessionId, reason);
  }

  async verifyEmailToken(token: string): Promise<void> {
    const tokenHash = createTokenHash(token);
    const user = await this.repository.findUserByEmailVerificationTokenHash(tokenHash);

    if (!user) {
      throw new HttpError(400, "Verification token is invalid or expired.");
    }

    await this.repository.markEmailVerified(user.id);
  }

  async requestPasswordReset(emailValue: string): Promise<void> {
    const email = normalizeEmail(emailValue);
    const emailProvider = this.requireEmailProvider();
    const user = await this.repository.findUserByEmail(email);

    if (!user || !user.emailVerifiedAt) {
      return;
    }

    const resetToken = createTokenValue();
    const resetTokenHash = createTokenHash(resetToken);
    const resetTokenExpiresAt = new Date(Date.now() + RESET_TOKEN_TTL_MS);
    const resetUrl = this.buildPasswordResetUrl(resetToken);

    await this.repository.storePasswordResetToken(user.id, resetTokenHash, resetTokenExpiresAt);
    await emailProvider.sendEmail({
      to: email,
      subject: "Reset your EtherSend password",
      html: this.buildPasswordResetEmailHtml({
        recipientName: user.name,
        resetUrl
      }),
      text: this.buildPasswordResetEmailText({
        recipientName: user.name,
        resetUrl
      })
    });
  }

  async resetPassword(token: string, nextPassword: string): Promise<void> {
    const tokenHash = createTokenHash(token);
    const user = await this.repository.findUserByPasswordResetTokenHash(tokenHash);

    if (!user) {
      throw new HttpError(400, "Reset token is invalid or expired.");
    }

    const passwordHash = await hash(nextPassword, PASSWORD_SALT_ROUNDS);
    await this.repository.updatePasswordAfterReset(user.id, passwordHash);
    await this.repository.clearPasswordResetRequired(user.id);
    await this.repository.revokeAllActiveSessions(user.id, "password_reset");
  }

  async permanentlyDeleteAccount(userId: string): Promise<void> {
    const storagePaths = await this.repository.listOwnedStoragePaths(userId);
    const deleted = await this.repository.permanentlyDeleteAccount(userId);

    if (!deleted) {
      throw new HttpError(404, "Account not found");
    }

    for (const storagePath of storagePaths) {
      try {
        await storage.delete(storagePath);
      } catch {
        // Best-effort storage cleanup after permanent DB deletion.
      }
    }
  }

  private requireEmailProvider(): EmailProvider {
    if (!this.emailProvider) {
      throw new HttpError(503, "Email delivery is not configured.");
    }

    return this.emailProvider;
  }

  private assertPasswordResetNotRequired(user: User): void {
    if (user.passwordResetRequiredAt) {
      throw new HttpError(403, "Password reset required before signing in.", {
        code: "PASSWORD_RESET_REQUIRED"
      });
    }
  }

  private buildVerificationUrl(token: string): string {
    const url = new URL("/auth/verify-email", env.FRONTEND_BASE_URL);
    url.searchParams.set("token", token);
    return url.toString();
  }

  private buildPasswordResetUrl(token: string): string {
    const url = new URL("/auth/reset-password", env.FRONTEND_BASE_URL);
    url.searchParams.set("token", token);
    return url.toString();
  }

  private buildVerificationEmailHtml(input: { recipientName?: string; verificationUrl: string }): string {
    const greeting = input.recipientName ? `Hi ${input.recipientName},` : "Hi,";
    return `
      <div style="font-family:Arial,sans-serif;line-height:1.5;color:#0f172a;max-width:560px;margin:0 auto;">
        <h2 style="margin-bottom:8px;">Verify your EtherSend account</h2>
        <p>${greeting}</p>
        <p>Thanks for signing up. Please verify your email address to activate your account.</p>
        <p style="margin:24px 0;">
          <a href="${input.verificationUrl}" style="display:inline-block;padding:10px 16px;border-radius:8px;background:#1e90a8;color:#ffffff;text-decoration:none;font-weight:700;">Verify email</a>
        </p>
        <p>If the button does not work, copy and paste this URL:</p>
        <p style="word-break:break-all;">${input.verificationUrl}</p>
        <p style="margin-top:20px;color:#475569;font-size:12px;">This link expires in 24 hours.</p>
      </div>
    `;
  }

  private buildVerificationEmailText(input: { recipientName?: string; verificationUrl: string }): string {
    const greeting = input.recipientName ? `Hi ${input.recipientName},` : "Hi,";
    return `${greeting}\n\nVerify your EtherSend account by opening this link:\n${input.verificationUrl}\n\nThis link expires in 24 hours.`;
  }

  private buildPasswordResetEmailHtml(input: { recipientName?: string | null; resetUrl: string }): string {
    const greeting = input.recipientName ? `Hi ${input.recipientName},` : "Hi,";
    return `
      <div style="font-family:Arial,sans-serif;line-height:1.5;color:#0f172a;max-width:560px;margin:0 auto;">
        <h2 style="margin-bottom:8px;">Reset your EtherSend password</h2>
        <p>${greeting}</p>
        <p>We received a request to reset your password.</p>
        <p style="margin:24px 0;">
          <a href="${input.resetUrl}" style="display:inline-block;padding:10px 16px;border-radius:8px;background:#1e90a8;color:#ffffff;text-decoration:none;font-weight:700;">Reset password</a>
        </p>
        <p>If the button does not work, copy and paste this URL:</p>
        <p style="word-break:break-all;">${input.resetUrl}</p>
        <p style="margin-top:20px;color:#475569;font-size:12px;">This link expires in 30 minutes. If you did not request this, you can ignore this email.</p>
      </div>
    `;
  }

  private buildPasswordResetEmailText(input: { recipientName?: string | null; resetUrl: string }): string {
    const greeting = input.recipientName ? `Hi ${input.recipientName},` : "Hi,";
    return `${greeting}\n\nReset your EtherSend password by opening this link:\n${input.resetUrl}\n\nThis link expires in 30 minutes.`;
  }
}
