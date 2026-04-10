"use client";

import { motion } from "framer-motion";
import { DashboardHeader } from "../components/dashboard-header";
import { OverviewCards } from "../features/dashboard/overview-cards";
import { ImageManager } from "../features/image/image-manager";
import { MediaManager } from "../features/media/media-manager";
import { QrGenerator } from "../features/qr/qr-generator";

export default function HomePage() {
  return (
    <main className="min-h-screen px-4 py-8 md:px-10">
      <div className="mx-auto flex w-full max-w-7xl flex-col gap-6">
        <DashboardHeader />

        <motion.section
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.4 }}
          className="soft-grid rounded-3xl border border-border bg-card p-4 shadow-lift md:p-6"
        >
          <OverviewCards />
        </motion.section>

        <div className="grid gap-6 lg:grid-cols-2">
          <ImageManager />
          <QrGenerator />
        </div>

        <MediaManager />
      </div>
    </main>
  );
}
