import { DominatorRepository } from "./repository.js";

interface MetricsCacheEntry {
  expiresAtMs: number;
  value: {
    users: {
      totalRegistered: number;
      totalGuests: number;
      totalOverall: number;
      activeUsers: number;
      activeGuests: number;
      activeLoggedInUsers: number;
    };
    files: {
      totalUploadedFiles: number;
      totalActiveSharedLinks: number;
      totalStorageBytes: string;
      storageBreakdown: {
        imagesBytes: string;
        videosBytes: string;
        documentsBytes: string;
        othersBytes: string;
      };
    };
    system: {
      serverUptimeSeconds: number;
      databaseSizeBytes: string;
      activeSessions: number;
      recentUploadsCount: number;
      recentRegistrationsCount: number;
    };
  };
}

const METRICS_CACHE_TTL_MS = 20_000;

export class AdminMetricsService {
  private cache: MetricsCacheEntry | null = null;

  constructor(private readonly repository: DominatorRepository) {}

  async getOverview(): Promise<MetricsCacheEntry["value"]> {
    const nowMs = Date.now();
    if (this.cache && this.cache.expiresAtMs > nowMs) {
      return this.cache.value;
    }

    const now = new Date();
    const [metrics, databaseSizeBytes] = await Promise.all([
      this.repository.getPlatformMetrics(now),
      this.repository.getDatabaseSizeBytes()
    ]);

    const value: MetricsCacheEntry["value"] = {
      users: {
        totalRegistered: metrics.totalRegisteredUsers,
        totalGuests: metrics.totalGuestUsers,
        totalOverall: metrics.totalUsersOverall,
        activeUsers: metrics.activeLoggedInUsers + metrics.activeGuests,
        activeGuests: metrics.activeGuests,
        activeLoggedInUsers: metrics.activeLoggedInUsers
      },
      files: {
        totalUploadedFiles: metrics.totalUploadedFiles,
        totalActiveSharedLinks: metrics.totalActiveSharedLinks,
        totalStorageBytes: metrics.totalStorageBytes.toString(),
        storageBreakdown: {
          imagesBytes: metrics.totalImageBytes.toString(),
          videosBytes: metrics.totalVideoBytes.toString(),
          documentsBytes: metrics.totalDocumentBytes.toString(),
          othersBytes: metrics.totalOtherBytes.toString()
        }
      },
      system: {
        serverUptimeSeconds: Math.floor(process.uptime()),
        databaseSizeBytes: databaseSizeBytes.toString(),
        activeSessions: metrics.activeSessions,
        recentUploadsCount: metrics.recentUploadsCount,
        recentRegistrationsCount: metrics.recentRegistrationsCount
      }
    };

    this.cache = {
      expiresAtMs: nowMs + METRICS_CACHE_TTL_MS,
      value
    };

    return value;
  }
}
