"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { requestDominatorActivationToken } from "../lib/api-client";

interface UseDominatorActivationInput {
  enabled: boolean;
}

export function useDominatorActivation(input: UseDominatorActivationInput): void {
  const router = useRouter();

  useEffect(() => {
    if (!input.enabled) {
      return;
    }

    function onKeyDown(event: KeyboardEvent): void {
      const matches = event.ctrlKey && event.altKey && event.shiftKey && event.code === "KeyD";
      if (!matches) {
        return;
      }

      void (async () => {
        try {
          const result = await requestDominatorActivationToken();
          router.push(`/dominator?token=${encodeURIComponent(result.token)}`);
        } catch {
        }
      })();
    }

    window.addEventListener("keydown", onKeyDown);
    return () => {
      window.removeEventListener("keydown", onKeyDown);
    };
  }, [input.enabled, router]);
}
