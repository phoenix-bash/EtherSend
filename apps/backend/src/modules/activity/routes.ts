import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { prisma } from "../../config/prisma.js";
import { ensureGuestSession } from "../../middlewares/guest-session.js";

const activityQuerySchema = z.object({
  limit: z.coerce.number().int().min(1).max(100).optional()
});

type Actor =
  | { kind: "user"; userId: string; role: "ADMIN" | "USER" }
  | { kind: "guest"; guestSessionId: string; requestStartMs: number };

type ActivityItem = {
  id: string;
  kind: "asset_uploaded" | "batch_shared" | "batch_viewed";
  message: string;
  level: "info" | "success" | "warning";
  createdAt: Date;
};

async function resolveActor(
  app: FastifyInstance,
  request: {
    headers: Record<string, unknown>;
    cookies: Record<string, string | undefined>;
    jwtVerify: () => Promise<void>;
    user?: { sub: string; role: "ADMIN" | "USER" };
  }
): Promise<Actor> {
  if (request.headers.authorization) {
    try {
      await request.jwtVerify();
      return {
        kind: "user",
        userId: request.user?.sub ?? "",
        role: request.user?.role ?? "USER"
      };
    } catch {
      // Fallback to cookie/guest actor when bearer token is invalid.
    }
  }

  const cookieToken = request.cookies.lf_access_token;
  if (cookieToken) {
    try {
      const payload = app.jwt.verify(cookieToken) as { sub: string; role: "ADMIN" | "USER" };
      return {
        kind: "user",
        userId: payload.sub,
        role: payload.role
      };
    } catch {
      // Invalid auth cookies should not block guest activity lookups.
    }
  }

  return {
    kind: "guest",
    guestSessionId: String(request.headers["x-guest-session-id"] ?? ""),
    requestStartMs: Date.now()
  };
}

function mediaWhereForActor(actor: Actor) {
  if (actor.kind === "user") {
    if (actor.role === "ADMIN") {
      return undefined;
    }

    return {
      ownerType: "USER" as const,
      userId: actor.userId
    };
  }

  return {
    ownerType: "GUEST" as const,
    guestSessionId: actor.guestSessionId,
    expiresAt: {
      gte: new Date(actor.requestStartMs)
    }
  };
}

function batchWhereForActor(actor: Actor) {
  if (actor.kind === "user") {
    if (actor.role === "ADMIN") {
      return {
        shareToken: {
          isNot: null
        }
      };
    }

    return {
      ownerType: "USER" as const,
      userId: actor.userId,
      shareToken: {
        isNot: null
      }
    };
  }

  return {
    ownerType: "GUEST" as const,
    guestSessionId: actor.guestSessionId,
    shareToken: {
      isNot: null
    }
  };
}

export async function registerActivityRoutes(app: FastifyInstance): Promise<void> {
  app.get(
    "/activity",
    {
      preHandler: [ensureGuestSession],
      config: {
        rateLimit: {
          max: 60,
          timeWindow: "1 minute"
        }
      }
    },
    async (request, reply) => {
      const parsedQuery = activityQuerySchema.safeParse(request.query ?? {});
      if (!parsedQuery.success) {
        return reply.status(400).send({ error: "Invalid query", details: parsedQuery.error.flatten() });
      }

      const limit = parsedQuery.data.limit ?? 20;
      const actor = await resolveActor(app, request);

    const mediaWhere = mediaWhereForActor(actor);

    const [recentMedia, sharedBatches] = await Promise.all([
      prisma.mediaFile.findMany({
        where: mediaWhere,
        select: {
          id: true,
          filename: true,
          createdAt: true
        },
        orderBy: {
          createdAt: "desc"
        },
        take: Math.max(80, limit * 3)
      }),
      prisma.mediaBatch.findMany({
        where: batchWhereForActor(actor),
        include: {
          shareToken: true,
          _count: {
            select: {
              items: true
            }
          }
        },
        orderBy: {
          createdAt: "desc"
        },
        take: Math.max(60, limit * 2)
      })
    ]);

    const mediaNameById = new Map(recentMedia.map((media) => [media.id, media.filename]));
    const mediaIds = recentMedia.map((media) => media.id);

    const shareViews = mediaIds.length
      ? await prisma.accessLog.findMany({
          where: {
            action: "BATCH_SHARE_VIEW",
            mediaFileId: {
              in: mediaIds
            }
          },
          orderBy: {
            createdAt: "desc"
          },
          take: Math.max(80, limit * 3)
        })
      : [];

    const uploadActivity: ActivityItem[] = recentMedia.map((media) => ({
      id: `upload-${media.id}`,
      kind: "asset_uploaded",
      message: `Asset uploaded: ${media.filename}`,
      level: "success",
      createdAt: media.createdAt
    }));

    const batchActivity: ActivityItem[] = sharedBatches
      .filter((batch) => Boolean(batch.shareToken))
      .map((batch) => {
        const batchName = batch.name?.trim() || `Batch ${batch.id.slice(0, 8)}`;
        const itemCount = batch._count.items;

        return {
          id: `batch-share-${batch.id}`,
          kind: "batch_shared",
          message: `Batch shared: ${batchName} (${itemCount} asset${itemCount === 1 ? "" : "s"})`,
          level: "info" as const,
          createdAt: batch.shareToken!.updatedAt
        };
      });

    const shareViewActivity: ActivityItem[] = shareViews.map((entry) => {
      const filename = entry.mediaFileId ? mediaNameById.get(entry.mediaFileId) : undefined;

      return {
        id: `batch-view-${entry.id}`,
        kind: "batch_viewed",
        message: filename
          ? `Batch viewed by another user: ${filename}`
          : "Batch viewed by another user",
        level: "warning",
        createdAt: entry.createdAt
      };
    });

    const items = [...uploadActivity, ...batchActivity, ...shareViewActivity]
      .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime())
      .slice(0, limit)
      .map((item) => ({
        id: item.id,
        kind: item.kind,
        message: item.message,
        level: item.level,
        createdAt: item.createdAt
      }));

      return { items };
    }
  );
}
