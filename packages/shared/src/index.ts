export interface UploadSummary {
  id: string;
  filename: string;
  sizeBytes: number;
  mimeType: string;
  createdAt: string;
}

export interface DashboardOverview {
  totalFiles: number;
  activeLinks: number;
  recentUploads: UploadSummary[];
}
