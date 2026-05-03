"use client";

import { ControlShell } from "../../components/control-shell";
import { V2UploadManager } from "../../features/v2-upload/v2-upload-manager";

export function V2UploadClientPage() {
  const enabled = process.env.NEXT_PUBLIC_ENABLE_V2_UPLOAD === "true";

  return (
    <ControlShell plainHeader searchPlaceholder="SEARCH ASSETS OR BATCHES...">
      <div className="flex flex-col gap-5">
        {!enabled ? (
          <section className="rounded-xl border border-amber-500/30 bg-amber-500/10 p-4">
            <p className="text-sm text-amber-900 dark:text-amber-200">V2 upload is currently disabled. Set `NEXT_PUBLIC_ENABLE_V2_UPLOAD=true` to enable.</p>
          </section>
        ) : null}

        <V2UploadManager />
      </div>
    </ControlShell>
  );
}
