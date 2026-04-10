import { createReadStream, createWriteStream, promises as fs } from "node:fs";
import { dirname, resolve } from "node:path";
import { pipeline } from "node:stream/promises";
import type { Readable } from "node:stream";
import { env } from "../../config/env.js";
import type { StorageProvider, UploadInput } from "./storage-provider.js";

export class LocalStorageProvider implements StorageProvider {
  private readonly root: string;

  constructor(root = env.LOCAL_STORAGE_ROOT) {
    this.root = resolve(root);
  }

  private resolveSafe(relativePath: string): string {
    const normalized = relativePath.replace(/\\/g, "/").replace(/^\/+/, "");
    const fullPath = resolve(this.root, normalized);
    if (!fullPath.startsWith(this.root)) {
      throw new Error("Path traversal detected");
    }
    return fullPath;
  }

  async upload(input: UploadInput): Promise<{ path: string }> {
    const destination = this.resolveSafe(input.path);
    await fs.mkdir(dirname(destination), { recursive: true });
    await pipeline(input.stream, createWriteStream(destination));
    return { path: input.path };
  }

  async replace(input: UploadInput): Promise<void> {
    const destination = this.resolveSafe(input.path);
    await fs.mkdir(dirname(destination), { recursive: true });
    await pipeline(input.stream, createWriteStream(destination));
  }

  async delete(path: string): Promise<void> {
    const destination = this.resolveSafe(path);
    await fs.rm(destination, { force: true });
  }

  async get(path: string): Promise<Readable> {
    const destination = this.resolveSafe(path);
    return createReadStream(destination);
  }
}
