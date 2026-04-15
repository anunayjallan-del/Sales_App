"use client";

import Link from "next/link";
import { Button, Card, Empty, Input, Space, Typography } from "antd";
import type { SaleGroup } from "@/lib/auction-catalogue";

type AuctionCatalogueSaleListProps = {
  auctionCentre: string;
  activeSaleNo: string | null;
  saleGroups: SaleGroup[];
  searchValue: string;
  onSearchChange: (value: string) => void;
  onSelectSale: (saleNo: string) => void;
};

function formatSaleDeskHref(auctionCentre: string, saleNo: string): string {
  return `/auction-catalogue/live?auctionCentre=${encodeURIComponent(auctionCentre)}&saleNo=${encodeURIComponent(saleNo)}`;
}

export function AuctionCatalogueSaleList({
  auctionCentre,
  activeSaleNo,
  saleGroups,
  searchValue,
  onSearchChange,
  onSelectSale
}: AuctionCatalogueSaleListProps) {
  return (
    <Card title="Sale Weeks" styles={{ body: { paddingTop: 12 } }}>
      <Space direction="vertical" size={12} style={{ width: "100%" }}>
        <Input
          allowClear
          value={searchValue}
          placeholder="Search sale no. or mark"
          onChange={(event) => onSearchChange(event.target.value)}
        />

        {saleGroups.length ? (
          <Space direction="vertical" size={12} style={{ width: "100%" }}>
            {saleGroups.map((saleGroup) => {
              const isActive = saleGroup.saleNo === activeSaleNo;
              const summaryLabel = `${saleGroup.lotCount} lots • ${saleGroup.markCount} marks`;
              const marksPreview = saleGroup.markGroups
                .map((markGroup) => markGroup.mark)
                .slice(0, 3)
                .join(", ");

              return (
                <Card
                  key={`${auctionCentre}-${saleGroup.saleNo}`}
                  size="small"
                  hoverable
                  onClick={() => onSelectSale(saleGroup.saleNo)}
                  style={{
                    cursor: "pointer",
                    borderColor: isActive ? "#3f7c2f" : undefined,
                    background: isActive ? "#f6fbf2" : undefined,
                    boxShadow: isActive ? "0 0 0 1px rgba(63, 124, 47, 0.12)" : undefined
                  }}
                >
                  <Space direction="vertical" size={12} style={{ width: "100%" }}>
                    <Space align="start" style={{ width: "100%", justifyContent: "space-between" }}>
                      <Space direction="vertical" size={2}>
                        <Typography.Text type="secondary">Sale No.</Typography.Text>
                        <Typography.Title level={5} style={{ margin: 0 }}>
                          {saleGroup.saleNo}
                        </Typography.Title>
                        <Typography.Text type="secondary">{summaryLabel}</Typography.Text>
                      </Space>

                      <Link
                        href={formatSaleDeskHref(auctionCentre, saleGroup.saleNo)}
                        aria-disabled={auctionCentre === "-" || saleGroup.saleNo === "-"}
                        onClick={(event) => {
                          event.stopPropagation();
                          if (auctionCentre === "-" || saleGroup.saleNo === "-") {
                            event.preventDefault();
                          }
                        }}
                      >
                        <Button size="small" type={isActive ? "primary" : "default"} disabled={auctionCentre === "-" || saleGroup.saleNo === "-"}>
                          Open Sale Desk
                        </Button>
                      </Link>
                    </Space>

                    <Space size={[16, 8]} wrap>
                      <Typography.Text>Bags: {saleGroup.totalBags}</Typography.Text>
                      <Typography.Text>Quantity: {saleGroup.totalQuantity.toFixed(3)} kgs</Typography.Text>
                    </Space>

                    {marksPreview ? (
                      <Typography.Text type="secondary">
                        Marks: {marksPreview}
                        {saleGroup.markGroups.length > 3 ? ` +${saleGroup.markGroups.length - 3} more` : ""}
                      </Typography.Text>
                    ) : null}
                  </Space>
                </Card>
              );
            })}
          </Space>
        ) : (
          <Empty description="No sale weeks match this search." />
        )}
      </Space>
    </Card>
  );
}
