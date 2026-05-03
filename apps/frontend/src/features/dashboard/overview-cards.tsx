"use client";

import { useEffect, useMemo, useState } from "react";
import { motion } from "framer-motion";
import { getStorageLimits, listBatches, listMedia, type BatchListItem, type MediaItem } from "../../lib/api-client";
import { MEDIA_LIBRARY_CHANGED_EVENT, MEDIA_UPLOADED_EVENT, SIGNED_OUT_EVENT } from "../../lib/events";
import { useAuthSession } from "../../hooks/use-auth-session";
import { formatDateTimeDdMmYyyyHm } from "../../lib/utils";

const GUEST_STORAGE_CAP_BYTES = 100 * 1024 * 1024;
const SIGNED_IN_STORAGE_CAP_BYTES = 250 * 1024 * 1024;

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
        const [mediaResult, batchResult, limitsResult] = await Promise.all([listMedia(), listBatches(), getStorageLimits()]);
        const storageCapBytes = user
          ? Math.max(1, limitsResult.signedInStorageCapBytes || SIGNED_IN_STORAGE_CAP_BYTES)
          : Math.max(1, limitsResult.guestStorageCapBytes || GUEST_STORAGE_CAP_BYTES);
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
    <section className="dashboard-section-band px-3 py-3 sm:px-4 sm:py-4 md:px-6 md:py-5">
      <div className="dashboard-overview-band grid grid-cols-2 gap-3 md:grid-cols-2 md:gap-6 lg:grid-cols-4">
      <motion.article
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.25 }}
        className="group flex items-start justify-between p-3 transition-all sm:p-4 md:p-6"
      >
        <div>
          <p className="text-[9px] font-label uppercase tracking-wider text-on-surface-variant sm:text-[10px] sm:tracking-widest">Remaining Storage</p>
          <h3 className="mt-1 font-headline text-base font-bold text-on-surface sm:text-lg md:text-2xl">{remainingStorageLabel}</h3>
          <p className="mt-1 text-[9px] font-label text-primary sm:text-[10px]">{usedVsCapLabel}</p>
        </div>
        <div className="relative h-12 w-12 sm:h-14 sm:w-14 md:h-16 md:w-16">
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
          <span className="absolute inset-0 flex items-center justify-center text-[9px] font-headline font-bold text-on-surface sm:text-[10px]">{storagePercent}%</span>
        </div>
      </motion.article>

      <motion.article
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.08, duration: 0.25 }}
        className="group flex items-start justify-between p-3 transition-all sm:p-4 md:p-6"
      >
        <div>
          <p className="text-[9px] font-label uppercase tracking-wider text-on-surface-variant sm:text-[10px] sm:tracking-widest">Total Media</p>
          <h3 className="mt-1 font-headline text-base font-bold text-on-surface sm:text-lg md:text-2xl">{overview ? overview.totalFiles : "-"}</h3>
          <div className="mt-1 flex items-center gap-1 text-[9px] font-label text-primary sm:text-[10px]">
            <span className="material-symbols-outlined text-xs">trending_up</span>
            <span>{overview ? `${overview.activeLinks} ACTIVE` : "-"}</span>
          </div>
        </div>
        <span className="material-symbols-outlined text-2xl text-primary/35 transition-colors group-hover:text-primary sm:text-3xl md:text-4xl">perm_media</span>
      </motion.article>

      <motion.article
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.16, duration: 0.25 }}
        className="group flex items-start justify-between p-3 transition-all sm:p-4 md:p-6"
      >
        <div>
          <p className="text-[9px] font-label uppercase tracking-wider text-on-surface-variant sm:text-[10px] sm:tracking-widest">Active Shares</p>
          <h3 className="mt-1 font-headline text-base font-bold text-on-surface sm:text-lg md:text-2xl">{overview ? overview.activeShares : "-"}</h3>
          <p className="mt-1 text-[9px] font-label uppercase text-tertiary sm:text-[10px]">
            {overview ? `${Math.max(0, overview.totalFiles - overview.activeLinks)} archived` : "-"}
          </p>
        </div>
        <span className="material-symbols-outlined text-2xl text-tertiary/35 transition-colors group-hover:text-tertiary sm:text-3xl md:text-4xl">share</span>
      </motion.article>

      <motion.article
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.24, duration: 0.25 }}
        className="group flex items-start justify-between p-3 transition-all sm:p-4 md:p-6"
      >
        <div className="min-w-0">
          <p className="text-[9px] font-label uppercase tracking-wider text-on-surface-variant sm:text-[10px] sm:tracking-widest">Media TTL</p>
          <h3 className="mt-1 truncate font-headline text-[13px] font-bold text-on-surface sm:text-base md:text-2xl">{ttlLabel}</h3>
          <p className="mt-1 truncate text-[9px] font-label uppercase text-error sm:text-[10px]">
            {overview?.nearestBatchName ? `Batch: ${overview.nearestBatchName}` : "No active batch expiry"}
          </p>
        </div>
        <span className="material-symbols-outlined text-2xl text-error/35 transition-colors group-hover:text-error sm:text-3xl md:text-4xl">timer</span>
      </motion.article>
      </div>
    </section>
  );
}
