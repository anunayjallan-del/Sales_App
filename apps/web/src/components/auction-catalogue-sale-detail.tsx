"use client";

import Link from "next/link";
import { Button, Card, Checkbox, Empty, Space, Table, Typography } from "antd";
import type { ColumnsType } from "antd/es/table";
import type { CatalogueRow, SaleGroup } from "@/lib/auction-catalogue";

type AuctionCatalogueSaleDetailProps = {
  auctionCentre: string | null;
  saleGroup: SaleGroup | null;
  selectedLotIds: string[];
  columns: ColumnsType<CatalogueRow>;
  emptyDescription?: string;
  onToggleLot: (lotId: string) => void;
  onSetLotSelection: (lotId: string, selected: boolean) => void;
  onSetManyLotsSelection: (lotIds: string[], selected: boolean) => void;
};

function formatSaleDeskHref(auctionCentre: string, saleNo: string): string {
  return `/auction-catalogue/live?auctionCentre=${encodeURIComponent(auctionCentre)}&saleNo=${encodeURIComponent(saleNo)}`;
}

export function AuctionCatalogueSaleDetail({
  auctionCentre,
  saleGroup,
  selectedLotIds,
  columns,
  emptyDescription = "Choose a sale week to view its catalogue details.",
  onToggleLot,
  onSetLotSelection,
  onSetManyLotsSelection
}: AuctionCatalogueSaleDetailProps) {
  if (!saleGroup || !auctionCentre) {
    return (
      <Card>
        <Empty description={emptyDescription} />
      </Card>
    );
  }

  const saleLotIds = saleGroup.markGroups.flatMap((markGroup) => markGroup.rows.map((row) => row.id));
  const selectedCount = saleLotIds.filter((id) => selectedLotIds.includes(id)).length;
  const allSelected = saleLotIds.length > 0 && selectedCount === saleLotIds.length;
  const partiallySelected = selectedCount > 0 && !allSelected;

  return (
    <Card styles={{ body: { paddingTop: 12 } }}>
      <Space direction="vertical" size={16} style={{ width: "100%" }}>
        <Space align="start" style={{ width: "100%", justifyContent: "space-between" }} wrap>
          <Space direction="vertical" size={4}>
            <Typography.Title level={4} style={{ margin: 0 }}>
              Sale No.: {saleGroup.saleNo}
            </Typography.Title>
            <Typography.Text type="secondary">
              {saleGroup.lotCount} lots • {saleGroup.markCount} marks • Bags: {saleGroup.totalBags} • Quantity: {saleGroup.totalQuantity.toFixed(3)} kgs
            </Typography.Text>
          </Space>

          <Link
            href={formatSaleDeskHref(auctionCentre, saleGroup.saleNo)}
            aria-disabled={auctionCentre === "-" || saleGroup.saleNo === "-"}
            onClick={(event) => {
              if (auctionCentre === "-" || saleGroup.saleNo === "-") {
                event.preventDefault();
              }
            }}
          >
            <Button size="small" disabled={auctionCentre === "-" || saleGroup.saleNo === "-"}>
              Open Sale Desk
            </Button>
          </Link>
        </Space>

        <Checkbox checked={allSelected} indeterminate={partiallySelected} onChange={(event) => onSetManyLotsSelection(saleLotIds, event.target.checked)}>
          Select all lots in this sale
          {selectedCount ? ` (${selectedCount}/${saleLotIds.length})` : ` (${saleLotIds.length})`}
        </Checkbox>

        <Space direction="vertical" size={12} style={{ width: "100%" }}>
          {saleGroup.markGroups.map((markGroup) => (
            <Card key={`${auctionCentre}-${saleGroup.saleNo}-${markGroup.mark}`} size="small">
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
                rowSelection={{
                  selectedRowKeys: markGroup.rows.map((row) => row.id).filter((id) => selectedLotIds.includes(id)),
                  onSelect: (record, selected) => onSetLotSelection(String(record.id), selected),
                  onSelectAll: (selected, _selectedRows, changeRows) => onSetManyLotsSelection(changeRows.map((row) => String(row.id)), selected)
                }}
                onRow={(record) => ({
                  onClick: (event) => {
                    const target = event.target as HTMLElement;
                    if (target.closest("button, a, input, .ant-checkbox-wrapper, .ant-checkbox, .ant-select, .ant-input-number")) return;
                    onToggleLot(record.id);
                  }
                })}
                rowClassName={() => "clickable-lot-row"}
                pagination={false}
                size="small"
                scroll={{ x: 840 }}
              />
            </Card>
          ))}
        </Space>
      </Space>
    </Card>
  );
}
