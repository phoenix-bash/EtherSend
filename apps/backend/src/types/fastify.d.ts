import "@fastify/jwt";

declare module "@fastify/jwt" {
  interface FastifyJWT {
    payload: {
      sub: string;
      role: "ADMIN" | "USER";
      email: string;
      sid: string;
    };
    user: {
      sub: string;
      role: "ADMIN" | "USER";
      email: string;
      sid: string;
    };
  }
}
