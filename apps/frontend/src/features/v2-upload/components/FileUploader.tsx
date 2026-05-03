"use client";

import { useRef, useState } from "react";

interface FileUploaderProps {
  disabled?: boolean;
  onFilesSelected: (files: File[]) => void;
}

export function FileUploader({ disabled, onFilesSelected }: FileUploaderProps) {
  const inputRef = useRef<HTMLInputElement | null>(null);
  const [isDragging, setIsDragging] = useState(false);

  function handleFiles(fileList: FileList | null): void {
    if (!fileList || disabled) {
      return;
    }

    const files = Array.from(fileList);
    if (files.length === 0) {
      return;
    }

    onFilesSelected(files);
  }

  return (
    <section className="rounded-xl border border-outline-variant/25 bg-surface-container-low p-4">
      <div
        className={`rounded-lg border-2 border-dashed px-5 py-8 text-center transition-colors ${
          isDragging ? "border-primary bg-primary/5" : "border-outline-variant/35"
        } ${disabled ? "cursor-not-allowed opacity-60" : "cursor-pointer"}`}
        onClick={() => {
          if (!disabled) {
            inputRef.current?.click();
          }
        }}
        onDragOver={(event) => {
          event.preventDefault();
          if (!disabled) {
            setIsDragging(true);
          }
        }}
        onDragLeave={() => setIsDragging(false)}
        onDrop={(event) => {
          event.preventDefault();
          setIsDragging(false);
          handleFiles(event.dataTransfer.files);
        }}
      >
        <p className="font-headline text-sm uppercase tracking-widest text-on-surface">Drop files here or click to browse</p>
        <p className="mt-2 text-xs text-on-surface-variant">Parallel direct-to-S3 upload with resumable multipart support.</p>

        <input
          ref={inputRef}
          type="file"
          className="hidden"
          multiple
          onChange={(event) => {
            handleFiles(event.target.files);
            event.target.value = "";
          }}
        />
      </div>
    </section>
  );
}
