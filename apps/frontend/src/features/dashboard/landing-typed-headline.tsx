"use client";

import { useEffect, useRef, useState } from "react";

interface LandingTypedHeadlineProps {
  className?: string;
  start?: boolean;
}

const TYPED_HEADLINE = "Send it. Control it.\nBurn it.";
const VANISHED_TEXT = "Vanished";
const TYPING_INTERVAL_MS = 140;
const HEADLINE_HOLD_MS = 1200;
const VANISH_DURATION_MS = 760;
const VANISHED_HOLD_MS = 1400;

type HeadlinePhase = "typing" | "holding" | "vanishing" | "vanished";

export function LandingTypedHeadline({ className, start = true }: LandingTypedHeadlineProps) {
  const [visibleChars, setVisibleChars] = useState<number>(start ? 0 : TYPED_HEADLINE.length);
  const [phase, setPhase] = useState<HeadlinePhase>(start ? "typing" : "holding");
  const cycleTokenRef = useRef(0);
  const timeoutIdsRef = useRef<number[]>([]);

  useEffect(() => {
    const clearTimers = () => {
      timeoutIdsRef.current.forEach((id) => {
        window.clearTimeout(id);
      });
      timeoutIdsRef.current = [];
    };

    cycleTokenRef.current += 1;
    const token = cycleTokenRef.current;

    if (!start) {
      clearTimers();
      setVisibleChars(TYPED_HEADLINE.length);
      setPhase("holding");

      return;
    }

    clearTimers();

    const schedule = (callback: () => void, delay: number) => {
      const timeoutId = window.setTimeout(() => {
        if (cycleTokenRef.current !== token) {
          return;
        }

        callback();
      }, delay);

      timeoutIdsRef.current.push(timeoutId);
    };

    const runCycle = () => {
      setPhase("typing");
      setVisibleChars(0);

      const tick = (nextIndex: number) => {
        if (cycleTokenRef.current !== token) {
          return;
        }

        setVisibleChars(nextIndex);

        if (nextIndex >= TYPED_HEADLINE.length) {
          setPhase("holding");

          schedule(() => {
            setPhase("vanishing");

            schedule(() => {
              setPhase("vanished");

              schedule(() => {
                runCycle();
              }, VANISHED_HOLD_MS);
            }, VANISH_DURATION_MS);
          }, HEADLINE_HOLD_MS);

          return;
        }

        schedule(() => {
          tick(nextIndex + 1);
        }, TYPING_INTERVAL_MS);
      };

      schedule(() => {
        tick(1);
      }, TYPING_INTERVAL_MS);
    };

    runCycle();

    return () => {
      cycleTokenRef.current += 1;
      clearTimers();
    };
  }, [start]);

  const renderedText =
    phase === "typing" ? TYPED_HEADLINE.slice(0, visibleChars) : phase === "vanished" ? VANISHED_TEXT : TYPED_HEADLINE;
  const showCursor = phase === "typing" || phase === "holding";

  return (
    <h1 className={`landing-typed-headline ${className ?? ""} relative block whitespace-pre-line sm:whitespace-nowrap`}>
      <span className="invisible">{TYPED_HEADLINE}|</span>
      <span
        className={`landing-typed-copy absolute inset-0 whitespace-pre-line sm:whitespace-nowrap ${phase === "vanishing" ? "is-vanishing" : ""} ${phase === "vanished" ? "is-vanished" : ""}`}
      >
        {renderedText}
        {showCursor ? <span className={`landing-typing-cursor ${phase === "typing" ? "is-typing" : "is-idle"}`}>|</span> : null}
      </span>
    </h1>
  );
}
