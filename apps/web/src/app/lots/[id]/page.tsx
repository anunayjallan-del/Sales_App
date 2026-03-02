"use client";

import { useParams } from "next/navigation";
import { useMutation, useQuery } from "@tanstack/react-query";
import { App, Button, Card, Col, Descriptions, Empty, Row, Space, Spin, Tag, Typography } from "antd";
import { AppShell } from "@/components/app-shell";
import { fetchJson } from "@/lib/fetcher";

function formatStatusLabel(status: string): string {
  if (status === "SAMPLING_SENT") return "SAMPLED";
  if (status === "PENDING_AUCTION_DISPATCH") return "PENDING AUCTION DISPATCH";
  return status;
}

type LotDetail = {
  id: string;
  mark: string;
  invoice_number: string;
  grade: string;
  is_cancelled?: boolean;
  lifecycle_status?: string;
  active_statuses?: string[];
  warnings?: string[];
  status_events?: Array<{ id: string; status: string; source: string; effective_at: string; meta?: Record<string, unknown> | null }>;
  actions?: Array<{ id: string; action: string; resulting_status: string; performed_at: string }>;
  is_sampled?: boolean;
  last_sampled_on?: string | null;
  recent_sampling_parties?: string[];
  master_status?: string;
  auction_tracks?: { auction_status?: string }[];
  private_deals?: Array<{ id: string; status: string; final_sale_price_inr: number | null; due_date: string | null }>;
};

export default function LotDetailPage() {
  const params = useParams<{ id: string }>();
  const { message } = App.useApp();

  const { data, isLoading, refetch } = useQuery({
    queryKey: ["lot", params.id],
    queryFn: () => fetchJson<{ lot: LotDetail }>(`/api/lots/${params.id}`)
  });

  const generateDispatch = useMutation({
    mutationFn: (dealId: string) => fetchJson(`/api/private-deals/${dealId}/dispatch-advice/generate`, { method: "POST" }),
    onSuccess: async () => {
      message.success("Dispatch advice generated");
      await refetch();
    }
  });

  const lot = data?.lot;

  return (
    <AppShell title="Lot Detail">
      {isLoading ? <Spin size="large" /> : null}
      {!isLoading && !lot ? <Empty description="Lot not found" /> : null}
      {lot ? (
        <Space direction="vertical" size="middle" style={{ width: "100%" }}>
          <Row gutter={[16, 16]}>
            <Col xs={24} lg={12}>
              <Card title="Identity" variant="borderless">
                <Descriptions column={1} size="small">
                  <Descriptions.Item label="Lot">{lot.mark + " / " + lot.invoice_number}</Descriptions.Item>
                  <Descriptions.Item label="Grade">{lot.grade}</Descriptions.Item>
                  <Descriptions.Item label="Active Statuses">
                    <Space wrap>
                      {(lot.active_statuses ?? [lot.lifecycle_status ?? "PENDING"]).map((s) => (
                        <Tag key={s} color={s === "CANCELLED" ? "red" : s === "CLOSED" ? "blue" : "green"}>
                          {formatStatusLabel(s)}
                        </Tag>
                      ))}
                      {(lot.warnings ?? []).map((w) => (
                        <Tag key={w} color="orange">
                          {w}
                        </Tag>
                      ))}
                    </Space>
                  </Descriptions.Item>
                  <Descriptions.Item label="Sampled">{lot.is_sampled ? "Yes" : "No"}</Descriptions.Item>
                  <Descriptions.Item label="Last Sampled On">{lot.last_sampled_on ?? "-"}</Descriptions.Item>
                  <Descriptions.Item label="Recent Sampling Parties">
                    {lot.recent_sampling_parties?.length ? lot.recent_sampling_parties.join(", ") : "-"}
                  </Descriptions.Item>
                </Descriptions>
              </Card>
            </Col>
            <Col xs={24} lg={12}>
              <Card title="Auction Track" variant="borderless">
                <Space direction="vertical" style={{ width: "100%" }}>
                  <Typography.Text>Status: {lot.auction_tracks?.[0]?.auction_status ?? "Not set"}</Typography.Text>
                </Space>
              </Card>
            </Col>
          </Row>

          <Card title="Private Deals" variant="borderless">
            <Space direction="vertical" style={{ width: "100%" }}>
              {(lot.private_deals ?? []).length === 0 ? <Empty description="No private deals yet" /> : null}
              {(lot.private_deals ?? []).map((deal) => (
                <Card key={deal.id} size="small" type="inner" title={deal.id}>
                  <Space wrap>
                    <Tag>{deal.status}</Tag>
                    <Typography.Text>Price INR: {deal.final_sale_price_inr ?? "-"}</Typography.Text>
                    <Typography.Text>Due Date: {deal.due_date ?? "-"}</Typography.Text>
                    <Button
                      size="small"
                      onClick={() => generateDispatch.mutate(deal.id)}
                      loading={generateDispatch.isPending}
                      disabled={!["SOLD_PENDING_DISPATCH", "SOLD"].includes(deal.status)}
                    >
                      Generate Dispatch Advice
                    </Button>
                  </Space>
                </Card>
              ))}
            </Space>
          </Card>

          <Card title="Status Timeline" variant="borderless">
            <Space direction="vertical" style={{ width: "100%" }}>
              {(lot.status_events ?? []).length === 0 ? <Empty description="No status events yet" /> : null}
              {(lot.status_events ?? []).map((evt) => (
                <Space key={evt.id} style={{ justifyContent: "space-between", width: "100%" }}>
                  <Tag>{formatStatusLabel(evt.status)}</Tag>
                  <Typography.Text type="secondary">{new Date(evt.effective_at).toLocaleString()}</Typography.Text>
                  <Typography.Text type="secondary">{evt.source}</Typography.Text>
                </Space>
              ))}
            </Space>
          </Card>

          <Card title="Action Timeline" variant="borderless">
            <Space direction="vertical" style={{ width: "100%" }}>
              {(lot.actions ?? []).length === 0 ? <Empty description="No actions yet" /> : null}
              {(lot.actions ?? []).map((a) => (
                <Space key={a.id} style={{ justifyContent: "space-between", width: "100%" }}>
                  <Typography.Text>{a.action.replaceAll("_", " ")}</Typography.Text>
                  <Tag color="green">{formatStatusLabel(a.resulting_status)}</Tag>
                  <Typography.Text type="secondary">{new Date(a.performed_at).toLocaleString()}</Typography.Text>
                </Space>
              ))}
            </Space>
          </Card>
        </Space>
      ) : null}
    </AppShell>
  );
}
