"use client";

import { useEffect, useState } from "react";
import { useAuthSession } from "../../hooks/use-auth-session";
import { listActivity, type ActivityFeedItem } from "../../lib/api-client";
import { SIGNED_OUT_EVENT, SYSTEM_LOG_EVENT, type SystemLogLevel, type SystemLogPayload } from "../../lib/events";

const NOTIFICATIONS_CLEAR_BEFORE_KEY = "ethersend:notifications-clear-before-ms";
const LAST_SEEN_ACTIVITY_KEY = "ethersend:last-seen-activity-at";

interface FeedEntry {
  id: string;
  message: string;
  level: SystemLogLevel;
  createdAt: number;
  source: "server" | "local";
}

function toRelativeTime(timestamp: number): string {
  const elapsedMs = Date.now() - timestamp;
  const elapsedMinutes = Math.max(1, Math.floor(elapsedMs / 60000));

  if (elapsedMinutes < 60) {
    return `${elapsedMinutes} min${elapsedMinutes === 1 ? "" : "s"} ago`;
  }

  const elapsedHours = Math.floor(elapsedMinutes / 60);
  return `${elapsedHours} hour${elapsedHours === 1 ? "" : "s"} ago`;
}

export function SystemFeed() {
  const { user } = useAuthSession();
  const [, setTick] = useState(0);
  const [logs, setLogs] = useState<FeedEntry[]>([]);
  const [clearBeforeMs, setClearBeforeMs] = useState<number>(() => {
    if (typeof window === "undefined") {
      return 0;
    }

    const raw = window.localStorage.getItem(NOTIFICATIONS_CLEAR_BEFORE_KEY);
    const parsed = Number(raw ?? "0");
    return Number.isFinite(parsed) ? parsed : 0;
  });

  function mergeServerEntries(serverItems: FeedEntry[]): void {
    setLogs((current) => {
      const localItems = current.filter((entry) => entry.source === "local" && entry.createdAt > clearBeforeMs);
      const visibleServerItems = serverItems.filter((entry) => entry.createdAt > clearBeforeMs);
      const merged = [...visibleServerItems, ...localItems]
        .sort((a, b) => b.createdAt - a.createdAt)
        .slice(0, 20);

      return merged;
    });
  }

  function mapActivityEntry(item: ActivityFeedItem): FeedEntry {
    return {
      id: `server-${item.id}`,
      message: item.message,
      level: item.level,
      createdAt: new Date(item.createdAt).getTime(),
      source: "server"
    };
  }

  useEffect(() => {
    let disposed = false;

    async function loadActivity(): Promise<void> {
      try {
        const result = await listActivity(20);
        if (disposed) {
          return;
        }

        mergeServerEntries(result.items.map(mapActivityEntry));
      } catch {
        if (!disposed) {
          mergeServerEntries([]);
        }
      }
    }

    void loadActivity();

    const intervalId = window.setInterval(() => {
      setTick((value) => value + 1);
    }, 60000);

    const refreshId = window.setInterval(() => {
      void loadActivity();
    }, 20000);

    function onSystemLog(event: Event): void {
      const detail = (event as CustomEvent<SystemLogPayload>).detail;
      if (!detail?.message) {
        return;
      }

      const next: FeedEntry = {
        id: `${Date.now()}-${Math.random().toString(16).slice(2, 8)}`,
        message: detail.message,
        level: detail.level ?? "info",
        createdAt: Date.now(),
        source: "local"
      };

      setLogs((current) => [next, ...current].slice(0, 20));
    }

    function onSignedOut(): void {
      setLogs([]);
    }

    window.addEventListener(SYSTEM_LOG_EVENT, onSystemLog);
    window.addEventListener(SIGNED_OUT_EVENT, onSignedOut);

    return () => {
      disposed = true;
      window.clearInterval(intervalId);
      window.clearInterval(refreshId);
      window.removeEventListener(SYSTEM_LOG_EVENT, onSystemLog);
      window.removeEventListener(SIGNED_OUT_EVENT, onSignedOut);
    };
  }, [clearBeforeMs]);

  function clearNotifications(): void {
    const clearedAt = Date.now();
    setClearBeforeMs(clearedAt);
    setLogs([]);
    window.localStorage.setItem(NOTIFICATIONS_CLEAR_BEFORE_KEY, String(clearedAt));
    window.localStorage.setItem(LAST_SEEN_ACTIVITY_KEY, String(clearedAt));
  }

  return (
    <section className="dashboard-section-band flex flex-col border border-outline-variant/15 bg-surface-container-low p-6">
      <div className="mb-6 flex items-center justify-between gap-2">
        <h3 className="font-headline text-sm font-bold uppercase tracking-widest text-on-surface">System Logs</h3>
        <div className="flex items-center gap-2">
          <span className="text-[10px] font-label uppercase text-primary">{user ? "Live Feed" : "Guest Feed"}</span>
          <button
            type="button"
            className="rounded-md border border-outline-variant/20 bg-surface-container px-2.5 py-1 text-[10px] font-label uppercase tracking-wider text-on-surface-variant transition-colors hover:text-primary"
            onClick={clearNotifications}
          >
            Clear
          </button>
        </div>
      </div>

      <ul className="custom-scrollbar max-h-[300px] flex-1 space-y-6 overflow-y-auto pr-2">
        {logs.length === 0 ? (
          <li className="border border-outline-variant/10 bg-surface-container px-3 py-4 text-[11px] text-on-surface-variant">
            No activity yet. Upload an asset or share a batch to start the timeline.
          </li>
        ) : (
          logs.map((entry, index) => {
            const dotColor =
              entry.level === "success"
                ? "bg-primary ring-primary/10"
                : entry.level === "warning"
                  ? "bg-error ring-error/10"
                  : "bg-secondary ring-secondary/10";

            return (
              <li key={entry.id} className="flex gap-4">
                <div className="flex flex-col items-center">
                  <div className={`h-2 w-2 rounded-full ring-4 ${dotColor}`}></div>
                  {index < logs.length - 1 ? <div className="mt-2 h-full w-px bg-outline-variant/20"></div> : null}
                </div>
                <div>
                  <p className={`text-[11px] leading-snug ${entry.level === "warning" ? "text-error-dim" : "text-on-surface"}`}>{entry.message}</p>
                  <p className="mt-1 text-[9px] font-label uppercase text-on-surface-variant">{toRelativeTime(entry.createdAt)}</p>
                </div>
              </li>
            );
          })
        )}
      </ul>

      <div className="mt-4 border border-outline-variant/10 bg-surface-container px-3 py-2 text-[10px] font-label uppercase tracking-widest text-on-surface-variant">
        {logs.length === 0 ? "No activity in this session" : user ? "Live activity feed" : "Guest activity feed"}
      </div>
    </section>
  );
}
