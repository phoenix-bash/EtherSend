"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import { ControlShell } from "../../components/control-shell";
import { listBatches, listMedia, mediaViewUrl, type BatchListItem, type MediaItem } from "../../lib/api-client";
import { formatDateTimeDdMmYyyyHm } from "../../lib/utils";

interface SearchSectionLink {
  href: string;
  label: string;
  description: string;
  keywords: string[];
}

const PAGE_LINKS: SearchSectionLink[] = [
  {
    href: "/",
    label: "System Overview",
    description: "Upload media and manage the media archive console.",
    keywords: ["home", "dashboard", "overview", "archive", "upload"]
  },
  {
    href: "/library",
    label: "Media Library",
    description: "Browse uploaded files, previews, and direct links.",
    keywords: ["media", "library", "uploaded", "assets", "files"]
  },
  {
    href: "/batches",
    label: "Batches",
    description: "Open and manage generated batch share links.",
    keywords: ["batch", "share", "download", "qr"]
  },
  {
    href: "/account",
    label: "Account",
    description: "Profile settings, security details, and account policy.",
    keywords: ["account", "settings", "profile", "security", "plan"]
  },
  {
    href: "/notifications",
    label: "Notifications",
    description: "System feed with timeline and event logs.",
    keywords: ["notifications", "logs", "events", "activity"]
  }
];

function normalize(value: string): string {
  return value.trim().toLowerCase();
}

function batchName(batch: BatchListItem): string {
  if (batch.name && batch.name.trim().length > 0) {
    return batch.name;
  }

  return `Batch ${batch.id.slice(0, 8)}`;
}

export default function SearchPage() {
  const searchParams = useSearchParams();
  const query = searchParams.get("q") ?? "";
  const normalizedQuery = normalize(query);

  const [media, setMedia] = useState<MediaItem[]>([]);
  const [batches, setBatches] = useState<BatchListItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [status, setStatus] = useState("Type in the top search bar to run a global lookup.");

  useEffect(() => {
    let cancelled = false;

    async function loadSearchData(): Promise<void> {
      if (!normalizedQuery) {
        setLoading(false);
        setMedia([]);
        setBatches([]);
        setStatus("Type in the top search bar to run a global lookup.");
        return;
      }

      setLoading(true);
      setStatus("Searching media, batches, and pages...");

      try {
        const [mediaResult, batchesResult] = await Promise.all([listMedia(), listBatches()]);
        if (cancelled) {
          return;
        }

        setMedia(mediaResult.items);
        setBatches(batchesResult.items);
        setStatus("Search completed.");
      } catch {
        if (cancelled) {
          return;
        }

        setMedia([]);
        setBatches([]);
        setStatus("Search is unavailable right now. Try again after signing in.");
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    }

    void loadSearchData();

    return () => {
      cancelled = true;
    };
  }, [normalizedQuery]);

  const pageMatches = useMemo(() => {
    if (!normalizedQuery) {
      return PAGE_LINKS;
    }

    return PAGE_LINKS.filter((entry) => {
      const haystack = `${entry.label} ${entry.description} ${entry.keywords.join(" ")}`.toLowerCase();
      return haystack.includes(normalizedQuery);
    });
  }, [normalizedQuery]);

  const mediaMatches = useMemo(() => {
    if (!normalizedQuery) {
      return [];
    }

    return media
      .filter((item) => `${item.filename} ${item.mimeType}`.toLowerCase().includes(normalizedQuery))
      .slice(0, 24);
  }, [media, normalizedQuery]);

  const batchMatches = useMemo(() => {
    if (!normalizedQuery) {
      return [];
    }

    return batches
      .filter((batch) => {
        const name = batchName(batch);
        return `${name} ${batch.id}`.toLowerCase().includes(normalizedQuery);
      })
      .slice(0, 24);
  }, [batches, normalizedQuery]);

  const totalMatches = pageMatches.length + mediaMatches.length + batchMatches.length;

  return (
    <ControlShell searchPlaceholder="Search filenames, batches, or pages...">
      <div className="flex w-full flex-col gap-4">
        <section className="border-b border-outline-variant/20 pb-3">
          <h2 className="font-headline text-2xl font-extrabold tracking-tight text-on-surface">Search</h2>
          <p className="mt-1 text-xs uppercase tracking-wider text-on-surface-variant">{status}</p>
          {normalizedQuery ? (
            <p className="mt-1 text-xs text-on-surface-variant">
              Query: <span className="font-semibold text-on-surface">{query}</span> • Matches: {loading ? "..." : totalMatches}
            </p>
          ) : (
            <p className="mt-1 text-xs text-on-surface-variant">Enter a query to search media filenames, batch names, and app pages.</p>
          )}
        </section>

        <section className="space-y-2">
          <div className="flex items-center justify-between gap-3">
            <h3 className="text-[11px] font-bold uppercase tracking-[0.14em] text-on-surface-variant">Pages</h3>
            <span className="text-[10px] uppercase tracking-wider text-on-surface-variant">{pageMatches.length}</span>
          </div>

          <div className="divide-y divide-outline-variant/15 rounded-lg border border-outline-variant/15 bg-surface-container-low/40">
            {pageMatches.map((entry) => (
              <Link key={entry.href} href={entry.href} className="block px-3 py-2.5 transition-colors hover:bg-surface-container-high/40">
                <p className="text-sm font-semibold text-on-surface">{entry.label}</p>
                <p className="text-xs text-on-surface-variant">{entry.description}</p>
              </Link>
            ))}
          </div>
        </section>

        {normalizedQuery ? (
          <section className="space-y-2">
            <div className="flex items-center justify-between gap-3">
              <h3 className="text-[11px] font-bold uppercase tracking-[0.14em] text-on-surface-variant">Uploaded Media</h3>
              <span className="text-[10px] uppercase tracking-wider text-on-surface-variant">{mediaMatches.length}</span>
            </div>

            {mediaMatches.length === 0 ? <p className="text-xs text-on-surface-variant">No uploaded files matched your search.</p> : null}

            {mediaMatches.length > 0 ? (
              <div className="divide-y divide-outline-variant/15 rounded-lg border border-outline-variant/15 bg-surface-container-low/40">
                {mediaMatches.map((item) => (
                  <article key={item.id} className="px-3 py-2.5">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <Link
                        href={`/library?mediaId=${encodeURIComponent(item.id)}&q=${encodeURIComponent(item.filename)}`}
                        className="text-sm font-semibold text-on-surface transition-colors hover:text-primary"
                      >
                        {item.filename}
                      </Link>
                      <p className="text-[10px] uppercase tracking-wider text-on-surface-variant">{item.isActive ? "Active" : "Archived"}</p>
                    </div>
                    <p className="text-xs text-on-surface-variant">{item.mimeType}</p>
                    <div className="mt-1.5 flex flex-wrap gap-2">
                      <Link
                        href={`/library?mediaId=${encodeURIComponent(item.id)}&q=${encodeURIComponent(item.filename)}`}
                        className="text-[10px] font-bold uppercase tracking-wider text-primary"
                      >
                        Open In Library
                      </Link>
                      <a href={mediaViewUrl(item.id)} target="_blank" rel="noreferrer" className="text-[10px] font-bold uppercase tracking-wider text-on-surface-variant hover:text-primary">
                        Open File
                      </a>
                    </div>
                  </article>
                ))}
              </div>
            ) : null}
          </section>
        ) : null}

        {normalizedQuery ? (
          <section className="space-y-2">
            <div className="flex items-center justify-between gap-3">
              <h3 className="text-[11px] font-bold uppercase tracking-[0.14em] text-on-surface-variant">Batches</h3>
              <span className="text-[10px] uppercase tracking-wider text-on-surface-variant">{batchMatches.length}</span>
            </div>

            {batchMatches.length === 0 ? <p className="text-xs text-on-surface-variant">No batch names matched your search.</p> : null}

            {batchMatches.length > 0 ? (
              <div className="divide-y divide-outline-variant/15 rounded-lg border border-outline-variant/15 bg-surface-container-low/40">
                {batchMatches.map((batch) => (
                  <article key={batch.id} className="px-3 py-2.5">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <Link
                        href={`/batches?batchId=${encodeURIComponent(batch.id)}&q=${encodeURIComponent(batchName(batch))}`}
                        className="text-sm font-semibold text-on-surface transition-colors hover:text-primary"
                      >
                        {batchName(batch)}
                      </Link>
                      <p className="text-[10px] uppercase tracking-wider text-on-surface-variant">{batch.fileCount} file(s)</p>
                    </div>
                    <p className="text-xs text-on-surface-variant">
                      Created: {formatDateTimeDdMmYyyyHm(batch.createdAt)}
                      {batch.share ? ` • Share expiry: ${formatDateTimeDdMmYyyyHm(batch.share.expiresAt)}` : " • No active share"}
                    </p>
                    <div className="mt-1.5 flex flex-wrap gap-2">
                      <Link
                        href={`/batches?batchId=${encodeURIComponent(batch.id)}&q=${encodeURIComponent(batchName(batch))}`}
                        className="text-[10px] font-bold uppercase tracking-wider text-primary"
                      >
                        Open Batch
                      </Link>
                      {batch.share?.publicPath ? (
                        <a
                          href={batch.share.publicUrl ?? batch.share.publicPath}
                          target="_blank"
                          rel="noreferrer"
                          className="text-[10px] font-bold uppercase tracking-wider text-on-surface-variant hover:text-primary"
                        >
                          Open Share
                        </a>
                      ) : null}
                    </div>
                  </article>
                ))}
              </div>
            ) : null}
          </section>
        ) : null}
      </div>
    </ControlShell>
  );
}
