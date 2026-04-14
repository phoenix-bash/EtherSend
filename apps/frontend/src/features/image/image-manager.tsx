"use client";

import { useCallback, useEffect, useState } from "react";
import { ImagePlus } from "lucide-react";
import { useRouter } from "next/navigation";
import { ApiError, uploadMedia } from "../../lib/api-client";
import { MEDIA_LIBRARY_CHANGED_EVENT, MEDIA_UPLOADED_EVENT, SIGNED_OUT_EVENT, SYSTEM_LOG_EVENT } from "../../lib/events";
import { useAuthSession } from "../../hooks/use-auth-session";
import { clearPendingUploads, consumePendingUploads, hasPendingUploads, queuePendingUploads } from "../../lib/pending-upload-store";

interface UploadedMediaEntry {
  id: string;
  filename: string;
  expiresAt: string | null;
}

const GUEST_UPLOAD_CHOICE_KEY = "ethersend:guest-upload-choice";
const GUEST_CONTINUE_CHOICE = "continue";
const GUEST_MODE_STORAGE_KEY = "lf_guest_mode_enabled";
const GUEST_MAX_FILES_PER_BATCH = 6;

function hasGuestUploadAccess(): boolean {
  if (typeof window === "undefined") {
    return false;
  }

  return (
    window.localStorage.getItem(GUEST_UPLOAD_CHOICE_KEY) === GUEST_CONTINUE_CHOICE ||
    window.localStorage.getItem(GUEST_MODE_STORAGE_KEY) === "true"
  );
}

export function MediaUploader() {
  const router = useRouter();
  const { user, loading } = useAuthSession();
  const [progress, setProgress] = useState(0);
  const [uploadedMedia, setUploadedMedia] = useState<UploadedMediaEntry[]>([]);
  const [status, setStatus] = useState<string>("Upload media files. Create direct links from Media Manager.");
  const isUploading = status.startsWith("Uploading") && progress > 0 && progress < 100;
  const hasProgress = progress > 0;

  useEffect(() => {
    function onSignedOut(): void {
      setUploadedMedia([]);
      setProgress(0);
      clearPendingUploads();
      setStatus("Upload media files. Create direct links from Media Manager.");
    }

    window.addEventListener(SIGNED_OUT_EVENT, onSignedOut);

    return () => {
      window.removeEventListener(SIGNED_OUT_EVENT, onSignedOut);
    };
  }, []);

  const performUploadBatch = useCallback(
    async (files: File[]): Promise<void> => {
      if (files.length === 0) {
        return;
      }

      const uploadedEntries: UploadedMediaEntry[] = [];
      let terminalGuestStatus: string | null = null;
      const totalBytes = files.reduce((sum, file) => sum + Math.max(0, file.size || 0), 0);
      let uploadedBytes = 0;

      const toProgressPercent = (bytes: number): number => {
        if (totalBytes <= 0) {
          return 0;
        }

        const ratio = Math.min(1, Math.max(0, bytes / totalBytes));
        return Math.round(ratio * 100);
      };

      for (let index = 0; index < files.length; index += 1) {
        const file = files[index];
        setProgress(toProgressPercent(uploadedBytes));
        setStatus(`Uploading ${index + 1}/${files.length}: ${file.name}`);

        try {
          const uploadResult = await uploadMedia(file);
          window.dispatchEvent(new CustomEvent(MEDIA_UPLOADED_EVENT, { detail: { media: uploadResult.media } }));
          window.dispatchEvent(new Event(MEDIA_LIBRARY_CHANGED_EVENT));
          window.dispatchEvent(
            new CustomEvent(SYSTEM_LOG_EVENT, {
              detail: { message: `Media uploaded: ${uploadResult.media.filename}.`, level: "success" }
            })
          );

          uploadedEntries.push({
            id: uploadResult.media.id,
            filename: uploadResult.media.filename,
            expiresAt: uploadResult.media.expiresAt ?? null
          });

          uploadedBytes += Math.max(0, file.size || 0);
          setProgress(toProgressPercent(uploadedBytes));
        } catch (error) {
          if (error instanceof ApiError) {
            if (!user && (error.status === 401 || error.status === 403 || error.status === 413 || error.status === 429)) {
              const uploadedCount = uploadedEntries.length;
              const reasonLabel =
                error.status === 413
                  ? "Guest storage limit reached."
                  : error.status === 429
                    ? "Guest upload limit reached."
                    : "Guest session expired. Refresh and try again.";

              terminalGuestStatus =
                uploadedCount > 0
                  ? `Uploaded ${uploadedCount}/${files.length}. ${reasonLabel}`
                  : reasonLabel;

              setProgress(toProgressPercent(uploadedBytes));
              setStatus(terminalGuestStatus);
              window.dispatchEvent(
                new CustomEvent(SYSTEM_LOG_EVENT, {
                  detail: { message: "Guest upload reached policy limits.", level: "warning" }
                })
              );
              break;
            }

            if (user && (error.status === 401 || error.status === 403)) {
              queuePendingUploads(files.slice(index));
              setStatus("Please sign in to continue uploading.");
              router.push("/auth/signin?source=upload&returnTo=/");
              window.dispatchEvent(
                new CustomEvent(SYSTEM_LOG_EVENT, {
                  detail: { message: "Upload requires authentication.", level: "warning" }
                })
              );
              return;
            }

            setStatus(error.message);
          }

          window.dispatchEvent(
            new CustomEvent(SYSTEM_LOG_EVENT, {
              detail: { message: `Upload failed for ${file.name}.`, level: "warning" }
            })
          );
        }
      }

      if (uploadedEntries.length > 0) {
        setUploadedMedia((current) => [...uploadedEntries, ...current]);
        setProgress(toProgressPercent(uploadedBytes));
        setStatus(
          uploadedEntries.length === files.length
            ? `Uploaded ${uploadedEntries.length} file${uploadedEntries.length === 1 ? "" : "s"}.`
            : `Uploaded ${uploadedEntries.length}/${files.length} file${files.length === 1 ? "" : "s"}.`
        );
        return;
      }

      if (terminalGuestStatus) {
        return;
      }

      setProgress(0);
      setStatus("Failed to upload selected files. Please try again.");
    },
    [router, user]
  );

  useEffect(() => {
    if (loading) {
      return;
    }

    if (!hasPendingUploads()) {
      return;
    }

    if (!user && !hasGuestUploadAccess()) {
      return;
    }

    const queuedFiles = consumePendingUploads();
    if (queuedFiles.length === 0) {
      return;
    }

    void performUploadBatch(queuedFiles);
  }, [loading, performUploadBatch, user]);

  async function onUpload(files: File[]): Promise<void> {
    if (files.length === 0) {
      return;
    }

    if (!user && files.length > GUEST_MAX_FILES_PER_BATCH) {
      clearPendingUploads();
      setProgress(0);
      setStatus(`Guest uploads are limited to ${GUEST_MAX_FILES_PER_BATCH} files. Sign in to upload more.`);
      window.dispatchEvent(
        new CustomEvent(SYSTEM_LOG_EVENT, {
          detail: { message: "Guest upload selection exceeded item limit.", level: "warning" }
        })
      );
      router.push("/auth/signin?source=upload&returnTo=/");
      return;
    }

    if (!user && !hasGuestUploadAccess()) {
      queuePendingUploads(files);
      setStatus("Redirecting to login. Your selected files are saved.");
      router.push("/auth/signin?source=upload&returnTo=/");
      return;
    }

    await performUploadBatch(files);
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
          multiple
          className="hidden"
          onChange={(event) => {
            const files = Array.from(event.target.files ?? []);
            void onUpload(files);
            event.target.value = "";
          }}
        />
      </label>

      <div className="relative px-5 pb-5 pt-4">
        <div className={`upload-progress-shell h-3 w-full ${isUploading ? "is-active" : ""}`}>
          <div className="upload-progress-grid" aria-hidden="true" />
          <div className={`upload-progress-fill ${isUploading ? "is-active" : ""}`} style={{ width: `${progress}%` }}>
            {hasProgress ? <span className="upload-progress-head" aria-hidden="true" /> : null}
          </div>
        </div>

        <div className="mt-2 flex items-center justify-between gap-3">
          <p className="min-w-0 text-[10px] font-label uppercase tracking-widest text-on-surface-variant">{status}</p>
          <span className="shrink-0 text-[10px] font-label uppercase tracking-widest text-primary">{progress}%</span>
        </div>

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
      </div>
    </section>
  );
}
