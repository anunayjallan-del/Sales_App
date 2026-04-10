import { describe, expect, it } from "vitest";
import { resolveCatalogueSaleNo } from "@/lib/auction-catalogue";

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
});
