"use client";

import { useEffect, useMemo, useState } from "react";
import {
  absoluteApiUrl,
  ApiError,
  createDominatorSession,
  deleteDominatorFile,
  deleteDominatorUser,
  fetchDominatorAuditLogs,
  fetchDominatorLiveActivity,
  fetchDominatorOverview,
  fetchDominatorUser,
  fetchDominatorUserFiles,
  mediaViewUrl,
  logoutDominatorSession,
  searchDominatorUsers,
  type DominatorOverview
} from "../../lib/api-client";
import { formatDateTimeDdMmYyyyHm } from "../../lib/utils";

interface DominatorClientProps {
  initialChallengeToken: string | null;
  hasActiveSession: boolean;
}

interface SearchUserItem {
  id: string;
  email: string;
  name: string | null;
  createdAt: string;
}

interface DominatorUser {
  id: string;
  email: string;
  name: string | null;
  createdAt: string;
  storageBytes: string;
  uploadedFilesCount: number;
  activeLinksCount: number;
  lastLoginAt: string | null;
  ipHistory: string[];
  accountType: string;
}

interface DominatorFile {
  id: string;
  filename: string;
  mimeType: string;
  sizeBytes: string;
  createdAt: string;
  expiresAt: string | null;
  isActive: boolean;
}

interface DominatorAuditLog {
  id: string;
  action: string;
  status: string;
  ipAddress: string | null;
  targetUserId: string | null;
  createdAt: string;
}

function formatBytes(raw: string): string {
  const bytes = Number(raw);
  if (!Number.isFinite(bytes) || bytes <= 0) {
    return "0 B";
  }

  const units = ["B", "KB", "MB", "GB", "TB"];
  let value = bytes;
  let unitIndex = 0;
  while (value >= 1024 && unitIndex < units.length - 1) {
    value /= 1024;
    unitIndex += 1;
  }

  return `${value.toFixed(unitIndex === 0 ? 0 : 2)} ${units[unitIndex]}`;
}

export default function DominatorClient({ initialChallengeToken, hasActiveSession }: DominatorClientProps) {
  const [challengeToken, setChallengeToken] = useState<string | null>(initialChallengeToken);
  const [adminReady, setAdminReady] = useState(hasActiveSession);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [authError, setAuthError] = useState("");
  const [authLoading, setAuthLoading] = useState(false);

  const [overview, setOverview] = useState<DominatorOverview | null>(null);
  const [liveActivity, setLiveActivity] = useState<{ onlineUsers: number; uploadingUsers: number; activeSessions: number; activeGuests: number } | null>(null);
  const [auditLogs, setAuditLogs] = useState<DominatorAuditLog[]>([]);

  const [userSearch, setUserSearch] = useState("");
  const [users, setUsers] = useState<SearchUserItem[]>([]);
  const [selectedUser, setSelectedUser] = useState<DominatorUser | null>(null);
  const [userFiles, setUserFiles] = useState<DominatorFile[]>([]);
  const [superuserPassword, setSuperuserPassword] = useState("");
  const [actionError, setActionError] = useState("");

  const canLogin = Boolean(challengeToken) && email.length > 0 && password.length > 0;

  async function loadDashboardData(): Promise<void> {
    const [overviewResult, liveResult, auditResult, usersResult] = await Promise.all([
      fetchDominatorOverview(),
      fetchDominatorLiveActivity(),
      fetchDominatorAuditLogs(100),
      searchDominatorUsers(undefined, 1, 20)
    ]);

    setOverview(overviewResult.overview);
    setLiveActivity(liveResult.activity);
    setAuditLogs(auditResult.logs);
    setUsers(usersResult.items);

    if (usersResult.items.length > 0) {
      await loadUser(usersResult.items[0].id);
    }
  }

  async function loadUser(userId: string): Promise<void> {
    const [userResult, filesResult] = await Promise.all([
      fetchDominatorUser(userId),
      fetchDominatorUserFiles(userId, 1, 20)
    ]);

    setSelectedUser(userResult.user);
    setUserFiles(filesResult.items);
  }

  useEffect(() => {
    if (!adminReady) {
      return;
    }

    void loadDashboardData();
  }, [adminReady]);

  async function handleLogin(): Promise<void> {
    if (!canLogin || !challengeToken) {
      return;
    }

    setAuthLoading(true);
    setAuthError("");

    try {
      await createDominatorSession(email.trim(), password, challengeToken);
      setAdminReady(true);
      setChallengeToken(null);
      setPassword("");
    } catch (error) {
      if (error instanceof ApiError) {
        setAuthError(error.message);
      } else {
        setAuthError("Request failed");
      }
    } finally {
      setAuthLoading(false);
    }
  }

  async function handleSearchUsers(): Promise<void> {
    const result = await searchDominatorUsers(userSearch, 1, 20);
    setUsers(result.items);
    if (result.items.length > 0) {
      await loadUser(result.items[0].id);
    } else {
      setSelectedUser(null);
      setUserFiles([]);
    }
  }

  async function handleDeleteFile(mediaId: string): Promise<void> {
    if (!superuserPassword) {
      return;
    }

    setActionError("");
    try {
      await deleteDominatorFile(mediaId, superuserPassword);
      if (selectedUser) {
        await loadUser(selectedUser.id);
      }
    } catch (error) {
      if (error instanceof ApiError) {
        setActionError(error.message);
      } else {
        setActionError("Delete failed");
      }
    }
  }

  async function handleDeleteUser(): Promise<void> {
    if (!selectedUser || !superuserPassword) {
      return;
    }

    const confirmed = window.confirm(`Delete ${selectedUser.email}? This cannot be undone.`);
    if (!confirmed) {
      return;
    }

    setActionError("");
    try {
      await deleteDominatorUser(selectedUser.id, superuserPassword);
      setSelectedUser(null);
      setUserFiles([]);
      await handleSearchUsers();
    } catch (error) {
      if (error instanceof ApiError) {
        setActionError(error.message);
      } else {
        setActionError("Delete failed");
      }
    }
  }

  async function handleLogout(): Promise<void> {
    await logoutDominatorSession();
    window.location.href = "/";
  }

  const storageBreakdown = useMemo(() => {
    if (!overview) {
      return null;
    }

    return [
      { label: "Images", value: formatBytes(overview.files.storageBreakdown.imagesBytes) },
      { label: "Videos", value: formatBytes(overview.files.storageBreakdown.videosBytes) },
      { label: "Documents", value: formatBytes(overview.files.storageBreakdown.documentsBytes) },
      { label: "Others", value: formatBytes(overview.files.storageBreakdown.othersBytes) }
    ];
  }, [overview]);

  if (!adminReady) {
    return (
      <main className="min-h-screen bg-[#08090d] text-[#f0f3ff]">
        <div className="mx-auto w-full max-w-md px-6 py-24">
          <h1 className="text-lg font-semibold">Restricted Console</h1>
          <p className="mt-2 text-sm text-[#8f9ab5]">Superuser verification required</p>

          <div className="mt-6 space-y-3 rounded-lg border border-[#2b3349] bg-[#0f1320] p-4">
            <input
              type="email"
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              placeholder="Superuser email"
              className="h-10 w-full rounded border border-[#2b3349] bg-[#0c1020] px-3 text-sm text-[#f0f3ff] outline-none"
            />
            <input
              type="password"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              placeholder="Superuser password"
              className="h-10 w-full rounded border border-[#2b3349] bg-[#0c1020] px-3 text-sm text-[#f0f3ff] outline-none"
            />
            <button
              type="button"
              disabled={!canLogin || authLoading}
              onClick={() => {
                void handleLogin();
              }}
              className="h-10 w-full rounded border border-[#5e72ff] bg-[#1b2550] text-xs font-semibold uppercase tracking-wider text-[#dce2ff] disabled:opacity-50"
            >
              {authLoading ? "Validating..." : "Authenticate"}
            </button>
            {authError ? <p className="text-xs text-[#ff8e8e]">{authError}</p> : null}
          </div>
        </div>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-[#08090d] text-[#f0f3ff]">
      <div className="mx-auto w-full max-w-7xl px-4 py-5">
        <div className="mb-4 flex items-center justify-between">
          <h1 className="text-sm font-semibold uppercase tracking-[0.2em] text-[#8f9ab5]">Dominator Console</h1>
          <button
            type="button"
            onClick={() => {
              void handleLogout();
            }}
            className="rounded border border-[#2b3349] px-3 py-1 text-xs uppercase tracking-wider text-[#cfd6f6]"
          >
            Logout
          </button>
        </div>

        <section className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
          <article className="rounded border border-[#2b3349] bg-[#0f1320] p-3">
            <h2 className="text-xs uppercase tracking-wider text-[#8f9ab5]">Users</h2>
            <p className="mt-2 text-sm">Registered: {overview?.users.totalRegistered ?? "-"}</p>
            <p className="text-sm">Guests: {overview?.users.totalGuests ?? "-"}</p>
            <p className="text-sm">Overall: {overview?.users.totalOverall ?? "-"}</p>
            <p className="text-sm">Active: {overview?.users.activeUsers ?? "-"}</p>
          </article>

          <article className="rounded border border-[#2b3349] bg-[#0f1320] p-3">
            <h2 className="text-xs uppercase tracking-wider text-[#8f9ab5]">Live Activity</h2>
            <p className="mt-2 text-sm">Online users: {liveActivity?.onlineUsers ?? "-"}</p>
            <p className="text-sm">Uploading users: {liveActivity?.uploadingUsers ?? "-"}</p>
            <p className="text-sm">Active sessions: {liveActivity?.activeSessions ?? "-"}</p>
            <p className="text-sm">Active guests: {liveActivity?.activeGuests ?? "-"}</p>
          </article>

          <article className="rounded border border-[#2b3349] bg-[#0f1320] p-3">
            <h2 className="text-xs uppercase tracking-wider text-[#8f9ab5]">Files</h2>
            <p className="mt-2 text-sm">Total files: {overview?.files.totalUploadedFiles ?? "-"}</p>
            <p className="text-sm">Active links: {overview?.files.totalActiveSharedLinks ?? "-"}</p>
            <p className="text-sm">Storage: {overview ? formatBytes(overview.files.totalStorageBytes) : "-"}</p>
            <div className="mt-2 text-xs text-[#9ea8c3]">
              {storageBreakdown?.map((item) => <p key={item.label}>{item.label}: {item.value}</p>)}
            </div>
          </article>

          <article className="rounded border border-[#2b3349] bg-[#0f1320] p-3">
            <h2 className="text-xs uppercase tracking-wider text-[#8f9ab5]">System</h2>
            <p className="mt-2 text-sm">Uptime: {overview?.system.serverUptimeSeconds ?? "-"}s</p>
            <p className="text-sm">DB size: {overview ? formatBytes(overview.system.databaseSizeBytes) : "-"}</p>
            <p className="text-sm">Sessions: {overview?.system.activeSessions ?? "-"}</p>
            <p className="text-sm">Recent uploads: {overview?.system.recentUploadsCount ?? "-"}</p>
            <p className="text-sm">Recent registrations: {overview?.system.recentRegistrationsCount ?? "-"}</p>
          </article>
        </section>

        <section className="mt-5 grid gap-3 lg:grid-cols-[1.1fr_1fr]">
          <div className="space-y-3">
            <article className="rounded border border-[#2b3349] bg-[#0f1320] p-3">
              <h2 className="text-xs uppercase tracking-wider text-[#8f9ab5]">User List</h2>
              <div className="mt-2 flex items-center gap-2">
                <input
                  type="text"
                  value={userSearch}
                  onChange={(event) => setUserSearch(event.target.value)}
                  placeholder="Search user by email or name"
                  className="h-9 flex-1 rounded border border-[#2b3349] bg-[#0c1020] px-3 text-sm"
                />
                <button
                  type="button"
                  onClick={() => {
                    void handleSearchUsers();
                  }}
                  className="h-9 rounded border border-[#2b3349] px-3 text-xs uppercase tracking-wider"
                >
                  Search
                </button>
              </div>

              <div className="mt-3 h-72 overflow-auto text-xs">
                {users.map((user) => (
                  <button
                    key={user.id}
                    type="button"
                    onClick={() => {
                      void loadUser(user.id);
                    }}
                    className="mb-2 w-full rounded border border-[#20263a] p-2 text-left hover:border-[#5e72ff]"
                  >
                    <p className="font-semibold">{user.email}</p>
                    <p className="text-[#8f9ab5]">{user.name || "-"} • {formatDateTimeDdMmYyyyHm(user.createdAt)}</p>
                  </button>
                ))}
              </div>
            </article>

            <article className="rounded border border-[#2b3349] bg-[#0f1320] p-3">
              <h2 className="text-xs uppercase tracking-wider text-[#8f9ab5]">Account Details</h2>
              {selectedUser ? (
                <div className="mt-2 rounded border border-[#2b3349] bg-[#0b101b] p-3 text-xs">
                  <p>Email: {selectedUser.email}</p>
                  <p>Name: {selectedUser.name || "-"}</p>
                  <p>Registered: {formatDateTimeDdMmYyyyHm(selectedUser.createdAt)}</p>
                  <p>Storage: {formatBytes(selectedUser.storageBytes)}</p>
                  <p>Uploaded files: {selectedUser.uploadedFilesCount}</p>
                  <p>Active links: {selectedUser.activeLinksCount}</p>
                  <p>Last login: {selectedUser.lastLoginAt ? formatDateTimeDdMmYyyyHm(selectedUser.lastLoginAt) : "-"}</p>
                  <p>IPs: {selectedUser.ipHistory.join(", ") || "-"}</p>
                  <p>Status: {selectedUser.accountType}</p>
                </div>
              ) : (
                <p className="mt-2 text-xs text-[#8f9ab5]">Select a user to view account details.</p>
              )}
            </article>

            <article className="rounded border border-[#2b3349] bg-[#0f1320] p-3">
              <h2 className="text-xs uppercase tracking-wider text-[#8f9ab5]">Superuser Password</h2>
              <div className="mt-2">
                <input
                  type="password"
                  value={superuserPassword}
                  onChange={(event) => setSuperuserPassword(event.target.value)}
                  placeholder="Re-enter superuser password"
                  className="h-9 w-full rounded border border-[#2b3349] bg-[#0c1020] px-3 text-xs"
                />
                <button
                  type="button"
                  disabled={!selectedUser || !superuserPassword}
                  onClick={() => {
                    void handleDeleteUser();
                  }}
                  className="mt-2 h-9 w-full rounded border border-[#6f2230] bg-[#2b1017] text-xs uppercase tracking-wider text-[#ffb8c3] disabled:opacity-40"
                >
                  Delete user
                </button>
                {actionError ? <p className="mt-2 text-xs text-[#ff8e8e]">{actionError}</p> : null}
              </div>
            </article>
          </div>

          <article className="rounded border border-[#2b3349] bg-[#0f1320] p-3">
            <h2 className="text-xs uppercase tracking-wider text-[#8f9ab5]">User Files</h2>
            <div className="mt-2 h-[42rem] overflow-auto text-xs">
              {userFiles.map((file) => (
                <div key={file.id} className="mb-2 rounded border border-[#20263a] p-2">
                  <p className="font-semibold">{file.filename}</p>
                  <p>{file.mimeType} • {formatBytes(file.sizeBytes)}</p>
                  <p>Created: {formatDateTimeDdMmYyyyHm(file.createdAt)}</p>
                  <a
                    href={absoluteApiUrl(mediaViewUrl(file.id))}
                    target="_blank"
                    rel="noreferrer"
                    className="mt-2 inline-flex rounded border border-[#2b3349] px-2 py-1 text-[10px] uppercase tracking-wider text-[#cfd6f6]"
                  >
                    View
                  </a>
                  <button
                    type="button"
                    disabled={!superuserPassword}
                    onClick={() => {
                      void handleDeleteFile(file.id);
                    }}
                    className="mt-2 rounded border border-[#6f2230] px-2 py-1 text-[10px] uppercase tracking-wider text-[#ffb8c3] disabled:opacity-40"
                  >
                    Delete file
                  </button>
                </div>
              ))}
            </div>
          </article>
        </section>

        <section className="mt-5 rounded border border-[#2b3349] bg-[#0f1320] p-3">
          <h2 className="text-xs uppercase tracking-wider text-[#8f9ab5]">Audit Logs</h2>
          <div className="mt-2 max-h-60 overflow-auto text-xs">
            {auditLogs.map((log) => (
              <div key={log.id} className="mb-1 rounded border border-[#20263a] p-2">
                <p>{formatDateTimeDdMmYyyyHm(log.createdAt)} • {log.action} • {log.status}</p>
                <p className="text-[#8f9ab5]">IP: {log.ipAddress || "-"} • Target: {log.targetUserId || "-"}</p>
              </div>
            ))}
          </div>
        </section>
      </div>
    </main>
  );
}
