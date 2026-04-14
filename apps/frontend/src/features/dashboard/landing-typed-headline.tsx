"use client";

import { useEffect, useState } from "react";

interface LandingTypedHeadlineProps {
  className?: string;
  start?: boolean;
}

const TYPED_HEADLINE = "Upload once.\nShare instantly.";
const TYPING_INTERVAL_MS = 140;
const LOOP_PAUSE_MS = 1700;

export function LandingTypedHeadline({ className, start = true }: LandingTypedHeadlineProps) {
  const [visibleChars, setVisibleChars] = useState<number>(start ? 0 : TYPED_HEADLINE.length);

  useEffect(() => {
    if (!start) {
      setVisibleChars(TYPED_HEADLINE.length);
      return;
    }

    let typingTimer: number | null = null;
    let pauseTimer: number | null = null;
    let stopped = false;

    const clearTimers = () => {
      if (typingTimer !== null) {
        window.clearInterval(typingTimer);
        typingTimer = null;
      }

      if (pauseTimer !== null) {
        window.clearTimeout(pauseTimer);
        pauseTimer = null;
      }
    };

    const startTypingCycle = (initialChars: number) => {
      setVisibleChars(initialChars);

      typingTimer = window.setInterval(() => {
        setVisibleChars((current) => {
          const next = current + 1;

          if (next >= TYPED_HEADLINE.length) {
            if (typingTimer !== null) {
              window.clearInterval(typingTimer);
              typingTimer = null;
            }

            pauseTimer = window.setTimeout(() => {
              if (stopped) {
                return;
              }

              startTypingCycle(1);
            }, LOOP_PAUSE_MS);

            return TYPED_HEADLINE.length;
          }

          return next;
        });
      }, TYPING_INTERVAL_MS);
    };

    startTypingCycle(1);

    return () => {
      stopped = true;
      clearTimers();
    };
  }, [start]);

  const renderedText = TYPED_HEADLINE.slice(0, visibleChars);
  const isTyping = visibleChars < TYPED_HEADLINE.length;

  return (
    <h1 className={`landing-typed-headline ${className ?? ""} whitespace-pre-line`} style={{ minHeight: "2.8em" }}>
      {renderedText}
      <span className={`landing-typing-cursor ${isTyping ? "is-typing" : "is-idle"}`}>|</span>
    </h1>
  );
}
