export const API_BASE_URL = process.env.NEXT_PUBLIC_API_BASE_URL ?? "http://localhost:4000";

const ACCESS_TOKEN_KEY = "lf_access_token";

export interface AuthUser {
  id: string;
  email: string;
  name?: string | null;
  role: "ADMIN" | "USER";
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

function buildHeaders(init?: RequestInit): HeadersInit {
  const headers: Record<string, string> = {};

  const token = getAccessToken();
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
    throw new Error(`API request failed with status ${response.status}`);
  }

  if (response.status === 204) {
    return undefined as T;
  }

  return response.json() as Promise<T>;
}

export async function fetchCurrentUser(): Promise<AuthUser | null> {
  try {
    const result = await apiRequest<{ user: AuthUser | null }>("/auth/me");
    return result.user;
  } catch {
    return null;
  }
}

export async function fetchAccountInfo(): Promise<AccountInfo | null> {
  try {
    const result = await apiRequest<{ account: AccountInfo | null }>("/auth/account");
    return result.account;
  } catch {
    return null;
  }
}

async function uploadFile(path: string, file: File): Promise<{ media: MediaItem }> {
  const formData = new FormData();
  formData.append("file", file);

  const token = getAccessToken();
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
    throw new Error(`Upload failed with status ${response.status}`);
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

export function mediaViewUrl(mediaId: string): string {
  return `${API_BASE_URL}/m/${mediaId}`;
}

export function mediaDownloadUrl(mediaId: string): string {
  return `${API_BASE_URL}/m/${mediaId}?disposition=download`;
}

export function absoluteApiUrl(path: string): string {
  return `${API_BASE_URL}${path}`;
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
