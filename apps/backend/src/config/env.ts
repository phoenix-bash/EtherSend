import { config as dotenvConfig } from "dotenv";
import { z } from "zod";

dotenvConfig();

const envSchema = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  PORT: z.coerce.number().default(4000),
  DATABASE_URL: z.string().min(1),
  REDIS_URL: z.string().min(1).default("redis://localhost:6379"),
  JWT_ACCESS_SECRET: z.string().min(16),
  JWT_REFRESH_SECRET: z.string().min(16),
  GOOGLE_CLIENT_ID: z.string().optional(),
  GOOGLE_CLIENT_SECRET: z.string().optional(),
  GITHUB_CLIENT_ID: z.string().optional(),
  GITHUB_CLIENT_SECRET: z.string().optional(),
  SMTP_HOST: z.string().default("smtp.gmail.com"),
  SMTP_PORT: z.coerce.number().int().positive().default(465),
  SMTP_SECURE: z.enum(["true", "false"]).default("true").transform((value) => value === "true"),
  SMTP_USER: z.string().optional(),
  SMTP_PASS: z.string().optional(),
  SMTP_FROM_EMAIL: z.string().email().default("noreply@example.com"),
  SMTP_REPLY_TO: z.string().email().optional(),
  SHARE_SMTP_HOST: z.string().optional(),
  SHARE_SMTP_PORT: z.coerce.number().int().positive().optional(),
  SHARE_SMTP_SECURE: z.enum(["true", "false"]).optional().transform((value) => value === undefined ? undefined : value === "true"),
  SHARE_SMTP_USER: z.string().optional(),
  SHARE_SMTP_PASS: z.string().optional(),
  SHARE_SMTP_FROM_EMAIL: z.string().email().optional(),
  SHARE_SMTP_REPLY_TO: z.string().email().optional(),
  OAUTH_CALLBACK_BASE_URL: z.string().url(),
  FRONTEND_BASE_URL: z.string().url(),
  CORS_ALLOWED_ORIGINS: z.string().default(""),
  GUEST_SESSION_SECRET: z.string().min(16),
  MAINTENANCE_API_KEY: z.preprocess((value) => {
    if (typeof value !== "string") {
      return value;
    }

    const trimmed = value.trim();
    return trimmed.length === 0 ? undefined : trimmed;
  }, z.string().optional()),
  CLEANUP_INTERVAL_SECONDS: z.coerce.number().int().min(30).default(120),
  CLEANUP_BATCH_SIZE: z.coerce.number().int().min(1).default(100),
  ENABLE_DOCUMENT_CONVERSION_WORKER: z.enum(["true", "false"]).default("true").transform((value) => value === "true"),
  MAX_UPLOAD_BYTES: z.coerce.number().positive().default(104857600),
  SIGNED_IN_MAX_TOTAL_BYTES: z.coerce.number().int().positive().default(262144000),
  SUPERUSER_EMAIL: z.string().email().default("superuser@example.com"),
  SUPERUSER_PASSWORD_HASH: z.string().min(20).default("$2b$10$J5kYI2N8S6Qf8k7wV6A2Re6POcKf2nQWf.Jv4QfH4rLx4n8m2M4Li"),
  ADMIN_ACCESS_SECRET: z.string().min(32).default("change_me_admin_access_secret_1234567890"),
  ENABLE_V2_UPLOAD: z.enum(["true", "false"]).default("false").transform((value) => value === "true"),
  V2_API_PREFIX: z.string().default("/api/v2"),
  V2_S3_BUCKET: z.string().min(1).default("linkforge-dev-v2"),
  V2_S3_REGION: z.string().min(1).default("ap-south-1"),
  V2_S3_ENDPOINT: z.preprocess((value) => {
    if (typeof value !== "string") {
      return value;
    }

    const trimmed = value.trim();
    return trimmed.length === 0 ? undefined : trimmed;
  }, z.string().url().optional()),
  V2_S3_PUBLIC_ENDPOINT: z.preprocess((value) => {
    if (typeof value !== "string") {
      return value;
    }

    const trimmed = value.trim();
    return trimmed.length === 0 ? undefined : trimmed;
  }, z.string().url().optional()),
  V2_S3_FORCE_PATH_STYLE: z.enum(["true", "false"]).default("false").transform((value) => value === "true"),
  V2_S3_ACCESS_KEY_ID: z.string().optional(),
  V2_S3_SECRET_ACCESS_KEY: z.string().optional(),
  V2_SIGNED_URL_TTL_SECONDS: z.coerce.number().int().positive().default(3600),
  V2_CHUNK_SIZE_BYTES: z
    .coerce.number()
    .int()
    .positive()
    .default(5242880)
    .refine((value) => value === 5242880, "V2_CHUNK_SIZE_BYTES must be exactly 5242880 (5MB)."),
  V2_MAX_FILE_SIZE_GUEST_BYTES: z.coerce.number().int().positive().default(104857600),
  V2_MAX_FILE_SIZE_SIGNED_BYTES: z.coerce.number().int().positive().default(536870912),
  V2_ALLOWED_MIME_TYPES: z.string().default("*/*")
}).superRefine((value, ctx) => {
  if (value.NODE_ENV === "production" && !value.MAINTENANCE_API_KEY) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: "MAINTENANCE_API_KEY is required in production.",
      path: ["MAINTENANCE_API_KEY"]
    });
  }
});

export type AppEnv = z.infer<typeof envSchema>;

export const env: AppEnv = envSchema.parse(process.env);
