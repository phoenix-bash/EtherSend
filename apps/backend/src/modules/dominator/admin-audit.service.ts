import type { Prisma } from "@prisma/client";
import { env } from "../../config/env.js";
import { DominatorRepository } from "./repository.js";

export class AdminAuditService {
  constructor(private readonly repository: DominatorRepository) {}

  async log(input: {
    action: string;
    status: string;
    ipAddress?: string;
    userAgent?: string;
    targetUserId?: string;
    details?: Prisma.InputJsonValue;
  }): Promise<void> {
    await this.repository.logAdminAudit({
      superuserEmail: env.SUPERUSER_EMAIL.toLowerCase(),
      action: input.action,
      status: input.status,
      ipAddress: input.ipAddress,
      userAgent: input.userAgent,
      targetUserId: input.targetUserId,
      details: input.details
    });
  }

  async listRecent(limit = 100): Promise<Array<{
    id: string;
    action: string;
    status: string;
    ipAddress: string | null;
    targetUserId: string | null;
    createdAt: Date;
  }>> {
    return this.repository.getAuditLogs(Math.min(Math.max(limit, 1), 250));
  }
}
