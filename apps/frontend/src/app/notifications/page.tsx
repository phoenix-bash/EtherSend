import { Suspense } from "react";
import NotificationsClientPage from "./notifications-client";

export default function NotificationsPage() {
  return (
    <Suspense fallback={<main className="min-h-screen" />}>
      <NotificationsClientPage />
    </Suspense>
  );
}
