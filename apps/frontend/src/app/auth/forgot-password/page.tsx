import { Suspense } from "react";
import ForgotPasswordClientPage from "./forgot-password-client";

export default function ForgotPasswordPage() {
  return (
    <Suspense fallback={<main className="min-h-screen" />}>
      <ForgotPasswordClientPage />
    </Suspense>
  );
}
