import type { FastifyReply, FastifyRequest } from "fastify";
import { env } from "../config/env.js";
import { GuestService } from "../modules/guest/service.js";

const guestService = new GuestService();

export async function ensureGuestSession(request: FastifyRequest, reply: FastifyReply): Promise<void> {
  const existingToken = request.cookies[guestService.getCookieName()];
  const guest = await guestService.getOrCreateGuestSession(existingToken);
  const isProduction = env.NODE_ENV === "production";

  request.headers["x-guest-session-id"] = guest.sessionId;

  reply.setCookie(guestService.getCookieName(), guest.token, {
    httpOnly: true,
    sameSite: isProduction ? "none" : "lax",
    secure: isProduction,
    path: "/",
    maxAge: guestService.getCookieMaxAgeSeconds()
  });
}
