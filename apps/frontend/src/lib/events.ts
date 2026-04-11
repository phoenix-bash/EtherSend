export const MEDIA_UPLOADED_EVENT = "linkforge:media-uploaded";
export const SIGNED_OUT_EVENT = "linkforge:signed-out";
export const MEDIA_LIBRARY_CHANGED_EVENT = "linkforge:media-library-changed";
export const SYSTEM_LOG_EVENT = "linkforge:system-log";

export type SystemLogLevel = "info" | "success" | "warning";

export interface SystemLogPayload {
	message: string;
	level?: SystemLogLevel;
}