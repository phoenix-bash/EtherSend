import { env } from "../../config/env.js";
import type { EmailProvider } from "./email-provider.js";
import { NodemailerEmailProvider } from "./nodemailer.provider.js";

let cachedProvider: EmailProvider | null = null;
let cachedShareProvider: EmailProvider | null = null;

function resolveProviderConfig(mode: "auth" | "share") {
  if (mode === "share") {
    const user = env.SHARE_SMTP_USER ?? env.SMTP_USER;
    const pass = env.SHARE_SMTP_PASS ?? env.SMTP_PASS;

    if (!user || !pass) {
      return null;
    }

    return {
      host: env.SHARE_SMTP_HOST ?? env.SMTP_HOST,
      port: env.SHARE_SMTP_PORT ?? env.SMTP_PORT,
      secure: env.SHARE_SMTP_SECURE ?? env.SMTP_SECURE,
      user,
      pass,
      fromEmail: env.SHARE_SMTP_FROM_EMAIL ?? env.SMTP_FROM_EMAIL,
      replyTo: env.SHARE_SMTP_REPLY_TO ?? env.SMTP_REPLY_TO
    };
  }

  if (!env.SMTP_USER || !env.SMTP_PASS) {
    return null;
  }

  return {
    host: env.SMTP_HOST,
    port: env.SMTP_PORT,
    secure: env.SMTP_SECURE,
    user: env.SMTP_USER,
    pass: env.SMTP_PASS,
    fromEmail: env.SMTP_FROM_EMAIL,
    replyTo: env.SMTP_REPLY_TO
  };
}

export function getEmailProvider(): EmailProvider | null {
  if (cachedProvider) {
    return cachedProvider;
  }

  const config = resolveProviderConfig("auth");
  if (!config) {
    return null;
  }

  cachedProvider = new NodemailerEmailProvider(config);

  return cachedProvider;
}

export function getShareEmailProvider(): EmailProvider | null {
  if (cachedShareProvider) {
    return cachedShareProvider;
  }

  const config = resolveProviderConfig("share");
  if (!config) {
    return null;
  }

  cachedShareProvider = new NodemailerEmailProvider(config);
  return cachedShareProvider;
}
