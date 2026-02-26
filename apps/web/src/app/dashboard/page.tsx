"use client";

import { useQuery } from "@tanstack/react-query";
import { Card, Col, Divider, Row, Space, Spin, Statistic, Typography } from "antd";
import { AppShell } from "@/components/app-shell";
import { fetchJson } from "@/lib/fetcher";

function prettyKey(key: string) {
  return key
    .replace(/([a-z])([A-Z])/g, "$1 $2")
    .replace(/^./, (v) => v.toUpperCase());
}

export default function DashboardPage() {
  const { data, isLoading, error } = useQuery({
    queryKey: ["dashboard"],
    queryFn: () => fetchJson<{ actionRequired: Record<string, number>; snapshot: Record<string, number> }>("/api/dashboard")
  });

  return (
    <AppShell title="Dashboard">
      {isLoading ? <Spin size="large" /> : null}
      {error ? <Typography.Text type="danger">{(error as Error).message}</Typography.Text> : null}
      {data ? (
        <Row gutter={[16, 16]}>
          <Col xs={24} lg={12}>
            <Card title="Action Required" variant="borderless">
              <Space direction="vertical" style={{ width: "100%" }} size="middle">
                {Object.entries(data.actionRequired).map(([k, v], idx) => (
                  <div key={k}>
                    <Statistic title={prettyKey(k)} value={v} valueStyle={{ fontSize: 22 }} />
                    {idx < Object.keys(data.actionRequired).length - 1 ? <Divider style={{ margin: "12px 0" }} /> : null}
                  </div>
                ))}
              </Space>
            </Card>
          </Col>
          <Col xs={24} lg={12}>
            <Card title="Snapshot" variant="borderless">
              <Space direction="vertical" style={{ width: "100%" }} size="middle">
                {Object.entries(data.snapshot).map(([k, v], idx) => (
                  <div key={k}>
                    <Statistic key={k} title={prettyKey(k)} value={v} valueStyle={{ fontSize: 22 }} />
                    {idx < Object.keys(data.snapshot).length - 1 ? <Divider style={{ margin: "12px 0" }} /> : null}
                  </div>
                ))}
              </Space>
            </Card>
          </Col>
        </Row>
      ) : null}
    </AppShell>
  );
}
