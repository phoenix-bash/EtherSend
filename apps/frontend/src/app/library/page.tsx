import { Suspense } from "react";
import LibraryClientPage from "./library-client";

export default function LibraryPage() {
  return (
    <Suspense fallback={<main className="min-h-screen" />}>
      <LibraryClientPage />
    </Suspense>
  );
}
