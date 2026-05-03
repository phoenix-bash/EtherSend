import { type JobsOptions, Queue, Worker } from "bullmq";
import * as IORedis from "ioredis";
import { env } from "../config/env.js";
import { DocumentConversionService } from "../modules/media/document-conversion.service.js";

export const DOCUMENT_CONVERSION_QUEUE_NAME = "document-conversion";
export const DOCUMENT_CONVERSION_JOB_NAME = "document-conversion";

export interface DocumentConversionJobData {
  mediaId: string;
  trigger: "upload" | "manual";
  requestedAt: string;
}

export interface DocumentConversionJobResult {
  mediaId: string;
  generatedPdf: boolean;
  generatedSlides: number;
  generatedPdfPages: number;
}

const connection = new IORedis.Redis(env.REDIS_URL, {
  maxRetriesPerRequest: null
});

const defaultJobOptions: JobsOptions = {
  removeOnComplete: true,
  removeOnFail: false
};

export const documentConversionQueue = new Queue<
  DocumentConversionJobData,
  DocumentConversionJobResult,
  typeof DOCUMENT_CONVERSION_JOB_NAME
>(DOCUMENT_CONVERSION_QUEUE_NAME, { connection });

export async function enqueueDocumentConversion(mediaId: string, trigger: DocumentConversionJobData["trigger"]): Promise<string> {
  const job = await documentConversionQueue.add(
    DOCUMENT_CONVERSION_JOB_NAME,
    {
      mediaId,
      trigger,
      requestedAt: new Date().toISOString()
    },
    {
      ...defaultJobOptions,
      jobId: `media:${mediaId}`
    }
  );

  return String(job.id);
}

export function createDocumentConversionWorker(): Worker<
  DocumentConversionJobData,
  DocumentConversionJobResult,
  typeof DOCUMENT_CONVERSION_JOB_NAME
> {
  const service = new DocumentConversionService();

  return new Worker(
    DOCUMENT_CONVERSION_QUEUE_NAME,
    async (job) => {
      return service.processMedia(job.data.mediaId);
    },
    { connection }
  );
}
