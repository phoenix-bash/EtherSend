import { describe, expect, it } from "vitest";
import { isMimeTypeAllowed, resolveAllowedMimePatterns, sanitizeFileName, sanitizePathSegment } from "../validation.js";

describe("v2 upload validation helpers", () => {
  it("allows wildcard mime patterns", () => {
    const patterns = resolveAllowedMimePatterns("image/*,application/pdf");

    expect(isMimeTypeAllowed("image/png", patterns)).toBe(true);
    expect(isMimeTypeAllowed("application/pdf", patterns)).toBe(true);
    expect(isMimeTypeAllowed("video/mp4", patterns)).toBe(false);
  });

  it("supports allow-all mime mode", () => {
    expect(isMimeTypeAllowed("application/octet-stream", ["*/*"])).toBe(true);
  });

  it("sanitizes path segments and file names", () => {
    expect(sanitizePathSegment(" guest user /#1 ")).toBe("guest-user-1");
    expect(sanitizeFileName("  ")).toBe("file");
  });
});
