import { compare } from "bcryptjs";
import { env } from "../../config/env.js";
import { LocalStorageProvider } from "../../providers/storage/local-storage.provider.js";
import { HttpError } from "../../utils/http-error.js";
import { AdminAuditService } from "./admin-audit.service.js";
import { DominatorRepository } from "./repository.js";

export class AdminUserService {
  private readonly storage = new LocalStorageProvider();

  constructor(
    private readonly repository: DominatorRepository,
    private readonly auditService: AdminAuditService
  ) {}

  async searchUsers(input: { query?: string; page?: number; pageSize?: number }) {
    const page = Math.max(1, input.page ?? 1);
    const pageSize = Math.min(100, Math.max(1, input.pageSize ?? 20));

    return this.repository.searchUsers(input.query?.trim() || undefined, (page - 1) * pageSize, pageSize);
  }

  async getUserDetails(userId: string) {
    const user = await this.repository.getUserDetails(userId);
    if (!user) {
      return null;
    }

    return {
      ...user,
      storageBytes: user.storageBytes.toString()
    };
  }

  async listUserFiles(input: { userId: string; page?: number; pageSize?: number }) {
    const page = Math.max(1, input.page ?? 1);
    const pageSize = Math.min(100, Math.max(1, input.pageSize ?? 20));
    const files = await this.repository.listUserFiles(input.userId, (page - 1) * pageSize, pageSize);

    return {
      total: files.total,
      items: files.items.map((item) => ({
        ...item,
        sizeBytes: item.sizeBytes.toString()
      }))
    };
  }

  async deleteMediaFile(input: { mediaId: string; superuserPassword: string; ipAddress?: string; userAgent?: string }): Promise<void> {
    await this.verifySuperuserPassword(input.superuserPassword);

    const storagePaths = await this.repository.getMediaStoragePaths(input.mediaId);
    if (!storagePaths) {
      throw new HttpError(404, "Not Found");
    }

    const deleted = await this.repository.deleteMediaById(input.mediaId);
    if (!deleted) {
      throw new HttpError(404, "Not Found");
    }

    for (const path of storagePaths) {
      try {
        await this.storage.delete(path);
      } catch {
      }
    }

    await this.auditService.log({
      action: "media_delete",
      status: "ok",
      ipAddress: input.ipAddress,
      userAgent: input.userAgent,
      details: {
        mediaId: input.mediaId
      }
    });
  }

  async deleteUser(input: { userId: string; superuserPassword: string; ipAddress?: string; userAgent?: string }): Promise<void> {
    await this.verifySuperuserPassword(input.superuserPassword);

    const storagePaths = await this.repository.listOwnedStoragePaths(input.userId);
    const deleted = await this.repository.deleteUserCascade(input.userId);

    if (!deleted) {
      throw new HttpError(404, "Not Found");
    }

    for (const path of storagePaths) {
      try {
        await this.storage.delete(path);
      } catch {
      }
    }

    await this.auditService.log({
      action: "user_delete",
      status: "ok",
      ipAddress: input.ipAddress,
      userAgent: input.userAgent,
      targetUserId: input.userId
    });
  }

  private async verifySuperuserPassword(password: string): Promise<void> {
    const matches = await compare(password, env.SUPERUSER_PASSWORD_HASH);
    if (!matches) {
      throw new HttpError(404, "Not Found");
    }
  }
}
