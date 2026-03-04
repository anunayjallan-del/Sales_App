import { z } from "zod";
import { GlobalLotStatus } from "@/lib/types";

export const actionNames = [
  "SAMPLING",
  "DISPATCH_TO_AUCTION",
  "AUCTION_DISPATCHED",
  "HOLD_AWR",
  "AWR_RECEIVED",
  "PRINT",
  "SET_RESERVE_PRICE",
  "SOLD_AUCTION",
  "OUT",
  "REPRINT",
  "HOLD",
  "WITHDRAW",
  "NEGOTIATING",
  "SOLD_PENDING_DISPATCH",
  "SOLD_PRIVATE",
  "CANCELLED",
  "REINVOICED",
  "PAYMENT_RECEIVED"
] as const;

export type LotActionName = (typeof actionNames)[number];

type ActionRule = {
  resultingStatus?: GlobalLotStatus;
  eventOnly?: boolean;
  allowedFrom: GlobalLotStatus[];
  schema: z.ZodTypeAny;
};

export const auctionLaneStatuses = [
  "PENDING_AUCTION_DISPATCH",
  "IN_TRANSIT",
  "AWR_PENDING",
  "AWR_RECEIVED",
  "CATALOGUED",
  "RESERVE_SET",
  "SOLD_AUCTION",
  "OUT",
  "HOLD",
  "REPRINT",
  "WITHDRAW"
] as const;

export const privateLaneStatuses = ["NEGOTIATING", "SOLD_PENDING_DISPATCH", "SOLD"] as const;

export const terminalStatuses = ["CANCELLED", "CLOSED"] as const;

export const privateProgressionActions = ["NEGOTIATING", "SOLD_PENDING_DISPATCH", "SOLD_PRIVATE"] as const;

export const privateCommitmentActions = ["SOLD_PENDING_DISPATCH", "SOLD_PRIVATE"] as const;

export const conflictPromptTypes = [
  "EARLY_STAGE_GUIDANCE",
  "MIDDLE_STAGE_1_GUIDANCE",
  "MIDDLE_STAGE_2_GUIDANCE",
  "LATER_STAGE_GUIDANCE"
] as const;

export const legacyConflictPromptTypes = ["WITHDRAW_GUIDANCE", "CANCEL_PRINTING_GUIDANCE"] as const;

export const acceptedConflictPromptTypes = [...conflictPromptTypes, ...legacyConflictPromptTypes] as const;

export type ConflictPromptType = (typeof conflictPromptTypes)[number];
export type AcceptedConflictPromptType = (typeof acceptedConflictPromptTypes)[number];

type LotStatusLanes = {
  terminal: GlobalLotStatus | null;
  auction: GlobalLotStatus | null;
  private: GlobalLotStatus | null;
};

const auctionStatusPriority: GlobalLotStatus[] = [
  "SOLD_AUCTION",
  "WITHDRAW",
  "REPRINT",
  "HOLD",
  "OUT",
  "RESERVE_SET",
  "CATALOGUED",
  "AWR_RECEIVED",
  "AWR_PENDING",
  "IN_TRANSIT",
  "PENDING_AUCTION_DISPATCH"
];

const privateStatusPriority: GlobalLotStatus[] = ["SOLD", "SOLD_PENDING_DISPATCH", "NEGOTIATING"];

const auctionActionSet = new Set<LotActionName>([
  "DISPATCH_TO_AUCTION",
  "AUCTION_DISPATCHED",
  "HOLD_AWR",
  "AWR_RECEIVED",
  "PRINT",
  "SET_RESERVE_PRICE",
  "SOLD_AUCTION",
  "OUT",
  "REPRINT",
  "HOLD",
  "WITHDRAW"
]);

const privateActionSet = new Set<LotActionName>(["NEGOTIATING", "SOLD_PENDING_DISPATCH", "SOLD_PRIVATE"]);

const auctionStatusesEarlyStage = new Set<GlobalLotStatus>(["PENDING_AUCTION_DISPATCH", "IN_TRANSIT"]);

const auctionStatusesMiddleStage1 = new Set<GlobalLotStatus>(["AWR_PENDING"]);

const auctionStatusesMiddleStage2 = new Set<GlobalLotStatus>(["AWR_RECEIVED"]);

const auctionStatusesLaterStage = new Set<GlobalLotStatus>(["CATALOGUED", "RESERVE_SET", "OUT", "HOLD", "REPRINT"]);

const auctionActiveForPrivateConflict = new Set<GlobalLotStatus>([
  "PENDING_AUCTION_DISPATCH",
  "IN_TRANSIT",
  "AWR_PENDING",
  "AWR_RECEIVED",
  "CATALOGUED",
  "RESERVE_SET",
  "OUT",
  "HOLD",
  "REPRINT"
]);

const commonRemark = { remarks: z.string().optional() };
const diptiWarehouse = "Dipti Tea Warehouse";
const nowalWarehouse = "Nowal Tea Warehouse";
const kolkataCentre = "Kolkata";
const guwahatiCentre = "Guwahati";

function normalizeBuyerList(input: unknown): string[] {
  if (Array.isArray(input)) {
    return Array.from(
      new Set(
        input
          .map((value) => String(value ?? "").trim())
          .filter(Boolean)
      )
    );
  }
  const single = String(input ?? "").trim();
  return single ? [single] : [];
}

const negotiatingSchema = z
  .object({
    buyer: z.string().optional(),
    buyers: z.array(z.string()).optional(),
    negotiation_date: z.string().trim().min(1)
  })
  .superRefine((value, ctx) => {
    const normalized = [...normalizeBuyerList(value.buyers), ...normalizeBuyerList(value.buyer)];
    if (!normalized.length) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["buyers"],
        message: "At least one buyer is required."
      });
    }
  })
  .transform((value) => ({
    buyers: Array.from(new Set([...normalizeBuyerList(value.buyers), ...normalizeBuyerList(value.buyer)])),
    negotiation_date: value.negotiation_date
  }));

export const actionRules: Record<LotActionName, ActionRule> = {
  SAMPLING: {
    eventOnly: true,
    allowedFrom: ["PENDING", "IN_TRANSIT", "AWR_PENDING", "AWR_RECEIVED", "CATALOGUED", "HOLD", "OUT", "WITHDRAW", "SAMPLING_SENT"],
    schema: z.object({
      parties: z.array(z.string().min(1)).min(1),
      sampling_date: z.string().min(1),
      ...commonRemark
    })
  },
  DISPATCH_TO_AUCTION: {
    resultingStatus: "PENDING_AUCTION_DISPATCH",
    allowedFrom: ["PENDING", "NEGOTIATING"],
    schema: z
      .object({
        advice_date: z.string().min(1),
        broker: z.string().min(1),
        warehouse: z.string().min(1),
        auction_centre: z.string().min(1),
        ...commonRemark
      })
      .superRefine((value, ctx) => {
        const warehouse = value.warehouse.trim();
        const centre = value.auction_centre.trim();
        const broker = value.broker.trim();
        if (warehouse === diptiWarehouse && centre !== kolkataCentre) {
          ctx.addIssue({
            code: z.ZodIssueCode.custom,
            path: ["auction_centre"],
            message: `${diptiWarehouse} must map to ${kolkataCentre}.`
          });
        }
        if (warehouse === nowalWarehouse && centre !== guwahatiCentre) {
          ctx.addIssue({
            code: z.ZodIssueCode.custom,
            path: ["auction_centre"],
            message: `${nowalWarehouse} must map to ${guwahatiCentre}.`
          });
        }
        if (broker === "Associated Brokers" && warehouse !== diptiWarehouse) {
          ctx.addIssue({
            code: z.ZodIssueCode.custom,
            path: ["warehouse"],
            message: "Associated Brokers must map to Dipti Tea Warehouse."
          });
        }
      })
  },
  AUCTION_DISPATCHED: {
    resultingStatus: "IN_TRANSIT",
    allowedFrom: ["PENDING_AUCTION_DISPATCH"],
    schema: z.object({
      dispatch_date: z.string().min(1),
      transporter: z.string().min(1),
      ...commonRemark
    })
  },
  HOLD_AWR: {
    resultingStatus: "AWR_PENDING",
    allowedFrom: ["IN_TRANSIT"],
    schema: z.object({
      arrival_date: z.string().min(1),
      ...commonRemark
    })
  },
  AWR_RECEIVED: {
    resultingStatus: "AWR_RECEIVED",
    allowedFrom: ["IN_TRANSIT", "AWR_PENDING"],
    schema: z.object({
      arrival_date: z.string().min(1),
      ...commonRemark
    })
  },
  PRINT: {
    resultingStatus: "CATALOGUED",
    allowedFrom: ["AWR_RECEIVED"],
    schema: z.object({
      print_date: z.string().min(1),
      sale_no: z.string().min(1),
      ...commonRemark
    })
  },
  SET_RESERVE_PRICE: {
    resultingStatus: "RESERVE_SET",
    allowedFrom: ["CATALOGUED", "REPRINT"],
    schema: z.object({
      reserve_price: z.coerce.number().positive(),
      reserve_set_date: z.string().min(1),
      point_of_contact: z.string().min(1),
      ...commonRemark
    })
  },
  SOLD_AUCTION: {
    resultingStatus: "SOLD_AUCTION",
    allowedFrom: ["RESERVE_SET", "CATALOGUED"],
    schema: z.object({
      sale_no: z.string().min(1),
      sale_date: z.string().min(1),
      hammer_price: z.coerce.number().positive(),
      buyer_name: z.string().min(1),
      settlement_due_date: z.string().min(1),
      ...commonRemark
    })
  },
  OUT: {
    resultingStatus: "OUT",
    allowedFrom: ["CATALOGUED", "RESERVE_SET", "REPRINT"],
    schema: z.object({
      sale_no: z.string().min(1),
      out_date: z.string().min(1),
      out_price: z.coerce.number().nonnegative(),
      ...commonRemark
    })
  },
  REPRINT: {
    resultingStatus: "REPRINT",
    allowedFrom: ["OUT", "HOLD"],
    schema: z.object({
      reprint_date: z.string().min(1),
      target_sale_no: z.string().min(1),
      ...commonRemark
    })
  },
  HOLD: {
    resultingStatus: "HOLD",
    allowedFrom: ["OUT", "REPRINT", "CATALOGUED"],
    schema: z.object({
      hold_date: z.string().min(1),
      ...commonRemark
    })
  },
  WITHDRAW: {
    resultingStatus: "WITHDRAW",
    allowedFrom: ["PENDING_AUCTION_DISPATCH", "IN_TRANSIT", "AWR_PENDING", "AWR_RECEIVED", "CATALOGUED", "RESERVE_SET", "OUT", "HOLD", "REPRINT"],
    schema: z.object({
      withdraw_date: z.string().min(1),
      ...commonRemark
    })
  },
  NEGOTIATING: {
    resultingStatus: "NEGOTIATING",
    allowedFrom: [
      "PENDING",
      "PENDING_AUCTION_DISPATCH",
      "IN_TRANSIT",
      "AWR_PENDING",
      "AWR_RECEIVED",
      "CATALOGUED",
      "RESERVE_SET",
      "OUT",
      "HOLD",
      "REPRINT",
      "WITHDRAW",
      "NEGOTIATING",
      "SOLD_PENDING_DISPATCH"
    ],
    schema: negotiatingSchema
  },
  SOLD_PENDING_DISPATCH: {
    resultingStatus: "SOLD_PENDING_DISPATCH",
    allowedFrom: [
      "NEGOTIATING",
      "SAMPLING_SENT",
      "PENDING",
      "PENDING_AUCTION_DISPATCH",
      "IN_TRANSIT",
      "AWR_PENDING",
      "AWR_RECEIVED",
      "CATALOGUED",
      "RESERVE_SET",
      "OUT",
      "WITHDRAW",
      "REPRINT",
      "HOLD",
      "SOLD_PENDING_DISPATCH"
    ],
    schema: z.object({
      broker: z.string().min(1),
      buyer: z.string().min(1),
      sale_price: z.coerce.number().positive(),
      sale_date: z.string().min(1),
      payment_term: z.string().min(1),
      ...commonRemark
    })
  },
  SOLD_PRIVATE: {
    resultingStatus: "SOLD",
    allowedFrom: ["SOLD_PENDING_DISPATCH", "NEGOTIATING"],
    schema: z.object({
      broker: z.string().min(1),
      buyer: z.string().min(1),
      sale_price: z.coerce.number().positive(),
      sold_date: z.string().min(1),
      payment_term: z.string().min(1),
      ...commonRemark
    })
  },
  CANCELLED: {
    resultingStatus: "CANCELLED",
    allowedFrom: [
      "PENDING",
      "IN_TRANSIT",
      "AWR_PENDING",
      "AWR_RECEIVED",
      "CATALOGUED",
      "RESERVE_SET",
      "SOLD_AUCTION",
      "OUT",
      "HOLD",
      "REPRINT",
      "WITHDRAW",
      "SAMPLING_SENT",
      "NEGOTIATING",
      "SOLD_PENDING_DISPATCH",
      "SOLD"
    ],
    schema: z.object({
      cancelled_date: z.string().min(1),
      cancel_reason: z.string().optional(),
      ...commonRemark
    })
  },
  REINVOICED: {
    resultingStatus: "CANCELLED",
    allowedFrom: [
      "PENDING",
      "PENDING_AUCTION_DISPATCH",
      "IN_TRANSIT",
      "AWR_PENDING",
      "AWR_RECEIVED",
      "CATALOGUED",
      "RESERVE_SET",
      "SOLD_AUCTION",
      "OUT",
      "HOLD",
      "REPRINT",
      "WITHDRAW",
      "SAMPLING_SENT",
      "NEGOTIATING",
      "SOLD_PENDING_DISPATCH",
      "SOLD",
      "CANCELLED"
    ],
    schema: z.object({
      reinvoice_date: z.string().min(1),
      reinvoiced_to_lot_id: z.string().uuid(),
      ...commonRemark
    })
  },
  PAYMENT_RECEIVED: {
    resultingStatus: "CLOSED",
    allowedFrom: ["SOLD"],
    schema: z.object({
      payment_received_date: z.string().min(1),
      amount_received: z.coerce.number().nonnegative(),
      ...commonRemark
    })
  }
};

function firstInPriority(statuses: GlobalLotStatus[], priority: GlobalLotStatus[]): GlobalLotStatus | null {
  for (const status of priority) {
    if (statuses.includes(status)) return status;
  }
  return null;
}

export function splitLotStatusLanes(statuses: GlobalLotStatus[]): LotStatusLanes {
  if (statuses.includes("CLOSED")) {
    return { terminal: "CLOSED", auction: null, private: null };
  }
  if (statuses.includes("CANCELLED")) {
    return { terminal: "CANCELLED", auction: null, private: null };
  }

  return {
    terminal: null,
    auction: firstInPriority(statuses, auctionStatusPriority),
    private: firstInPriority(statuses, privateStatusPriority)
  };
}

export function buildStatusesFromLanes(lanes: LotStatusLanes): GlobalLotStatus[] {
  if (lanes.terminal) return [lanes.terminal];
  const next: GlobalLotStatus[] = [];
  if (lanes.auction) next.push(lanes.auction);
  if (lanes.private) next.push(lanes.private);
  if (!next.length) next.push("PENDING");
  return next;
}

export function normalizeCurrentStatus(statuses: GlobalLotStatus[]): GlobalLotStatus {
  if (!statuses.length) return "PENDING";
  const priority: GlobalLotStatus[] = [
    "CLOSED",
    "CANCELLED",
    "SOLD",
    "SOLD_PENDING_DISPATCH",
    "NEGOTIATING",
    "SOLD_AUCTION",
    "PENDING_AUCTION_DISPATCH",
    "WITHDRAW",
    "HOLD",
    "REPRINT",
    "OUT",
    "RESERVE_SET",
    "CATALOGUED",
    "AWR_RECEIVED",
    "AWR_PENDING",
    "IN_TRANSIT",
    "PENDING"
  ];
  for (const p of priority) {
    if (statuses.includes(p)) return p;
  }
  return "PENDING";
}

export function parseActionPayload(action: LotActionName, payload: unknown) {
  return actionRules[action].schema.safeParse(payload ?? {});
}

export function isLifecycleAction(action: string): boolean {
  if (!actionNames.includes(action as LotActionName)) return false;
  return !actionRules[action as LotActionName].eventOnly;
}

export function resolveConflictPromptType(auctionStatus: GlobalLotStatus | null): ConflictPromptType | null {
  if (!auctionStatus) return null;
  if (auctionStatusesEarlyStage.has(auctionStatus)) return "EARLY_STAGE_GUIDANCE";
  if (auctionStatusesMiddleStage1.has(auctionStatus)) return "MIDDLE_STAGE_1_GUIDANCE";
  if (auctionStatusesMiddleStage2.has(auctionStatus)) return "MIDDLE_STAGE_2_GUIDANCE";
  if (auctionStatusesLaterStage.has(auctionStatus)) return "LATER_STAGE_GUIDANCE";
  return null;
}

export function isPrivateProgressionAction(action: LotActionName): boolean {
  return privateProgressionActions.includes(action as (typeof privateProgressionActions)[number]);
}

export function shouldRequireConflictAck(action: LotActionName, auctionStatus: GlobalLotStatus | null): boolean {
  if (!privateCommitmentActions.includes(action as (typeof privateCommitmentActions)[number])) return false;
  if (!auctionStatus) return false;
  return auctionActiveForPrivateConflict.has(auctionStatus);
}

export function isConflictPromptTypeCompatible(
  received: AcceptedConflictPromptType | null | undefined,
  expected: ConflictPromptType | null
): boolean {
  if (!expected) return true;
  if (!received) return false;
  if (received === expected) return true;
  if (received === "CANCEL_PRINTING_GUIDANCE") {
    return expected === "EARLY_STAGE_GUIDANCE" || expected === "MIDDLE_STAGE_1_GUIDANCE";
  }
  if (received === "WITHDRAW_GUIDANCE") {
    return expected === "MIDDLE_STAGE_2_GUIDANCE" || expected === "LATER_STAGE_GUIDANCE";
  }
  return false;
}

export function normalizeConflictPromptTypeForAudit(
  received: AcceptedConflictPromptType | null | undefined,
  fallback: ConflictPromptType | null
): ConflictPromptType | null {
  if (received === "EARLY_STAGE_GUIDANCE") return "EARLY_STAGE_GUIDANCE";
  if (received === "MIDDLE_STAGE_1_GUIDANCE") return "MIDDLE_STAGE_1_GUIDANCE";
  if (received === "MIDDLE_STAGE_2_GUIDANCE") return "MIDDLE_STAGE_2_GUIDANCE";
  if (received === "LATER_STAGE_GUIDANCE") return "LATER_STAGE_GUIDANCE";
  if (received === "CANCEL_PRINTING_GUIDANCE") return "EARLY_STAGE_GUIDANCE";
  if (received === "WITHDRAW_GUIDANCE") return "LATER_STAGE_GUIDANCE";
  return fallback;
}

export function isActionAllowedForStatuses(action: LotActionName, statuses: GlobalLotStatus[]): boolean {
  const lanes = splitLotStatusLanes(statuses);

  if (action === "REINVOICED") return lanes.terminal !== "CLOSED";
  if (action === "PAYMENT_RECEIVED") return lanes.private === "SOLD" || lanes.auction === "SOLD_AUCTION";

  if (lanes.terminal) {
    return false;
  }

  if (privateActionSet.has(action) && lanes.auction === "SOLD_AUCTION") {
    return false;
  }

  if (action === "NEGOTIATING") {
    return lanes.private === null || lanes.private === "NEGOTIATING";
  }

  if (action === "SOLD_PENDING_DISPATCH") {
    return lanes.private === null || lanes.private === "NEGOTIATING";
  }

  if (action === "SOLD_PRIVATE") {
    return lanes.private === "NEGOTIATING" || lanes.private === "SOLD_PENDING_DISPATCH";
  }

  if (action === "SAMPLING") {
    return true;
  }

  if (action === "CANCELLED") {
    return true;
  }

  const rule = actionRules[action];
  if (auctionActionSet.has(action)) {
    const currentAuction = lanes.auction ?? "PENDING";
    return rule.allowedFrom.includes(currentAuction);
  }

  if (privateActionSet.has(action)) {
    const privateContext = lanes.private ?? lanes.auction ?? "PENDING";
    return rule.allowedFrom.includes(privateContext);
  }

  const fallbackContext = lanes.private ?? lanes.auction ?? "PENDING";
  return rule.allowedFrom.includes(fallbackContext);
}

export function getAllowedActionsForStatuses(statuses: GlobalLotStatus[]): LotActionName[] {
  return actionNames.filter((action) => isActionAllowedForStatuses(action, statuses));
}

export function applyActionToStatuses(action: LotActionName, currentStatuses: GlobalLotStatus[]): {
  resultingStatus: GlobalLotStatus;
  nextStatuses: GlobalLotStatus[];
} {
  const lanes = splitLotStatusLanes(currentStatuses);

  if (action === "SAMPLING") {
    return {
      resultingStatus: normalizeCurrentStatus(currentStatuses),
      nextStatuses: buildStatusesFromLanes(lanes)
    };
  }

  if (action === "CANCELLED") {
    return { resultingStatus: "CANCELLED", nextStatuses: ["CANCELLED"] };
  }

  if (action === "REINVOICED") {
    return { resultingStatus: "CANCELLED", nextStatuses: ["CANCELLED"] };
  }

  if (action === "PAYMENT_RECEIVED") {
    return { resultingStatus: "CLOSED", nextStatuses: ["CLOSED"] };
  }

  if (lanes.terminal) {
    return { resultingStatus: lanes.terminal, nextStatuses: [lanes.terminal] };
  }

  if (auctionActionSet.has(action)) {
    const nextAuction = actionRules[action].resultingStatus ?? lanes.auction ?? "PENDING";
    const nextLanes: LotStatusLanes = {
      terminal: null,
      auction: nextAuction,
      private: action === "SOLD_AUCTION" ? null : lanes.private
    };
    return {
      resultingStatus: nextAuction,
      nextStatuses: buildStatusesFromLanes(nextLanes)
    };
  }

  if (action === "NEGOTIATING") {
    const nextLanes: LotStatusLanes = { ...lanes, private: "NEGOTIATING", terminal: null };
    return { resultingStatus: "NEGOTIATING", nextStatuses: buildStatusesFromLanes(nextLanes) };
  }

  if (action === "SOLD_PENDING_DISPATCH") {
    const nextLanes: LotStatusLanes = { ...lanes, private: "SOLD_PENDING_DISPATCH", terminal: null };
    return { resultingStatus: "SOLD_PENDING_DISPATCH", nextStatuses: buildStatusesFromLanes(nextLanes) };
  }

  if (action === "SOLD_PRIVATE") {
    const nextLanes: LotStatusLanes = { ...lanes, private: "SOLD", terminal: null };
    return { resultingStatus: "SOLD", nextStatuses: buildStatusesFromLanes(nextLanes) };
  }

  const fallback = normalizeCurrentStatus(currentStatuses);
  return { resultingStatus: fallback, nextStatuses: buildStatusesFromLanes(lanes) };
}

export function replayStatusesFromActions(
  actions: Array<{ action: string; performed_at?: string | null; created_at?: string | null; id?: string | null }>
): GlobalLotStatus[] {
  const ordered = [...actions].sort((a, b) => {
    const aAt = String(a.performed_at ?? a.created_at ?? "");
    const bAt = String(b.performed_at ?? b.created_at ?? "");
    if (aAt !== bAt) return aAt.localeCompare(bAt);
    return String(a.id ?? "").localeCompare(String(b.id ?? ""));
  });

  let statuses: GlobalLotStatus[] = ["PENDING"];
  for (const row of ordered) {
    const action = String(row.action) as LotActionName;
    if (!actionNames.includes(action)) continue;
    const next = applyActionToStatuses(action, statuses);
    statuses = next.nextStatuses;
  }
  return statuses.length ? statuses : ["PENDING"];
}

export function actionLabel(action: LotActionName): string {
  return action
    .toLowerCase()
    .replaceAll("_", " ")
    .replace(/\b\w/g, (c) => c.toUpperCase());
}
