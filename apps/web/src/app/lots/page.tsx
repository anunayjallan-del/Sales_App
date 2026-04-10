import { Suspense } from "react";
import { AppShell } from "@/components/app-shell";
import { LotsClient } from "@/components/lots-client";

export default function LotsPage() {
  return (
    <AppShell title="Lots">
      <Suspense fallback={null}>
        <LotsClient />
      </Suspense>
    </AppShell>
  );
}
