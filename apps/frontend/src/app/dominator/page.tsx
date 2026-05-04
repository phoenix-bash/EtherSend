import { cookies, headers } from "next/headers";
import { notFound } from "next/navigation";
import DominatorClient from "./dominator-client";

function resolveBackendBaseUrl(requestHeaders: Headers): string {
  const configured = process.env.NEXT_PUBLIC_API_BASE_URL?.trim();
  if (configured && /^https?:\/\//i.test(configured)) {
    return configured.replace(/\/+$/, "");
  }

  const forwardedHost = requestHeaders.get("x-forwarded-host")?.split(",")[0]?.trim();
  const host = forwardedHost || requestHeaders.get("host") || "";
  const forwardedProto = requestHeaders.get("x-forwarded-proto")?.split(",")[0]?.trim();
  const protocol = forwardedProto || "https";
  if (host) {
    const basePath = configured && configured.startsWith("/") ? configured : "/api";
    return `${protocol}://${host}${basePath}`.replace(/\/+$/, "");
  }

  return "http://localhost:4000";
}

async function requestBackend(path: string, cookieHeader: string, requestHeaders: Headers, init?: RequestInit): Promise<Response> {
  const backendBase = resolveBackendBaseUrl(requestHeaders);
  const forwardedHost = requestHeaders.get("x-forwarded-host")?.split(",")[0]?.trim();
  const host = forwardedHost || requestHeaders.get("host") || "";
  const forwardedProto = requestHeaders.get("x-forwarded-proto")?.split(",")[0]?.trim();
  const protocol = forwardedProto || "https";
  const requestOrigin = host ? `${protocol}://${host}` : requestHeaders.get("origin") || undefined;
  const requestReferer = requestHeaders.get("referer") || (requestOrigin ? `${requestOrigin}/` : undefined);

  return fetch(`${backendBase}${path}`, {
    ...init,
    cache: "no-store",
    headers: {
      "content-type": "application/json",
      cookie: cookieHeader,
      ...(requestOrigin ? { origin: requestOrigin } : {}),
      ...(requestReferer ? { referer: requestReferer } : {}),
      ...(init?.headers ?? {})
    }
  });
}

async function requestBackendSafe(path: string, cookieHeader: string, requestHeaders: Headers, init?: RequestInit): Promise<Response | null> {
  try {
    return await requestBackend(path, cookieHeader, requestHeaders, init);
  } catch {
    return null;
  }
}

interface DominatorPageProps {
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
}

export default async function DominatorPage({ searchParams }: DominatorPageProps) {
  const resolvedParams = searchParams ? await searchParams : {};
  const tokenValue = resolvedParams.token;
  const token = Array.isArray(tokenValue) ? tokenValue[0] : tokenValue;

  const cookieStore = await cookies();
  const requestHeaders = await headers();
  const cookieHeader = cookieStore.toString();

  const activeSessionResponse = await requestBackendSafe("/dominator/session/me", cookieHeader, requestHeaders);
  if (activeSessionResponse?.ok) {
    return <DominatorClient initialChallengeToken={null} hasActiveSession />;
  }

  if (!token) {
    notFound();
  }

  const consumeResponse = await requestBackendSafe("/dominator/access/consume", cookieHeader, requestHeaders, {
    method: "POST",
    body: JSON.stringify({ token })
  });

  if (!consumeResponse?.ok) {
    notFound();
  }

  const payload = (await consumeResponse.json()) as { challengeToken?: string };
  if (!payload.challengeToken) {
    notFound();
  }

  return <DominatorClient initialChallengeToken={payload.challengeToken} hasActiveSession={false} />;
}
