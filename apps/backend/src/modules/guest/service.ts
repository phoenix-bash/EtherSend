import { createHash, randomUUID } from "node:crypto";
import { Prisma } from "@prisma/client";
import { env } from "../../config/env.js";
import { prisma } from "../../config/prisma.js";
import { HttpError } from "../../utils/http-error.js";

const GUEST_COOKIE_NAME = "lf_guest";
const GUEST_SESSION_TTL_MS = 15 * 60 * 1000;
const GUEST_COOKIE_MAX_AGE_SECONDS = 15 * 60;

function hashToken(token: string): string {
  return createHash("sha256").update(`${token}:${env.GUEST_SESSION_SECRET}`).digest("hex");
}

export class GuestService {
  private async sumGuestLegacyBytes(sessionId: string): Promise<bigint> {
    const usage = await prisma.mediaFile.aggregate({
      where: {
        ownerType: "GUEST",
        guestSessionId: sessionId
      },
      _sum: {
        sizeBytes: true
      }
    });

    return usage._sum.sizeBytes ?? 0n;
  }

  private async sumGuestV2Bytes(sessionId: string): Promise<bigint> {
    try {
      const usage = await prisma.v2Upload.aggregate({
        where: {
          userId: `guest:${sessionId}`,
          status: {
            in: ["PENDING", "UPLOADING", "COMPLETED"]
          }
        },
        _sum: {
          fileSize: true
        }
      });

      return usage._sum.fileSize ?? 0n;
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2021") {
        return 0n;
      }

      throw error;
    }
  }

  private async resolveGuestUsageBytes(sessionId: string): Promise<bigint> {
    const [legacyBytes, v2Bytes] = await Promise.all([this.sumGuestLegacyBytes(sessionId), this.sumGuestV2Bytes(sessionId)]);
    return legacyBytes + v2Bytes;
  }

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
        if (!existing.expiresAt || existing.expiresAt.getTime() > Date.now()) {
          return { token: rawToken, sessionId: existing.id };
        }
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

    const currentBytes = await this.resolveGuestUsageBytes(sessionId);
    const projectedBytes = currentBytes + BigInt(Math.max(0, fileBytes));

    if (projectedBytes > BigInt(env.MAX_UPLOAD_BYTES)) {
      throw new HttpError(413, "Guest storage limit reached");
    }
  }

  async registerGuestUpload(sessionId: string, fileBytes: number): Promise<{ expiresAt: Date }> {
    const guest = await prisma.guestSession.findUnique({ where: { id: sessionId } });
    if (!guest) {
      throw new HttpError(401, "Guest session not found");
    }

    const now = new Date();
    const startedAt = guest.startedAt ?? now;
    const expiresAt = new Date(now.getTime() + GUEST_SESSION_TTL_MS);

    await prisma.guestSession.update({
      where: { id: sessionId },
      data: {
        startedAt,
        expiresAt
      }
    });

    return { expiresAt };
  }
}
