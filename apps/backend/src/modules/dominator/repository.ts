import { Prisma, type MediaFile } from "@prisma/client";
import { prisma } from "../../config/prisma.js";

interface CreateAdminAccessTokenInput {
  jtiHash: string;
  userId: string;
  superuserEmail: string;
  expiresAt: Date;
  ipAddress?: string;
  userAgent?: string;
}

interface CreateAdminSessionInput {
  sessionTokenHash: string;
  userId: string;
  superuserEmail: string;
  expiresAt: Date;
  ipAddress?: string;
  userAgent?: string;
}

interface LogAdminAuditInput {
  superuserEmail: string;
  action: string;
  status: string;
  ipAddress?: string;
  userAgent?: string;
  targetUserId?: string;
  details?: Prisma.InputJsonValue;
}

export class DominatorRepository {
  async createAdminAccessToken(input: CreateAdminAccessTokenInput): Promise<void> {
    await prisma.adminAccessToken.create({
      data: {
        jtiHash: input.jtiHash,
        userId: input.userId,
        superuserEmail: input.superuserEmail,
        expiresAt: input.expiresAt,
        ipAddress: input.ipAddress,
        userAgent: input.userAgent
      }
    });
  }

  async consumeAdminAccessTokenAndIssueChallenge(input: {
    jtiHash: string;
    userId: string;
    challengeHash: string;
    challengeExpiresAt: Date;
  }): Promise<boolean> {
    return prisma.$transaction(async (tx) => {
      const token = await tx.adminAccessToken.findUnique({
        where: {
          jtiHash: input.jtiHash
        },
        select: {
          id: true,
          userId: true,
          expiresAt: true,
          consumedAt: true
        }
      });

      if (!token) {
        return false;
      }

      if (token.userId !== input.userId || token.consumedAt || token.expiresAt.getTime() <= Date.now()) {
        return false;
      }

      await tx.adminAccessToken.update({
        where: {
          id: token.id
        },
        data: {
          consumedAt: new Date(),
          challengeHash: input.challengeHash,
          challengeExpiresAt: input.challengeExpiresAt
        }
      });

      return true;
    });
  }

  async consumeChallenge(challengeHash: string, userId: string): Promise<boolean> {
    return prisma.$transaction(async (tx) => {
      const token = await tx.adminAccessToken.findUnique({
        where: {
          challengeHash
        },
        select: {
          id: true,
          userId: true,
          challengeUsedAt: true,
          challengeExpiresAt: true
        }
      });

      if (!token) {
        return false;
      }

      if (token.userId !== userId || token.challengeUsedAt || !token.challengeExpiresAt || token.challengeExpiresAt.getTime() <= Date.now()) {
        return false;
      }

      await tx.adminAccessToken.update({
        where: {
          id: token.id
        },
        data: {
          challengeUsedAt: new Date()
        }
      });

      return true;
    });
  }

  async createAdminSession(input: CreateAdminSessionInput): Promise<void> {
    await prisma.adminSession.create({
      data: {
        sessionTokenHash: input.sessionTokenHash,
        userId: input.userId,
        superuserEmail: input.superuserEmail,
        expiresAt: input.expiresAt,
        ipAddress: input.ipAddress,
        userAgent: input.userAgent
      }
    });
  }

  async findActiveAdminSessionByTokenHash(sessionTokenHash: string): Promise<{
    id: string;
    userId: string;
    superuserEmail: string;
    expiresAt: Date;
  } | null> {
    return prisma.adminSession.findFirst({
      where: {
        sessionTokenHash,
        revokedAt: null,
        expiresAt: {
          gt: new Date()
        }
      },
      select: {
        id: true,
        userId: true,
        superuserEmail: true,
        expiresAt: true
      }
    });
  }

  async touchAdminSession(sessionId: string): Promise<void> {
    await prisma.adminSession.update({
      where: {
        id: sessionId
      },
      data: {
        lastActivityAt: new Date()
      }
    });
  }

  async revokeAdminSessionByTokenHash(sessionTokenHash: string): Promise<void> {
    await prisma.adminSession.updateMany({
      where: {
        sessionTokenHash,
        revokedAt: null
      },
      data: {
        revokedAt: new Date(),
        revokeReason: "manual_revoke"
      }
    });
  }

  async countFailedAdminLoginsSince(ipAddress: string | undefined, since: Date): Promise<number> {
    if (!ipAddress) {
      return 0;
    }

    return prisma.adminAuditLog.count({
      where: {
        action: "admin_login",
        status: "failed",
        ipAddress,
        createdAt: {
          gte: since
        }
      }
    });
  }

  async logAdminAudit(input: LogAdminAuditInput): Promise<void> {
    await prisma.adminAuditLog.create({
      data: {
        superuserEmail: input.superuserEmail,
        action: input.action,
        status: input.status,
        ipAddress: input.ipAddress,
        userAgent: input.userAgent,
        targetUserId: input.targetUserId,
        details: input.details
      }
    });
  }

  async getAuditLogs(limit: number): Promise<Array<{
    id: string;
    action: string;
    status: string;
    ipAddress: string | null;
    targetUserId: string | null;
    createdAt: Date;
  }>> {
    return prisma.adminAuditLog.findMany({
      orderBy: {
        createdAt: "desc"
      },
      take: limit,
      select: {
        id: true,
        action: true,
        status: true,
        ipAddress: true,
        targetUserId: true,
        createdAt: true
      }
    });
  }

  async getPlatformMetrics(now: Date): Promise<{
    totalRegisteredUsers: number;
    totalGuestUsers: number;
    totalGuestUsersTillDate: number;
    totalUsersOverall: number;
    totalUsersTillDate: number;
    activeLoggedInUsers: number;
    activeGuests: number;
    totalUploadedFiles: number;
    totalActiveSharedLinks: number;
    totalStorageBytes: bigint;
    totalImageBytes: bigint;
    totalVideoBytes: bigint;
    totalDocumentBytes: bigint;
    totalOtherBytes: bigint;
    activeSessions: number;
    recentUploadsCount: number;
    recentRegistrationsCount: number;
  }> {
    const fiveMinutesAgo = new Date(now.getTime() - 5 * 60 * 1000);
    const dayAgo = new Date(now.getTime() - 24 * 60 * 60 * 1000);
    const currentGuestWhere = {
      OR: [
        {
          expiresAt: {
            gt: now
          }
        },
        {
          expiresAt: null,
          updatedAt: {
            gte: fiveMinutesAgo
          }
        }
      ]
    };
    const activeGuestWhere = {
      ...currentGuestWhere,
      updatedAt: {
        gte: fiveMinutesAgo
      }
    };

    const [
      totalRegisteredUsers,
      totalGuestUsersTillDate,
      totalGuestUsers,
      activeLoggedInUsers,
      activeGuests,
      totalUploadedFiles,
      totalActiveSharedLinks,
      totalStorageAggregate,
      imageStorageAggregate,
      videoStorageAggregate,
      documentStorageAggregate,
      otherStorageAggregate,
      activeSessions,
      recentUploadsCount,
      recentRegistrationsCount
    ] = await Promise.all([
      prisma.user.count(),
      prisma.guestSession.count(),
      prisma.guestSession.count({ where: currentGuestWhere }),
      prisma.loginSession.findMany({
        where: {
          revokedAt: null,
          expiresAt: {
            gt: now
          },
          lastActivityAt: {
            gte: fiveMinutesAgo
          }
        },
        distinct: ["userId"],
        select: {
          userId: true
        }
      }).then((items) => items.length),
      prisma.guestSession.count({ where: activeGuestWhere }),
      prisma.mediaFile.count(),
      prisma.batchShareToken.count({
        where: {
          expiresAt: {
            gt: now
          }
        }
      }),
      prisma.mediaFile.aggregate({
        _sum: {
          sizeBytes: true
        }
      }),
      prisma.mediaFile.aggregate({
        where: {
          mimeType: {
            startsWith: "image/"
          }
        },
        _sum: {
          sizeBytes: true
        }
      }),
      prisma.mediaFile.aggregate({
        where: {
          mimeType: {
            startsWith: "video/"
          }
        },
        _sum: {
          sizeBytes: true
        }
      }),
      prisma.mediaFile.aggregate({
        where: {
          OR: [
            { mimeType: { startsWith: "application/" } },
            { mimeType: { startsWith: "text/" } }
          ]
        },
        _sum: {
          sizeBytes: true
        }
      }),
      prisma.mediaFile.aggregate({
        where: {
          AND: [
            { mimeType: { not: { startsWith: "image/" } } },
            { mimeType: { not: { startsWith: "video/" } } },
            { mimeType: { not: { startsWith: "application/" } } },
            { mimeType: { not: { startsWith: "text/" } } }
          ]
        },
        _sum: {
          sizeBytes: true
        }
      }),
      prisma.loginSession.count({
        where: {
          revokedAt: null,
          expiresAt: {
            gt: now
          }
        }
      }),
      prisma.mediaFile.count({
        where: {
          createdAt: {
            gte: dayAgo
          }
        }
      }),
      prisma.user.count({
        where: {
          createdAt: {
            gte: dayAgo
          }
        }
      })
    ]);

    return {
      totalRegisteredUsers,
      totalGuestUsers,
      totalGuestUsersTillDate,
      totalUsersOverall: totalRegisteredUsers + totalGuestUsers,
      totalUsersTillDate: totalRegisteredUsers + totalGuestUsersTillDate,
      activeLoggedInUsers,
      activeGuests,
      totalUploadedFiles,
      totalActiveSharedLinks,
      totalStorageBytes: totalStorageAggregate._sum.sizeBytes ?? 0n,
      totalImageBytes: imageStorageAggregate._sum.sizeBytes ?? 0n,
      totalVideoBytes: videoStorageAggregate._sum.sizeBytes ?? 0n,
      totalDocumentBytes: documentStorageAggregate._sum.sizeBytes ?? 0n,
      totalOtherBytes: otherStorageAggregate._sum.sizeBytes ?? 0n,
      activeSessions,
      recentUploadsCount,
      recentRegistrationsCount
    };
  }

  async getDatabaseSizeBytes(): Promise<bigint> {
    const result = await prisma.$queryRaw<Array<{ size: bigint }>>`SELECT pg_database_size(current_database())::bigint AS size`;
    return result[0]?.size ?? 0n;
  }

  async searchUsers(query: string | undefined, skip: number, take: number): Promise<{ total: number; items: Array<{ id: string; email: string; name: string | null; createdAt: Date; }> }> {
    const where = query
      ? {
          OR: [
            { email: { contains: query, mode: "insensitive" as const } },
            { name: { contains: query, mode: "insensitive" as const } }
          ]
        }
      : {};

    const [total, items] = await Promise.all([
      prisma.user.count({ where }),
      prisma.user.findMany({
        where,
        orderBy: {
          createdAt: "desc"
        },
        skip,
        take,
        select: {
          id: true,
          email: true,
          name: true,
          createdAt: true
        }
      })
    ]);

    return { total, items };
  }

  async getUserDetails(userId: string): Promise<{
    id: string;
    email: string;
    name: string | null;
    createdAt: Date;
    storageBytes: bigint;
    uploadedFilesCount: number;
    activeLinksCount: number;
    lastLoginAt: Date | null;
    ipHistory: string[];
    accountType: string;
  } | null> {
    const user = await prisma.user.findUnique({
      where: {
        id: userId
      },
      select: {
        id: true,
        email: true,
        name: true,
        createdAt: true,
        accountType: true,
        mediaFiles: {
          where: {
            ownerType: "USER"
          },
          select: {
            sizeBytes: true
          }
        },
        loginSessions: {
          orderBy: {
            lastActivityAt: "desc"
          },
          take: 20,
          select: {
            lastActivityAt: true,
            ipAddress: true
          }
        }
      }
    });

    if (!user) {
      return null;
    }

    const [uploadedFilesCount, activeBatchLinksCount] = await Promise.all([
      prisma.mediaFile.count({
        where: {
          ownerType: "USER",
          userId
        }
      }),
      prisma.batchShareToken.count({
        where: {
          batch: {
            userId
          },
          expiresAt: {
            gt: new Date()
          }
        }
      })
    ]);

    const storageBytes = user.mediaFiles.reduce((sum, media) => sum + media.sizeBytes, 0n);
    const lastLoginAt = user.loginSessions[0]?.lastActivityAt ?? null;
    const ipHistory = Array.from(new Set(user.loginSessions.map((session) => session.ipAddress).filter((item): item is string => Boolean(item)))).slice(0, 20);

    return {
      id: user.id,
      email: user.email,
      name: user.name,
      createdAt: user.createdAt,
      storageBytes,
      uploadedFilesCount,
      activeLinksCount: activeBatchLinksCount,
      lastLoginAt,
      ipHistory,
      accountType: user.accountType
    };
  }

  async listUserFiles(userId: string, skip: number, take: number): Promise<{ total: number; items: Array<Pick<MediaFile, "id" | "filename" | "mimeType" | "sizeBytes" | "createdAt" | "expiresAt" | "isActive">> }> {
    const where = {
      ownerType: "USER" as const,
      userId
    };

    const [total, items] = await Promise.all([
      prisma.mediaFile.count({ where }),
      prisma.mediaFile.findMany({
        where,
        orderBy: {
          createdAt: "desc"
        },
        skip,
        take,
        select: {
          id: true,
          filename: true,
          mimeType: true,
          sizeBytes: true,
          createdAt: true,
          expiresAt: true,
          isActive: true
        }
      })
    ]);

    return { total, items };
  }

  async getMediaStoragePaths(mediaId: string): Promise<string[] | null> {
    const media = await prisma.mediaFile.findUnique({
      where: {
        id: mediaId
      },
      select: {
        id: true,
        storagePath: true,
        versions: {
          select: {
            storagePath: true
          }
        }
      }
    });

    if (!media) {
      return null;
    }

    const unique = new Set<string>([media.storagePath, ...media.versions.map((version) => version.storagePath)]);
    return Array.from(unique);
  }

  async deleteMediaById(mediaId: string): Promise<boolean> {
    const result = await prisma.mediaFile.deleteMany({
      where: {
        id: mediaId
      }
    });

    return result.count > 0;
  }

  async listOwnedStoragePaths(userId: string): Promise<string[]> {
    const mediaFiles = await prisma.mediaFile.findMany({
      where: {
        ownerType: "USER",
        userId
      },
      select: {
        storagePath: true,
        versions: {
          select: {
            storagePath: true
          }
        }
      }
    });

    const paths = new Set<string>();
    for (const media of mediaFiles) {
      paths.add(media.storagePath);
      for (const version of media.versions) {
        paths.add(version.storagePath);
      }
    }

    return Array.from(paths);
  }

  async deleteUserCascade(userId: string): Promise<boolean> {
    return prisma.$transaction(async (tx) => {
      const user = await tx.user.findUnique({
        where: {
          id: userId
        },
        select: {
          id: true
        }
      });

      if (!user) {
        return false;
      }

      await tx.loginSession.updateMany({
        where: {
          userId,
          revokedAt: null
        },
        data: {
          revokedAt: new Date(),
          revokeReason: "dominator_user_delete"
        }
      });

      await tx.mediaBatch.deleteMany({
        where: {
          ownerType: "USER",
          userId
        }
      });

      await tx.mediaFile.deleteMany({
        where: {
          ownerType: "USER",
          userId
        }
      });

      await tx.user.delete({
        where: {
          id: userId
        }
      });

      return true;
    });
  }

  async listStoragePathsByOwnerType(ownerType: "USER" | "GUEST"): Promise<string[]> {
    const mediaFiles = await prisma.mediaFile.findMany({
      where: {
        ownerType
      },
      select: {
        storagePath: true,
        versions: {
          select: {
            storagePath: true
          }
        }
      }
    });

    const paths = new Set<string>();
    for (const media of mediaFiles) {
      paths.add(media.storagePath);
      for (const version of media.versions) {
        paths.add(version.storagePath);
      }
    }

    return Array.from(paths);
  }

  async listV2UploadStoragePaths(scope: "guests" | "registered"): Promise<string[]> {
    const uploads = await prisma.v2Upload.findMany({
      where:
        scope === "guests"
          ? {
              userId: {
                startsWith: "guest:"
              }
            }
          : {
              NOT: {
                userId: {
                  startsWith: "guest:"
                }
              }
            },
      select: {
        s3Bucket: true,
        s3Key: true
      }
    });

    return uploads
      .map((upload) => {
        if (!upload.s3Bucket || !upload.s3Key) {
          return null;
        }

        return `s3://${upload.s3Bucket}/${upload.s3Key}`;
      })
      .filter((value): value is string => Boolean(value));
  }

  async clearGuestStorageData(): Promise<{ batchesDeleted: number; mediaDeleted: number; guestSessionsDeleted: number; v2UploadsDeleted: number }> {
    return prisma.$transaction(async (tx) => {
      const [batchesDeleted, mediaDeleted, guestSessionsDeleted, v2UploadsDeleted] = await Promise.all([
        tx.mediaBatch.deleteMany({
          where: {
            ownerType: "GUEST"
          }
        }),
        tx.mediaFile.deleteMany({
          where: {
            ownerType: "GUEST"
          }
        }),
        tx.guestSession.deleteMany({}),
        tx.v2Upload.deleteMany({
          where: {
            userId: {
              startsWith: "guest:"
            }
          }
        })
      ]);

      return {
        batchesDeleted: batchesDeleted.count,
        mediaDeleted: mediaDeleted.count,
        guestSessionsDeleted: guestSessionsDeleted.count,
        v2UploadsDeleted: v2UploadsDeleted.count
      };
    });
  }

  async clearRegisteredUserStorageData(): Promise<{ batchesDeleted: number; mediaDeleted: number; v2UploadsDeleted: number }> {
    return prisma.$transaction(async (tx) => {
      const [batchesDeleted, mediaDeleted, v2UploadsDeleted] = await Promise.all([
        tx.mediaBatch.deleteMany({
          where: {
            ownerType: "USER"
          }
        }),
        tx.mediaFile.deleteMany({
          where: {
            ownerType: "USER"
          }
        }),
        tx.v2Upload.deleteMany({
          where: {
            NOT: {
              userId: {
                startsWith: "guest:"
              }
            }
          }
        })
      ]);

      return {
        batchesDeleted: batchesDeleted.count,
        mediaDeleted: mediaDeleted.count,
        v2UploadsDeleted: v2UploadsDeleted.count
      };
    });
  }

  async getLiveActivity(now: Date): Promise<{
    onlineUsers: number;
    uploadingUsers: number;
    activeSessions: number;
    activeGuests: number;
  }> {
    const fiveMinutesAgo = new Date(now.getTime() - 5 * 60 * 1000);

    const [onlineUsers, uploadingUsers, activeSessions, activeGuests] = await Promise.all([
      prisma.loginSession.findMany({
        where: {
          revokedAt: null,
          expiresAt: {
            gt: now
          },
          lastActivityAt: {
            gte: fiveMinutesAgo
          }
        },
        distinct: ["userId"],
        select: {
          userId: true
        }
      }).then((items) => items.length),
      prisma.v2Upload.findMany({
        where: {
          status: "UPLOADING",
          createdAt: {
            gte: fiveMinutesAgo
          }
        },
        distinct: ["userId"],
        select: {
          userId: true
        }
      }).then((items) => items.length),
      prisma.loginSession.count({
        where: {
          revokedAt: null,
          expiresAt: {
            gt: now
          }
        }
      }),
      prisma.guestSession.count({
        where: {
          OR: [
            {
              expiresAt: {
                gt: now
              }
            },
            {
              expiresAt: null
            }
          ],
          updatedAt: {
            gte: fiveMinutesAgo
          }
        }
      })
    ]);

    return {
      onlineUsers,
      uploadingUsers,
      activeSessions,
      activeGuests
    };
  }
}
