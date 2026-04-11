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
  OAUTH_CALLBACK_BASE_URL: z.string().url(),
  FRONTEND_BASE_URL: z.string().url(),
  GUEST_SESSION_SECRET: z.string().min(16),
  MAINTENANCE_API_KEY: z.string().optional(),
  CLEANUP_INTERVAL_SECONDS: z.coerce.number().int().min(30).default(120),
  CLEANUP_BATCH_SIZE: z.coerce.number().int().min(1).default(100),
  LOCAL_STORAGE_ROOT: z.string().default("./storage"),
  MAX_UPLOAD_BYTES: z.coerce.number().positive().default(104857600),
  SIGNED_IN_MAX_TOTAL_BYTES: z.coerce.number().int().positive().default(1073741824)
});

export type AppEnv = z.infer<typeof envSchema>;

export const env: AppEnv = envSchema.parse(process.env);
