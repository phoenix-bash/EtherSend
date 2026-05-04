import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { env } from "../../config/env.js";
import { AdminAuditService } from "./admin-audit.service.js";
import { AdminAuthService } from "./admin-auth.service.js";
import { AdminMetricsService } from "./admin-metrics.service.js";
import { AdminUserService } from "./admin-user.service.js";
import { requireAdminSession, requireDominatorAuth } from "./middleware.js";
import { DominatorRepository } from "./repository.js";

const repository = new DominatorRepository();
const auditService = new AdminAuditService(repository);
const authService = new AdminAuthService(repository, auditService);
const metricsService = new AdminMetricsService(repository);
const userService = new AdminUserService(repository, auditService);

const activationConsumeSchema = z.object({
  token: z.string().min(20)
});

const adminLoginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(8).max(256),
  challengeToken: z.string().min(20)
});

const paginationSchema = z.object({
  page: z.coerce.number().int().min(1).optional(),
  pageSize: z.coerce.number().int().min(1).max(100).optional(),
  query: z.string().trim().max(120).optional()
});

const userParamSchema = z.object({
  userId: z.string().uuid()
});

const mediaParamSchema = z.object({
  mediaId: z.string().uuid()
});

const destructiveActionSchema = z.object({
  superuserPassword: z.string().min(8).max(256)
});

function setAdminSessionCookie(reply: { setCookie: (name: string, value: string, options: Record<string, unknown>) => unknown }, token: string): void {
  const isProduction = env.NODE_ENV === "production";
  reply.setCookie("lf_admin_session", token, {
    path: "/",
    httpOnly: true,
    secure: isProduction,
    sameSite: "strict",
    maxAge: 60 * 60
  });
}

export async function registerDominatorRoutes(app: FastifyInstance): Promise<void> {
  app.addHook("onSend", async (request, reply) => {
    if (!request.url.startsWith("/dominator")) {
      return;
    }

    reply.header("Cache-Control", "no-store");
  });

  app.post(
    "/dominator/access/ignite",
    {
      preHandler: [requireDominatorAuth],
      config: {
        rateLimit: {
          max: 4,
          timeWindow: "1 minute"
        }
      }
    },
    async (request, reply) => {
      const referer = String(request.headers.referer ?? "");
      let contextPath = "";
      try {
        contextPath = new URL(referer).pathname;
      } catch {
        contextPath = "";
      }

      const token = await authService.createActivationToken({
        userId: request.user.sub,
        userEmail: request.user.email,
        contextPath,
        ipAddress: request.ip,
        userAgent: String(request.headers["user-agent"] ?? "") || undefined
      });

      return reply.send({ token, expiresInSeconds: 30 });
    }
  );

  app.post(
    "/dominator/access/consume",
    {
      preHandler: [requireDominatorAuth],
      config: {
        rateLimit: {
          max: 8,
          timeWindow: "1 minute"
        }
      }
    },
    async (request, reply) => {
      const bodyResult = activationConsumeSchema.safeParse(request.body);
      if (!bodyResult.success) {
        return reply.status(404).send({ error: "Not Found" });
      }

      const challengeToken = await authService.consumeActivationToken({
        userId: request.user.sub,
        userEmail: request.user.email,
        token: bodyResult.data.token,
        ipAddress: request.ip,
        userAgent: String(request.headers["user-agent"] ?? "") || undefined
      });

      return reply.send({ challengeToken });
    }
  );

  app.post(
    "/dominator/session",
    {
      preHandler: [requireDominatorAuth],
      config: {
        rateLimit: {
          max: 5,
          timeWindow: "15 minutes"
        }
      }
    },
    async (request, reply) => {
      const bodyResult = adminLoginSchema.safeParse(request.body);
      if (!bodyResult.success) {
        return reply.status(404).send({ error: "Not Found" });
      }

      const sessionToken = await authService.createAdminSession({
        userId: request.user.sub,
        userEmail: request.user.email,
        email: bodyResult.data.email,
        password: bodyResult.data.password,
        challengeToken: bodyResult.data.challengeToken,
        ipAddress: request.ip,
        userAgent: String(request.headers["user-agent"] ?? "") || undefined
      });

      setAdminSessionCookie(reply, sessionToken);
      return reply.send({ ok: true });
    }
  );

  app.get(
    "/dominator/session/me",
    {
      preHandler: [requireDominatorAuth],
      config: {
        rateLimit: {
          max: 20,
          timeWindow: "1 minute"
        }
      }
    },
    async (request, reply) => {
      if (!request.user?.email) {
        return reply.status(404).send({ error: "Not Found" });
      }

      const activeSession = await authService.resolveActiveSession(request.cookies.lf_admin_session, request.user.email);
      if (!activeSession) {
        return reply.status(404).send({ error: "Not Found" });
      }

      return reply.send({ ok: true });
    }
  );

  app.delete(
    "/dominator/session",
    {
      preHandler: [requireDominatorAuth],
      config: {
        rateLimit: {
          max: 10,
          timeWindow: "1 minute"
        }
      }
    },
    async (request, reply) => {
      if (request.cookies.lf_admin_session) {
        await authService.revokeSession(
          request.cookies.lf_admin_session,
          request.ip,
          String(request.headers["user-agent"] ?? "") || undefined
        );
      }

      reply.clearCookie("lf_admin_session", { path: "/" });
      return reply.send({ ok: true });
    }
  );

  app.get(
    "/dominator/overview",
    {
      preHandler: [requireDominatorAuth, requireAdminSession],
      config: {
        rateLimit: {
          max: 20,
          timeWindow: "1 minute"
        }
      }
    },
    async () => {
      const overview = await metricsService.getOverview();
      return { overview };
    }
  );

  app.get(
    "/dominator/users",
    {
      preHandler: [requireDominatorAuth, requireAdminSession],
      config: {
        rateLimit: {
          max: 20,
          timeWindow: "1 minute"
        }
      }
    },
    async (request, reply) => {
      const queryResult = paginationSchema.safeParse(request.query);
      if (!queryResult.success) {
        return reply.status(400).send({ error: "Invalid query" });
      }

      const users = await userService.searchUsers(queryResult.data);
      return reply.send(users);
    }
  );

  app.get(
    "/dominator/users/:userId",
    {
      preHandler: [requireDominatorAuth, requireAdminSession]
    },
    async (request, reply) => {
      const paramResult = userParamSchema.safeParse(request.params);
      if (!paramResult.success) {
        return reply.status(404).send({ error: "Not Found" });
      }

      const user = await userService.getUserDetails(paramResult.data.userId);
      if (!user) {
        return reply.status(404).send({ error: "Not Found" });
      }

      return reply.send({ user });
    }
  );

  app.get(
    "/dominator/users/:userId/files",
    {
      preHandler: [requireDominatorAuth, requireAdminSession]
    },
    async (request, reply) => {
      const paramResult = userParamSchema.safeParse(request.params);
      const queryResult = paginationSchema.safeParse(request.query);
      if (!paramResult.success || !queryResult.success) {
        return reply.status(404).send({ error: "Not Found" });
      }

      const files = await userService.listUserFiles({
        userId: paramResult.data.userId,
        page: queryResult.data.page,
        pageSize: queryResult.data.pageSize
      });

      return reply.send(files);
    }
  );

  app.delete(
    "/dominator/files/:mediaId",
    {
      preHandler: [requireDominatorAuth, requireAdminSession]
    },
    async (request, reply) => {
      const paramResult = mediaParamSchema.safeParse(request.params);
      const bodyResult = destructiveActionSchema.safeParse(request.body);
      if (!paramResult.success || !bodyResult.success) {
        return reply.status(404).send({ error: "Not Found" });
      }

      await userService.deleteMediaFile({
        mediaId: paramResult.data.mediaId,
        superuserPassword: bodyResult.data.superuserPassword,
        ipAddress: request.ip,
        userAgent: String(request.headers["user-agent"] ?? "") || undefined
      });

      return reply.send({ ok: true });
    }
  );

  app.delete(
    "/dominator/users/:userId",
    {
      preHandler: [requireDominatorAuth, requireAdminSession]
    },
    async (request, reply) => {
      const paramResult = userParamSchema.safeParse(request.params);
      const bodyResult = destructiveActionSchema.safeParse(request.body);
      if (!paramResult.success || !bodyResult.success) {
        return reply.status(404).send({ error: "Not Found" });
      }

      await userService.deleteUser({
        userId: paramResult.data.userId,
        superuserPassword: bodyResult.data.superuserPassword,
        ipAddress: request.ip,
        userAgent: String(request.headers["user-agent"] ?? "") || undefined
      });

      return reply.send({ ok: true });
    }
  );

  app.post(
    "/dominator/storage/guests/clear",
    {
      preHandler: [requireDominatorAuth, requireAdminSession]
    },
    async (request, reply) => {
      const bodyResult = destructiveActionSchema.safeParse(request.body);
      if (!bodyResult.success) {
        return reply.status(404).send({ error: "Not Found" });
      }

      const summary = await userService.clearGuestStorage({
        superuserPassword: bodyResult.data.superuserPassword,
        ipAddress: request.ip,
        userAgent: String(request.headers["user-agent"] ?? "") || undefined
      });

      return reply.send({ ok: true, summary });
    }
  );

  app.post(
    "/dominator/destructive/verify",
    {
      preHandler: [requireDominatorAuth, requireAdminSession]
    },
    async (request, reply) => {
      const bodyResult = destructiveActionSchema.safeParse(request.body);
      if (!bodyResult.success) {
        return reply.status(404).send({ error: "Not Found" });
      }

      await userService.verifyDestructiveAccess({
        superuserPassword: bodyResult.data.superuserPassword,
        ipAddress: request.ip,
        userAgent: String(request.headers["user-agent"] ?? "") || undefined
      });

      return reply.send({ ok: true });
    }
  );

  app.post(
    "/dominator/storage/registered/clear",
    {
      preHandler: [requireDominatorAuth, requireAdminSession]
    },
    async (request, reply) => {
      const bodyResult = destructiveActionSchema.safeParse(request.body);
      if (!bodyResult.success) {
        return reply.status(404).send({ error: "Not Found" });
      }

      const summary = await userService.clearRegisteredUserStorage({
        superuserPassword: bodyResult.data.superuserPassword,
        ipAddress: request.ip,
        userAgent: String(request.headers["user-agent"] ?? "") || undefined
      });

      return reply.send({ ok: true, summary });
    }
  );

  app.get(
    "/dominator/live-activity",
    {
      preHandler: [requireDominatorAuth, requireAdminSession]
    },
    async () => {
      const activity = await repository.getLiveActivity(new Date());
      return { activity };
    }
  );

  app.get(
    "/dominator/audit-logs",
    {
      preHandler: [requireDominatorAuth, requireAdminSession]
    },
    async (request) => {
      const query = z.object({ take: z.coerce.number().int().min(1).max(250).optional() }).safeParse(request.query);
      const logs = await auditService.listRecent(query.success ? query.data.take : undefined);
      return { logs };
    }
  );
}
