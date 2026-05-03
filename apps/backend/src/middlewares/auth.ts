import type { FastifyReply, FastifyRequest } from "fastify";
import { prisma } from "../config/prisma.js";

interface JwtPayload {
  sub: string;
  role: "ADMIN" | "USER";
  email: string;
  sid: string;
}

async function isSessionActive(payload: JwtPayload): Promise<boolean> {
  if (!payload.sid) {
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

  if (session.userId !== payload.sub) {
    return false;
  }

  if (session.revokedAt) {
    return false;
  }

  return session.expiresAt.getTime() > Date.now();
}

export async function requireAuth(request: FastifyRequest, reply: FastifyReply): Promise<void> {
  try {
    await request.jwtVerify();
    const payload = request.user as JwtPayload;
    if (await isSessionActive(payload)) {
      return;
    }
  } catch {
    // Fall through to cookie token fallback.
  }

  const cookieToken = request.cookies?.lf_access_token;

  if (cookieToken) {
    try {
      const payload = request.server.jwt.verify(cookieToken) as JwtPayload;

      if (!(await isSessionActive(payload))) {
        reply.status(401).send({ error: "Unauthorized" });
        return;
      }

      (request as FastifyRequest & { user: JwtPayload }).user = payload;
      return;
    } catch {
      reply.status(401).send({ error: "Unauthorized" });
      return;
    }
  }

  reply.status(401).send({ error: "Unauthorized" });
}

export function requireRole(roles: Array<"ADMIN" | "USER">) {
  return async function roleGuard(request: FastifyRequest, reply: FastifyReply): Promise<void> {
    await requireAuth(request, reply);

    if (reply.sent) {
      return;
    }

    if (!request.user || !roles.includes(request.user.role)) {
      reply.status(403).send({ error: "Forbidden" });
    }
  };
}
