import { AuthProvider, type User } from "@prisma/client";
import { prisma } from "../../config/prisma.js";

interface UpsertIdentityInput {
  provider: AuthProvider;
  providerSubjectId: string;
  email: string;
  name?: string;
}

export class AuthRepository {
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
      return existingByIdentity.user;
    }

    const user = await prisma.user.upsert({
      where: {
        email: input.email
      },
      update: {
        name: input.name
      },
      create: {
        email: input.email,
        name: input.name,
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
}
