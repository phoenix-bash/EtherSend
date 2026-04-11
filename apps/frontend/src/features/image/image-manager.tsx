"use client";

import { useEffect, useState } from "react";
import { ImagePlus } from "lucide-react";
import { ApiError, API_BASE_URL, uploadMedia } from "../../lib/api-client";
import { MEDIA_LIBRARY_CHANGED_EVENT, MEDIA_UPLOADED_EVENT, SIGNED_OUT_EVENT, SYSTEM_LOG_EVENT } from "../../lib/events";
import { useAuthSession } from "../../hooks/use-auth-session";

interface UploadedMediaEntry {
  id: string;
  filename: string;
  expiresAt: string | null;
}

function oauthStartUrl(provider: "google" | "github"): string {
  const query = new URLSearchParams({
    mode: "token",
    redirectPath: "/auth/callback"
  });

  return `${API_BASE_URL}/auth/${provider}/start?${query.toString()}`;
}

function openOAuthPopup(provider: "google" | "github"): void {
  const popup = window.open(
    oauthStartUrl(provider),
    "linkforge-auth",
    "width=520,height=720,menubar=no,toolbar=no,location=no,status=no,resizable=yes,scrollbars=yes"
  );

  if (!popup) {
    window.location.href = oauthStartUrl(provider);
  }
}

export function MediaUploader() {
  const { user, refresh } = useAuthSession();
  const [progress, setProgress] = useState(0);
  const [uploadedMedia, setUploadedMedia] = useState<UploadedMediaEntry[]>([]);
  const [status, setStatus] = useState<string>("Upload media files. Create direct links from Media Manager.");
  const [showLoginPrompt, setShowLoginPrompt] = useState(false);

  useEffect(() => {
    function onMessage(event: MessageEvent): void {
      if (event.origin !== window.location.origin) {
        return;
      }

      const payload = event.data as { type?: string } | null;
      if (payload?.type === "linkforge:auth-success") {
        void refresh();
        setShowLoginPrompt(false);
        setStatus("Signed in. Your next uploads will use signed-in policy.");
        window.dispatchEvent(
          new CustomEvent(SYSTEM_LOG_EVENT, {
            detail: { message: "Authentication gateway accepted the current session.", level: "success" }
          })
        );
      }
    }

    window.addEventListener("message", onMessage);
    return () => {
      window.removeEventListener("message", onMessage);
    };
  }, [refresh]);

  useEffect(() => {
    function onSignedOut(): void {
      setUploadedMedia([]);
      setProgress(0);
      setShowLoginPrompt(false);
      setStatus("Upload media files. Create direct links from Media Manager.");
    }

    window.addEventListener(SIGNED_OUT_EVENT, onSignedOut);

    return () => {
      window.removeEventListener(SIGNED_OUT_EVENT, onSignedOut);
    };
  }, []);

  async function onUpload(file: File | null): Promise<void> {
    if (!file) {
      return;
    }

    if (!user) {
      setShowLoginPrompt(true);
    }

    setProgress(20);
    setStatus("Uploading media...");

    try {
      const uploadResult = await uploadMedia(file);
      window.dispatchEvent(new CustomEvent(MEDIA_UPLOADED_EVENT, { detail: { media: uploadResult.media } }));
      window.dispatchEvent(new Event(MEDIA_LIBRARY_CHANGED_EVENT));
      window.dispatchEvent(
        new CustomEvent(SYSTEM_LOG_EVENT, {
          detail: { message: `Media uploaded: ${uploadResult.media.filename}.`, level: "success" }
        })
      );
      setUploadedMedia((current) => [
        ...current,
        {
          id: uploadResult.media.id,
          filename: uploadResult.media.filename,
          expiresAt: uploadResult.media.expiresAt ?? null
        }
      ]);
      setProgress(100);
      setStatus(user ? "Upload complete. Create direct links from Media Manager." : "Guest upload complete. Create direct links from Media Manager.");
    } catch (error) {
      setProgress(0);
      if (error instanceof ApiError && (error.status === 401 || error.status === 403)) {
        setShowLoginPrompt(true);
        setStatus("You can continue as guest with limits, or sign in for full access.");
        window.dispatchEvent(
          new CustomEvent(SYSTEM_LOG_EVENT, {
            detail: { message: "Upload requires authentication or available guest capacity.", level: "warning" }
          })
        );
        return;
      }

      setStatus("Failed to upload media. Please try again.");
      window.dispatchEvent(
        new CustomEvent(SYSTEM_LOG_EVENT, {
          detail: { message: "Upload failed due to a network or policy issue.", level: "warning" }
        })
      );
    }
  }

  return (
    <section id="media-uploader" className="group relative overflow-hidden rounded-xl border border-outline-variant/15 bg-surface-container-low p-1">
      <div className="pointer-events-none absolute inset-0 bg-gradient-to-br from-primary/5 to-transparent opacity-0 transition-opacity group-hover:opacity-100"></div>

      <label className="relative flex cursor-pointer flex-col items-center justify-center rounded-lg border-2 border-dashed border-outline-variant/30 px-6 py-12 text-center transition-all group-hover:border-primary/30">
        <div className="mb-4 rounded-full border border-outline-variant/10 bg-surface-container-high p-5 shadow-xl">
          <ImagePlus className="h-9 w-9 text-primary" />
        </div>
        <h4 className="font-headline text-lg font-bold uppercase tracking-tight text-on-surface">Synthesize New Assets</h4>
        <p className="mt-2 max-w-sm text-sm text-on-surface-variant">Drag and drop your raw files here to initiate compression and metadata indexing.</p>
        <div className="mt-8 rounded-lg border border-outline-variant/30 bg-surface-container-highest px-8 py-3 text-[10px] font-label uppercase tracking-widest text-on-surface transition-all hover:border-primary/40 hover:text-primary">
          Browse Local Storage
        </div>

        <input
          type="file"
          accept="image/*,video/*,audio/*,.pdf"
          className="hidden"
          onChange={(event) => {
            const file = event.target.files?.[0] ?? null;
            void onUpload(file);
            event.target.value = "";
          }}
        />
      </label>

      <div className="relative px-5 pb-5 pt-4">
        <div className="h-2 w-full overflow-hidden rounded-full bg-surface-container">
          <div className="h-full rounded-full bg-gradient-to-r from-primary to-primary-container transition-all" style={{ width: `${progress}%` }} />
        </div>

        <p className="mt-2 text-[10px] font-label uppercase tracking-widest text-on-surface-variant">{status}</p>

        {uploadedMedia.length > 0 ? (
          <div className="mt-3 rounded-lg border border-outline-variant/15 bg-surface-container p-3">
            <p className="text-[10px] font-label uppercase tracking-widest text-on-surface-variant">Recently Added</p>
            <ul className="mt-2 space-y-1.5 text-xs text-on-surface">
              {uploadedMedia.slice(0, 3).map((entry) => (
                <li key={entry.id}>
                  <p className="font-semibold">{entry.filename}</p>
                  {entry.expiresAt ? <p className="text-[10px] text-primary">Expires: {new Date(entry.expiresAt).toLocaleString()}</p> : null}
                </li>
              ))}
            </ul>
          </div>
        ) : null}

        {showLoginPrompt && !user ? (
          <div className="mt-4 rounded-lg border border-outline-variant/20 bg-surface-container p-4">
            <p className="text-sm font-semibold text-on-surface">Continue as guest or sign in</p>
            <p className="mt-1 text-xs text-on-surface-variant">
              Guest mode works with policy limits (10-minute validity). Sign in for longer validity and account features.
            </p>
            <div className="mt-3 flex flex-wrap gap-2">
              <button
                type="button"
                className="rounded-lg border border-outline-variant/20 bg-surface-container-high px-3 py-2 text-xs font-label uppercase tracking-wider text-on-surface transition-all hover:text-primary"
                onClick={() => {
                  openOAuthPopup("google");
                }}
              >
                Sign in with Google
              </button>
              <button
                type="button"
                className="rounded-lg border border-outline-variant/20 bg-surface-container-high px-3 py-2 text-xs font-label uppercase tracking-wider text-on-surface transition-all hover:text-primary"
                onClick={() => {
                  openOAuthPopup("github");
                }}
              >
                Sign in with GitHub
              </button>
              <button
                type="button"
                className="rounded-lg border border-outline-variant/20 bg-surface-container px-3 py-2 text-xs font-label uppercase tracking-wider text-on-surface-variant transition-all hover:text-on-surface"
                onClick={() => {
                  setShowLoginPrompt(false);
                }}
              >
                Continue as guest
              </button>
            </div>
          </div>
        ) : null}
      </div>
    </section>
  );
}
