"use client";

import { Card, Col, Empty, Row, Space, Spin, Typography } from "antd";
import {
  buildLaneTimeline,
  buildSamplingHistory,
  getActionContextMode,
  type ContextMode,
  type ManageLotActionName,
  type ManageLotActionRow,
  type ManageLotLaneSnapshot,
  type TimelineEntry
} from "@/lib/manage-lot-context";

type ManageLotHistoryContextProps = {
  selectedAction: ManageLotActionName;
  lot: ManageLotLaneSnapshot | null;
  actions: ManageLotActionRow[];
  loading?: boolean;
};

function renderTimelineEntries(entries: TimelineEntry[]) {
  const merged = new Map<string, { label: string; latestValue: string }>();
  const remarksValues: string[] = [];
  const orderedKeys: string[] = [];

  for (const entry of entries) {
    for (const field of entry.fields) {
      if (field.key === "remarks") {
        const value = String(field.value ?? "").trim();
        if (value) remarksValues.push(value);
      }
      if (!merged.has(field.key)) {
        merged.set(field.key, { label: field.label, latestValue: field.value });
        orderedKeys.push(field.key);
      }
    }
  }

  const mergedFields = orderedKeys
    .map((key) => {
      const value = merged.get(key);
      if (!value) return null;
      if (key === "remarks" && remarksValues.length > 1) {
        return { key, label: value.label, value: remarksValues.join(" ; ") };
      }
      return { key, label: value.label, value: value.latestValue };
    })
    .filter((item): item is { key: string; label: string; value: string } => Boolean(item));

  return (
    <div
      style={{
        border: "1px solid #f0f0f0",
        borderRadius: 10,
        background: "#fff",
        padding: 12
      }}
    >
      {mergedFields.length ? (
        <Row gutter={[12, 8]}>
          {mergedFields.map((field) => (
            <Col key={field.key} xs={24} md={field.key === "remarks" ? 24 : 12}>
              <Typography.Text type="secondary" style={{ fontSize: 12 }}>
                {field.label}
              </Typography.Text>
              <div style={{ wordBreak: "break-word", lineHeight: 1.3 }}>{field.value}</div>
            </Col>
          ))}
        </Row>
      ) : (
        <Typography.Text type="secondary">No fields captured.</Typography.Text>
      )}
    </div>
  );
}

function Section({
  title,
  description,
  entries,
  emptyText,
  loading,
  tone
}: {
  title: string;
  description: string;
  entries: TimelineEntry[];
  emptyText: string;
  loading: boolean;
  tone: "auction" | "private" | "sampling";
}) {
  const styleByTone = {
    auction: { background: "#f6ffed", borderColor: "#b7eb8f" },
    private: { background: "#f9f0ff", borderColor: "#d3adf7" },
    sampling: { background: "#e6f7ff", borderColor: "#91d5ff" }
  }[tone];

  return (
    <Card size="small" style={styleByTone}>
      <Space direction="vertical" size={10} style={{ width: "100%" }}>
        <Space direction="vertical" size={2}>
          <Typography.Text strong>{title}</Typography.Text>
          <Typography.Text type="secondary">{description}</Typography.Text>
        </Space>
        {loading ? (
          <Space size={8}>
            <Spin size="small" />
            <Typography.Text type="secondary">Loading history...</Typography.Text>
          </Space>
        ) : entries.length ? (
          renderTimelineEntries(entries)
        ) : (
          <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description={emptyText} />
        )}
      </Space>
    </Card>
  );
}

export function ManageLotHistoryContext({ selectedAction, lot, actions, loading = false }: ManageLotHistoryContextProps) {
  const mode: ContextMode = getActionContextMode(selectedAction, lot, actions);
  if (mode === "none") return null;

  const auctionEntries = mode === "auction" || mode === "both" ? buildLaneTimeline(actions, "auction") : [];
  const privateEntries = mode === "private" || mode === "both" ? buildLaneTimeline(actions, "private") : [];
  const samplingEntries = mode === "sampling" ? buildSamplingHistory(actions) : [];

  return (
    <Space direction="vertical" size={12} style={{ width: "100%" }}>
      {mode === "auction" || mode === "both" ? (
        <Section
          title="Auction Lane Context"
          description="Previously logged auction lifecycle details for this lot."
          entries={auctionEntries}
          emptyText="No previous auction lane data logged yet."
          loading={loading}
          tone="auction"
        />
      ) : null}
      {mode === "private" || mode === "both" ? (
        <Section
          title="Private Lane Context"
          description="Previously logged private lifecycle details for this lot."
          entries={privateEntries}
          emptyText="No previous private lane data logged yet."
          loading={loading}
          tone="private"
        />
      ) : null}
      {mode === "sampling" ? (
        <Section
          title="Sampling History"
          description="Previous sampling records for this lot."
          entries={samplingEntries}
          emptyText="No sampling history for this lot yet."
          loading={loading}
          tone="sampling"
        />
      ) : null}
    </Space>
  );
}
