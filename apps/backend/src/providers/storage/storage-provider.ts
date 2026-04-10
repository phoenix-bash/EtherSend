import type { Readable } from "node:stream";

export interface UploadInput {
  stream: Readable;
  path: string;
}

export interface StorageProvider {
  upload(input: UploadInput): Promise<{ path: string }>;
  replace(input: UploadInput): Promise<void>;
  delete(path: string): Promise<void>;
  get(path: string): Promise<Readable>;
}
