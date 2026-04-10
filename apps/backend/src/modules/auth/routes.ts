import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { requireAuth } from "../../middlewares/auth.js";
import { prisma } from "../../config/prisma.js";
import { env } from "../../config/env.js";
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

function issueTokens(app: FastifyInstance, user: { id: string; role: "ADMIN" | "USER"; email: string }) {
  const accessToken = app.jwt.sign({
    sub: user.id,
    role: user.role,
    email: user.email
  });

  const refreshToken = app.jwt.sign(
    {
      sub: user.id,
      role: user.role,
      email: user.email
    },
    { expiresIn: "7d" }
  );

  return { accessToken, refreshToken };
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

export async function registerAuthRoutes(app: FastifyInstance): Promise<void> {
  const service = new AuthService(new AuthRepository());

  app.get("/auth/providers", async () => ({
    enabled: ["google", "github"],
    localPasswordAuth: false
  }));

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

    const user = await service.authenticateWithCode(providerResult.data, queryResult.data.code);
    const tokens = issueTokens(app, {
      id: user.id,
      role: user.role,
      email: user.email
    });

    const statePayload = decodeState(queryResult.data.state);

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

    const tokens = issueTokens(app, {
      id: user.id,
      role: user.role,
      email: user.email
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

    let payload: { sub: string; role: "ADMIN" | "USER"; email: string };
    try {
      payload = app.jwt.verify(refreshToken) as { sub: string; role: "ADMIN" | "USER"; email: string };
    } catch {
      return reply.status(401).send({ error: "Invalid refresh token" });
    }

    const accessToken = app.jwt.sign({
      sub: payload.sub,
      role: payload.role,
      email: payload.email
    });

    return reply.send({ accessToken });
  });

  app.post("/auth/logout", async (_request, reply) => {
    reply
      .clearCookie("lf_access_token", { path: "/" })
      .clearCookie("lf_refresh_token", { path: "/" });

    return reply.send({ ok: true });
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
        : new Date(Date.now() + 1000 * 60 * 60 * 24 * 30 * 6);

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
}
