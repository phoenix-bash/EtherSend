"use client";

import { type ReactNode } from "react";
import { usePathname } from "next/navigation";

interface PageTransitionProps {
  children: ReactNode;
}

export function PageTransition({ children }: PageTransitionProps) {
  const pathname = usePathname();
  const transitionKey = pathname;

  return (
    <div key={transitionKey} className="page-enter min-h-screen">
      {children}
    </div>
  );
}
