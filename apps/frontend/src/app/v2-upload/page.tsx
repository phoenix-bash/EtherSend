import { Suspense } from "react";
import { V2UploadClientPage } from "./v2-upload-client";

export default function V2UploadPage() {
  return (
    <Suspense fallback={<main className="min-h-screen" />}>
      <V2UploadClientPage />
    </Suspense>
  );
}
