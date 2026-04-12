import { env } from "../../config/env.js";
import type { EmailProvider } from "./email-provider.js";
import { NodemailerEmailProvider } from "./nodemailer.provider.js";

let cachedProvider: EmailProvider | null = null;

export function getEmailProvider(): EmailProvider | null {
  if (cachedProvider) {
    return cachedProvider;
  }

  if (!env.SMTP_USER || !env.SMTP_PASS) {
    return null;
  }

  cachedProvider = new NodemailerEmailProvider({
    host: env.SMTP_HOST,
    port: env.SMTP_PORT,
    secure: env.SMTP_SECURE,
    user: env.SMTP_USER,
    pass: env.SMTP_PASS,
    fromEmail: env.SMTP_FROM_EMAIL,
    replyTo: env.SMTP_REPLY_TO
  });

  return cachedProvider;
}
