"use client";

import { useQuery } from "@tanstack/react-query";
import { AppShell } from "@/components/app-shell";
import { fetchJson } from "@/lib/fetcher";
import { Card, Empty, List, Spin, Tag } from "antd";

export default function SyncHistoryPage() {
  const { data, isLoading } = useQuery({
    queryKey: ["sync-runs"],
    queryFn: () => fetchJson<{ runs: Array<Record<string, unknown>> }>("/api/sync-runs")
  });

  return (
    <AppShell title="Sync History">
      <Card variant="borderless">
        {isLoading ? <Spin /> : null}
        {!isLoading && (data?.runs ?? []).length === 0 ? <Empty description="No sync runs yet" /> : null}
        <List
          dataSource={data?.runs ?? []}
          renderItem={(run) => (
            <List.Item>
              <List.Item.Meta
                title={String(run.filename)}
                description={`Rows: ${String(run.total_rows)} | Errors: ${String(run.error_count)}`}
              />
              <Tag>{String(run.status)}</Tag>
            </List.Item>
          )}
        />
      </Card>
    </AppShell>
  );
}
