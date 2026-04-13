import { Suspense } from "react";
import ResetPasswordClientPage from "./reset-password-client";

export default function ResetPasswordPage() {
  return (
    <Suspense fallback={<main className="min-h-screen" />}>
      <ResetPasswordClientPage />
    </Suspense>
  );
}
