"use client";

import { useEffect, useMemo, useState } from "react";
import { motion } from "framer-motion";
import { Files, Link2, Clock3 } from "lucide-react";
import { listMedia } from "../../lib/api-client";

export function OverviewCards() {
  const [totalFiles, setTotalFiles] = useState<number | null>(null);
  const [activeLinks, setActiveLinks] = useState<number | null>(null);
  const [recentUploads, setRecentUploads] = useState<number | null>(null);

  useEffect(() => {
    async function load() {
      try {
        const { items } = await listMedia();
        setTotalFiles(items.length);
        setActiveLinks(items.filter((item) => item.isActive).length);
        setRecentUploads(items.slice(0, 10).length);
      } catch {
        setTotalFiles(null);
        setActiveLinks(null);
        setRecentUploads(null);
      }
    }

    void load();
  }, []);

  const cards = useMemo(
    () => [
      { label: "Total Files", value: totalFiles === null ? "-" : String(totalFiles), icon: Files },
      { label: "Active Links", value: activeLinks === null ? "-" : String(activeLinks), icon: Link2 },
      { label: "Recent Uploads", value: recentUploads === null ? "-" : String(recentUploads), icon: Clock3 }
    ],
    [activeLinks, recentUploads, totalFiles]
  );

  return (
    <div className="grid gap-3 md:grid-cols-3">
      {cards.map((card, index) => {
        const Icon = card.icon;
        return (
          <motion.article
            key={card.label}
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: index * 0.08, duration: 0.25 }}
            className="rounded-2xl border border-border bg-bg/70 p-4"
          >
            <div className="mb-3 inline-flex rounded-lg border border-border p-2">
              <Icon className="h-4 w-4 text-accent" />
            </div>
            <p className="text-xs uppercase tracking-widest text-accent">{card.label}</p>
            <p className="mt-1 text-3xl font-semibold">{card.value}</p>
          </motion.article>
        );
      })}
    </div>
  );
}
