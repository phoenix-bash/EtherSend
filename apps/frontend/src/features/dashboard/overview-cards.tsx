"use client";

import { useEffect, useMemo, useState } from "react";
import { motion } from "framer-motion";
import { listBatches, listMedia, type BatchListItem, type MediaItem } from "../../lib/api-client";
import { MEDIA_LIBRARY_CHANGED_EVENT, MEDIA_UPLOADED_EVENT, SIGNED_OUT_EVENT } from "../../lib/events";
import { useAuthSession } from "../../hooks/use-auth-session";
import { formatDateTimeDdMmYyyyHm } from "../../lib/utils";

const GUEST_STORAGE_CAP_BYTES = 100 * 1024 * 1024;
const SIGNED_IN_STORAGE_CAP_BYTES = 1024 * 1024 * 1024;

interface OverviewState {
  totalFiles: number;
  activeLinks: number;
  activeShares: number;
  totalBytes: number;
  storageCapBytes: number;
  nearestBatchExpiryAt: number | null;
  nearestBatchName: string | null;
}

function formatStorage(bytes: number): string {
  if (bytes <= 0) {
    return "0 MB";
  }

  if (bytes >= 1024 * 1024 * 1024) {
    return `${(bytes / (1024 * 1024 * 1024)).toFixed(2)} GB`;
  }

  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function formatTtl(expiryAt: number | null, nowMs: number): string {
  if (!expiryAt) {
    return "NO ACTIVE EXPIRY";
  }

  if (expiryAt <= nowMs) {
    return "EXPIRED";
  }

  return formatDateTimeDdMmYyyyHm(expiryAt);
}

function computeOverview(items: MediaItem[], batches: BatchListItem[], storageCapBytes: number, nowMs: number): OverviewState {
  const totalBytes = items.reduce((sum, item) => sum + Number(item.sizeBytes || "0"), 0);

  const activeShareEntries = batches
    .filter((batch) => batch.share)
    .map((batch) => ({
      batch,
      expiryMs: batch.share ? new Date(batch.share.expiresAt).getTime() : Number.NaN
    }))
    .filter((entry) => Number.isFinite(entry.expiryMs));

  const activeShares = activeShareEntries.filter((entry) => entry.expiryMs > nowMs).length;

  const nearestActiveShare = activeShareEntries
    .filter((entry) => entry.expiryMs > nowMs)
    .sort((a, b) => a.expiryMs - b.expiryMs)[0];

  return {
    totalFiles: items.length,
    activeLinks: items.filter((item) => item.isActive).length,
    activeShares,
    totalBytes,
    storageCapBytes,
    nearestBatchExpiryAt: nearestActiveShare?.expiryMs ?? null,
    nearestBatchName: nearestActiveShare ? nearestActiveShare.batch.name || `Batch ${nearestActiveShare.batch.id.slice(0, 8)}` : null
  };
}

export function OverviewCards() {
  const { user } = useAuthSession();
  const [overview, setOverview] = useState<OverviewState | null>(null);
  const [nowMs, setNowMs] = useState(() => Date.now());

  useEffect(() => {
    async function loadOverview() {
      try {
        const [mediaResult, batchResult] = await Promise.all([listMedia(), listBatches()]);
        const storageCapBytes = user ? SIGNED_IN_STORAGE_CAP_BYTES : GUEST_STORAGE_CAP_BYTES;
        setOverview(computeOverview(mediaResult.items, batchResult.items, storageCapBytes, Date.now()));
      } catch {
        setOverview(null);
      }
    }

    function onDataChanged(): void {
      void loadOverview();
    }

    function onSignedOut(): void {
      setOverview(null);
    }

    void loadOverview();

    window.addEventListener(MEDIA_UPLOADED_EVENT, onDataChanged);
    window.addEventListener(MEDIA_LIBRARY_CHANGED_EVENT, onDataChanged);
    window.addEventListener(SIGNED_OUT_EVENT, onSignedOut);

    return () => {
      window.removeEventListener(MEDIA_UPLOADED_EVENT, onDataChanged);
      window.removeEventListener(MEDIA_LIBRARY_CHANGED_EVENT, onDataChanged);
      window.removeEventListener(SIGNED_OUT_EVENT, onSignedOut);
    };
  }, [user]);

  useEffect(() => {
    const timer = window.setInterval(() => {
      setNowMs(Date.now());
    }, 30000);

    return () => {
      window.clearInterval(timer);
    };
  }, []);

  const storagePercent = useMemo(() => {
    if (!overview || overview.storageCapBytes <= 0) {
      return 0;
    }

    return Math.min(100, Math.round((overview.totalBytes / overview.storageCapBytes) * 100));
  }, [overview]);

  const remainingStorageLabel = useMemo(() => {
    if (!overview) {
      return "-";
    }

    const remainingBytes = Math.max(0, overview.storageCapBytes - overview.totalBytes);
    return formatStorage(remainingBytes);
  }, [overview]);

  const usedVsCapLabel = useMemo(() => {
    if (!overview) {
      return "-";
    }

    return `${formatStorage(overview.totalBytes)} / ${formatStorage(overview.storageCapBytes)} USED`;
  }, [overview]);

  const ttlLabel = useMemo(() => formatTtl(overview?.nearestBatchExpiryAt ?? null, nowMs), [overview?.nearestBatchExpiryAt, nowMs]);

  return (
    <div className="grid grid-cols-1 gap-6 md:grid-cols-2 lg:grid-cols-4">
      <motion.article
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.25 }}
        className="group flex items-center justify-between rounded-xl border border-outline-variant/15 bg-surface-container-low p-6 transition-all hover:border-primary/20"
      >
        <div>
          <p className="text-[10px] font-label uppercase tracking-widest text-on-surface-variant">Remaining Storage</p>
          <h3 className="mt-1 font-headline text-2xl font-bold text-on-surface">{remainingStorageLabel}</h3>
          <p className="mt-1 text-[10px] font-label text-primary">{usedVsCapLabel}</p>
        </div>
        <div className="relative h-16 w-16">
          <svg className="h-full w-full" viewBox="0 0 36 36">
            <circle className="stroke-surface-container-high" cx="18" cy="18" fill="none" r="16" strokeWidth="3" />
            <circle
              className="stroke-primary"
              cx="18"
              cy="18"
              fill="none"
              r="16"
              strokeDasharray={`${storagePercent}, 100`}
              strokeLinecap="round"
              strokeWidth="3"
              transform="rotate(-90 18 18)"
            />
          </svg>
          <span className="absolute inset-0 flex items-center justify-center text-[10px] font-headline font-bold text-on-surface">{storagePercent}%</span>
        </div>
      </motion.article>

      <motion.article
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.08, duration: 0.25 }}
        className="group flex items-center justify-between rounded-xl border border-outline-variant/15 bg-surface-container-low p-6 transition-all hover:border-primary/20"
      >
        <div>
          <p className="text-[10px] font-label uppercase tracking-widest text-on-surface-variant">Total Media</p>
          <h3 className="mt-1 font-headline text-2xl font-bold text-on-surface">{overview ? overview.totalFiles : "-"}</h3>
          <div className="mt-1 flex items-center gap-1 text-[10px] font-label text-primary">
            <span className="material-symbols-outlined text-xs">trending_up</span>
            <span>{overview ? `${overview.activeLinks} ACTIVE` : "-"}</span>
          </div>
        </div>
        <span className="material-symbols-outlined text-4xl text-primary/35 transition-colors group-hover:text-primary">perm_media</span>
      </motion.article>

      <motion.article
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.16, duration: 0.25 }}
        className="group flex items-center justify-between rounded-xl border border-outline-variant/15 bg-surface-container-low p-6 transition-all hover:border-primary/20"
      >
        <div>
          <p className="text-[10px] font-label uppercase tracking-widest text-on-surface-variant">Active Shares</p>
          <h3 className="mt-1 font-headline text-2xl font-bold text-on-surface">{overview ? overview.activeShares : "-"}</h3>
          <p className="mt-1 text-[10px] font-label uppercase text-tertiary">
            {overview ? `${Math.max(0, overview.totalFiles - overview.activeLinks)} archived` : "-"}
          </p>
        </div>
        <span className="material-symbols-outlined text-4xl text-tertiary/35 transition-colors group-hover:text-tertiary">share</span>
      </motion.article>

      <motion.article
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.24, duration: 0.25 }}
        className="group flex items-center justify-between rounded-xl border border-outline-variant/15 bg-surface-container-low p-6 transition-all hover:border-primary/20"
      >
        <div>
          <p className="text-[10px] font-label uppercase tracking-widest text-on-surface-variant">Media TTL</p>
          <h3 className="mt-1 font-headline text-2xl font-bold text-on-surface">{ttlLabel}</h3>
          <p className="mt-1 text-[10px] font-label uppercase text-error">
            {overview?.nearestBatchName ? `Batch: ${overview.nearestBatchName}` : "No active batch expiry"}
          </p>
        </div>
        <span className="material-symbols-outlined text-4xl text-error/35 transition-colors group-hover:text-error">timer</span>
      </motion.article>
    </div>
  );
}
