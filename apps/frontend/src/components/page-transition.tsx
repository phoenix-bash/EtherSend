"use client";

import { type ReactNode } from "react";
import { usePathname, useSearchParams } from "next/navigation";

interface PageTransitionProps {
  children: ReactNode;
}

export function PageTransition({ children }: PageTransitionProps) {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const transitionKey = `${pathname}?${searchParams.toString()}`;

  return (
    <div key={transitionKey} className="page-enter min-h-screen">
      {children}
    </div>
  );
}