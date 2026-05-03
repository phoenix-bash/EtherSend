"use client";

import { ControlShell } from "../../components/control-shell";
import { SystemFeed } from "../../features/dashboard/system-feed";

export default function NotificationsPage() {
  return (
    <ControlShell searchPlaceholder="Search notifications...">
      <div className="flex w-full flex-col gap-6">
        <section className="flex flex-col gap-2">
          <h2 className="font-headline text-3xl font-extrabold tracking-tight text-on-surface">Notifications</h2>
          <p className="text-sm text-on-surface-variant">System logs, policy events, and guest activity timeline.</p>
        </section>

        <SystemFeed />
      </div>
    </ControlShell>
  );
}
