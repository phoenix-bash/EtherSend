"use client";

import { useState } from "react";
import { ImagePlus, Link2 } from "lucide-react";
import { absoluteApiUrl, createImageLink, uploadMedia } from "../../lib/api-client";

export function ImageManager() {
  const [progress, setProgress] = useState(0);
  const [directLink, setDirectLink] = useState<string | null>(null);
  const [expiresAt, setExpiresAt] = useState<string | null>(null);
  const [status, setStatus] = useState<string>("Upload an image to create a direct link.");

  async function onUpload(file: File | null): Promise<void> {
    if (!file) {
      return;
    }

    setProgress(20);
    setStatus("Uploading image...");

    try {
      const uploadResult = await uploadMedia(file);
      setProgress(65);
      const link = await createImageLink(uploadResult.media.id);

      const absoluteLink = absoluteApiUrl(link.directUrl);
      setDirectLink(absoluteLink);
      setExpiresAt(link.link.expiresAt);
      setProgress(100);
      setStatus("Direct image link created.");
    } catch {
      setProgress(0);
      setStatus("Failed to create image link. Ensure you are signed in.");
    }
  }

  async function copyLink(): Promise<void> {
    if (!directLink) {
      return;
    }

    await navigator.clipboard.writeText(directLink);
    setStatus("Direct link copied.");
  }

  return (
    <section className="rounded-3xl border border-border bg-card p-5 shadow-lift">
      <div className="mb-4 flex items-center justify-between">
        <h2 className="text-lg font-semibold">Image Manager</h2>
        <span className="rounded-lg bg-accent/10 px-2 py-1 text-xs text-accent">Signed-in media: 6 months default</span>
      </div>

      <label className="flex cursor-pointer flex-col items-center justify-center gap-2 rounded-2xl border border-dashed border-border bg-bg/70 p-6 text-center">
        <ImagePlus className="h-6 w-6 text-accent" />
        <span className="text-sm">Drag and drop an image, or click to upload</span>
        <input
          type="file"
          accept="image/*"
          className="hidden"
          onChange={(event) => {
            const file = event.target.files?.[0] ?? null;
            void onUpload(file);
          }}
        />
      </label>

      <div className="mt-4 h-2 w-full overflow-hidden rounded-full bg-bg">
        <div className="h-full rounded-full bg-accent transition-all" style={{ width: `${progress}%` }} />
      </div>

      <div className="mt-4 flex flex-wrap gap-2">
        <button
          className="inline-flex items-center gap-2 rounded-xl border border-border bg-bg px-3 py-2 text-sm"
          onClick={() => {
            void copyLink();
          }}
          disabled={!directLink}
        >
          <Link2 className="h-4 w-4" />
          Copy direct link
        </button>
      </div>

      {directLink ? <p className="mt-3 text-xs break-all">{directLink}</p> : null}
      {expiresAt ? <p className="mt-1 text-xs text-accent">Expires at: {new Date(expiresAt).toLocaleString()}</p> : null}
      <p className="mt-1 text-xs">{status}</p>
    </section>
  );
}
