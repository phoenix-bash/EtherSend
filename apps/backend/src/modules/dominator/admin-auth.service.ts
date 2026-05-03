import { createHash, randomBytes, timingSafeEqual } from "node:crypto";
import { compare } from "bcryptjs";
import { env } from "../../config/env.js";
import { HttpError } from "../../utils/http-error.js";
import { AdminAuditService } from "./admin-audit.service.js";
import { DominatorRepository } from "./repository.js";

const ACTIVATION_TOKEN_TTL_SECONDS = 30;
const CHALLENGE_TOKEN_TTL_SECONDS = 120;
const ADMIN_SESSION_TTL_MS = 60 * 60 * 1000;
const ADMIN_BRUTE_FORCE_WINDOW_MS = 15 * 60 * 1000;
const ADMIN_BRUTE_FORCE_MAX_ATTEMPTS = 5;

interface ActivationTokenPayload {
  sub: string;
  email: string;
  jti: string;
  exp: number;
  iat: number;
}

export class AdminAuthService {
  constructor(
    private readonly repository: DominatorRepository,
    private readonly auditService: AdminAuditService
  ) {}

  async createActivationToken(input: {
    userId: string;
    userEmail: string;
    contextPath: string;
    ipAddress?: string;
    userAgent?: string;
  }): Promise<string> {
    this.assertSuperuserEmail(input.userEmail);

    if (input.contextPath !== "/" && input.contextPath !== "/account") {
      await this.auditService.log({
        action: "activation_request",
        status: "failed_context",
        ipAddress: input.ipAddress,
        userAgent: input.userAgent,
        details: {
          contextPath: input.contextPath
        }
      });
      throw new HttpError(404, "Not Found");
    }

    const nowSeconds = Math.floor(Date.now() / 1000);
    const jti = randomBytes(16).toString("hex");
    const payload: ActivationTokenPayload = {
      sub: input.userId,
      email: input.userEmail.toLowerCase(),
      jti,
      iat: nowSeconds,
      exp: nowSeconds + ACTIVATION_TOKEN_TTL_SECONDS
    };

    await this.repository.createAdminAccessToken({
      jtiHash: createTokenHash(jti),
      userId: input.userId,
      superuserEmail: payload.email,
      expiresAt: new Date(payload.exp * 1000),
      ipAddress: input.ipAddress,
      userAgent: input.userAgent
    });

    await this.auditService.log({
      action: "activation_request",
      status: "ok",
      ipAddress: input.ipAddress,
      userAgent: input.userAgent
    });

    return signActivationToken(payload);
  }

  async consumeActivationToken(input: {
    userId: string;
    userEmail: string;
    token: string;
    ipAddress?: string;
    userAgent?: string;
  }): Promise<string> {
    this.assertSuperuserEmail(input.userEmail);

    const payload = verifyActivationToken(input.token);
    if (!payload || payload.sub !== input.userId || payload.email !== input.userEmail.toLowerCase()) {
      await this.auditService.log({
        action: "activation_consume",
        status: "failed_invalid_token",
        ipAddress: input.ipAddress,
        userAgent: input.userAgent
      });
      throw new HttpError(404, "Not Found");
    }

    const challengeToken = randomBytes(24).toString("hex");
    const consumed = await this.repository.consumeAdminAccessTokenAndIssueChallenge({
      jtiHash: createTokenHash(payload.jti),
      userId: input.userId,
      challengeHash: createTokenHash(challengeToken),
      challengeExpiresAt: new Date(Date.now() + CHALLENGE_TOKEN_TTL_SECONDS * 1000)
    });

    if (!consumed) {
      await this.auditService.log({
        action: "activation_consume",
        status: "failed_reused_or_expired",
        ipAddress: input.ipAddress,
        userAgent: input.userAgent
      });
      throw new HttpError(404, "Not Found");
    }

    await this.auditService.log({
      action: "activation_consume",
      status: "ok",
      ipAddress: input.ipAddress,
      userAgent: input.userAgent
    });

    return challengeToken;
  }

  async createAdminSession(input: {
    userId: string;
    userEmail: string;
    email: string;
    password: string;
    challengeToken: string;
    ipAddress?: string;
    userAgent?: string;
  }): Promise<string> {
    this.assertSuperuserEmail(input.userEmail);

    const failedAttempts = await this.repository.countFailedAdminLoginsSince(
      input.ipAddress,
      new Date(Date.now() - ADMIN_BRUTE_FORCE_WINDOW_MS)
    );

    if (failedAttempts >= ADMIN_BRUTE_FORCE_MAX_ATTEMPTS) {
      await this.auditService.log({
        action: "admin_login",
        status: "failed_bruteforce",
        ipAddress: input.ipAddress,
        userAgent: input.userAgent
      });
      throw new HttpError(404, "Not Found");
    }

    if (input.email.toLowerCase() !== env.SUPERUSER_EMAIL.toLowerCase()) {
      await this.auditService.log({
        action: "admin_login",
        status: "failed_email",
        ipAddress: input.ipAddress,
        userAgent: input.userAgent
      });
      throw new HttpError(404, "Not Found");
    }

    const challengeValid = await this.repository.consumeChallenge(createTokenHash(input.challengeToken), input.userId);
    if (!challengeValid) {
      await this.auditService.log({
        action: "admin_login",
        status: "failed_challenge",
        ipAddress: input.ipAddress,
        userAgent: input.userAgent
      });
      throw new HttpError(404, "Not Found");
    }

    const passwordOk = await compare(input.password, env.SUPERUSER_PASSWORD_HASH);
    if (!passwordOk) {
      await this.auditService.log({
        action: "admin_login",
        status: "failed_password",
        ipAddress: input.ipAddress,
        userAgent: input.userAgent
      });
      throw new HttpError(404, "Not Found");
    }

    const sessionToken = randomBytes(32).toString("hex");
    await this.repository.createAdminSession({
      sessionTokenHash: createTokenHash(sessionToken),
      userId: input.userId,
      superuserEmail: input.userEmail.toLowerCase(),
      expiresAt: new Date(Date.now() + ADMIN_SESSION_TTL_MS),
      ipAddress: input.ipAddress,
      userAgent: input.userAgent
    });

    await this.auditService.log({
      action: "admin_login",
      status: "ok",
      ipAddress: input.ipAddress,
      userAgent: input.userAgent
    });

    return sessionToken;
  }

  async revokeSession(sessionToken: string, ipAddress?: string, userAgent?: string): Promise<void> {
    await this.repository.revokeAdminSessionByTokenHash(createTokenHash(sessionToken));
    await this.auditService.log({
      action: "admin_logout",
      status: "ok",
      ipAddress,
      userAgent
    });
  }

  async resolveActiveSession(sessionToken: string | undefined, userEmail: string): Promise<{ userId: string; superuserEmail: string } | null> {
    if (!sessionToken) {
      return null;
    }

    const session = await this.repository.findActiveAdminSessionByTokenHash(createTokenHash(sessionToken));
    if (!session) {
      return null;
    }

    if (session.superuserEmail.toLowerCase() !== env.SUPERUSER_EMAIL.toLowerCase() || userEmail.toLowerCase() !== env.SUPERUSER_EMAIL.toLowerCase()) {
      return null;
    }

    await this.repository.touchAdminSession(session.id);
    return {
      userId: session.userId,
      superuserEmail: session.superuserEmail
    };
  }

  private assertSuperuserEmail(userEmail: string): void {
    if (userEmail.toLowerCase() !== env.SUPERUSER_EMAIL.toLowerCase()) {
      throw new HttpError(404, "Not Found");
    }
  }
}

function createTokenHash(value: string): string {
  return createHash("sha256").update(value).digest("hex");
}

function signActivationToken(payload: ActivationTokenPayload): string {
  const encodedPayload = toBase64Url(JSON.stringify(payload));
  const signature = createHash("sha256")
    .update(`${encodedPayload}.${env.ADMIN_ACCESS_SECRET}`)
    .digest("base64url");
  return `${encodedPayload}.${signature}`;
}

function verifyActivationToken(token: string): ActivationTokenPayload | null {
  const parts = token.split(".");
  if (parts.length !== 2) {
    return null;
  }

  const [encodedPayload, providedSignature] = parts;
  const expectedSignature = createHash("sha256")
    .update(`${encodedPayload}.${env.ADMIN_ACCESS_SECRET}`)
    .digest("base64url");

  if (!safeCompare(providedSignature, expectedSignature)) {
    return null;
  }

  try {
    const payload = JSON.parse(fromBase64Url(encodedPayload)) as ActivationTokenPayload;
    if (!payload.jti || !payload.sub || !payload.email || typeof payload.exp !== "number") {
      return null;
    }

    if (payload.exp * 1000 <= Date.now()) {
      return null;
    }

    return payload;
  } catch {
    return null;
  }
}

function safeCompare(a: string, b: string): boolean {
  const left = Buffer.from(a);
  const right = Buffer.from(b);

  if (left.length !== right.length) {
    return false;
  }

  return timingSafeEqual(left, right);
}

function toBase64Url(value: string): string {
  return Buffer.from(value, "utf8").toString("base64url");
}

function fromBase64Url(value: string): string {
  return Buffer.from(value, "base64url").toString("utf8");
}
