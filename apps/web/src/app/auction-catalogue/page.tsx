"use client";

import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { Card, Empty, Space, Spin, Table, Tag, Typography } from "antd";
import type { ColumnsType } from "antd/es/table";
import { AppShell } from "@/components/app-shell";
import { fetchJson } from "@/lib/fetcher";

type CatalogueRow = {
  id: string;
  mark: string;
  invoice_number: string;
  grade: string;
  bags: number;
  net_weight_kg: number;
  date_created: string;
  auction_centre: string;
  sale_no: string;
  status: string;
};

type MarkGroup = {
  mark: string;
  rows: CatalogueRow[];
  totalBags: number;
  totalQuantity: number;
};

type SaleGroup = {
  saleNo: string;
  markGroups: MarkGroup[];
};

type CentreGroup = {
  centre: string;
  saleGroups: SaleGroup[];
};

function formatStatus(status: string) {
  return status
    .toLowerCase()
    .split("_")
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

export default function AuctionCataloguePage() {
  const { data, isLoading } = useQuery({
    queryKey: ["auction-catalogue"],
    queryFn: () => fetchJson<{ rows: CatalogueRow[] }>("/api/auction-catalogue")
  });

  const grouped = useMemo<CentreGroup[]>(() => {
    const centreMap = new Map<string, Map<string, Map<string, CatalogueRow[]>>>();
    for (const row of data?.rows ?? []) {
      const centre = row.auction_centre || "-";
      const saleNo = row.sale_no || "-";
      const mark = row.mark || "-";
      const saleMap = centreMap.get(centre) ?? new Map<string, Map<string, CatalogueRow[]>>();
      const markMap = saleMap.get(saleNo) ?? new Map<string, CatalogueRow[]>();
      const lots = markMap.get(mark) ?? [];
      lots.push(row);
      markMap.set(mark, lots);
      saleMap.set(saleNo, markMap);
      centreMap.set(centre, saleMap);
    }

    return Array.from(centreMap.entries())
      .sort((a, b) => a[0].localeCompare(b[0]))
      .map(([centre, saleMap]) => ({
        centre,
        saleGroups: Array.from(saleMap.entries())
          .sort((a, b) => a[0].localeCompare(b[0], undefined, { numeric: true, sensitivity: "base" }))
          .map(([saleNo, markMap]) => ({
            saleNo,
            markGroups: Array.from(markMap.entries())
              .sort((a, b) => a[0].localeCompare(b[0]))
              .map(([mark, rows]) => ({
                mark,
                rows: [...rows].sort((a, b) => a.invoice_number.localeCompare(b.invoice_number)),
                totalBags: rows.reduce((sum, row) => sum + (row.bags || 0), 0),
                totalQuantity: rows.reduce((sum, row) => sum + (row.net_weight_kg || 0), 0)
              }))
          }))
      }));
  }, [data?.rows]);

  const columns: ColumnsType<CatalogueRow> = [
    { title: "Lot No.", dataIndex: "invoice_number", key: "invoice_number", width: 140 },
    { title: "Grade", dataIndex: "grade", key: "grade", width: 120 },
    { title: "Bags", dataIndex: "bags", key: "bags", width: 90 },
    {
      title: "Quantity",
      dataIndex: "net_weight_kg",
      key: "net_weight_kg",
      width: 120,
      render: (value: number) => `${Number(value ?? 0).toFixed(3)} kgs`
    },
    { title: "Packing Date", dataIndex: "date_created", key: "date_created", width: 130 },
    {
      title: "Status",
      dataIndex: "status",
      key: "status",
      width: 140,
      render: (value: string) => <Tag color="geekblue">{formatStatus(value)}</Tag>
    }
  ];

  return (
    <AppShell title="Auction Catalogue">
      {isLoading ? (
        <Card>
          <Spin />
        </Card>
      ) : grouped.length === 0 ? (
        <Card>
          <Empty description="No catalogued lots found." />
        </Card>
      ) : (
        <Space direction="vertical" size={16} style={{ width: "100%" }}>
          {grouped.map((centreGroup) => (
            <Card key={centreGroup.centre}>
              <Typography.Title level={5} style={{ marginTop: 0 }}>
                Auction Centre: {centreGroup.centre}
              </Typography.Title>
              <Space direction="vertical" size={16} style={{ width: "100%" }}>
                {centreGroup.saleGroups.map((saleGroup) => (
                  <Card key={`${centreGroup.centre}-${saleGroup.saleNo}`} variant="borderless" style={{ background: "#fafafa" }}>
                    <Typography.Title level={5} style={{ marginTop: 0, marginBottom: 12 }}>
                      Sale No.: {saleGroup.saleNo}
                    </Typography.Title>
                    <Space direction="vertical" size={12} style={{ width: "100%" }}>
                      {saleGroup.markGroups.map((markGroup) => (
                        <Card key={`${centreGroup.centre}-${saleGroup.saleNo}-${markGroup.mark}`} size="small">
                          <Space align="baseline" style={{ marginBottom: 10 }}>
                            <Typography.Title level={5} style={{ margin: 0 }}>
                              Mark: {markGroup.mark}
                            </Typography.Title>
                            <Typography.Text type="secondary">
                              Bags: {markGroup.totalBags} | Quantity: {markGroup.totalQuantity.toFixed(3)} kgs
                            </Typography.Text>
                          </Space>
                          <Table<CatalogueRow>
                            rowKey="id"
                            columns={columns}
                            dataSource={markGroup.rows}
                            pagination={false}
                            size="small"
                            scroll={{ x: 720 }}
                          />
                        </Card>
                      ))}
                    </Space>
                  </Card>
                ))}
              </Space>
            </Card>
          ))}
        </Space>
      )}
    </AppShell>
  );
}
