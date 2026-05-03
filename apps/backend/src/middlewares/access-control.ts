import { prisma } from "../config/prisma.js";
import { HttpError } from "../utils/http-error.js";

export async function enforceMediaAccess(mediaId: string, intent: "view" | "download"): Promise<void> {
  const media = await prisma.mediaFile.findUnique({ where: { id: mediaId } });

  if (!media) {
    throw new HttpError(404, "Media not found");
  }

  if (!media.isActive) {
    throw new HttpError(403, "Media link is disabled");
  }

  if (media.expiresAt && media.expiresAt.getTime() <= Date.now()) {
    throw new HttpError(410, "Media link has expired");
  }

  if (intent === "download" && !media.allowDownload) {
    throw new HttpError(403, "Download not allowed for this media");
  }
}
