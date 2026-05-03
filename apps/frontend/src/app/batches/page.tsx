import { Suspense } from "react";
import BatchesClientPage from "./batches-client";

export default function BatchesPage() {
  return (
    <Suspense fallback={<main className="min-h-screen" />}>
      <BatchesClientPage />
    </Suspense>
  );
}
