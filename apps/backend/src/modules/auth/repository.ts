import { AuthProvider, Prisma, type LoginSession, type User } from "@prisma/client";
import { prisma } from "../../config/prisma.js";

interface UpsertIdentityInput {
  provider: AuthProvider;
  providerSubjectId: string;
  email: string;
  name?: string;
}

interface CreateEmailUserInput {
  email: string;
  name?: string;
  passwordHash: string;
  emailVerificationTokenHash: string;
  emailVerificationTokenExpiresAt: Date;
}

interface UpdateEmailSignupInput {
  userId: string;
  email: string;
  name?: string;
  passwordHash: string;
  emailVerificationTokenHash: string;
  emailVerificationTokenExpiresAt: Date;
}

export interface CreateLoginSessionInput {
  id: string;
  userId: string;
  refreshTokenHash: string;
  expiresAt: Date;
  ipAddress?: string;
  userAgent?: string;
  browser?: string;
  os?: string;
  deviceType?: string;
  deviceModel?: string;
}

export class AuthRepository {
  async findUserByIdentity(provider: AuthProvider, providerSubjectId: string): Promise<User | null> {
    const identity = await prisma.userIdentity.findUnique({
      where: {
        provider_providerSubjectId: {
          provider,
          providerSubjectId
        }
      },
      include: {
        user: true
      }
    });

    return identity?.user ?? null;
  }

  async upsertUserAndIdentity(input: UpsertIdentityInput): Promise<User> {
    const existingByIdentity = await prisma.userIdentity.findUnique({
      where: {
        provider_providerSubjectId: {
          provider: input.provider,
          providerSubjectId: input.providerSubjectId
        }
      },
      include: {
        user: true
      }
    });

    if (existingByIdentity) {
      return prisma.user.update({
        where: {
          id: existingByIdentity.user.id
        },
        data: {
          name: input.name,
          emailVerifiedAt: existingByIdentity.user.emailVerifiedAt ?? new Date()
        }
      });
    }

    const user = await prisma.user.upsert({
      where: {
        email: input.email
      },
      update: {
        name: input.name,
        emailVerifiedAt: new Date()
      },
      create: {
        email: input.email,
        name: input.name,
        emailVerifiedAt: new Date(),
        identities: {
          create: {
            provider: input.provider,
            providerSubjectId: input.providerSubjectId
          }
        }
      }
    });

    await prisma.userIdentity.upsert({
      where: {
        provider_providerSubjectId: {
          provider: input.provider,
          providerSubjectId: input.providerSubjectId
        }
      },
      update: {
        userId: user.id
      },
      create: {
        userId: user.id,
        provider: input.provider,
        providerSubjectId: input.providerSubjectId
      }
    });

    return user;
  }

  async findUserByEmail(email: string): Promise<User | null> {
    return prisma.user.findUnique({
      where: {
        email
      }
    });
  }

  async findUserById(userId: string): Promise<User | null> {
    return prisma.user.findUnique({
      where: {
        id: userId
      }
    });
  }

  async createEmailUser(input: CreateEmailUserInput): Promise<User> {
    return prisma.user.create({
      data: {
        email: input.email,
        name: input.name,
        passwordHash: input.passwordHash,
        emailVerificationTokenHash: input.emailVerificationTokenHash,
        emailVerificationTokenExpiresAt: input.emailVerificationTokenExpiresAt,
        identities: {
          create: {
            provider: "EMAIL",
            providerSubjectId: input.email
          }
        }
      }
    });
  }

  async updateEmailSignupForUser(input: UpdateEmailSignupInput): Promise<User> {
    const user = await prisma.user.update({
      where: {
        id: input.userId
      },
      data: {
        name: input.name,
        passwordHash: input.passwordHash,
        emailVerifiedAt: null,
        emailVerificationTokenHash: input.emailVerificationTokenHash,
        emailVerificationTokenExpiresAt: input.emailVerificationTokenExpiresAt
      }
    });

    await prisma.userIdentity.upsert({
      where: {
        provider_providerSubjectId: {
          provider: "EMAIL",
          providerSubjectId: input.email
        }
      },
      update: {
        userId: user.id
      },
      create: {
        userId: user.id,
        provider: "EMAIL",
        providerSubjectId: input.email
      }
    });

    return user;
  }

  async findUserByEmailVerificationTokenHash(tokenHash: string): Promise<User | null> {
    return prisma.user.findFirst({
      where: {
        emailVerificationTokenHash: tokenHash,
        emailVerificationTokenExpiresAt: {
          gt: new Date()
        }
      }
    });
  }

  async markEmailVerified(userId: string): Promise<User> {
    return prisma.user.update({
      where: {
        id: userId
      },
      data: {
        emailVerifiedAt: new Date(),
        emailVerificationTokenHash: null,
        emailVerificationTokenExpiresAt: null
      }
    });
  }

  async storePasswordResetToken(userId: string, tokenHash: string, expiresAt: Date): Promise<void> {
    await prisma.user.update({
      where: {
        id: userId
      },
      data: {
        passwordResetTokenHash: tokenHash,
        passwordResetTokenExpiresAt: expiresAt
      }
    });
  }

  async findUserByPasswordResetTokenHash(tokenHash: string): Promise<User | null> {
    return prisma.user.findFirst({
      where: {
        passwordResetTokenHash: tokenHash,
        passwordResetTokenExpiresAt: {
          gt: new Date()
        }
      }
    });
  }

  async updatePasswordAfterReset(userId: string, passwordHash: string): Promise<void> {
    await prisma.user.update({
      where: {
        id: userId
      },
      data: {
        passwordHash,
        passwordResetRequiredAt: null,
        passwordResetTokenHash: null,
        passwordResetTokenExpiresAt: null
      }
    });
  }

  async markPasswordResetRequired(userId: string): Promise<void> {
    await prisma.user.update({
      where: {
        id: userId
      },
      data: {
        passwordResetRequiredAt: new Date()
      }
    });
  }

  async clearPasswordResetRequired(userId: string): Promise<void> {
    await prisma.user.update({
      where: {
        id: userId
      },
      data: {
        passwordResetRequiredAt: null
      }
    });
  }

  async storeAccountDeletionCode(userId: string, tokenHash: string, expiresAt: Date): Promise<void> {
    const data: Record<string, unknown> = {
      accountDeletionCodeHash: tokenHash,
      accountDeletionCodeExpiresAt: expiresAt
    };

    await prisma.user.update({
      where: {
        id: userId
      },
      data: data as Prisma.UserUncheckedUpdateInput
    });
  }

  async clearAccountDeletionCode(userId: string): Promise<void> {
    const data: Record<string, unknown> = {
      accountDeletionCodeHash: null,
      accountDeletionCodeExpiresAt: null
    };

    await prisma.user.update({
      where: {
        id: userId
      },
      data: data as Prisma.UserUncheckedUpdateInput
    });
  }

  async createLoginSession(input: CreateLoginSessionInput): Promise<LoginSession> {
    return prisma.loginSession.create({
      data: {
        id: input.id,
        userId: input.userId,
        refreshTokenHash: input.refreshTokenHash,
        expiresAt: input.expiresAt,
        ipAddress: input.ipAddress,
        userAgent: input.userAgent,
        browser: input.browser,
        os: input.os,
        deviceType: input.deviceType,
        deviceModel: input.deviceModel
      }
    });
  }

  async countActiveSessions(userId: string): Promise<number> {
    return prisma.loginSession.count({
      where: {
        userId,
        revokedAt: null,
        expiresAt: {
          gt: new Date()
        }
      }
    });
  }

  async findActiveSessionById(sessionId: string): Promise<LoginSession | null> {
    return prisma.loginSession.findFirst({
      where: {
        id: sessionId,
        revokedAt: null,
        expiresAt: {
          gt: new Date()
        }
      }
    });
  }

  async listActiveSessionsByUser(userId: string): Promise<LoginSession[]> {
    return prisma.loginSession.findMany({
      where: {
        userId,
        revokedAt: null,
        expiresAt: {
          gt: new Date()
        }
      },
      orderBy: {
        lastActivityAt: "desc"
      }
    });
  }

  async touchSession(input: { sessionId: string; expiresAt: Date; refreshTokenHash?: string }): Promise<void> {
    const data: { lastActivityAt: Date; expiresAt: Date; refreshTokenHash?: string } = {
      lastActivityAt: new Date(),
      expiresAt: input.expiresAt
    };

    if (input.refreshTokenHash) {
      data.refreshTokenHash = input.refreshTokenHash;
    }

    await prisma.loginSession.updateMany({
      where: {
        id: input.sessionId,
        revokedAt: null
      },
      data
    });
  }

  async revokeSession(userId: string, sessionId: string, reason: string): Promise<boolean> {
    const result = await prisma.loginSession.updateMany({
      where: {
        id: sessionId,
        userId,
        revokedAt: null
      },
      data: {
        revokedAt: new Date(),
        revokeReason: reason
      }
    });

    return result.count > 0;
  }

  async revokeAllActiveSessions(userId: string, reason: string): Promise<void> {
    await prisma.loginSession.updateMany({
      where: {
        userId,
        revokedAt: null
      },
      data: {
        revokedAt: new Date(),
        revokeReason: reason
      }
    });
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

    const uniquePaths = new Set<string>();

    for (const mediaFile of mediaFiles) {
      uniquePaths.add(mediaFile.storagePath);
      for (const version of mediaFile.versions) {
        uniquePaths.add(version.storagePath);
      }
    }

    return Array.from(uniquePaths);
  }

  async permanentlyDeleteAccount(userId: string): Promise<boolean> {
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
}
