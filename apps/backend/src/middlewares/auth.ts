import type { FastifyReply, FastifyRequest } from "fastify";

export async function requireAuth(request: FastifyRequest, reply: FastifyReply): Promise<void> {
  try {
    await request.jwtVerify();
  } catch {
    const cookieToken = request.cookies?.lf_access_token;

    if (cookieToken) {
      try {
        const payload = request.server.jwt.verify(cookieToken) as {
          sub: string;
          role: "ADMIN" | "USER";
          email: string;
        };

        (request as FastifyRequest & { user: typeof payload }).user = payload;
        return;
      } catch {
        reply.status(401).send({ error: "Unauthorized" });
        return;
      }
    }

    reply.status(401).send({ error: "Unauthorized" });
  }
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
