-- CreateTable
CREATE TABLE "AdminAccessToken" (
    "id" TEXT NOT NULL,
    "jtiHash" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "superuserEmail" TEXT NOT NULL,
    "challengeHash" TEXT,
    "challengeExpiresAt" TIMESTAMP(3),
    "challengeUsedAt" TIMESTAMP(3),
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "consumedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "ipAddress" TEXT,
    "userAgent" TEXT,

    CONSTRAINT "AdminAccessToken_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AdminSession" (
    "id" TEXT NOT NULL,
    "sessionTokenHash" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "superuserEmail" TEXT NOT NULL,
    "ipAddress" TEXT,
    "userAgent" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lastActivityAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "revokedAt" TIMESTAMP(3),
    "revokeReason" TEXT,

    CONSTRAINT "AdminSession_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AdminAuditLog" (
    "id" TEXT NOT NULL,
    "superuserEmail" TEXT NOT NULL,
    "action" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "ipAddress" TEXT,
    "userAgent" TEXT,
    "targetUserId" TEXT,
    "details" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AdminAuditLog_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "AdminAccessToken_jtiHash_key" ON "AdminAccessToken"("jtiHash");

-- CreateIndex
CREATE UNIQUE INDEX "AdminAccessToken_challengeHash_key" ON "AdminAccessToken"("challengeHash");

-- CreateIndex
CREATE INDEX "AdminAccessToken_userId_idx" ON "AdminAccessToken"("userId");

-- CreateIndex
CREATE INDEX "AdminAccessToken_expiresAt_idx" ON "AdminAccessToken"("expiresAt");

-- CreateIndex
CREATE INDEX "AdminAccessToken_consumedAt_idx" ON "AdminAccessToken"("consumedAt");

-- CreateIndex
CREATE INDEX "AdminAccessToken_challengeExpiresAt_idx" ON "AdminAccessToken"("challengeExpiresAt");

-- CreateIndex
CREATE UNIQUE INDEX "AdminSession_sessionTokenHash_key" ON "AdminSession"("sessionTokenHash");

-- CreateIndex
CREATE INDEX "AdminSession_userId_idx" ON "AdminSession"("userId");

-- CreateIndex
CREATE INDEX "AdminSession_expiresAt_idx" ON "AdminSession"("expiresAt");

-- CreateIndex
CREATE INDEX "AdminSession_revokedAt_idx" ON "AdminSession"("revokedAt");

-- CreateIndex
CREATE INDEX "AdminSession_lastActivityAt_idx" ON "AdminSession"("lastActivityAt");

-- CreateIndex
CREATE INDEX "AdminAuditLog_action_idx" ON "AdminAuditLog"("action");

-- CreateIndex
CREATE INDEX "AdminAuditLog_status_idx" ON "AdminAuditLog"("status");

-- CreateIndex
CREATE INDEX "AdminAuditLog_targetUserId_idx" ON "AdminAuditLog"("targetUserId");

-- CreateIndex
CREATE INDEX "AdminAuditLog_createdAt_idx" ON "AdminAuditLog"("createdAt");
