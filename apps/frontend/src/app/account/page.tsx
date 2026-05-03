import { Suspense } from "react";
import AccountClientPage from "./account-client";

export default function AccountPage() {
  return (
    <Suspense fallback={<main className="min-h-screen" />}>
      <AccountClientPage />
    </Suspense>
  );
}
