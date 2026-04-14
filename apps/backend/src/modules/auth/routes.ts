import { randomUUID } from "node:crypto";
import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import { z } from "zod";
import { requireAuth } from "../../middlewares/auth.js";
import { prisma } from "../../config/prisma.js";
import { env } from "../../config/env.js";
import { getEmailProvider } from "../../providers/email/index.js";
import { HttpError } from "../../utils/http-error.js";
import type { LoginSessionMetadata } from "./service.js";
import { AuthRepository } from "./repository.js";
import { AuthService } from "./service.js";

const providerSchema = z.enum(["google", "github"]);

const startQuerySchema = z.object({
  state: z.string().optional(),
  mode: z.enum(["cookie", "token"]).optional(),
  redirectPath: z.string().optional()
});

const callbackQuerySchema = z.object({
  code: z.string().min(1),
  state: z.string().optional()
});

const exchangeBodySchema = z
  .object({
    accessToken: z.string().min(1).optional(),
    code: z.string().min(1).optional()
  })
  .refine((value) => Boolean(value.accessToken || value.code), {
    message: "Either accessToken or code is required"
  });

const emailSignUpSchema = z.object({
  email: z.string().email(),
  password: z.string().min(8).max(128),
  name: z.string().trim().min(1).max(80).optional()
});

const emailSignInSchema = z.object({
  email: z.string().email(),
  password: z.string().min(8).max(128)
});

const verifyEmailSchema = z.object({
  token: z.string().min(32).max(512)
});

const forgotPasswordSchema = z.object({
  email: z.string().email()
});

const resetPasswordSchema = z.object({
  token: z.string().min(32).max(512),
  password: z.string().min(8).max(128)
});

const sessionRevokeParamSchema = z.object({
  sessionId: z.string().uuid()
});

const deleteAccountSchema = z.object({
  confirmation: z.string().trim().regex(/^[A-Za-z]{1,15}$/)
});

function issueTokens(
  app: FastifyInstance,
  user: { id: string; role: "ADMIN" | "USER"; email: string },
  sessionId: string
) {
  const accessToken = app.jwt.sign({
    sub: user.id,
    role: user.role,
    email: user.email,
    sid: sessionId
  });

  const refreshToken = app.jwt.sign(
    {
      sub: user.id,
      role: user.role,
      email: user.email,
      sid: sessionId
    },
    { expiresIn: "7d" }
  );

  return { accessToken, refreshToken };
}

function setSessionCookies(reply: FastifyReply, tokens: { accessToken: string; refreshToken: string }): void {
  reply
    .setCookie("lf_access_token", tokens.accessToken, {
      path: "/",
      httpOnly: true,
      sameSite: "lax",
      secure: env.NODE_ENV === "production",
      maxAge: 60 * 15
    })
    .setCookie("lf_refresh_token", tokens.refreshToken, {
      path: "/",
      httpOnly: true,
      sameSite: "lax",
      secure: env.NODE_ENV === "production",
      maxAge: 60 * 60 * 24 * 7
    });
}

interface AuthStatePayload {
  mode: "cookie" | "token";
  redirectPath: string;
  appState?: string;
}

function encodeState(payload: AuthStatePayload): string {
  return Buffer.from(JSON.stringify(payload), "utf8").toString("base64url");
}

function decodeState(raw?: string): AuthStatePayload {
  if (!raw) {
    return {
      mode: "cookie",
      redirectPath: "/auth/callback"
    };
  }

  try {
    const decoded = Buffer.from(raw, "base64url").toString("utf8");
    const parsed = JSON.parse(decoded) as Partial<AuthStatePayload>;
    return {
      mode: parsed.mode === "token" ? "token" : "cookie",
      redirectPath:
        typeof parsed.redirectPath === "string" && parsed.redirectPath.startsWith("/")
          ? parsed.redirectPath
          : "/auth/callback",
      appState: typeof parsed.appState === "string" ? parsed.appState : undefined
    };
  } catch {
    return {
      mode: "cookie",
      redirectPath: "/auth/callback"
    };
  }
}

function extractBearerToken(authorizationHeader?: string): string | null {
  if (!authorizationHeader) {
    return null;
  }

  const [scheme, token] = authorizationHeader.split(" ");
  if (!scheme || !token || scheme.toLowerCase() !== "bearer") {
    return null;
  }

  return token;
}

function parseBrowser(userAgent: string): string | undefined {
  if (!userAgent) {
    return undefined;
  }

  if (/edg\//i.test(userAgent)) {
    return "Edge";
  }

  if (/opr\//i.test(userAgent) || /opera/i.test(userAgent)) {
    return "Opera";
  }

  if (/chrome\//i.test(userAgent) && !/edg\//i.test(userAgent)) {
    return "Chrome";
  }

  if (/firefox\//i.test(userAgent)) {
    return "Firefox";
  }

  if (/safari\//i.test(userAgent) && /version\//i.test(userAgent) && !/chrome\//i.test(userAgent)) {
    return "Safari";
  }

  return undefined;
}

function parseOs(userAgent: string): string | undefined {
  if (!userAgent) {
    return undefined;
  }

  if (/windows nt/i.test(userAgent)) {
    return "Windows";
  }

  if (/android/i.test(userAgent)) {
    return "Android";
  }

  if (/iphone|ipad|ipod/i.test(userAgent)) {
    return "iOS";
  }

  if (/mac os x/i.test(userAgent)) {
    return "macOS";
  }

  if (/linux/i.test(userAgent)) {
    return "Linux";
  }

  return undefined;
}

function parseDeviceType(userAgent: string): string | undefined {
  if (!userAgent) {
    return undefined;
  }

  if (/ipad|tablet|sm-t|nexus 7/i.test(userAgent)) {
    return "tablet";
  }

  if (/iphone|mobile|android/i.test(userAgent)) {
    return "mobile";
  }

  return "desktop";
}

function parseDeviceModel(userAgent: string): string | undefined {
  if (!userAgent) {
    return undefined;
  }

  if (/iphone/i.test(userAgent)) {
    return "iPhone";
  }

  if (/ipad/i.test(userAgent)) {
    return "iPad";
  }

  const androidModelMatch = userAgent.match(/Android[^;]*;\s*([^;\)]+)(?:\s+Build|;|\))/i);
  if (androidModelMatch?.[1]) {
    const model = androidModelMatch[1].trim();
    if (model && model.toLowerCase() !== "wv") {
      return model;
    }
  }

  return undefined;
}

function parseClientMetadata(request: FastifyRequest): LoginSessionMetadata {
  const userAgentHeader = request.headers["user-agent"];
  const userAgent = typeof userAgentHeader === "string" ? userAgentHeader : undefined;

  return {
    ipAddress: request.ip,
    userAgent,
    browser: userAgent ? parseBrowser(userAgent) : undefined,
    os: userAgent ? parseOs(userAgent) : undefined,
    deviceType: userAgent ? parseDeviceType(userAgent) : undefined,
    deviceModel: userAgent ? parseDeviceModel(userAgent) : undefined
  };
}

export async function registerAuthRoutes(app: FastifyInstance): Promise<void> {
  const service = new AuthService(new AuthRepository(), getEmailProvider());

  app.get("/auth/providers", async () => ({
    enabled: ["google", "github"],
    localPasswordAuth: true
  }));

  app.post(
    "/auth/signup",
    {
      config: {
        rateLimit: {
          max: 8,
          timeWindow: "1 minute"
        }
      }
    },
    async (request, reply) => {
      const bodyResult = emailSignUpSchema.safeParse(request.body);
      if (!bodyResult.success) {
        return reply.status(400).send({ error: "Invalid body", details: bodyResult.error.flatten() });
      }

      const result = await service.signUpWithEmail(bodyResult.data);
      return reply.send({ ok: true, ...result });
    }
  );

  app.post(
    "/auth/signin",
    {
      config: {
        rateLimit: {
          max: 12,
          timeWindow: "1 minute"
        }
      }
    },
    async (request, reply) => {
      const bodyResult = emailSignInSchema.safeParse(request.body);
      if (!bodyResult.success) {
        return reply.status(400).send({ error: "Invalid body", details: bodyResult.error.flatten() });
      }

      const user = await service.signInWithEmail(bodyResult.data);
      await service.enforceSessionPolicyForLogin(user.id);

      const sessionId = randomUUID();
      const tokens = issueTokens(
        app,
        {
          id: user.id,
          role: user.role,
          email: user.email
        },
        sessionId
      );

      await service.createLoginSession({
        sessionId,
        userId: user.id,
        refreshToken: tokens.refreshToken,
        metadata: parseClientMetadata(request)
      });

      setSessionCookies(reply, tokens);

      return reply.send({
        user,
        ...tokens
      });
    }
  );

  app.post(
    "/auth/verify-email",
    {
      config: {
        rateLimit: {
          max: 15,
          timeWindow: "1 minute"
        }
      }
    },
    async (request, reply) => {
      const bodyResult = verifyEmailSchema.safeParse(request.body);
      if (!bodyResult.success) {
        return reply.status(400).send({ error: "Invalid body", details: bodyResult.error.flatten() });
      }

      await service.verifyEmailToken(bodyResult.data.token);
      return reply.send({ ok: true });
    }
  );

  app.post(
    "/auth/forgot-password",
    {
      config: {
        rateLimit: {
          max: 6,
          timeWindow: "1 minute"
        }
      }
    },
    async (request, reply) => {
      const bodyResult = forgotPasswordSchema.safeParse(request.body);
      if (!bodyResult.success) {
        return reply.status(400).send({ error: "Invalid body", details: bodyResult.error.flatten() });
      }

      await service.requestPasswordReset(bodyResult.data.email);
      return reply.send({ ok: true });
    }
  );

  app.post(
    "/auth/reset-password",
    {
      config: {
        rateLimit: {
          max: 8,
          timeWindow: "1 minute"
        }
      }
    },
    async (request, reply) => {
      const bodyResult = resetPasswordSchema.safeParse(request.body);
      if (!bodyResult.success) {
        return reply.status(400).send({ error: "Invalid body", details: bodyResult.error.flatten() });
      }

      await service.resetPassword(bodyResult.data.token, bodyResult.data.password);
      return reply.send({ ok: true });
    }
  );

  app.get("/auth/:provider/start", async (request, reply) => {
    const providerResult = providerSchema.safeParse((request.params as { provider: string }).provider);

    if (!providerResult.success) {
      return reply.status(400).send({ error: "Invalid provider" });
    }

    const queryResult = startQuerySchema.safeParse(request.query);
    if (!queryResult.success) {
      return reply.status(400).send({ error: "Invalid query", details: queryResult.error.flatten() });
    }

    const mode = queryResult.data.mode === "token" ? "token" : "cookie";
    const redirectPath =
      queryResult.data.redirectPath && queryResult.data.redirectPath.startsWith("/")
        ? queryResult.data.redirectPath
        : "/auth/callback";

    const state = encodeState({
      mode,
      redirectPath,
      appState: queryResult.data.state
    });

    const authorizationUrl = service.getAuthorizationUrl(providerResult.data, state);
    return reply.redirect(authorizationUrl);
  });

  app.get("/auth/:provider/callback", async (request, reply) => {
    const providerResult = providerSchema.safeParse((request.params as { provider: string }).provider);
    if (!providerResult.success) {
      return reply.status(400).send({ error: "Invalid provider" });
    }

    const queryResult = callbackQuerySchema.safeParse(request.query);
    if (!queryResult.success) {
      return reply.status(400).send({ error: "Invalid callback query", details: queryResult.error.flatten() });
    }

    const statePayload = decodeState(queryResult.data.state);
    let user: { id: string; role: "ADMIN" | "USER"; email: string };

    try {
      user = await service.authenticateWithCode(providerResult.data, queryResult.data.code);
      await service.enforceSessionPolicyForLogin(user.id);
    } catch (error) {
      if (error instanceof HttpError && (error.details as { code?: unknown } | undefined)?.code === "PASSWORD_RESET_REQUIRED") {
        const redirectUrl = new URL(`${env.FRONTEND_BASE_URL}${statePayload.redirectPath}`);
        redirectUrl.searchParams.set("errorCode", "PASSWORD_RESET_REQUIRED");
        if (statePayload.appState) {
          redirectUrl.searchParams.set("state", statePayload.appState);
        }

        return reply.redirect(redirectUrl.toString());
      }

      throw error;
    }

    const sessionId = randomUUID();
    const tokens = issueTokens(
      app,
      {
        id: user.id,
        role: user.role,
        email: user.email
      },
      sessionId
    );

    await service.createLoginSession({
      sessionId,
      userId: user.id,
      refreshToken: tokens.refreshToken,
      metadata: parseClientMetadata(request)
    });

    if (statePayload.mode === "token") {
      const redirectUrl = new URL(`${env.FRONTEND_BASE_URL}${statePayload.redirectPath}`);
      redirectUrl.searchParams.set("accessToken", tokens.accessToken);
      redirectUrl.searchParams.set("refreshToken", tokens.refreshToken);
      redirectUrl.searchParams.set("provider", providerResult.data);
      if (statePayload.appState) {
        redirectUrl.searchParams.set("state", statePayload.appState);
      }

      return reply.redirect(redirectUrl.toString());
    }

    setSessionCookies(reply, tokens);

    return reply.redirect(`${env.FRONTEND_BASE_URL}${statePayload.redirectPath}`);
  });

  app.post("/auth/oauth/:provider", async (request, reply) => {
    const providerResult = providerSchema.safeParse((request.params as { provider: string }).provider);

    if (!providerResult.success) {
      return reply.status(400).send({ error: "Invalid provider" });
    }

    const bodyResult = exchangeBodySchema.safeParse(request.body);
    if (!bodyResult.success) {
      return reply.status(400).send({ error: "Invalid body", details: bodyResult.error.flatten() });
    }

    const user = bodyResult.data.accessToken
      ? await service.authenticateWithAccessToken(providerResult.data, bodyResult.data.accessToken)
      : await service.authenticateWithCode(providerResult.data, bodyResult.data.code as string);

    await service.enforceSessionPolicyForLogin(user.id);

    const sessionId = randomUUID();
    const tokens = issueTokens(
      app,
      {
        id: user.id,
        role: user.role,
        email: user.email
      },
      sessionId
    );

    await service.createLoginSession({
      sessionId,
      userId: user.id,
      refreshToken: tokens.refreshToken,
      metadata: parseClientMetadata(request)
    });

    return reply.send({
      user,
      ...tokens
    });
  });

  app.post("/auth/refresh", async (request, reply) => {
    const refreshToken =
      (request.body as { refreshToken?: string } | undefined)?.refreshToken ?? request.cookies.lf_refresh_token;

    if (!refreshToken) {
      return reply.status(400).send({ error: "Refresh token is required" });
    }

    let payload: { sub: string; role: "ADMIN" | "USER"; email: string; sid: string };
    try {
      payload = app.jwt.verify(refreshToken) as { sub: string; role: "ADMIN" | "USER"; email: string; sid: string };
    } catch {
      return reply.status(401).send({ error: "Invalid refresh token" });
    }

    if (!payload.sid) {
      return reply.status(401).send({ error: "Invalid refresh token" });
    }

    const validSession = await service.validateRefreshSession(payload.sub, payload.sid, refreshToken);
    if (!validSession) {
      return reply.status(401).send({ error: "Invalid refresh session" });
    }

    await service.touchSession(payload.sid);

    const accessToken = app.jwt.sign({
      sub: payload.sub,
      role: payload.role,
      email: payload.email,
      sid: payload.sid
    });

    return reply.send({ accessToken });
  });

  app.post("/auth/logout", async (request, reply) => {
    const bearerToken = extractBearerToken(request.headers.authorization);
    const accessToken = bearerToken ?? request.cookies.lf_access_token;
    const refreshToken =
      (request.body as { refreshToken?: string } | undefined)?.refreshToken ?? request.cookies.lf_refresh_token;

    let payload: { sub: string; sid: string } | null = null;

    if (accessToken) {
      try {
        payload = app.jwt.verify(accessToken) as { sub: string; sid: string };
      } catch {
        payload = null;
      }
    }

    if (!payload && refreshToken) {
      try {
        payload = app.jwt.verify(refreshToken) as { sub: string; sid: string };
      } catch {
        payload = null;
      }
    }

    if (payload?.sid) {
      await service.revokeSessionByToken(payload.sub, payload.sid, "logout");
    }

    reply
      .clearCookie("lf_access_token", { path: "/" })
      .clearCookie("lf_refresh_token", { path: "/" });

    return reply.send({ ok: true });
  });

  app.get("/auth/sessions", { preHandler: [requireAuth] }, async (request) => {
    const sessions = await service.listActiveSessions(request.user.sub, request.user.sid);
    return { items: sessions };
  });

  app.delete("/auth/sessions/:sessionId", { preHandler: [requireAuth] }, async (request, reply) => {
    const paramsResult = sessionRevokeParamSchema.safeParse(request.params);
    if (!paramsResult.success) {
      return reply.status(400).send({ error: "Invalid session id" });
    }

    await service.revokeSession(request.user.sub, paramsResult.data.sessionId);
    const currentSessionRevoked = request.user.sid === paramsResult.data.sessionId;

    if (currentSessionRevoked) {
      reply
        .clearCookie("lf_access_token", { path: "/" })
        .clearCookie("lf_refresh_token", { path: "/" });
    }

    return reply.send({
      ok: true,
      currentSessionRevoked
    });
  });

  app.get("/auth/me", { preHandler: [requireAuth] }, async (request) => {
    const user = await prisma.user.findUnique({ where: { id: request.user.sub } });
    return { user };
  });

  app.get("/auth/account", { preHandler: [requireAuth] }, async (request) => {
    const user = await prisma.user.findUnique({ where: { id: request.user.sub } });

    if (!user) {
      return { account: null };
    }

    const validityEndsAt =
      user.accountType === "SUBSCRIPTION"
        ? user.planValidUntil
        : new Date(Date.now() + 1000 * 60 * 60 * 24 * 30 * 3);

    return {
      account: {
        id: user.id,
        email: user.email,
        name: user.name,
        role: user.role,
        accountType: user.accountType,
        planName: user.planName,
        planValidUntil: user.planValidUntil,
        defaultMediaValidityEndsAt: validityEndsAt
      }
    };
  });

  app.delete("/auth/account", { preHandler: [requireAuth] }, async (request, reply) => {
    const bodyResult = deleteAccountSchema.safeParse(request.body);
    if (!bodyResult.success) {
      return reply.status(400).send({ error: "Invalid deletion confirmation" });
    }

    await service.permanentlyDeleteAccount(request.user.sub);

    reply
      .clearCookie("lf_access_token", { path: "/" })
      .clearCookie("lf_refresh_token", { path: "/" });

    return reply.send({ ok: true });
  });
}
