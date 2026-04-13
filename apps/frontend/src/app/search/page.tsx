import { Suspense } from "react";
import SearchClientPage from "./search-client";

export default function SearchPage() {
  return (
    <Suspense fallback={<main className="min-h-screen" />}>
      <SearchClientPage />
    </Suspense>
  );
}
