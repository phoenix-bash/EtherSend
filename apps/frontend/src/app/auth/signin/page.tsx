import { Suspense } from "react";
import SignInClientPage from "./signin-client";

export default function SignInPage() {
  return (
    <Suspense fallback={<main className="min-h-screen" />}>
      <SignInClientPage />
    </Suspense>
  );
}
