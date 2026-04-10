import { createHash, randomUUID } from "node:crypto";
import { env } from "../../config/env.js";
import { prisma } from "../../config/prisma.js";
import { HttpError } from "../../utils/http-error.js";

const GUEST_COOKIE_NAME = "lf_guest";
const TEN_MIN_MS = 10 * 60 * 1000;
const GUEST_COOKIE_MAX_AGE_SECONDS = 10 * 60;

function hashToken(token: string): string {
  return createHash("sha256").update(`${token}:${env.GUEST_SESSION_SECRET}`).digest("hex");
}

export class GuestService {
  getCookieName(): string {
    return GUEST_COOKIE_NAME;
  }

  getCookieMaxAgeSeconds(): number {
    return GUEST_COOKIE_MAX_AGE_SECONDS;
  }

  async getOrCreateGuestSession(rawToken?: string): Promise<{ token: string; sessionId: string }> {
    if (rawToken) {
      const existing = await prisma.guestSession.findUnique({
        where: { tokenHash: hashToken(rawToken) }
      });

      if (existing) {
        return { token: rawToken, sessionId: existing.id };
      }
    }

    const token = randomUUID();
    const session = await prisma.guestSession.create({
      data: {
        tokenHash: hashToken(token)
      }
    });

    return { token, sessionId: session.id };
  }

  async assertGuestCanUpload(sessionId: string, fileBytes: number): Promise<void> {
    const guest = await prisma.guestSession.findUnique({ where: { id: sessionId } });
    if (!guest) {
      throw new HttpError(401, "Guest session not found");
    }

    if (guest.uploadCount >= 5) {
      throw new HttpError(429, "Guest upload limit reached");
    }

    const currentBytes = Number(guest.totalBytes);
    if (currentBytes + fileBytes > env.MAX_UPLOAD_BYTES) {
      throw new HttpError(413, "Guest storage limit reached");
    }
  }

  async registerGuestUpload(sessionId: string, fileBytes: number): Promise<{ expiresAt: Date }> {
    const guest = await prisma.guestSession.findUnique({ where: { id: sessionId } });
    if (!guest) {
      throw new HttpError(401, "Guest session not found");
    }

    const startedAt = guest.startedAt ?? new Date();
    const expiresAt = guest.expiresAt ?? new Date(startedAt.getTime() + TEN_MIN_MS);

    await prisma.guestSession.update({
      where: { id: sessionId },
      data: {
        startedAt,
        expiresAt,
        uploadCount: { increment: 1 },
        totalBytes: guest.totalBytes + BigInt(fileBytes)
      }
    });

    return { expiresAt };
  }
}
