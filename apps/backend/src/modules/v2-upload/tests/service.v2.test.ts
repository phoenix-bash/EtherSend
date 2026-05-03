import { describe, expect, it, vi } from "vitest";
import { V2UploadService } from "../service.js";

describe("V2UploadService", () => {
  it("uses direct upload for files below 10MB", async () => {
    const repository = {
      create: vi.fn(async (input) => ({ ...input, fileSize: BigInt(input.fileSize) }))
    };
    const s3Service = {
      buildObjectKey: vi.fn(() => "uploads/user/file-id/file.bin"),
      createDirectUploadUrl: vi.fn(async () => "https://signed-direct"),
      createMultipartUpload: vi.fn(),
      createMultipartPartUrls: vi.fn()
    };
    const guestService = {
      assertGuestCanUpload: vi.fn(async () => undefined)
    };
    const mediaRepository = {
      findById: vi.fn()
    };

    const service = new V2UploadService(
      repository as never,
      s3Service as never,
      guestService as never,
      mediaRepository as never
    );

    const result = await service.initUpload(
      {
        fileName: "file.bin",
        fileSize: 8 * 1024 * 1024,
        mimeType: "application/octet-stream"
      },
      {
        userId: "guest-session-1",
        isGuest: true,
        guestSessionId: "guest-session-1"
      }
    );

    expect(result.useMultipart).toBe(false);
    expect(repository.create).toHaveBeenCalledOnce();
    expect(s3Service.createDirectUploadUrl).toHaveBeenCalledOnce();
    expect(s3Service.createMultipartUpload).not.toHaveBeenCalled();
  });

  it("uses multipart upload for files at or above 10MB", async () => {
    const repository = {
      create: vi.fn(async (input) => ({ ...input, fileSize: BigInt(input.fileSize) }))
    };
    const s3Service = {
      buildObjectKey: vi.fn(() => "uploads/user/file-id/video.mp4"),
      createDirectUploadUrl: vi.fn(),
      createMultipartUpload: vi.fn(async () => "upload-123"),
      createMultipartPartUrls: vi.fn(async () => ["https://signed-part-1", "https://signed-part-2"])
    };
    const guestService = {
      assertGuestCanUpload: vi.fn(async () => undefined)
    };
    const mediaRepository = {
      findById: vi.fn()
    };

    const service = new V2UploadService(
      repository as never,
      s3Service as never,
      guestService as never,
      mediaRepository as never
    );

    const result = await service.initUpload(
      {
        fileName: "video.mp4",
        fileSize: 12 * 1024 * 1024,
        mimeType: "video/mp4"
      },
      {
        userId: "guest-session-1",
        isGuest: true,
        guestSessionId: "guest-session-1"
      }
    );

    expect(result.useMultipart).toBe(true);
    expect(result.uploadId).toBe("upload-123");
    expect(repository.create).toHaveBeenCalledOnce();
    expect(s3Service.createDirectUploadUrl).not.toHaveBeenCalled();
    expect(s3Service.createMultipartUpload).toHaveBeenCalledOnce();
    expect(s3Service.createMultipartPartUrls).toHaveBeenCalledOnce();
  });
});
