import type { Metadata } from "next";

import { ObservabilityDashboard } from "@/components/observability-dashboard";
import { SiteFooter } from "@/components/site-footer";
import { SiteHeader } from "@/components/site-header";

export const metadata: Metadata = {
  title: "Mission Control | KathaQuest",
  description:
    "Live SigNoz observability for KathaQuest lesson quality, latency, dependencies, and activity.",
};

export default function ObservabilityPage() {
  return (
    <main className="observability-page">
      <SiteHeader active="observability" />
      <div className="container">
        <ObservabilityDashboard />
      </div>
      <SiteFooter />
    </main>
  );
}
