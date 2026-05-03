"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Bell, FolderOpen, Home, Layers, UserRound } from "lucide-react";

const links = [
  {
    href: "/",
    label: "HOME",
    icon: Home
  },
  {
    href: "/notifications",
    label: "Notifications",
    icon: Bell
  },
  {
    href: "/library",
    label: "Media Library",
    icon: FolderOpen
  },
  {
    href: "/batches",
    label: "Batches",
    icon: Layers
  },
  {
    href: "/account",
    label: "Account",
    icon: UserRound
  }
];

export function ControlNav() {
  const pathname = usePathname();

  return (
    <nav className="rounded-2xl border border-border bg-card/90 p-2 shadow-lift">
      <ul className="flex flex-wrap gap-2">
        {links.map((item) => {
          const Icon = item.icon;
          const active = pathname === item.href;

          return (
            <li key={item.href}>
              <Link
                href={item.href}
                className={`inline-flex items-center gap-2 rounded-xl border px-3 py-2 text-sm transition ${
                  active
                    ? "border-accent bg-accent/15 text-accent"
                    : "border-border bg-bg hover:border-accent/50 hover:text-accent"
                }`}
              >
                <Icon className="h-4 w-4" />
                {item.label}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}