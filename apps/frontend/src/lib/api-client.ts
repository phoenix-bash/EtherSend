function trimTrailingSlashes(value: string): string {
  return value.replace(/\/+$/, "");
}

function resolveApiBaseUrl(): string {
  const envBaseUrl = process.env.NEXT_PUBLIC_API_BASE_URL?.trim();
  if (typeof window !== "undefined") {
    const isLocalHost =
      window.location.hostname === "localhost" ||
      window.location.hostname === "127.0.0.1" ||
      window.location.hostname === "::1" ||
      window.location.hostname === "[::1]";
    const isNextDevServer = window.location.port === "3000";
    const isStandardPort = !window.location.port || window.location.port === "80" || window.location.port === "443";

    if (envBaseUrl) {
      try {
        const parsed = new URL(envBaseUrl);
        if (
          parsed.hostname === "localhost" ||
          parsed.hostname === "127.0.0.1" ||
          parsed.hostname === "::1" ||
          parsed.hostname === "[::1]"
        ) {
          parsed.hostname = window.location.hostname;
          return trimTrailingSlashes(parsed.toString());
        }
      } catch {
        const normalizedRelativePath = envBaseUrl.startsWith("/") ? envBaseUrl : `/${envBaseUrl}`;

        // In local Next dev (port 3000), relative /api points to Next itself, not backend.
        if (isNextDevServer && (normalizedRelativePath === "/api" || normalizedRelativePath.startsWith("/api/"))) {
          return `${window.location.protocol}//${window.location.hostname}:4000`;
        }

        return trimTrailingSlashes(`${window.location.origin}${normalizedRelativePath}`);
      }

      return trimTrailingSlashes(envBaseUrl);
    }

    // When served through a reverse proxy (including local HTTPS), stay on same-origin /api.
    if (isStandardPort) {
      return `${window.location.origin}/api`;
    }

    if (isLocalHost) {
      return `${window.location.protocol}//${window.location.hostname}:4000`;
    }

    return `${window.location.protocol}//${window.location.hostname}:4000`;
  }

  if (envBaseUrl) {
    if (!/^https?:\/\//i.test(envBaseUrl) && envBaseUrl.startsWith("/") && process.env.NODE_ENV !== "production") {
      return "http://localhost:4000";
    }

    return trimTrailingSlashes(envBaseUrl);
  }

  return "http://localhost:4000";
}

export const API_BASE_URL = resolveApiBaseUrl();

const ACCESS_TOKEN_KEY = "lf_access_token";

export class ApiError extends Error {
  status: number;
  details?: unknown;

  constructor(status: number, message: string, details?: unknown) {
    super(message);
    this.status = status;
    this.details = details;
    this.name = "ApiError";
  }
}

export interface AuthUser {
  id: string;
  email: string;
  name?: string | null;
  role: "ADMIN" | "USER";
}

export interface EmailAuthResult {
  user: AuthUser;
  accessToken: string;
  refreshToken: string;
}

export interface EmailSignupResult {
  ok: boolean;
  requiresVerification: boolean;
}

export interface AccountInfo {
  id: string;
  email: string;
  name?: string | null;
  role: "ADMIN" | "USER";
  accountType: "FREE_6M" | "SUBSCRIPTION";
  planName?: string | null;
  planValidUntil?: string | null;
  defaultMediaValidityEndsAt: string;
}

export interface ActiveSessionItem {
  id: string;
  ipAddress?: string | null;
  userAgent?: string | null;
  browser?: string | null;
  os?: string | null;
  deviceType?: string | null;
  deviceModel?: string | null;
  createdAt: string;
  lastActivityAt: string;
  expiresAt: string;
  current: boolean;
}

export interface MediaItem {
  id: string;
  filename: string;
  mimeType: string;
  extension?: string | null;
  sizeBytes: string;
  isActive: boolean;
  allowDownload: boolean;
  expiresAt?: string | null;
  updatedAt: string;
}

export interface ImageLinkResult {
  link: {
    id: string;
    extension: string;
    expiresAt: string;
  };
  directUrl: string;
}

export interface QrResult {
  token: string;
  expiresAt: string;
  redirectUrl: string;
  qrDataUrl: string;
}

export interface CreatedBatch {
  id: string;
  name?: string | null;
  ownerType: "USER" | "GUEST";
  mediaIds: string[];
  createdAt: string;
}

export interface BatchShareResult {
  token: string;
  allowDownload: boolean;
  expiresAt: string;
  publicPath: string;
  publicUrl?: string;
}

export interface BatchListItem {
  id: string;
  name?: string | null;
  createdAt: string;
  fileCount: number;
  share: {
    token: string;
    allowDownload: boolean;
    expiresAt: string;
    publicPath: string;
    publicUrl?: string;
  } | null;
}

export interface PublicShareFile {
  id: string;
  filename: string;
  mimeType: string;
  sizeBytes: string;
  viewPath: string;
  downloadPath: string;
}

export interface PublicBatchShare {
  token: string;
  allowDownload: boolean;
  expiresAt: string;
  batch: {
    id: string;
    name?: string | null;
    files: PublicShareFile[];
  };
}

export interface ActivityFeedItem {
  id: string;
  kind: "asset_uploaded" | "batch_shared" | "batch_viewed";
  message: string;
  level: "info" | "success" | "warning";
  createdAt: string;
}

export function setAccessToken(token: string): void {
  if (typeof window === "undefined") {
    return;
  }

  window.localStorage.setItem(ACCESS_TOKEN_KEY, token);
}

export function getAccessToken(): string | null {
  if (typeof window === "undefined") {
    return null;
  }

  return window.localStorage.getItem(ACCESS_TOKEN_KEY);
}

export function clearAccessToken(): void {
  if (typeof window === "undefined") {
    return;
  }

  window.localStorage.removeItem(ACCESS_TOKEN_KEY);
}

function parseJwtPayload(token: string): { exp?: number } | null {
  const parts = token.split(".");
  if (parts.length < 2) {
    return null;
  }

  try {
    const payloadBase64 = parts[1].replace(/-/g, "+").replace(/_/g, "/");
    const padded = payloadBase64 + "=".repeat((4 - (payloadBase64.length % 4)) % 4);
    const payloadJson = atob(padded);
    const payload = JSON.parse(payloadJson) as { exp?: unknown };

    if (payload.exp !== undefined && typeof payload.exp !== "number") {
      return null;
    }

    return payload as { exp?: number };
  } catch {
    return null;
  }
}

function getUsableAccessToken(): string | null {
  const token = getAccessToken();
  if (!token) {
    return null;
  }

  const payload = parseJwtPayload(token);
  if (!payload) {
    clearAccessToken();
    return null;
  }

  // Drop token slightly before expiry to avoid request races that return 401.
  if (typeof payload.exp === "number" && payload.exp * 1000 <= Date.now() + 5000) {
    clearAccessToken();
    return null;
  }

  return token;
}

function buildHeaders(init?: RequestInit): HeadersInit {
  const headers: Record<string, string> = {};

  const token = getUsableAccessToken();
  if (token) {
    headers.Authorization = `Bearer ${token}`;
  }

  return {
    ...headers,
    ...(init?.headers ?? {})
  };
}

export async function apiRequest<T>(path: string, init?: RequestInit): Promise<T> {
  const headers = buildHeaders(init) as Record<string, string>;
  if (init?.body && !headers["Content-Type"]) {
    headers["Content-Type"] = "application/json";
  }

  const response = await fetch(`${API_BASE_URL}${path}`, {
    ...init,
    credentials: "include",
    headers
  });

  if (!response.ok) {
    const payload = (await response.json().catch(() => null)) as { error?: string; details?: unknown } | null;
    throw new ApiError(
      response.status,
      payload?.error ?? `API request failed with status ${response.status}`,
      payload?.details
    );
  }

  if (response.status === 204) {
    return undefined as T;
  }

  return response.json() as Promise<T>;
}

export async function fetchCurrentUser(): Promise<AuthUser | null> {
  if (!getUsableAccessToken()) {
    return null;
  }

  try {
    const result = await apiRequest<{ user: AuthUser | null }>("/auth/me");
    return result.user;
  } catch (error) {
    if (error instanceof ApiError && error.status === 401) {
      clearAccessToken();
    }

    return null;
  }
}

export function signupWithEmail(input: { email: string; password: string; name?: string }): Promise<EmailSignupResult> {
  return apiRequest<EmailSignupResult>("/auth/signup", {
    method: "POST",
    body: JSON.stringify(input)
  });
}

export async function signinWithEmail(input: { email: string; password: string }): Promise<EmailAuthResult> {
  const result = await apiRequest<EmailAuthResult>("/auth/signin", {
    method: "POST",
    body: JSON.stringify(input)
  });

  setAccessToken(result.accessToken);
  return result;
}

export function verifyEmailToken(token: string): Promise<{ ok: boolean }> {
  return apiRequest<{ ok: boolean }>("/auth/verify-email", {
    method: "POST",
    body: JSON.stringify({ token })
  });
}

export function requestPasswordReset(email: string): Promise<{ ok: boolean }> {
  return apiRequest<{ ok: boolean }>("/auth/forgot-password", {
    method: "POST",
    body: JSON.stringify({ email })
  });
}

export function resetPasswordWithToken(input: { token: string; password: string }): Promise<{ ok: boolean }> {
  return apiRequest<{ ok: boolean }>("/auth/reset-password", {
    method: "POST",
    body: JSON.stringify(input)
  });
}

export async function fetchAccountInfo(): Promise<AccountInfo | null> {
  if (!getUsableAccessToken()) {
    return null;
  }

  try {
    const result = await apiRequest<{ account: AccountInfo | null }>("/auth/account");
    return result.account;
  } catch (error) {
    if (error instanceof ApiError && error.status === 401) {
      clearAccessToken();
    }

    return null;
  }
}

export function listActiveSessions(): Promise<{ items: ActiveSessionItem[] }> {
  return apiRequest<{ items: ActiveSessionItem[] }>("/auth/sessions");
}

export function revokeActiveSession(sessionId: string): Promise<{ ok: boolean; currentSessionRevoked: boolean }> {
  return apiRequest<{ ok: boolean; currentSessionRevoked: boolean }>(`/auth/sessions/${sessionId}`, {
    method: "DELETE"
  });
}

export function deleteAccountPermanently(confirmation: string): Promise<{ ok: boolean }> {
  return apiRequest<{ ok: boolean }>("/auth/account", {
    method: "DELETE",
    body: JSON.stringify({ confirmation })
  });
}

async function uploadFile(path: string, file: File): Promise<{ media: MediaItem }> {
  const formData = new FormData();
  formData.append("file", file);

  const token = getUsableAccessToken();
  const headers: Record<string, string> = {};
  if (token) {
    headers.Authorization = `Bearer ${token}`;
  }

  const response = await fetch(`${API_BASE_URL}${path}`, {
    method: "POST",
    credentials: "include",
    headers,
    body: formData
  });

  if (!response.ok) {
    const payload = (await response.json().catch(() => null)) as { error?: string } | null;
    throw new ApiError(response.status, payload?.error ?? `Upload failed with status ${response.status}`);
  }

  return response.json() as Promise<{ media: MediaItem }>;
}

export function uploadMedia(file: File): Promise<{ media: MediaItem }> {
  return uploadFile("/media/upload", file);
}

export function replaceMedia(mediaId: string, file: File): Promise<{ media: MediaItem }> {
  return uploadFile(`/media/${mediaId}/replace`, file);
}

export function listMedia(): Promise<{ items: MediaItem[] }> {
  return apiRequest<{ items: MediaItem[] }>("/media");
}

export function toggleMedia(mediaId: string, payload: { isActive?: boolean; allowDownload?: boolean }) {
  return apiRequest<{ media: MediaItem }>(`/media/${mediaId}/toggles`, {
    method: "PATCH",
    body: JSON.stringify(payload)
  });
}

export async function deleteMedia(mediaId: string): Promise<void> {
  await apiRequest<unknown>(`/media/${mediaId}`, {
    method: "DELETE"
  });
}

export function createImageLink(mediaId: string): Promise<ImageLinkResult> {
  return apiRequest<ImageLinkResult>(`/images/${mediaId}/link`, { method: "POST" });
}

export function createQr(mediaId: string): Promise<QrResult> {
  return apiRequest<QrResult>(`/qr/${mediaId}`, { method: "POST" });
}

export function createBatch(mediaIds: string[], name?: string): Promise<{ batch: CreatedBatch }> {
  return apiRequest<{ batch: CreatedBatch }>("/batches", {
    method: "POST",
    body: JSON.stringify({ mediaIds, name })
  });
}

export function listBatches(): Promise<{ items: BatchListItem[] }> {
  return apiRequest<{ items: BatchListItem[] }>("/batches");
}

export function listActivity(limit = 20): Promise<{ items: ActivityFeedItem[] }> {
  const resolvedLimit = Math.max(1, Math.min(100, Math.floor(limit)));
  return apiRequest<{ items: ActivityFeedItem[] }>(`/activity?limit=${resolvedLimit}`);
}

export function createOrRefreshBatchShare(batchId: string, allowDownload?: boolean): Promise<{ share: BatchShareResult }> {
  return apiRequest<{ share: BatchShareResult }>(`/batches/${batchId}/share`, {
    method: "POST",
    body: JSON.stringify({ allowDownload })
  });
}

export function updateBatchShare(batchId: string, allowDownload: boolean): Promise<{ share: BatchShareResult }> {
  return apiRequest<{ share: BatchShareResult }>(`/batches/${batchId}/share`, {
    method: "PATCH",
    body: JSON.stringify({ allowDownload })
  });
}

export function fetchPublicBatchShare(token: string): Promise<PublicBatchShare> {
  return apiRequest<PublicBatchShare>(`/shares/${token}`);
}

export function shareFilePath(token: string, mediaId: string, disposition: "view" | "download" = "view"): string {
  const query = disposition === "download" ? "?disposition=download" : "";
  return `/shares/${token}/files/${mediaId}${query}`;
}

export function mediaViewUrl(mediaId: string): string {
  return `${API_BASE_URL}/m/${mediaId}`;
}

export function mediaDownloadUrl(mediaId: string): string {
  return `${API_BASE_URL}/m/${mediaId}?disposition=download`;
}

export function absoluteApiUrl(path: string): string {
  if (/^https?:\/\//i.test(path)) {
    return path;
  }

  const resolvedApiBaseUrl = (() => {
    if (/^https?:\/\//i.test(API_BASE_URL)) {
      return API_BASE_URL;
    }

    const normalizedBase = API_BASE_URL.startsWith("/") ? API_BASE_URL : `/${API_BASE_URL}`;
    if (typeof window !== "undefined") {
      return `${window.location.origin}${normalizedBase}`;
    }

    return `http://localhost:4000${normalizedBase}`;
  })();

  const normalizedPath = path.startsWith("/") ? path : `/${path}`;
  return `${trimTrailingSlashes(resolvedApiBaseUrl)}${normalizedPath}`;
}

export async function logoutSession(): Promise<void> {
  try {
    await apiRequest<{ ok: boolean }>("/auth/logout", { method: "POST" });
  } catch {
    // Local sign-out should proceed even if API logout fails.
  } finally {
    clearAccessToken();
  }
}
