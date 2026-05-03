import { beforeEach, describe, expect, it, vi } from "vitest";
import { hash } from "bcryptjs";
import { env } from "../../../config/env.js";
import { HttpError } from "../../../utils/http-error.js";
import { AdminAuditService } from "../admin-audit.service.js";
import { AdminAuthService } from "../admin-auth.service.js";

function createRepositoryMock() {
  return {
    createAdminAccessToken: vi.fn(async () => {}),
    consumeAdminAccessTokenAndIssueChallenge: vi.fn(async () => true),
    consumeChallenge: vi.fn(async () => true),
    countFailedAdminLoginsSince: vi.fn(async () => 0),
    createAdminSession: vi.fn(async () => {}),
    findActiveAdminSessionByTokenHash: vi.fn(async () => ({
      id: "session-1",
      userId: "user-1",
      superuserEmail: env.SUPERUSER_EMAIL,
      expiresAt: new Date(Date.now() + 10000)
    })),
    touchAdminSession: vi.fn(async () => {}),
    revokeAdminSessionByTokenHash: vi.fn(async () => {})
  };
}

describe("AdminAuthService", () => {
  beforeEach(async () => {
    env.SUPERUSER_EMAIL = "superuser@example.com";
    env.SUPERUSER_PASSWORD_HASH = await hash("CorrectPass123!", 10);
    env.ADMIN_ACCESS_SECRET = "0123456789012345678901234567890123456789";
  });

  it("creates a signed hidden activation token for superuser", async () => {
    const repository = createRepositoryMock();
    const audit = { log: vi.fn(async () => {}) } as unknown as AdminAuditService;
    const service = new AdminAuthService(repository as never, audit);

    const token = await service.createActivationToken({
      userId: "user-1",
      userEmail: "superuser@example.com",
      contextPath: "/",
      ipAddress: "127.0.0.1"
    });

    expect(token.length).toBeGreaterThan(20);
    expect(repository.createAdminAccessToken).toHaveBeenCalledOnce();
  });

  it("rejects invalid activation token consumption", async () => {
    const repository = createRepositoryMock();
    const audit = { log: vi.fn(async () => {}) } as unknown as AdminAuditService;
    const service = new AdminAuthService(repository as never, audit);

    await expect(
      service.consumeActivationToken({
        userId: "user-1",
        userEmail: "superuser@example.com",
        token: "malformed",
        ipAddress: "127.0.0.1"
      })
    ).rejects.toBeInstanceOf(HttpError);
  });

  it("enforces password verification for admin session login", async () => {
    const repository = createRepositoryMock();
    const audit = { log: vi.fn(async () => {}) } as unknown as AdminAuditService;
    const service = new AdminAuthService(repository as never, audit);

    await expect(
      service.createAdminSession({
        userId: "user-1",
        userEmail: "superuser@example.com",
        email: "superuser@example.com",
        password: "WrongPassword",
        challengeToken: "challenge-token",
        ipAddress: "127.0.0.1"
      })
    ).rejects.toBeInstanceOf(HttpError);
  });
});
