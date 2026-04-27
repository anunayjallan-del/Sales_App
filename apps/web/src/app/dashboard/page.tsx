"use client";

import type { ReactNode } from "react";
import { useQuery } from "@tanstack/react-query";
import AlertOutlined from "@ant-design/icons/es/icons/AlertOutlined";
import ApartmentOutlined from "@ant-design/icons/es/icons/ApartmentOutlined";
import CheckCircleOutlined from "@ant-design/icons/es/icons/CheckCircleOutlined";
import ClockCircleOutlined from "@ant-design/icons/es/icons/ClockCircleOutlined";
import DollarOutlined from "@ant-design/icons/es/icons/DollarOutlined";
import InboxOutlined from "@ant-design/icons/es/icons/InboxOutlined";
import LineChartOutlined from "@ant-design/icons/es/icons/LineChartOutlined";
import StopOutlined from "@ant-design/icons/es/icons/StopOutlined";
import SwapOutlined from "@ant-design/icons/es/icons/SwapOutlined";
import WarningOutlined from "@ant-design/icons/es/icons/WarningOutlined";
import { Alert, Card, Col, Empty, Row, Skeleton, Typography } from "antd";
import { AppShell } from "@/components/app-shell";
import { fetchJson } from "@/lib/fetcher";
import { formatInr } from "@/lib/format";

type DashboardResponse = {
  actionRequired: Record<string, number>;
  snapshot: Record<string, number>;
};

type MetricAppearance = "alertWhenPositive" | "positiveWhenPositive" | "neutral";

type MetricDefinition = {
  label: string;
  description: string;
  icon: ReactNode;
  statusLabel: string;
  appearance: MetricAppearance;
  format?: "currency";
};

type MetricItem = MetricDefinition & {
  key: string;
  value: number;
};

const actionMetricDefinitions: Record<string, MetricDefinition> = {
  soldPendingDispatch: {
    label: "Sold, Pending Dispatch",
    description: "Confirmed sales waiting for movement planning or dispatch completion.",
    icon: <ClockCircleOutlined />,
    statusLabel: "Dispatch focus",
    appearance: "alertWhenPositive"
  },
  privateCommittedAuctionActive: {
    label: "Private Commitments with Auction Activity",
    description: "Lots carrying conflicting private and auction signals that need operator review.",
    icon: <WarningOutlined />,
    statusLabel: "Conflict risk",
    appearance: "alertWhenPositive"
  },
  soldPendingNotWithdrawn: {
    label: "Sold Pending, Not Withdrawn",
    description: "Private-sold lots that still show live auction exposure and should be withdrawn.",
    icon: <SwapOutlined />,
    statusLabel: "Needs withdraw",
    appearance: "alertWhenPositive"
  },
  outLots: {
    label: "Out Lots",
    description: "Auction lots carrying an out status and still waiting on the next commercial decision.",
    icon: <StopOutlined />,
    statusLabel: "Commercial watch",
    appearance: "alertWhenPositive"
  },
  holdLots: {
    label: "Hold Lots",
    description: "Lots currently paused and likely to need follow-up before they re-enter the lane.",
    icon: <ClockCircleOutlined />,
    statusLabel: "Held",
    appearance: "alertWhenPositive"
  },
  overduePayments: {
    label: "Overdue Payments",
    description: "Settlements that have crossed the overdue threshold and should be chased now.",
    icon: <DollarOutlined />,
    statusLabel: "Receivables risk",
    appearance: "alertWhenPositive"
  }
};

const snapshotMetricDefinitions: Record<string, MetricDefinition> = {
  totalActiveLots: {
    label: "Active Lots",
    description: "Lots currently moving through any live operational or commercial stage.",
    icon: <InboxOutlined />,
    statusLabel: "Live inventory",
    appearance: "neutral"
  },
  auctionActive: {
    label: "Auction Active",
    description: "Lots inside auction preparation, transit, catalogue, or reserve workflows.",
    icon: <ApartmentOutlined />,
    statusLabel: "Auction lane",
    appearance: "neutral"
  },
  privateActive: {
    label: "Private Active",
    description: "Lots in private sampling or negotiation that still need active follow-up.",
    icon: <LineChartOutlined />,
    statusLabel: "Private lane",
    appearance: "neutral"
  },
  lotsUnsold30d: {
    label: "Unsold for 30+ Days",
    description: "Long-aging lots that deserve a sales review before they become stale inventory.",
    icon: <AlertOutlined />,
    statusLabel: "Ageing stock",
    appearance: "alertWhenPositive"
  },
  closedLots: {
    label: "Closed Lots",
    description: "Lots that have completed their lifecycle and cleared the live control queue.",
    icon: <CheckCircleOutlined />,
    statusLabel: "Resolved",
    appearance: "positiveWhenPositive"
  },
  totalOutstandingInr: {
    label: "Outstanding Value",
    description: "Open receivables still sitting outside settlement across sold deals.",
    icon: <DollarOutlined />,
    statusLabel: "Receivables",
    appearance: "alertWhenPositive",
    format: "currency"
  }
};

function prettyKey(key: string) {
  return key
    .replace(/([a-z])([A-Z])/g, "$1 $2")
    .replace(/^./, (v) => v.toUpperCase());
}

function toMetricItems(values: Record<string, number>, definitions: Record<string, MetricDefinition>): MetricItem[] {
  return Object.entries(values).map(([key, value]) => ({
    key,
    value: Number(value ?? 0),
    ...(definitions[key] ?? {
      label: prettyKey(key),
      description: "Operational metric surfaced from the current dashboard snapshot.",
      icon: <InboxOutlined />,
      statusLabel: "Operational read",
      appearance: "neutral" as const
    })
  }));
}

function formatMetricValue(item: MetricItem) {
  return item.format === "currency" ? formatInr(item.value) : item.value.toLocaleString("en-IN");
}

function getMetricClassName(item: MetricItem) {
  if (item.appearance === "alertWhenPositive") {
    return item.value > 0 ? "dashboard-metric-card is-alert" : "dashboard-metric-card is-positive";
  }

  if (item.appearance === "positiveWhenPositive") {
    return item.value > 0 ? "dashboard-metric-card is-positive" : "dashboard-metric-card";
  }

  return "dashboard-metric-card";
}

function MetricCard({ item }: { item: MetricItem }) {
  return (
    <div className={getMetricClassName(item)}>
      <div className="dashboard-metric-top">
        <div className="dashboard-metric-icon">{item.icon}</div>
        <span className="dashboard-metric-status">{item.statusLabel}</span>
      </div>
      <Typography.Text className="dashboard-metric-label">{item.label}</Typography.Text>
      <Typography.Title level={3} className="dashboard-metric-value">
        {formatMetricValue(item)}
      </Typography.Title>
      <Typography.Paragraph className="dashboard-metric-description">{item.description}</Typography.Paragraph>
    </div>
  );
}

export default function DashboardPage() {
  const { data, isLoading, error } = useQuery({
    queryKey: ["dashboard"],
    queryFn: () => fetchJson<DashboardResponse>("/api/dashboard")
  });

  const actionMetrics = data ? toMetricItems(data.actionRequired, actionMetricDefinitions).sort((a, b) => b.value - a.value) : [];
  const snapshotMetrics = data ? toMetricItems(data.snapshot, snapshotMetricDefinitions) : [];
  const totalActionItems = actionMetrics.reduce((sum, item) => sum + item.value, 0);
  const activeAlertBuckets = actionMetrics.filter((item) => item.value > 0).length;
  const totalActiveLots = Number(data?.snapshot.totalActiveLots ?? 0);
  const totalOutstanding = Number(data?.snapshot.totalOutstandingInr ?? 0);
  const resolvedLots = Number(data?.snapshot.closedLots ?? 0);
  const topAttentionItem = actionMetrics.find((item) => item.value > 0);

  return (
    <AppShell title="Dashboard">
      {isLoading ? (
        <Row gutter={[16, 16]}>
          <Col xs={24}>
            <Card variant="borderless">
              <Skeleton active paragraph={{ rows: 4 }} title />
            </Card>
          </Col>
          <Col xs={24} xl={12}>
            <Card variant="borderless">
              <Skeleton active paragraph={{ rows: 5 }} title />
            </Card>
          </Col>
          <Col xs={24} xl={12}>
            <Card variant="borderless">
              <Skeleton active paragraph={{ rows: 5 }} title />
            </Card>
          </Col>
        </Row>
      ) : null}
      {error ? (
        <Alert
          type="error"
          showIcon
          message="Dashboard unavailable"
          description={(error as Error).message}
          style={{ marginBottom: 16 }}
        />
      ) : null}
      {data ? (
        <div className="dashboard-stack">
          <Card variant="borderless" className="dashboard-hero">
            <Typography.Text className="dashboard-eyebrow">Operations overview</Typography.Text>
            <Typography.Title level={2} className="dashboard-hero-title">
              A sharper control tower for tea sales.
            </Typography.Title>
            <Typography.Paragraph className="dashboard-hero-copy">
              The dashboard now prioritizes dispatch risk, ageing exposure, and receivables in a cleaner Swiss-style
              layout so operators can scan, decide, and act faster.
            </Typography.Paragraph>
            <div className="dashboard-pill-row">
              <span className="dashboard-pill">
                Attention items
                <strong>{totalActionItems.toLocaleString("en-IN")}</strong>
              </span>
              <span className="dashboard-pill">
                Active lots
                <strong>{totalActiveLots.toLocaleString("en-IN")}</strong>
              </span>
              <span className="dashboard-pill">
                Outstanding
                <strong>{formatInr(totalOutstanding)}</strong>
              </span>
              <span className="dashboard-pill">
                Priority
                <strong>{topAttentionItem ? topAttentionItem.label : "No urgent queues"}</strong>
              </span>
            </div>
          </Card>

          <Row gutter={[16, 16]}>
            <Col xs={24} md={12} xl={6}>
              <Card variant="borderless" className="dashboard-kpi-card">
                <div className="dashboard-kpi-panel">
                  <div className="dashboard-kpi-icon">
                    <WarningOutlined />
                  </div>
                  <div>
                    <Typography.Text className="dashboard-kpi-label">Attention Queues</Typography.Text>
                    <Typography.Title level={3} className="dashboard-kpi-value">
                      {totalActionItems.toLocaleString("en-IN")}
                    </Typography.Title>
                    <Typography.Paragraph className="dashboard-kpi-copy">
                      Total items currently asking for operator follow-up.
                    </Typography.Paragraph>
                  </div>
                </div>
              </Card>
            </Col>
            <Col xs={24} md={12} xl={6}>
              <Card variant="borderless" className="dashboard-kpi-card">
                <div className="dashboard-kpi-panel">
                  <div className="dashboard-kpi-icon">
                    <InboxOutlined />
                  </div>
                  <div>
                    <Typography.Text className="dashboard-kpi-label">Live Lots</Typography.Text>
                    <Typography.Title level={3} className="dashboard-kpi-value">
                      {totalActiveLots.toLocaleString("en-IN")}
                    </Typography.Title>
                    <Typography.Paragraph className="dashboard-kpi-copy">
                      Lots moving somewhere in the active sales or dispatch lane.
                    </Typography.Paragraph>
                  </div>
                </div>
              </Card>
            </Col>
            <Col xs={24} md={12} xl={6}>
              <Card variant="borderless" className="dashboard-kpi-card">
                <div className="dashboard-kpi-panel">
                  <div className="dashboard-kpi-icon">
                    <DollarOutlined />
                  </div>
                  <div>
                    <Typography.Text className="dashboard-kpi-label">Outstanding Value</Typography.Text>
                    <Typography.Title level={3} className="dashboard-kpi-value">
                      {formatInr(totalOutstanding)}
                    </Typography.Title>
                    <Typography.Paragraph className="dashboard-kpi-copy">
                      Open sold value still outside settlement.
                    </Typography.Paragraph>
                  </div>
                </div>
              </Card>
            </Col>
            <Col xs={24} md={12} xl={6}>
              <Card variant="borderless" className="dashboard-kpi-card">
                <div className="dashboard-kpi-panel">
                  <div className="dashboard-kpi-icon">
                    <CheckCircleOutlined />
                  </div>
                  <div>
                    <Typography.Text className="dashboard-kpi-label">Resolved Lots</Typography.Text>
                    <Typography.Title level={3} className="dashboard-kpi-value">
                      {resolvedLots.toLocaleString("en-IN")}
                    </Typography.Title>
                    <Typography.Paragraph className="dashboard-kpi-copy">
                      Fully closed lots already cleared from the active queue.
                    </Typography.Paragraph>
                  </div>
                </div>
              </Card>
            </Col>
          </Row>

          <Row gutter={[16, 16]}>
            <Col xs={24} xl={12}>
              <Card variant="borderless" className="dashboard-section-card">
                <div className="dashboard-section-header">
                  <div>
                    <Typography.Text className="dashboard-eyebrow" style={{ color: "var(--app-subtle)" }}>
                      Priority queue
                    </Typography.Text>
                    <Typography.Title level={3} className="dashboard-section-title">
                      Action required
                    </Typography.Title>
                    <Typography.Paragraph className="dashboard-section-copy">
                      These counters surface where dispatch, payment, or cross-lane conflicts need the next decision.
                    </Typography.Paragraph>
                  </div>
                  <Typography.Text type="secondary">
                    {activeAlertBuckets} active {activeAlertBuckets === 1 ? "bucket" : "buckets"}
                  </Typography.Text>
                </div>
                {actionMetrics.length ? (
                  <Row gutter={[14, 14]}>
                    {actionMetrics.map((item) => (
                      <Col xs={24} sm={12} key={item.key}>
                        <MetricCard item={item} />
                      </Col>
                    ))}
                  </Row>
                ) : (
                  <div className="dashboard-state-empty">
                    <Empty description="No action metrics available." />
                  </div>
                )}
              </Card>
            </Col>
            <Col xs={24} xl={12}>
              <Card variant="borderless" className="dashboard-section-card">
                <div className="dashboard-section-header">
                  <div>
                    <Typography.Text className="dashboard-eyebrow" style={{ color: "var(--app-subtle)" }}>
                      Live system read
                    </Typography.Text>
                    <Typography.Title level={3} className="dashboard-section-title">
                      Portfolio snapshot
                    </Typography.Title>
                    <Typography.Paragraph className="dashboard-section-copy">
                      Keep a fast read on throughput, inventory age, and commercial exposure without digging through
                      tables first.
                    </Typography.Paragraph>
                  </div>
                  <Typography.Text type="secondary">Updated on load</Typography.Text>
                </div>
                {snapshotMetrics.length ? (
                  <Row gutter={[14, 14]}>
                    {snapshotMetrics.map((item) => (
                      <Col xs={24} sm={12} key={item.key}>
                        <MetricCard item={item} />
                      </Col>
                    ))}
                  </Row>
                ) : (
                  <div className="dashboard-state-empty">
                    <Empty description="No snapshot metrics available." />
                  </div>
                )}
              </Card>
            </Col>
          </Row>
        </div>
      ) : null}
    </AppShell>
  );
}
