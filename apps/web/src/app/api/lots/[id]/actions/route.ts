import { NextRequest } from "next/server";
import { badRequest, ok, serverError } from "@/lib/http";
import { requireRole } from "@/lib/authz";
import {
  addLotStatusEvent,
  createLotAction,
  getActiveStatusesForLots,
  getLotActionById,
  getLatestDispatchToAuctionAction,
  getLotWithRelations,
  listLotActions,
  recordNegotiatingViaRpc,
  recordSamplingViaRpc,
  replaceLotActiveStatuses
} from "@/server/repositories/lots-repo";
import { createLotActionSchema } from "@/server/schemas/lot-schemas";
import {
  applyActionToStatuses,
  actionLabel,
  actionRules,
  getAllowedActionsForStatuses,
  isConflictPromptTypeCompatible,
  isActionAllowedForStatuses,
  normalizeConflictPromptTypeForAudit,
  parseActionPayload,
  resolveConflictPromptType,
  shouldRequireConflictAck,
  splitLotStatusLanes
} from "@/server/services/lot-actions";
import { deriveWarnings } from "@/server/services/flat-status-engine";
import { mergeFinalizedSoldAuctionPayload } from "@/server/services/auction-sale-desk";
import { getSupabaseAdmin } from "@/lib/supabase";
import { GlobalLotStatus } from "@/lib/types";

export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    await requireRole(req, ["admin", "operator"]);
    const { id } = await params;
    const rows = await listLotActions(id);
    return ok({ rows });
  } catch (error) {
    return serverError(error);
  }
}

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    await requireRole(req, ["admin", "operator"]);
    const parsed = createLotActionSchema.safeParse(await req.json());
    if (!parsed.success) return badRequest("Invalid payload", parsed.error.issues);

    const { id } = await params;
    const lot = await getLotWithRelations(id);
    const activeMap = await getActiveStatusesForLots([id]);
    const activeStatuses: GlobalLotStatus[] = (activeMap.get(id) ?? lot.active_statuses ?? ["PENDING"]) as GlobalLotStatus[];

    if (!isActionAllowedForStatuses(parsed.data.action, activeStatuses)) {
      const allowed = getAllowedActionsForStatuses(activeStatuses).map((name) => actionLabel(name));
      return badRequest(
        `Action ${actionLabel(parsed.data.action)} is not allowed for current lot state.`,
        [{ code: "custom", message: `Allowed actions: ${allowed.join(", ") || "-"}` }]
      );
    }

    const actionPayload = parseActionPayload(parsed.data.action, parsed.data.data);
    if (!actionPayload.success) return badRequest("Missing/invalid action fields", actionPayload.error.issues);

    let validatedPayloadData = actionPayload.data as Record<string, unknown>;
    if (parsed.data.action === "FINALIZE_SOLD_AUCTION") {
      const actionRows = await listLotActions(id);
      const liveSoldAction = actionRows.find((row) => String(row.action) === "SOLD_AUCTION_LIVE");
      if (!liveSoldAction) {
        return badRequest("Cannot finalize sold auction without a prior live sale action.");
      }

      const mergedPayload = mergeFinalizedSoldAuctionPayload(
        (liveSoldAction.payload as Record<string, unknown> | null) ?? null,
        validatedPayloadData
      );
      const finalPayload = parseActionPayload("SOLD_AUCTION", mergedPayload);
      if (!finalPayload.success) {
        return badRequest("Missing/invalid action fields", finalPayload.error.issues);
      }
      validatedPayloadData = finalPayload.data as Record<string, unknown>;
    }

    const lanes = splitLotStatusLanes(activeStatuses);
    if (shouldRequireConflictAck(parsed.data.action, lanes.auction)) {
      const expectedPrompt = resolveConflictPromptType(lanes.auction);
      if (!parsed.data.conflict_acknowledged) {
        return badRequest("Conflict acknowledgement is required for private progression while auction flow is active.");
      }
      if (!isConflictPromptTypeCompatible(parsed.data.conflict_prompt_type, expectedPrompt)) {
        return badRequest("Invalid conflict acknowledgement prompt type.");
      }
    }

    const resolvedPromptForAudit = normalizeConflictPromptTypeForAudit(
      parsed.data.conflict_prompt_type,
      resolveConflictPromptType(lanes.auction)
    );

    const payloadWithAudit = {
      ...validatedPayloadData,
      ...(parsed.data.conflict_acknowledged
        ? {
            conflict_acknowledged: true,
            conflict_prompt_type: resolvedPromptForAudit,
            conflict_acknowledged_at: parsed.data.conflict_acknowledged_at ?? new Date().toISOString()
          }
        : {})
    } as Record<string, unknown>;

    if (parsed.data.action === "SAMPLING") {
      const expectedLotUpdatedAt = String(parsed.data.expected_lot_updated_at ?? "").trim();
      if (!expectedLotUpdatedAt) {
        return badRequest("Missing expected lot timestamp for sampling.");
      }

      const samplingPayload = validatedPayloadData as {
        parties: string[];
        sampling_date: string;
        follow_up_due_date?: string;
        remarks?: string;
      };

      try {
        const samplingResult = await recordSamplingViaRpc({
          lot_id: id,
          expected_lot_updated_at: expectedLotUpdatedAt,
          parties: samplingPayload.parties,
          sampling_date: samplingPayload.sampling_date,
          follow_up_due_date: samplingPayload.follow_up_due_date,
          remarks: samplingPayload.remarks
        });

        const actionRow = await getLotActionById(id, samplingResult.action_id);
        const latestStatuses = ((await getActiveStatusesForLots([id])).get(id) ?? activeStatuses) as GlobalLotStatus[];
        const warnings = deriveWarnings(latestStatuses);

        return ok(
          {
            action:
              actionRow ??
              ({
                id: samplingResult.action_id,
                lot_id: id,
                action: "SAMPLING",
                payload: payloadWithAudit
              } as Record<string, unknown>),
            activeStatuses: latestStatuses,
            warnings,
            sampling: {
              sampling_event_id: samplingResult.sampling_event_id,
              resolved_follow_up_due_date: samplingResult.resolved_follow_up_due_date,
              lot_updated_at: samplingResult.lot_updated_at
            }
          },
          201
        );
      } catch (rpcError) {
        const code = String(
          typeof rpcError === "object" &&
            rpcError !== null &&
            "message" in rpcError &&
            typeof rpcError.message === "string"
            ? rpcError.message
            : ""
        ).trim();

        if (code === "STALE_LOT_WRITE") {
          return badRequest("Sampling save rejected due to stale lot version. Refresh and retry.");
        }
        if (code.startsWith("SAMPLING_")) {
          return badRequest(code);
        }
        throw rpcError;
      }
    }

    if (parsed.data.action === "NEGOTIATING") {
      const expectedLotUpdatedAt = String(parsed.data.expected_lot_updated_at ?? "").trim();
      if (!expectedLotUpdatedAt) {
        return badRequest("Missing expected lot timestamp for negotiating.");
      }

      const negotiatingPayload = validatedPayloadData as {
        broker: string;
        buyers: string[];
        negotiation_date: string;
        remarks?: string;
      };

      try {
        const negotiatingResult = await recordNegotiatingViaRpc({
          lot_id: id,
          expected_lot_updated_at: expectedLotUpdatedAt,
          broker: negotiatingPayload.broker,
          buyers: negotiatingPayload.buyers,
          negotiation_date: negotiatingPayload.negotiation_date,
          remarks: negotiatingPayload.remarks
        });

        const actionRow = await getLotActionById(id, negotiatingResult.action_id);
        const latestStatuses = ((await getActiveStatusesForLots([id])).get(id) ?? activeStatuses) as GlobalLotStatus[];
        const warnings = deriveWarnings(latestStatuses);

        return ok(
          {
            action:
              actionRow ??
              ({
                id: negotiatingResult.action_id,
                lot_id: id,
                action: "NEGOTIATING",
                payload: payloadWithAudit
              } as Record<string, unknown>),
            activeStatuses: latestStatuses,
            warnings,
            negotiating: {
              created_deal_count: negotiatingResult.created_deal_count,
              lot_updated_at: negotiatingResult.lot_updated_at
            }
          },
          201
        );
      } catch (rpcError) {
        const code = String(
          typeof rpcError === "object" &&
            rpcError !== null &&
            "message" in rpcError &&
            typeof rpcError.message === "string"
            ? rpcError.message
            : ""
        ).trim();

        if (code === "STALE_LOT_WRITE") {
          return badRequest("Negotiating save rejected due to stale lot version. Refresh and retry.");
        }
        if (code === "DUPLICATE_NEGOTIATING_BUYER") {
          return badRequest("Duplicate open negotiating buyer for this lot.");
        }
        if (code.startsWith("NEGOTIATING_")) {
          return badRequest(code);
        }
        throw rpcError;
      }
    }

    const rule = actionRules[parsed.data.action];
    const transition = applyActionToStatuses(parsed.data.action, activeStatuses);

    // Reinvoice special handling: source lot cancelled + selected target lot kept pending.
    if (parsed.data.action === "REINVOICED") {
      const payload = actionPayload.data as {
        reinvoiced_to_lot_id: string;
        reinvoice_date: string;
        remarks?: string;
      };
      const targetLotId = String(payload.reinvoiced_to_lot_id);
      if (!targetLotId) {
        return badRequest("Reinvoiced target lot is required.");
      }
      if (targetLotId === id) {
        return badRequest("Target lot must be different from source lot.");
      }

      const { data: targetLot, error: targetLotError } = await getSupabaseAdmin()
        .from("lots")
        .select("*")
        .eq("id", targetLotId)
        .single();
      if (targetLotError) {
        return badRequest("Selected target lot not found.");
      }

      const targetActiveMap = await getActiveStatusesForLots([targetLotId]);
      const targetActiveStatuses = (targetActiveMap.get(targetLotId) ?? ["PENDING"]) as GlobalLotStatus[];
      const isTargetPending =
        targetActiveStatuses.length === 1 &&
        targetActiveStatuses[0] === "PENDING" &&
        !Boolean(targetLot.is_cancelled);
      if (!isTargetPending) {
        return badRequest("Selected target lot must be in pending status.");
      }

      await replaceLotActiveStatuses(id, ["CANCELLED"]);
      await addLotStatusEvent({
        lotId: id,
        status: "CANCELLED",
        source: "MANUAL",
        meta: { reinvoiced_to: targetLotId, ...payload }
      });
      await replaceLotActiveStatuses(targetLotId, ["PENDING"]);
      await addLotStatusEvent({
        lotId: targetLotId,
        status: "PENDING",
        source: "MANUAL",
        meta: { reinvoiced_from: id, ...payload }
      });
      await getSupabaseAdmin()
        .from("lots")
        .update({ is_cancelled: true })
        .eq("id", id);
      await getSupabaseAdmin()
        .from("lots")
        .update({ is_cancelled: false, repacked_from_lot_id: id })
        .eq("id", targetLotId);

      const warnings = deriveWarnings(["CANCELLED"]);
      const actionRow = await createLotAction({
        lotId: id,
        action: parsed.data.action,
        resultingStatus: "CANCELLED",
        payload: payloadWithAudit,
        warningFlags: warnings
      });
      return ok({ action: actionRow, activeStatuses: ["CANCELLED"], warnings, reinvoicedLot: targetLot }, 201);
    }

    if (parsed.data.action === "CANCELLED") {
      await getSupabaseAdmin().from("lots").update({ is_cancelled: true }).eq("id", id);
    }
    if (parsed.data.action === "PAYMENT_RECEIVED") {
      await getSupabaseAdmin()
        .from("lots")
        .update({ is_cancelled: false })
        .eq("id", id);
    }

    const isLifecycleTransition = !rule.eventOnly;
    let resultingStatuses = activeStatuses;
    if (isLifecycleTransition) {
      resultingStatuses = transition.nextStatuses;
      await replaceLotActiveStatuses(id, resultingStatuses);

      const previousSet = new Set(activeStatuses);
      const nextSet = new Set(resultingStatuses);
      const added = resultingStatuses.filter((status) => !previousSet.has(status));
      const removed = activeStatuses.filter((status) => !nextSet.has(status));

      for (const status of added) {
        await addLotStatusEvent({
          lotId: id,
          status,
          source: "MANUAL",
          meta: { action: parsed.data.action, ...payloadWithAudit }
        });
      }
      for (const status of removed) {
        await addLotStatusEvent({
          lotId: id,
          status,
          source: "MANUAL",
          meta: { action: parsed.data.action, removed: true, ...payloadWithAudit }
        });
      }
    }

    const resultingStatusForAudit = transition.resultingStatus;
    const warnings = deriveWarnings(resultingStatuses);
    if (parsed.data.action === "AUCTION_DISPATCHED") {
      const latestPrepared = await getLatestDispatchToAuctionAction(id);
      if (!latestPrepared) {
        warnings.push("DISPATCH_ADVICE_MISSING");
      }
    }
    const actionRow = await createLotAction({
      lotId: id,
      action: parsed.data.action,
      resultingStatus: resultingStatusForAudit,
      payload: payloadWithAudit,
      warningFlags: warnings
    });

    return ok({ action: actionRow, activeStatuses: resultingStatuses, warnings }, 201);
  } catch (error) {
    return serverError(error);
  }
}
