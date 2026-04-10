"use client";

import { useEffect, useRef, useState } from "react";
import { RefreshCw, Power, Download, Trash2 } from "lucide-react";
import { deleteMedia, listMedia, replaceMedia, toggleMedia, type MediaItem } from "../../lib/api-client";

export function MediaManager() {
  const [items, setItems] = useState<MediaItem[]>([]);
  const [status, setStatus] = useState("Loading media...");
  const [selectedReplaceId, setSelectedReplaceId] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  async function refreshMedia(): Promise<void> {
    try {
      const response = await listMedia();
      setItems(response.items);
      setStatus("Media loaded.");
    } catch {
      setStatus("Failed to load media. Sign in first.");
      setItems([]);
    }
  }

  useEffect(() => {
    void refreshMedia();
  }, []);

  async function toggleActive(item: MediaItem): Promise<void> {
    await toggleMedia(item.id, { isActive: !item.isActive });
    await refreshMedia();
  }

  async function toggleDownload(item: MediaItem): Promise<void> {
    await toggleMedia(item.id, { allowDownload: !item.allowDownload });
    await refreshMedia();
  }

  async function removeItem(item: MediaItem): Promise<void> {
    await deleteMedia(item.id);
    await refreshMedia();
  }

  async function onReplacePicked(file: File | null): Promise<void> {
    if (!file || !selectedReplaceId) {
      return;
    }

    await replaceMedia(selectedReplaceId, file);
    setSelectedReplaceId(null);
    await refreshMedia();
  }

  function asMegabytes(sizeBytes: string): string {
    const bytes = Number(sizeBytes);
    if (Number.isNaN(bytes)) {
      return "-";
    }

    return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
  }

  return (
    <section className="rounded-3xl border border-border bg-card p-5 shadow-lift">
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <h2 className="text-lg font-semibold">Media Manager</h2>
        <div className="flex gap-2">
          <button className="inline-flex items-center gap-2 rounded-xl border border-border bg-bg px-3 py-2 text-sm" onClick={() => { void refreshMedia(); }}>
            <RefreshCw className="h-4 w-4" />
            Refresh
          </button>
        </div>
      </div>

      <input
        ref={fileInputRef}
        type="file"
        className="hidden"
        onChange={(event) => {
          const file = event.target.files?.[0] ?? null;
          void onReplacePicked(file);
        }}
      />

      <div className="overflow-x-auto rounded-2xl border border-border">
        <table className="w-full min-w-[760px] text-left text-sm">
          <thead className="bg-bg/70">
            <tr>
              <th className="px-4 py-3">Name</th>
              <th className="px-4 py-3">Type</th>
              <th className="px-4 py-3">Size</th>
              <th className="px-4 py-3">Expires</th>
              <th className="px-4 py-3">Updated</th>
              <th className="px-4 py-3">Actions</th>
            </tr>
          </thead>
          <tbody>
            {items.map((item) => (
              <tr key={item.id} className="border-t border-border">
                <td className="px-4 py-3">{item.filename}</td>
                <td className="px-4 py-3">{item.mimeType}</td>
                <td className="px-4 py-3">{asMegabytes(item.sizeBytes)}</td>
                <td className="px-4 py-3">{item.expiresAt ? new Date(item.expiresAt).toLocaleDateString() : "-"}</td>
                <td className="px-4 py-3">{new Date(item.updatedAt).toLocaleString()}</td>
                <td className="px-4 py-3">
                  <div className="flex gap-2">
                    <button
                      className="rounded-lg border border-border p-2"
                      aria-label="replace media"
                      onClick={() => {
                        setSelectedReplaceId(item.id);
                        fileInputRef.current?.click();
                      }}
                    >
                      <RefreshCw className="h-4 w-4" />
                    </button>
                    <button className="rounded-lg border border-border p-2" aria-label="toggle active" onClick={() => { void toggleActive(item); }}>
                      <Power className="h-4 w-4" />
                    </button>
                    <button className="rounded-lg border border-border p-2" aria-label="toggle download" onClick={() => { void toggleDownload(item); }}>
                      <Download className="h-4 w-4" />
                    </button>
                    <button className="rounded-lg border border-border p-2" aria-label="delete media" onClick={() => { void removeItem(item); }}>
                      <Trash2 className="h-4 w-4" />
                    </button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="mt-3 text-xs">{status}</p>
    </section>
  );
}
