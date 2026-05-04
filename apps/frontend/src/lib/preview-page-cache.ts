const PREVIEW_PAGE_CACHE_STORAGE_KEY = "ethersend:preview-pages-cache:v1";

type PreviewPageCacheEntry =
  | {
      status: "ready";
      pages: string[];
      storedAt: number;
    }
  | {
      status: "cooldown";
      pages: [];
      retryAfter: number;
      storedAt: number;
    };

type PreviewPageCacheMap = Record<string, PreviewPageCacheEntry>;

const pendingRequests = new Map<string, Promise<string[]>>();
let memoryCache: PreviewPageCacheMap | null = null;

function canUseStorage(): boolean {
  return typeof window !== "undefined";
}

function readStorage(): PreviewPageCacheMap {
  if (!canUseStorage()) {
    return {};
  }

  try {
    const raw = window.localStorage.getItem(PREVIEW_PAGE_CACHE_STORAGE_KEY);
    if (!raw) {
      return {};
    }

    const parsed = JSON.parse(raw) as PreviewPageCacheMap;
    return parsed && typeof parsed === "object" ? parsed : {};
  } catch {
    return {};
  }
}

function ensureCache(): PreviewPageCacheMap {
  if (memoryCache) {
    return memoryCache;
  }

  memoryCache = readStorage();
  return memoryCache;
}

function persistCache(cache: PreviewPageCacheMap): void {
  if (!canUseStorage()) {
    return;
  }

  window.localStorage.setItem(PREVIEW_PAGE_CACHE_STORAGE_KEY, JSON.stringify(cache));
}

function removeCacheKey(cacheKey: string): void {
  const cache = ensureCache();
  if (!cache[cacheKey]) {
    return;
  }

  delete cache[cacheKey];
  persistCache(cache);
}

function getCacheEntry(cacheKey: string): PreviewPageCacheEntry | null {
  const cache = ensureCache();
  const entry = cache[cacheKey];
  if (!entry) {
    return null;
  }

  if (entry.status === "cooldown" && entry.retryAfter <= Date.now()) {
    delete cache[cacheKey];
    persistCache(cache);
    return null;
  }

  return entry;
}

export function createPreviewPagesCacheKey(scope: string, fileId: string): string {
  return `${scope}:${fileId}`;
}

export function loadPreviewPagesWithCache(input: {
  cacheKey: string;
  fetcher: () => Promise<string[]>;
  failureCooldownMs?: number;
}): Promise<string[]> {
  const { cacheKey, fetcher, failureCooldownMs = 12000 } = input;

  const existing = getCacheEntry(cacheKey);
  if (existing?.status === "ready") {
    return Promise.resolve(existing.pages);
  }

  if (existing?.status === "cooldown") {
    return Promise.reject(new Error("Preview is still processing. Please wait a bit and try again."));
  }

  const pending = pendingRequests.get(cacheKey);
  if (pending) {
    return pending;
  }

  const request = (async () => {
    try {
      const pages = await fetcher();
      if (!Array.isArray(pages) || pages.length === 0) {
        throw new Error("Preview pages are not ready yet.");
      }

      const cache = ensureCache();
      cache[cacheKey] = {
        status: "ready",
        pages,
        storedAt: Date.now()
      };
      persistCache(cache);
      return pages;
    } catch (error) {
      const cache = ensureCache();
      cache[cacheKey] = {
        status: "cooldown",
        pages: [],
        retryAfter: Date.now() + failureCooldownMs,
        storedAt: Date.now()
      };
      persistCache(cache);
      throw error;
    } finally {
      pendingRequests.delete(cacheKey);
    }
  })();

  pendingRequests.set(cacheKey, request);
  return request;
}

export function clearPreviewPagesCacheForFile(fileId: string): void {
  const suffix = `:${fileId}`;
  const cache = ensureCache();
  let changed = false;

  for (const key of Object.keys(cache)) {
    if (key.endsWith(suffix)) {
      delete cache[key];
      changed = true;
    }
  }

  if (changed) {
    persistCache(cache);
  }
}

export function clearPreviewPagesCacheByScope(scope: string): void {
  const prefix = `${scope}:`;
  const cache = ensureCache();
  let changed = false;

  for (const key of Object.keys(cache)) {
    if (key.startsWith(prefix)) {
      delete cache[key];
      changed = true;
    }
  }

  if (changed) {
    persistCache(cache);
  }
}

export function clearPreviewPagesCacheByKey(cacheKey: string): void {
  removeCacheKey(cacheKey);
}

export function clearAllPreviewPagesCache(): void {
  pendingRequests.clear();
  memoryCache = {};

  if (!canUseStorage()) {
    return;
  }

  window.localStorage.removeItem(PREVIEW_PAGE_CACHE_STORAGE_KEY);
}
