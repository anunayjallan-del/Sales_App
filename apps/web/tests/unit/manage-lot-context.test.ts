import { describe, expect, it } from "vitest";
import {
  buildLaneTimeline,
  buildSamplingHistory,
  getActionContextMode,
  toDisplayFields,
  type ManageLotActionRow
} from "@/lib/manage-lot-context";

describe("manage-lot-context", () => {
  it("resolves context mode by selected action", () => {
    const rows: ManageLotActionRow[] = [];
    const lot = { auction_lane_status: "IN_TRANSIT", private_lane_status: "NEGOTIATING" };
    expect(getActionContextMode("PRINT", lot, rows)).toBe("auction");
    expect(getActionContextMode("SOLD_PENDING_DISPATCH", lot, rows)).toBe("private");
    expect(getActionContextMode("SAMPLING", lot, rows)).toBe("sampling");
    expect(getActionContextMode("CANCELLED", lot, rows)).toBe("both");
    expect(getActionContextMode("REINVOICED", lot, rows)).toBe("none");
  });

  it("resolves payment received lane by sold-origin action", () => {
    const rows: ManageLotActionRow[] = [
      {
        id: "2",
        action: "SOLD_AUCTION",
        performed_at: "2026-03-01T10:00:00.000Z",
        payload: { sale_no: "10" }
      },
      {
        id: "1",
        action: "SOLD_PRIVATE",
        performed_at: "2026-02-20T10:00:00.000Z",
        payload: { buyer: "Buyer A" }
      }
    ];

    const lot = { auction_lane_status: "SOLD_AUCTION", private_lane_status: "SOLD" };
    expect(getActionContextMode("PAYMENT_RECEIVED", lot, rows)).toBe("auction");
  });

  it("builds lane timeline with lane-only actions", () => {
    const rows: ManageLotActionRow[] = [
      { id: "4", action: "SOLD_PENDING_DISPATCH", performed_at: "2026-03-04T08:00:00.000Z", payload: { buyer: "Buyer A" } },
      { id: "3", action: "PRINT", performed_at: "2026-03-03T08:00:00.000Z", payload: { sale_no: "11" } },
      { id: "2", action: "AWR_RECEIVED", performed_at: "2026-03-02T08:00:00.000Z", payload: { arrival_date: "2026-03-02" } },
      { id: "1", action: "SAMPLING", performed_at: "2026-03-01T08:00:00.000Z", payload: { sampling_date: "2026-03-01" } }
    ];

    const auctionTimeline = buildLaneTimeline(rows, "auction");
    expect(auctionTimeline.map((item) => item.action)).toEqual(["PRINT", "AWR_RECEIVED"]);

    const privateTimeline = buildLaneTimeline(rows, "private");
    expect(privateTimeline.map((item) => item.action)).toEqual(["SOLD_PENDING_DISPATCH"]);
  });

  it("keeps sampling history separate", () => {
    const rows: ManageLotActionRow[] = [
      {
        id: "2",
        action: "SAMPLING",
        performed_at: "2026-03-05T08:00:00.000Z",
        payload: { parties: ["Buyer A", "Broker B"], sampling_date: "2026-03-05" }
      },
      {
        id: "1",
        action: "PRINT",
        performed_at: "2026-03-04T08:00:00.000Z",
        payload: { sale_no: "11" }
      }
    ];

    const samplingTimeline = buildSamplingHistory(rows);
    expect(samplingTimeline).toHaveLength(1);
    expect(samplingTimeline[0]?.action).toBe("SAMPLING");
    expect(samplingTimeline[0]?.fields.some((field) => field.key === "parties")).toBe(true);
  });

  it("omits audit keys and empty values in payload field rendering", () => {
    const fields = toDisplayFields("SOLD_PENDING_DISPATCH", {
      broker: "Broker A",
      buyer: "Buyer A",
      remarks: "",
      conflict_acknowledged: true,
      conflict_prompt_type: "EARLY_STAGE_GUIDANCE"
    });

    expect(fields.map((field) => field.key)).toEqual(["broker", "buyer"]);
  });
});
