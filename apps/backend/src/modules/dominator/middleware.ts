import { createHash } from "node:crypto";
import type { FastifyReply, FastifyRequest } from "fastify";
import { env } from "../../config/env.js";
import { prisma } from "../../config/prisma.js";
import { AdminAuditService } from "./admin-audit.service.js";
import { DominatorRepository } from "./repository.js";

const repository = new DominatorRepository();
const auditService = new AdminAuditService(repository);

export interface AdminSessionContext {
  userId: string;
  superuserEmail: string;
}

interface JwtPayload {
  sub: string;
  role: "ADMIN" | "USER";
  email: string;
  sid: string;
}

export async function requireDominatorAuth(request: FastifyRequest, reply: FastifyReply): Promise<void> {
  const bearerPayload = await resolvePayloadFromBearer(request);
  if (bearerPayload && (await isLoginSessionActive(bearerPayload))) {
    (request as FastifyRequest & { user: JwtPayload }).user = bearerPayload;
    return;
  }

  const cookiePayload = await resolvePayloadFromCookie(request);
  if (cookiePayload && (await isLoginSessionActive(cookiePayload))) {
    (request as FastifyRequest & { user: JwtPayload }).user = cookiePayload;
    return;
  }

  await logFailedAccess(request, "missing_or_invalid_user_auth");
  return reply.status(404).send({ error: "Not Found" });
}

export async function requireAdminSession(request: FastifyRequest, reply: FastifyReply): Promise<void> {
  const sessionToken = request.cookies?.lf_admin_session;
  if (!sessionToken) {
    await logFailedAccess(request, "missing_cookie");
    reply.status(404).send({ error: "Not Found" });
    return;
  }

  const session = await repository.findActiveAdminSessionByTokenHash(createHash("sha256").update(sessionToken).digest("hex"));
  if (!session) {
    await logFailedAccess(request, "invalid_session");
    reply.status(404).send({ error: "Not Found" });
    return;
  }

  if (!request.user || request.user.email?.toLowerCase() !== env.SUPERUSER_EMAIL.toLowerCase()) {
    await logFailedAccess(request, "superuser_mismatch");
    reply.status(404).send({ error: "Not Found" });
    return;
  }

  await repository.touchAdminSession(session.id);
  (request as FastifyRequest & { adminSession: AdminSessionContext }).adminSession = {
    userId: session.userId,
    superuserEmail: session.superuserEmail
  };
}

async function logFailedAccess(request: FastifyRequest, status: string): Promise<void> {
  await auditService.log({
    action: "admin_access_attempt",
    status,
    ipAddress: request.ip,
    userAgent: String(request.headers["user-agent"] ?? "") || undefined,
    details: {
      path: request.url,
      method: request.method
    }
  });
}

async function resolvePayloadFromBearer(request: FastifyRequest): Promise<JwtPayload | null> {
  try {
    await request.jwtVerify();
    return request.user as JwtPayload;
  } catch {
    return null;
  }
}

async function resolvePayloadFromCookie(request: FastifyRequest): Promise<JwtPayload | null> {
  const token = request.cookies?.lf_access_token;
  if (!token) {
    return null;
  }

  try {
    return request.server.jwt.verify(token) as JwtPayload;
  } catch {
    return null;
  }
}

async function isLoginSessionActive(payload: JwtPayload): Promise<boolean> {
  if (!payload.sid || !payload.sub) {
    return false;
  }

  const session = await prisma.loginSession.findUnique({
    where: {
      id: payload.sid
    },
    select: {
      userId: true,
      revokedAt: true,
      expiresAt: true
    }
  });

  if (!session) {
    return false;
  }

  if (session.userId !== payload.sub || session.revokedAt) {
    return false;
  }

  return session.expiresAt.getTime() > Date.now();
}
