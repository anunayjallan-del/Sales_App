import { AppShell } from "@/components/app-shell";
import { LotsClient } from "@/components/lots-client";

export default function LotsPage() {
  return (
    <AppShell title="Lots">
      <LotsClient />
    </AppShell>
  );
}
