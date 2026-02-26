"use client";

import { Card, Space, Typography } from "antd";
import { AppShell } from "@/components/app-shell";
import { DEFAULT_THRESHOLDS } from "@/lib/constants";

export default function SettingsPage() {
  return (
    <AppShell title="Settings">
      <Space direction="vertical" size="middle" style={{ width: "100%" }}>
        <Card title="Default Thresholds" variant="borderless">
          <Typography.Paragraph style={{ marginBottom: 8 }}>
            Out/Hold alert: &gt; {DEFAULT_THRESHOLDS.outHoldDays} days
          </Typography.Paragraph>
          <Typography.Paragraph style={{ marginBottom: 0 }}>
            Payment overdue alert: &gt; {DEFAULT_THRESHOLDS.overdueDays} days
          </Typography.Paragraph>
        </Card>
        <Card title="Roles" variant="borderless">
          <Typography.Text type="secondary">Admin: full access, Operator: lifecycle operations.</Typography.Text>
        </Card>
      </Space>
    </AppShell>
  );
}
