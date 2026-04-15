import { describe, expect, it } from "vitest";
import { filterSaleGroups, groupCatalogueRows, resolveActiveCatalogueSelection, resolveCatalogueSaleNo, type CatalogueRow } from "@/lib/auction-catalogue";

function makeRow(overrides: Partial<CatalogueRow>): CatalogueRow {
  return {
    id: overrides.id ?? crypto.randomUUID(),
    mark: overrides.mark ?? "MARK",
    invoice_number: overrides.invoice_number ?? "LOT001",
    grade: overrides.grade ?? "PF",
    bags: overrides.bags ?? 10,
    net_weight_kg: overrides.net_weight_kg ?? 400,
    date_created: overrides.date_created ?? "2026-03-20",
    auction_centre: overrides.auction_centre ?? "Kolkata",
    sale_no: overrides.sale_no ?? "10",
    status: overrides.status ?? "CATALOGUED",
    active_statuses: overrides.active_statuses,
    auction_lane_status: overrides.auction_lane_status,
    private_lane_status: overrides.private_lane_status,
    is_sampled: overrides.is_sampled,
    allowed_actions: overrides.allowed_actions,
    reinvoiced_from_lot_id: overrides.reinvoiced_from_lot_id,
    negotiating_buyers: overrides.negotiating_buyers,
    last_negotiated_on: overrides.last_negotiated_on
  };
}

describe("auction catalogue sale number resolution", () => {
  it("falls back to legacy print sale number when awr received has none", () => {
    expect(
      resolveCatalogueSaleNo([
        {
          lot_id: "lot-1",
          action: "AWR_RECEIVED",
          payload: { arrival_date: "2026-03-22" },
          performed_at: "2026-03-22T10:00:00.000Z"
        },
        {
          lot_id: "lot-1",
          action: "PRINT",
          payload: { sale_no: "12" },
          performed_at: "2026-03-21T10:00:00.000Z"
        }
      ])
    ).toBe("12");
  });

  it("uses reprint target sale number when it is the latest catalogue sale number", () => {
    expect(
      resolveCatalogueSaleNo([
        {
          lot_id: "lot-2",
          action: "REPRINT",
          payload: { target_sale_no: "18" },
          performed_at: "2026-03-24T10:00:00.000Z"
        },
        {
          lot_id: "lot-2",
          action: "AWR_RECEIVED",
          payload: { sale_no: "12" },
          performed_at: "2026-03-23T10:00:00.000Z"
        }
      ])
    ).toBe("18");
  });

  it("uses the latest out sale number when the lot remains unsold", () => {
    expect(
      resolveCatalogueSaleNo([
        {
          lot_id: "lot-3",
          action: "OUT",
          payload: { sale_no: "19", out_date: "2026-03-25" },
          performed_at: "2026-03-25T10:00:00.000Z"
        },
        {
          lot_id: "lot-3",
          action: "AWR_RECEIVED",
          payload: { sale_no: "12" },
          performed_at: "2026-03-24T10:00:00.000Z"
        }
      ])
    ).toBe("19");
  });

  it("sorts sale weeks numeric-descending with dash last", () => {
    const grouped = groupCatalogueRows([
      makeRow({ id: "lot-1", sale_no: "2" }),
      makeRow({ id: "lot-2", sale_no: "10" }),
      makeRow({ id: "lot-3", sale_no: "-" }),
      makeRow({ id: "lot-4", sale_no: "7" })
    ]);

    expect(grouped[0]?.saleGroups.map((saleGroup) => saleGroup.saleNo)).toEqual(["10", "7", "2", "-"]);
  });

  it("filters sale summaries by sale number or mark", () => {
    const grouped = groupCatalogueRows([
      makeRow({ id: "lot-1", sale_no: "10", mark: "ABHOYJAN" }),
      makeRow({ id: "lot-2", sale_no: "12", mark: "FURKATING" })
    ]);

    expect(filterSaleGroups(grouped[0]?.saleGroups ?? [], "12").map((saleGroup) => saleGroup.saleNo)).toEqual(["12"]);
    expect(filterSaleGroups(grouped[0]?.saleGroups ?? [], "furka").map((saleGroup) => saleGroup.saleNo)).toEqual(["12"]);
  });

  it("defaults the active catalogue state to the first centre and latest sale", () => {
    const grouped = groupCatalogueRows([
      makeRow({ id: "lot-1", auction_centre: "Kolkata", sale_no: "7" }),
      makeRow({ id: "lot-2", auction_centre: "Kolkata", sale_no: "10" }),
      makeRow({ id: "lot-3", auction_centre: "Guwahati", sale_no: "5" })
    ]);

    expect(resolveActiveCatalogueSelection(grouped, null, null)).toEqual({
      activeCentre: "Guwahati",
      activeSaleNo: "5"
    });
  });

  it("honors a valid centre and sale from query params", () => {
    const grouped = groupCatalogueRows([
      makeRow({ id: "lot-1", auction_centre: "Kolkata", sale_no: "7" }),
      makeRow({ id: "lot-2", auction_centre: "Kolkata", sale_no: "10" }),
      makeRow({ id: "lot-3", auction_centre: "Guwahati", sale_no: "5" })
    ]);

    expect(resolveActiveCatalogueSelection(grouped, "Kolkata", "7")).toEqual({
      activeCentre: "Kolkata",
      activeSaleNo: "7"
    });
  });
});
