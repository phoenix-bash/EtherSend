let pendingUploads: File[] = [];

export function queuePendingUploads(files: File[]): void {
  pendingUploads = [...files];
}

export function hasPendingUploads(): boolean {
  return pendingUploads.length > 0;
}

export function consumePendingUploads(): File[] {
  const queued = pendingUploads;
  pendingUploads = [];
  return queued;
}

export function clearPendingUploads(): void {
  pendingUploads = [];
}