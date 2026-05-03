-- CreateEnum
CREATE TYPE "V2UploadStatus" AS ENUM ('PENDING', 'UPLOADING', 'COMPLETED', 'FAILED', 'ABORTED');

-- CreateTable
CREATE TABLE "v2_uploads" (
    "id" TEXT NOT NULL,
    "file_id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "file_name" TEXT NOT NULL,
    "file_size" BIGINT NOT NULL,
    "mime_type" TEXT,
    "s3_key" TEXT NOT NULL,
    "s3_bucket" TEXT NOT NULL,
    "status" "V2UploadStatus" NOT NULL,
    "upload_id" TEXT,
    "etags" JSONB,
    "file_url" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "completed_at" TIMESTAMP(3),
    "metadata" JSONB,

    CONSTRAINT "v2_uploads_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "v2_uploads_file_id_key" ON "v2_uploads"("file_id");

-- CreateIndex
CREATE INDEX "idx_v2_uploads_user_id" ON "v2_uploads"("user_id");

-- CreateIndex
CREATE INDEX "idx_v2_uploads_status" ON "v2_uploads"("status");

-- CreateIndex
CREATE INDEX "idx_v2_uploads_file_id" ON "v2_uploads"("file_id");
