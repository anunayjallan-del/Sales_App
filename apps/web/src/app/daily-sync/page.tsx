"use client";

import { Card, Space, Typography } from "antd";
import { AppShell } from "@/components/app-shell";
import { ImportXlsxForm } from "@/components/import-xlsx-form";

export default function DailySyncPage() {
  return (
    <AppShell title="Daily Sync">
      <Space direction="vertical" size="middle" style={{ width: "100%" }}>
        <Card variant="borderless">
          <Typography.Text type="secondary">
            Upload the daily invoicing export file here. Use Dry Run first, then Commit.
          </Typography.Text>
        </Card>
        <ImportXlsxForm />
      </Space>
    </AppShell>
  );
}
