import { apiRequest, API_BASE_URL } from "../../../lib/api-client";

const RAW_PREFIX = "/api/v2";

function normalizePath(path: string): string {
  const normalizedPath = path.startsWith("/") ? path : `/${path}`;

  if (API_BASE_URL.endsWith("/api") && RAW_PREFIX.startsWith("/api/")) {
    return `${RAW_PREFIX.replace(/^\/api/, "")}${normalizedPath}`;
  }

  return `${RAW_PREFIX}${normalizedPath}`;
}

export function v2ApiRequest<T>(path: string, init?: RequestInit): Promise<T> {
  return apiRequest<T>(normalizePath(path), init);
}
