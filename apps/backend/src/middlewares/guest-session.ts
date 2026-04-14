import type { FastifyReply, FastifyRequest } from "fastify";
import { GuestService } from "../modules/guest/service.js";

const guestService = new GuestService();

export async function ensureGuestSession(request: FastifyRequest, reply: FastifyReply): Promise<void> {
  const existingToken = request.cookies[guestService.getCookieName()];
  const guest = await guestService.getOrCreateGuestSession(existingToken);

  request.headers["x-guest-session-id"] = guest.sessionId;

  reply.setCookie(guestService.getCookieName(), guest.token, {
    httpOnly: true,
    sameSite: "lax",
    path: "/",
    maxAge: guestService.getCookieMaxAgeSeconds()
  });
}
