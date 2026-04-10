"use client";

import { useEffect, useMemo, useState } from "react";
import { QrCode, Download } from "lucide-react";
import { createQr } from "../../lib/api-client";

export function QrGenerator() {
  const [mediaId, setMediaId] = useState("");
  const [qrImage, setQrImage] = useState<string | null>(null);
  const [expiresAt, setExpiresAt] = useState<number | null>(null);
  const [secondsLeft, setSecondsLeft] = useState(600);
  const [status, setStatus] = useState("Enter a media ID to generate QR.");

  useEffect(() => {
    if (!expiresAt) {
      return;
    }

    const timer = window.setInterval(() => {
      const next = Math.max(0, Math.floor((expiresAt - Date.now()) / 1000));
      setSecondsLeft(next);
    }, 1000);

    return () => window.clearInterval(timer);
  }, [expiresAt]);

  const mins = useMemo(() => Math.floor(secondsLeft / 60), [secondsLeft]);
  const secs = useMemo(() => String(secondsLeft % 60).padStart(2, "0"), [secondsLeft]);

  async function generate(): Promise<void> {
    if (!mediaId.trim()) {
      setStatus("Media ID is required.");
      return;
    }

    try {
      const result = await createQr(mediaId.trim());
      setQrImage(result.qrDataUrl);
      const expiry = new Date(result.expiresAt).getTime();
      setExpiresAt(expiry);
      setSecondsLeft(Math.max(0, Math.floor((expiry - Date.now()) / 1000)));
      setStatus("QR generated.");
    } catch {
      setStatus("Failed to generate QR. Ensure media ID is valid and you are signed in.");
    }
  }

  return (
    <section className="rounded-3xl border border-border bg-card p-5 shadow-lift">
      <div className="mb-4 flex items-center justify-between">
        <h2 className="text-lg font-semibold">QR Generator</h2>
        <span className="rounded-lg bg-accent/10 px-2 py-1 text-xs text-accent">10 min expiry</span>
      </div>

      <div className="grid gap-4 md:grid-cols-[1fr_auto] md:items-center">
        <input
          value={mediaId}
          onChange={(event) => {
            setMediaId(event.target.value);
          }}
          className="rounded-xl border border-border bg-bg px-3 py-2 text-sm"
          placeholder="Media ID"
        />

        <button
          type="button"
          onClick={() => {
            void generate();
          }}
          className="inline-flex items-center justify-center gap-2 rounded-xl border border-border bg-bg px-3 py-2 text-sm"
        >
          <QrCode className="h-4 w-4" />
          Generate QR
        </button>

        <p className="text-sm text-accent">Expires in: {mins}:{secs}</p>
      </div>

      <div className="mt-4 flex h-40 items-center justify-center rounded-2xl border border-dashed border-border bg-bg/60">
        {qrImage ? <img src={qrImage} alt="Generated QR" className="h-36 w-36" /> : <span className="text-sm text-accent">QR preview area</span>}
      </div>

      <button
        className="mt-4 inline-flex items-center gap-2 rounded-xl border border-border bg-bg px-3 py-2 text-sm"
        disabled={!qrImage}
        onClick={() => {
          if (!qrImage) {
            return;
          }

          const anchor = document.createElement("a");
          anchor.href = qrImage;
          anchor.download = `linkforge-qr-${Date.now()}.png`;
          anchor.click();
        }}
      >
        <Download className="h-4 w-4" />
        Download QR
      </button>
      <p className="mt-2 text-xs">{status}</p>
    </section>
  );
}
