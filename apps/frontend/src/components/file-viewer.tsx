"use client";

import { useEffect, useMemo, useRef, useState } from "react";

type ViewerKind = "image" | "video" | "pdf" | "text" | "docx" | "xlsx" | "pptx" | "iframe";

function fileExtension(fileName: string): string {
  const normalized = fileName.trim().toLowerCase();
  const dotIndex = normalized.lastIndexOf(".");
  if (dotIndex < 0 || dotIndex === normalized.length - 1) {
    return "";
  }

  return normalized.slice(dotIndex + 1);
}

function resolveViewerKind(mimeType: string, fileName: string): ViewerKind {
  const normalizedMime = mimeType.toLowerCase();
  const ext = fileExtension(fileName);

  if (normalizedMime.startsWith("image/")) {
    return "image";
  }

  if (normalizedMime.startsWith("video/")) {
    return "video";
  }

  if (normalizedMime === "application/pdf" || ext === "pdf") {
    return "pdf";
  }

  if (
    normalizedMime === "application/vnd.openxmlformats-officedocument.wordprocessingml.document" ||
    ext === "docx"
  ) {
    return "docx";
  }

  if (
    normalizedMime === "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" ||
    normalizedMime === "application/vnd.ms-excel" ||
    ext === "xlsx"
  ) {
    return "xlsx";
  }

  if (
    normalizedMime === "application/vnd.openxmlformats-officedocument.presentationml.presentation" ||
    normalizedMime === "application/vnd.ms-powerpoint" ||
    ext === "pptx"
  ) {
    return "pptx";
  }

  if (normalizedMime.startsWith("text/")) {
    return "text";
  }

  return "iframe";
}

function withPdfViewerOptions(url: string, allowDownload: boolean): string {
  if (allowDownload) {
    return url;
  }

  return `${url}#toolbar=0&navpanes=0&scrollbar=0&pagemode=none`;
}

interface FileViewerProps {
  fileName: string;
  mimeType: string;
  objectUrl?: string;
  blob?: Blob;
  textContent?: string;
  pdfPageImageUrls?: string[];
  pptxSlideImageUrls?: string[];
  allowDownload?: boolean;
}

export function FileViewer({
  fileName,
  mimeType,
  objectUrl,
  blob,
  textContent,
  pdfPageImageUrls,
  pptxSlideImageUrls,
  allowDownload = true
}: FileViewerProps) {
  const kind = useMemo(() => resolveViewerKind(mimeType, fileName), [mimeType, fileName]);
  const isMobile = useMemo(() => {
    if (typeof navigator === "undefined") {
      return false;
    }

    return /Android|iPhone|iPad|iPod|Mobile/i.test(navigator.userAgent);
  }, []);
  const docxContainerRef = useRef<HTMLDivElement | null>(null);
  const [docxStatus, setDocxStatus] = useState<"idle" | "loading" | "error">("idle");
  const [docxError, setDocxError] = useState("");
  const [xlsxSheets, setXlsxSheets] = useState<Array<{ name: string; html: string }>>([]);
  const [xlsxStatus, setXlsxStatus] = useState<"idle" | "loading" | "error">("idle");
  const [xlsxError, setXlsxError] = useState("");

  useEffect(() => {
    if (kind !== "docx") {
      setDocxStatus("idle");
      setDocxError("");
      if (docxContainerRef.current) {
        docxContainerRef.current.innerHTML = "";
      }
      return;
    }

    if (!blob || !docxContainerRef.current) {
      setDocxStatus("error");
      setDocxError("DOCX preview is unavailable.");
      return;
    }

    let cancelled = false;
    setDocxStatus("loading");
    setDocxError("");
    docxContainerRef.current.innerHTML = "";

    void (async () => {
      try {
        const [{ renderAsync }, arrayBuffer] = await Promise.all([import("docx-preview"), blob.arrayBuffer()]);
        if (cancelled || !docxContainerRef.current) {
          return;
        }

        await renderAsync(arrayBuffer, docxContainerRef.current, undefined, {
          className: "docx-render",
          inWrapper: false,
          breakPages: true
        });
        if (!cancelled) {
          setDocxStatus("idle");
        }
      } catch {
        if (!cancelled) {
          setDocxStatus("error");
          setDocxError("Failed to render DOCX preview.");
        }
      }
    })();

    return () => {
      cancelled = true;
      if (docxContainerRef.current) {
        docxContainerRef.current.innerHTML = "";
      }
    };
  }, [blob, kind]);

  useEffect(() => {
    if (kind !== "xlsx") {
      setXlsxSheets([]);
      setXlsxStatus("idle");
      setXlsxError("");
      return;
    }

    if (!blob) {
      setXlsxStatus("error");
      setXlsxError("XLSX preview is unavailable.");
      return;
    }

    let cancelled = false;
    setXlsxStatus("loading");
    setXlsxError("");
    setXlsxSheets([]);

    void (async () => {
      try {
        const [XLSX, arrayBuffer] = await Promise.all([import("xlsx"), blob.arrayBuffer()]);
        const workbook = XLSX.read(arrayBuffer, { type: "array", cellStyles: true });
        const sheets = workbook.SheetNames.map((name: string) => ({
          name,
          html: XLSX.utils.sheet_to_html(workbook.Sheets[name] ?? {}, {
            editable: false
          })
        }));

        if (!cancelled) {
          setXlsxSheets(sheets);
          setXlsxStatus("idle");
        }
      } catch {
        if (!cancelled) {
          setXlsxStatus("error");
          setXlsxError("Failed to render XLSX preview.");
        }
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [blob, kind]);

  if (kind === "text" && textContent !== undefined) {
    return (
      <pre className="h-full w-full overflow-auto rounded-lg border border-outline-variant/20 bg-surface-container-lowest p-3 text-xs text-on-surface whitespace-pre-wrap break-words">
        {textContent}
      </pre>
    );
  }

  if (kind === "image" && objectUrl) {
    return (
      <div className="flex h-full w-full items-center justify-center rounded-lg border border-outline-variant/20 bg-surface-container-lowest p-2">
        <img src={objectUrl} alt={fileName} className="max-h-full max-w-full rounded-lg object-contain" draggable={false} />
      </div>
    );
  }

  if (kind === "video" && objectUrl) {
    return (
      <div className="flex h-full w-full items-center justify-center rounded-lg border border-outline-variant/20 bg-black p-2">
        <video
          src={objectUrl}
          className="max-h-full max-w-full rounded-lg bg-black object-contain"
          controls
          playsInline
          preload="metadata"
          controlsList={allowDownload ? undefined : "nodownload noplaybackrate"}
          disablePictureInPicture={!allowDownload}
        />
      </div>
    );
  }

  if (kind === "pdf") {
    const pageImages = pdfPageImageUrls ?? [];
    if (pageImages.length > 0) {
      return (
        <div className="h-full w-full space-y-3 overflow-auto rounded-lg border border-outline-variant/20 bg-surface-container-lowest p-3">
          {pageImages.map((pageUrl, index) => (
            <div key={pageUrl} className="overflow-hidden rounded-lg border border-outline-variant/20 bg-surface-container">
              <div className="border-b border-outline-variant/15 px-3 py-2 text-[10px] font-bold uppercase tracking-wider text-on-surface-variant">Page {index + 1}</div>
              <img src={pageUrl} alt={`${fileName} page ${index + 1}`} className="w-full object-contain" draggable={false} loading="lazy" />
            </div>
          ))}
        </div>
      );
    }

    if (!objectUrl) {
      return null;
    }

    const pdfUrl = withPdfViewerOptions(objectUrl, allowDownload);

    return (
      <div className="mx-auto h-full w-full max-w-5xl">
        {isMobile ? (
          <embed src={pdfUrl} type="application/pdf" className="h-full w-full rounded-lg border border-outline-variant/20 bg-surface-container-lowest" />
        ) : (
          <iframe src={pdfUrl} title={fileName} className="h-full w-full rounded-lg border border-outline-variant/20 bg-surface-container-lowest" />
        )}
      </div>
    );
  }

  if (kind === "docx") {
    return (
      <div className="docx-render h-full w-full overflow-auto rounded-lg border border-outline-variant/20 bg-surface-container-lowest p-4">
        {docxStatus === "loading" ? <p className="text-sm text-on-surface-variant">Rendering DOCX preview...</p> : null}
        {docxStatus === "error" ? <p className="text-sm text-error">{docxError}</p> : null}
        <div ref={docxContainerRef} className="min-h-full w-full" />
      </div>
    );
  }

  if (kind === "xlsx") {
    if (xlsxStatus === "loading") {
      return <div className="flex h-full items-center justify-center rounded-lg border border-outline-variant/15 bg-surface-container-low text-sm text-on-surface-variant">Rendering XLSX preview...</div>;
    }

    if (xlsxStatus === "error") {
      return <div className="flex h-full items-center justify-center rounded-lg border border-outline-variant/15 bg-surface-container-low text-sm text-error">{xlsxError}</div>;
    }

    return (
      <div className="xlsx-render h-full w-full space-y-3 overflow-auto rounded-lg border border-outline-variant/20 bg-surface-container-lowest p-3">
        {xlsxSheets.length === 0 ? (
          <p className="text-sm text-on-surface-variant">No worksheet data found.</p>
        ) : (
          xlsxSheets.map((sheet) => (
            <section key={sheet.name} className="overflow-auto rounded-lg border border-outline-variant/20 bg-surface-container p-2">
              <p className="mb-2 text-xs font-bold uppercase tracking-wider text-on-surface-variant">{sheet.name}</p>
              <div className="text-xs" dangerouslySetInnerHTML={{ __html: sheet.html }} />
            </section>
          ))
        )}
      </div>
    );
  }

  if (kind === "pptx") {
    const slides = pptxSlideImageUrls ?? [];
    if (slides.length === 0) {
      return <div className="flex h-full items-center justify-center rounded-lg border border-outline-variant/15 bg-surface-container-low text-sm text-on-surface-variant">PPTX slide preview is unavailable.</div>;
    }

    return (
      <div className="h-full w-full space-y-3 overflow-auto rounded-lg border border-outline-variant/20 bg-surface-container-lowest p-3">
        {slides.map((slideUrl, index) => (
          <div key={slideUrl} className="overflow-hidden rounded-lg border border-outline-variant/20 bg-surface-container">
            <div className="border-b border-outline-variant/15 px-3 py-2 text-[10px] font-bold uppercase tracking-wider text-on-surface-variant">Slide {index + 1}</div>
            <img src={slideUrl} alt={`${fileName} slide ${index + 1}`} className="w-full object-contain" draggable={false} loading="lazy" />
          </div>
        ))}
      </div>
    );
  }

  if (objectUrl) {
    return (
      <div className="mx-auto h-full w-full max-w-5xl">
        <iframe src={objectUrl} title={fileName} className="h-full w-full rounded-lg border border-outline-variant/20 bg-surface-container-lowest" />
      </div>
    );
  }

  return <div className="flex h-full items-center justify-center rounded-lg border border-outline-variant/15 bg-surface-container-low text-sm text-on-surface-variant">Preview unavailable.</div>;
}
