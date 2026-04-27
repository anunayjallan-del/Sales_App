import { afterEach, describe, expect, it, vi } from "vitest";

type MockedLotsRepo = {
  addLotStatusEvent: ReturnType<typeof vi.fn>;
  createLotAction: ReturnType<typeof vi.fn>;
  getActiveStatusesForLots: ReturnType<typeof vi.fn>;
  getLotActionById: ReturnType<typeof vi.fn>;
  getLatestDispatchToAuctionAction: ReturnType<typeof vi.fn>;
  getLotWithRelations: ReturnType<typeof vi.fn>;
  listLotActions: ReturnType<typeof vi.fn>;
  recordSamplingViaRpc: ReturnType<typeof vi.fn>;
  replaceLotActiveStatuses: ReturnType<typeof vi.fn>;
};

async function loadLotActionsRoute(lotsRepoOverrides: Partial<MockedLotsRepo> = {}) {
  vi.resetModules();

  const lotsRepo: MockedLotsRepo = {
    addLotStatusEvent: vi.fn(async () => ({ id: "status-event-1" })),
    createLotAction: vi.fn(async () => ({ id: "legacy-action-1" })),
    getActiveStatusesForLots: vi.fn(async () => new Map([["lot-1", ["PENDING"]]])),
    getLotActionById: vi.fn(async () => ({ id: "action-1", action: "SAMPLING" })),
    getLatestDispatchToAuctionAction: vi.fn(async () => ({ id: "dispatch-1" })),
    getLotWithRelations: vi.fn(async () => ({ id: "lot-1", active_statuses: ["PENDING"] })),
    listLotActions: vi.fn(async () => []),
    recordSamplingViaRpc: vi.fn(async () => ({
      action_id: "action-1",
      sampling_event_id: "sampling-event-1",
      resolved_follow_up_due_date: "2026-04-12",
      lot_updated_at: "2026-04-05T11:00:00.000Z"
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

describe("sampling write wiring", () => {
  it("routes SAMPLING writes to slice1_record_sampling RPC (single party)", async () => {
    const { POST, lotsRepo } = await loadLotActionsRoute();

    const response = await POST(
      new Request("http://localhost/api/lots/lot-1/actions", {
        method: "POST",
        body: JSON.stringify({
          action: "SAMPLING",
          expected_lot_updated_at: "2026-04-05T10:00:00.000Z",
          data: {
            parties: ["Buyer A"],
            sampling_date: "2026-04-05",
            remarks: "Initial sample"
          }
        })
      }) as never,
      { params: Promise.resolve({ id: "lot-1" }) }
    );
    const payload = await response.json();

    expect(response.status).toBe(201);
    expect(lotsRepo.recordSamplingViaRpc).toHaveBeenCalledWith({
      lot_id: "lot-1",
      expected_lot_updated_at: "2026-04-05T10:00:00.000Z",
      parties: ["Buyer A"],
      sampling_date: "2026-04-05",
      follow_up_due_date: undefined,
      remarks: "Initial sample"
    });
    expect(lotsRepo.createLotAction).not.toHaveBeenCalled();
    expect(lotsRepo.replaceLotActiveStatuses).not.toHaveBeenCalled();
    expect(lotsRepo.addLotStatusEvent).not.toHaveBeenCalled();
    expect(payload.sampling).toEqual({
      sampling_event_id: "sampling-event-1",
      resolved_follow_up_due_date: "2026-04-12",
      lot_updated_at: "2026-04-05T11:00:00.000Z"
    });
  });

  it("supports sampling multiple parties via RPC path", async () => {
    const { POST, lotsRepo } = await loadLotActionsRoute();

    const response = await POST(
      new Request("http://localhost/api/lots/lot-1/actions", {
        method: "POST",
        body: JSON.stringify({
          action: "SAMPLING",
          expected_lot_updated_at: "2026-04-05T10:00:00.000Z",
          data: {
            parties: ["Buyer A", "Buyer B"],
            sampling_date: "2026-04-05",
            follow_up_due_date: "2026-04-15"
          }
        })
      }) as never,
      { params: Promise.resolve({ id: "lot-1" }) }
    );

    expect(response.status).toBe(201);
    expect(lotsRepo.recordSamplingViaRpc).toHaveBeenCalledWith(
      expect.objectContaining({
        parties: ["Buyer A", "Buyer B"],
        follow_up_due_date: "2026-04-15"
      })
    );
  });

  it("rejects stale sampling writes", async () => {
    const { POST } = await loadLotActionsRoute({
      recordSamplingViaRpc: vi.fn(async () => {
        throw new Error("STALE_LOT_WRITE");
      })
    });

    const response = await POST(
      new Request("http://localhost/api/lots/lot-1/actions", {
        method: "POST",
        body: JSON.stringify({
          action: "SAMPLING",
          expected_lot_updated_at: "2026-04-05T10:00:00.000Z",
          data: {
            parties: ["Buyer A"],
            sampling_date: "2026-04-05"
          }
        })
      }) as never,
      { params: Promise.resolve({ id: "lot-1" }) }
    );
    const payload = await response.json();

    expect(response.status).toBe(400);
    expect(payload.error).toContain("stale");
  });

  it("keeps non-sampling actions on the legacy status/event/action path", async () => {
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
    expect(lotsRepo.recordSamplingViaRpc).not.toHaveBeenCalled();
    expect(lotsRepo.replaceLotActiveStatuses).toHaveBeenCalled();
    expect(lotsRepo.addLotStatusEvent).toHaveBeenCalled();
    expect(lotsRepo.createLotAction).toHaveBeenCalled();
  });
});

describe("structured sampling reads", () => {
  it("reads sampling records from structured sampling tables before legacy fallback", async () => {
    vi.resetModules();
    vi.doUnmock("@/server/repositories/lots-repo");
    vi.doUnmock("@/lib/authz");
    const from = vi.fn((table: string) => {
      if (table === "sampling_events") {
        return {
          select: () => ({
            order: () => ({
              order: async () => ({
                data: [
                  {
                    id: "sampling-event-1",
                    lot_id: "lot-1",
                    sampled_on: "2026-04-05",
                    remarks: "Structured sampling",
                    created_at: "2026-04-05T09:00:00.000Z",
                    lots: {
                      mark: "ABHOYJAN",
                      invoice_number: "INV-1",
                      grade: "BOP",
                      updated_at: "2026-04-05T09:05:00.000Z"
                    },
                    sampling_event_parties: [
                      { follow_up_due_date: "2026-04-12", party: { name: "Buyer A" } },
                      { follow_up_due_date: "2026-04-12", party: { name: "Buyer B" } }
                    ]
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
              order: async () => ({
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

    const { listSamplingActions } = await import("@/server/repositories/lots-repo");
    const rows = await listSamplingActions();

    expect(from).toHaveBeenCalledWith("sampling_events");
    expect(from).not.toHaveBeenCalledWith("lot_actions");
    expect(rows[0]).toMatchObject({
      sampling_event_id: "sampling-event-1",
      lot_id: "lot-1",
      payload: {
        parties: ["Buyer A", "Buyer B"],
        sampling_date: "2026-04-05",
        follow_up_due_date: "2026-04-12",
        remarks: "Structured sampling"
      }
    });
  });
});

describe("/api/sampling route", () => {
  it("returns sampling rows from structured-first repository reads", async () => {
    vi.resetModules();
    const listSamplingActions = vi.fn(async () => [
      {
        id: "sampling-event-1",
        sampling_event_id: "sampling-event-1",
        lot_id: "lot-1",
        performed_at: "2026-04-05T09:00:00.000Z",
        payload: {
          parties: ["Buyer A"],
          sampling_date: "2026-04-05",
          follow_up_due_date: "2026-04-12"
        }
      }
    ]);

    vi.doMock("@/lib/authz", () => ({
      requireRole: vi.fn(async () => ({ userId: "dev-user", role: "admin" }))
    }));
    vi.doMock("@/server/repositories/lots-repo", () => ({
      listSamplingActions
    }));

    const { GET } = await import("@/app/api/sampling/route");
    const response = await GET(new Request("http://localhost/api/sampling") as never);
    const payload = await response.json();

    expect(response.status).toBe(200);
    expect(listSamplingActions).toHaveBeenCalledTimes(1);
    expect(payload.rows[0]).toMatchObject({
      sampling_event_id: "sampling-event-1",
      payload: {
        follow_up_due_date: "2026-04-12"
      }
    });
  });
});
