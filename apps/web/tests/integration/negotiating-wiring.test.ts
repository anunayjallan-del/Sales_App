import { afterEach, describe, expect, it, vi } from "vitest";

type MockedLotsRepo = {
  addLotStatusEvent: ReturnType<typeof vi.fn>;
  createLotAction: ReturnType<typeof vi.fn>;
  createPrivateDeal: ReturnType<typeof vi.fn>;
  getActiveStatusesForLots: ReturnType<typeof vi.fn>;
  getLotActionById: ReturnType<typeof vi.fn>;
  getLatestDispatchToAuctionAction: ReturnType<typeof vi.fn>;
  getLotWithRelations: ReturnType<typeof vi.fn>;
  listLotActions: ReturnType<typeof vi.fn>;
  patchPrivateDeal: ReturnType<typeof vi.fn>;
  recordNegotiatingViaRpc: ReturnType<typeof vi.fn>;
  recordSamplingViaRpc: ReturnType<typeof vi.fn>;
  replaceLotActiveStatuses: ReturnType<typeof vi.fn>;
};

async function loadLotActionsRoute(lotsRepoOverrides: Partial<MockedLotsRepo> = {}) {
  vi.resetModules();

  const lotsRepo: MockedLotsRepo = {
    addLotStatusEvent: vi.fn(async () => ({ id: "status-event-1" })),
    createLotAction: vi.fn(async () => ({ id: "legacy-action-1" })),
    createPrivateDeal: vi.fn(async () => ({ id: "deal-1" })),
    getActiveStatusesForLots: vi.fn(async () => new Map([["lot-1", ["NEGOTIATING"]]])),
    getLotActionById: vi.fn(async () => ({ id: "action-1", action: "NEGOTIATING" })),
    getLatestDispatchToAuctionAction: vi.fn(async () => ({ id: "dispatch-1" })),
    getLotWithRelations: vi.fn(async () => ({ id: "lot-1", active_statuses: ["PENDING"] })),
    listLotActions: vi.fn(async () => []),
    patchPrivateDeal: vi.fn(async () => ({ id: "deal-1" })),
    recordNegotiatingViaRpc: vi.fn(async () => ({
      action_id: "action-1",
      created_deal_count: 2,
      lot_updated_at: "2026-04-07T11:00:00.000Z"
    })),
    recordSamplingViaRpc: vi.fn(async () => ({
      action_id: "sampling-action-1",
      sampling_event_id: "sampling-event-1",
      resolved_follow_up_due_date: "2026-04-08",
      lot_updated_at: "2026-04-07T11:00:00.000Z"
    })),
    replaceLotActiveStatuses: vi.fn(async () => undefined)
  };

  Object.assign(lotsRepo, lotsRepoOverrides);

  vi.doMock("@/lib/authz", () => ({
    requireRole: vi.fn(async () => ({ userId: "dev-user", role: "admin" }))
  }));
  vi.doMock("@/server/repositories/lots-repo", () => lotsRepo);

  const mod = await import("@/app/api/lots/[id]/actions/route");
  return { POST: mod.POST, lotsRepo };
}

afterEach(() => {
  vi.restoreAllMocks();
  vi.doUnmock("@/server/repositories/lots-repo");
  vi.doUnmock("@/lib/authz");
  vi.doUnmock("@/lib/supabase");
  vi.resetModules();
});

describe("negotiating write wiring", () => {
  it("routes NEGOTIATING writes to slice1_record_negotiating RPC", async () => {
    const { POST, lotsRepo } = await loadLotActionsRoute();

    const response = await POST(
      new Request("http://localhost/api/lots/lot-1/actions", {
        method: "POST",
        body: JSON.stringify({
          action: "NEGOTIATING",
          expected_lot_updated_at: "2026-04-07T10:00:00.000Z",
          data: {
            broker: "Broker A",
            buyers: ["Buyer A"],
            negotiation_date: "2026-04-07",
            remarks: "Round 1"
          }
        })
      }) as never,
      { params: Promise.resolve({ id: "lot-1" }) }
    );
    const payload = await response.json();

    expect(response.status).toBe(201);
    expect(lotsRepo.recordNegotiatingViaRpc).toHaveBeenCalledWith({
      lot_id: "lot-1",
      expected_lot_updated_at: "2026-04-07T10:00:00.000Z",
      broker: "Broker A",
      buyers: ["Buyer A"],
      negotiation_date: "2026-04-07",
      remarks: "Round 1"
    });
    expect(lotsRepo.createLotAction).not.toHaveBeenCalled();
    expect(lotsRepo.replaceLotActiveStatuses).not.toHaveBeenCalled();
    expect(lotsRepo.addLotStatusEvent).not.toHaveBeenCalled();
    expect(payload.negotiating).toEqual({
      created_deal_count: 2,
      lot_updated_at: "2026-04-07T11:00:00.000Z"
    });
  });

  it("passes multiple buyers and broker through RPC path", async () => {
    const { POST, lotsRepo } = await loadLotActionsRoute();

    const response = await POST(
      new Request("http://localhost/api/lots/lot-1/actions", {
        method: "POST",
        body: JSON.stringify({
          action: "NEGOTIATING",
          expected_lot_updated_at: "2026-04-07T10:00:00.000Z",
          data: {
            broker: "Broker X",
            buyers: ["Buyer A", "Buyer B", "Buyer C"],
            negotiation_date: "2026-04-07"
          }
        })
      }) as never,
      { params: Promise.resolve({ id: "lot-1" }) }
    );

    expect(response.status).toBe(201);
    expect(lotsRepo.recordNegotiatingViaRpc).toHaveBeenCalledWith(
      expect.objectContaining({
        broker: "Broker X",
        buyers: ["Buyer A", "Buyer B", "Buyer C"]
      })
    );
  });

  it("rejects stale negotiating writes", async () => {
    const { POST } = await loadLotActionsRoute({
      recordNegotiatingViaRpc: vi.fn(async () => {
        throw new Error("STALE_LOT_WRITE");
      })
    });

    const response = await POST(
      new Request("http://localhost/api/lots/lot-1/actions", {
        method: "POST",
        body: JSON.stringify({
          action: "NEGOTIATING",
          expected_lot_updated_at: "2026-04-07T10:00:00.000Z",
          data: {
            broker: "Broker A",
            buyers: ["Buyer A"],
            negotiation_date: "2026-04-07"
          }
        })
      }) as never,
      { params: Promise.resolve({ id: "lot-1" }) }
    );
    const payload = await response.json();

    expect(response.status).toBe(400);
    expect(payload.error).toContain("stale");
  });

  it("rejects duplicate same-buyer negotiating writes", async () => {
    const { POST } = await loadLotActionsRoute({
      recordNegotiatingViaRpc: vi.fn(async () => {
        throw new Error("DUPLICATE_NEGOTIATING_BUYER");
      })
    });

    const response = await POST(
      new Request("http://localhost/api/lots/lot-1/actions", {
        method: "POST",
        body: JSON.stringify({
          action: "NEGOTIATING",
          expected_lot_updated_at: "2026-04-07T10:00:00.000Z",
          data: {
            broker: "Broker A",
            buyers: ["Buyer A"],
            negotiation_date: "2026-04-07"
          }
        })
      }) as never,
      { params: Promise.resolve({ id: "lot-1" }) }
    );

    expect(response.status).toBe(400);
  });

  it("returns auction status preserved alongside NEGOTIATING when RPC leaves auction statuses intact", async () => {
    const { POST } = await loadLotActionsRoute({
      getActiveStatusesForLots: vi.fn(async () => new Map([["lot-1", ["CATALOGUED", "NEGOTIATING"]]]))
    });

    const response = await POST(
      new Request("http://localhost/api/lots/lot-1/actions", {
        method: "POST",
        body: JSON.stringify({
          action: "NEGOTIATING",
          expected_lot_updated_at: "2026-04-07T10:00:00.000Z",
          data: {
            broker: "Broker A",
            buyers: ["Buyer A"],
            negotiation_date: "2026-04-07"
          }
        })
      }) as never,
      { params: Promise.resolve({ id: "lot-1" }) }
    );
    const payload = await response.json();

    expect(response.status).toBe(201);
    expect(payload.activeStatuses).toEqual(expect.arrayContaining(["CATALOGUED", "NEGOTIATING"]));
  });

  it("reflects pending-placeholder removal when RPC returns only NEGOTIATING", async () => {
    const { POST } = await loadLotActionsRoute({
      getActiveStatusesForLots: vi.fn(async () => new Map([["lot-1", ["NEGOTIATING"]]]))
    });

    const response = await POST(
      new Request("http://localhost/api/lots/lot-1/actions", {
        method: "POST",
        body: JSON.stringify({
          action: "NEGOTIATING",
          expected_lot_updated_at: "2026-04-07T10:00:00.000Z",
          data: {
            broker: "Broker A",
            buyers: ["Buyer A"],
            negotiation_date: "2026-04-07"
          }
        })
      }) as never,
      { params: Promise.resolve({ id: "lot-1" }) }
    );
    const payload = await response.json();

    expect(response.status).toBe(201);
    expect(payload.activeStatuses).toEqual(["NEGOTIATING"]);
  });

  it("keeps non-negotiating actions on legacy status/event/action path", async () => {
    const { POST, lotsRepo } = await loadLotActionsRoute();

    const response = await POST(
      new Request("http://localhost/api/lots/lot-1/actions", {
        method: "POST",
        body: JSON.stringify({
          action: "DISPATCH_TO_AUCTION",
          data: {
            advice_date: "2026-04-06",
            broker: "Associated Brokers",
            warehouse: "Dipti Tea Warehouse",
            auction_centre: "Kolkata"
          }
        })
      }) as never,
      { params: Promise.resolve({ id: "lot-1" }) }
    );

    expect(response.status).toBe(201);
    expect(lotsRepo.recordNegotiatingViaRpc).not.toHaveBeenCalled();
    expect(lotsRepo.replaceLotActiveStatuses).toHaveBeenCalled();
    expect(lotsRepo.addLotStatusEvent).toHaveBeenCalled();
    expect(lotsRepo.createLotAction).toHaveBeenCalled();
  });
});

describe("negotiating repository wiring", () => {
  it("recordNegotiatingViaRpc sends broker/buyers/date and does not send buyer_id", async () => {
    vi.resetModules();
    const rpc = vi.fn(async () => ({
      data: [{ action_id: "action-1", created_deal_count: 2, lot_updated_at: "2026-04-07T11:00:00.000Z" }],
      error: null
    }));

    vi.doMock("@/lib/supabase", () => ({
      getSupabaseAdmin: () => ({ rpc })
    }));

    const { recordNegotiatingViaRpc } = await import("@/server/repositories/lots-repo");
    const result = await recordNegotiatingViaRpc({
      lot_id: "lot-1",
      expected_lot_updated_at: "2026-04-07T10:00:00.000Z",
      broker: "Broker A",
      buyers: ["Buyer A", "Buyer B"],
      negotiation_date: "2026-04-07",
      remarks: "Round 1"
    });

    expect(result.created_deal_count).toBe(2);
    expect(rpc).toHaveBeenCalledWith(
      "slice1_record_negotiating",
      expect.objectContaining({
        p_lot_id: "lot-1",
        p_broker: "Broker A",
        p_buyers: ["Buyer A", "Buyer B"],
        p_negotiation_date: "2026-04-07"
      })
    );
    expect(rpc.mock.calls[0]?.[1]).not.toHaveProperty("buyer_id");
    expect(rpc.mock.calls[0]?.[1]).not.toHaveProperty("p_buyer_id");
  });

  it("structured negotiating snapshot reads from private_deals + parties", async () => {
    vi.resetModules();
    const from = vi.fn((table: string) => {
      if (table === "private_deals") {
        return {
          select: () => ({
            eq: () => ({
              in: async () => ({
                data: [
                  {
                    lot_id: "lot-1",
                    negotiation_date: "2026-04-07",
                    created_at: "2026-04-07T09:00:00.000Z",
                    buyer_party: { name: "Buyer A" },
                    broker_party: { name: "Broker Z" },
                    buyer: null
                  },
                  {
                    lot_id: "lot-1",
                    negotiation_date: "2026-04-07",
                    created_at: "2026-04-07T09:00:00.000Z",
                    buyer_party: { name: "Buyer B" },
                    broker_party: { name: "Broker Z" },
                    buyer: null
                  }
                ],
                error: null
              })
            })
          })
        };
      }
      if (table === "lot_actions") {
        return {
          select: () => ({
            eq: () => ({
              in: async () => ({
                data: [],
                error: null
              })
            })
          })
        };
      }
      throw new Error(`Unexpected table: ${table}`);
    });

    vi.doMock("@/lib/supabase", () => ({
      getSupabaseAdmin: () => ({ from })
    }));

    const { getNegotiatingSnapshotByLotIds } = await import("@/server/repositories/lots-repo");
    const snapshot = await getNegotiatingSnapshotByLotIds(["lot-1"]);

    expect(from).toHaveBeenCalledWith("private_deals");
    expect(snapshot.get("lot-1")).toEqual({
      negotiating_buyers: ["Buyer A", "Buyer B"],
      negotiating_brokers: ["Broker Z"],
      last_negotiated_on: "2026-04-07"
    });
  });

  it("falls back to lot_actions negotiating payload when structured rows are absent", async () => {
    vi.resetModules();
    const from = vi.fn((table: string) => {
      if (table === "private_deals") {
        return {
          select: () => ({
            eq: () => ({
              in: async () => ({
                data: [],
                error: null
              })
            })
          })
        };
      }
      if (table === "lot_actions") {
        return {
          select: () => ({
            eq: () => ({
              in: async () => ({
                data: [
                  {
                    lot_id: "lot-1",
                    payload: { broker: "Legacy Broker", buyers: ["Legacy Buyer"], negotiation_date: "2026-03-01" },
                    performed_at: "2026-03-01T08:00:00.000Z"
                  }
                ],
                error: null
              })
            })
          })
        };
      }
      throw new Error(`Unexpected table: ${table}`);
    });

    vi.doMock("@/lib/supabase", () => ({
      getSupabaseAdmin: () => ({ from })
    }));

    const { getNegotiatingSnapshotByLotIds } = await import("@/server/repositories/lots-repo");
    const snapshot = await getNegotiatingSnapshotByLotIds(["lot-1"]);

    expect(from).toHaveBeenCalledWith("private_deals");
    expect(from).toHaveBeenCalledWith("lot_actions");
    expect(snapshot.get("lot-1")).toEqual({
      negotiating_buyers: ["Legacy Buyer"],
      negotiating_brokers: ["Legacy Broker"],
      last_negotiated_on: "2026-03-01"
    });
  });

  it("blocks legacy create/patch statuses that conflict with slice-1 negotiating/sampling truth", async () => {
    vi.resetModules();
    const from = vi.fn(() => ({
      insert: () => ({
        select: () => ({
          single: async () => ({ data: { id: "deal-1" }, error: null })
        })
      }),
      update: () => ({
        eq: () => ({
          select: () => ({
            single: async () => ({ data: { id: "deal-1" }, error: null })
          })
        })
      })
    }));

    vi.doMock("@/lib/supabase", () => ({
      getSupabaseAdmin: () => ({ from })
    }));

    const { createPrivateDeal, patchPrivateDeal } = await import("@/server/repositories/lots-repo");

    await expect(createPrivateDeal({ status: "NEGOTIATING" })).rejects.toThrow(/RPC flow/i);
    await expect(createPrivateDeal({ status: "SAMPLING_SENT" })).rejects.toThrow(/RPC flow/i);
    await expect(patchPrivateDeal("deal-1", { status: "NEGOTIATING" })).rejects.toThrow(/RPC flow/i);
    await expect(patchPrivateDeal("deal-1", { status: "SAMPLING_SENT" })).rejects.toThrow(/RPC flow/i);

    await expect(createPrivateDeal({ status: "SOLD_PENDING_DISPATCH" })).resolves.toMatchObject({ id: "deal-1" });
    await expect(patchPrivateDeal("deal-1", { status: "SOLD" })).resolves.toMatchObject({ id: "deal-1" });
  });
});
