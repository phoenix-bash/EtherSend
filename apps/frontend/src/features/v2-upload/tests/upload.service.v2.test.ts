import { describe, expect, it } from "vitest";
import { buildFileFingerprint, normalizeUploadError } from "../services/upload.service";

describe("v2 upload service helpers", () => {
  it("builds a stable file fingerprint", () => {
    const file = new File(["hello"], "demo.txt", {
      type: "text/plain",
      lastModified: 1700000000000
    });

    expect(buildFileFingerprint(file)).toBe("demo.txt:5:text/plain:1700000000000");
  });

  it("normalizes unknown errors", () => {
    expect(normalizeUploadError(new Error("boom"))).toBe("boom");
    expect(normalizeUploadError("oops")).toBe("Upload failed.");
  });
});
