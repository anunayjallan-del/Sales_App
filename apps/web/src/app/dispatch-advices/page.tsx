"use client";

import { useQuery } from "@tanstack/react-query";
import { Button, Card, Empty, List, Space, Spin, Typography } from "antd";
import { AppShell } from "@/components/app-shell";
import { fetchJson } from "@/lib/fetcher";

export default function DispatchAdvicesPage() {
  const { data, isLoading } = useQuery({
    queryKey: ["dispatch-advices"],
    queryFn: () => fetchJson<{ rows: Array<Record<string, unknown>> }>("/api/dispatch-advices")
  });

  return (
    <AppShell title="Dispatch Advices">
      <Card variant="borderless">
        <Space direction="vertical" style={{ width: "100%" }} size="middle">
          <Space style={{ width: "100%", justifyContent: "space-between" }} wrap>
            <Typography.Text type="secondary">Generated from sold-pending-dispatch private deals.</Typography.Text>
            <a href="/api/dispatch-advices?format=csv">
              <Button type="primary">Export CSV</Button>
            </a>
          </Space>
          {isLoading ? <Spin /> : null}
          {!isLoading && (data?.rows ?? []).length === 0 ? <Empty description="No dispatch advices" /> : null}
          <List
            dataSource={data?.rows ?? []}
            renderItem={(row) => (
              <List.Item>
                <List.Item.Meta
                  title={`${String(row.mark)} / ${String(row.invoice_number)} - ${String(row.buyer_name)}`}
                  description={`Value INR ${String(row.total_value_inr)}`}
                />
              </List.Item>
            )}
          />
        </Space>
      </Card>
    </AppShell>
  );
}
