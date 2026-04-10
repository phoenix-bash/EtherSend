import type { Readable } from "node:stream";
import type { StorageProvider, UploadInput } from "./storage-provider.js";

export class AzureBlobStorageProvider implements StorageProvider {
  async upload(_input: UploadInput): Promise<{ path: string }> {
    throw new Error("AzureBlobStorageProvider not implemented yet");
  }

  async replace(_input: UploadInput): Promise<void> {
    throw new Error("AzureBlobStorageProvider not implemented yet");
  }

  async delete(_path: string): Promise<void> {
    throw new Error("AzureBlobStorageProvider not implemented yet");
  }

  async get(_path: string): Promise<Readable> {
    throw new Error("AzureBlobStorageProvider not implemented yet");
  }
}
