import { cookies } from "next/headers";
import { notFound } from "next/navigation";
import DominatorClient from "./dominator-client";

function resolveBackendBaseUrl(): string {
  const configured = process.env.NEXT_PUBLIC_API_BASE_URL?.trim();
  if (configured && /^https?:\/\//i.test(configured)) {
    return configured.replace(/\/+$/, "");
  }

  return "http://localhost:4000";
}

async function requestBackend(path: string, cookieHeader: string, init?: RequestInit): Promise<Response> {
  const backendBase = resolveBackendBaseUrl();
  return fetch(`${backendBase}${path}`, {
    ...init,
    cache: "no-store",
    headers: {
      "content-type": "application/json",
      cookie: cookieHeader,
      ...(init?.headers ?? {})
    }
  });
}

async function requestBackendSafe(path: string, cookieHeader: string, init?: RequestInit): Promise<Response | null> {
  try {
    return await requestBackend(path, cookieHeader, init);
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
  const cookieHeader = cookieStore.toString();

  const activeSessionResponse = await requestBackendSafe("/dominator/session/me", cookieHeader);
  if (activeSessionResponse?.ok) {
    return <DominatorClient initialChallengeToken={null} hasActiveSession />;
  }

  if (!token) {
    notFound();
  }

  const consumeResponse = await requestBackendSafe("/dominator/access/consume", cookieHeader, {
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
