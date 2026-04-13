import { Suspense } from "react";
import VerifyEmailClientPage from "./verify-email-client";

export default function VerifyEmailPage() {
  return (
    <Suspense fallback={<main className="min-h-screen" />}>
      <VerifyEmailClientPage />
    </Suspense>
  );
}
