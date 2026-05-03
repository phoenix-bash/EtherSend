ALTER TABLE "User"
ADD COLUMN "accountDeletionCodeHash" TEXT,
ADD COLUMN "accountDeletionCodeExpiresAt" TIMESTAMP(3);
