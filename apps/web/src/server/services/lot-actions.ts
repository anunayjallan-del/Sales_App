import { z } from "zod";
import { GlobalLotStatus } from "@/lib/types";

export const actionNames = [
  "SAMPLING",
  "DISPATCH_TO_AUCTION",
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

const commonRemark = { remarks: z.string().optional() };
const diptiWarehouse = "Dipti Tea Warehouse";
const nowalWarehouse = "Nowal Tea Warehouse";
const kolkataCentre = "Kolkata";
const guwahatiCentre = "Guwahati";

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
    resultingStatus: "IN_TRANSIT",
    allowedFrom: ["PENDING"],
    schema: z
      .object({
        dispatch_date: z.string().min(1),
        broker: z.string().min(1),
        warehouse: z.string().min(1),
        auction_centre: z.string().min(1),
        transporter: z.string().optional(),
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
    resultingStatus: "SOLD",
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
    allowedFrom: ["CATALOGUED", "RESERVE_SET", "OUT", "HOLD", "REPRINT"],
    schema: z.object({
      withdraw_date: z.string().min(1),
      ...commonRemark
    })
  },
  NEGOTIATING: {
    resultingStatus: "NEGOTIATING",
    allowedFrom: ["SAMPLING_SENT"],
    schema: z.object({
      buyer: z.string().min(1),
      negotiation_date: z.string().min(1),
      offered_price: z.coerce.number().nonnegative().optional(),
      ...commonRemark
    })
  },
  SOLD_PENDING_DISPATCH: {
    resultingStatus: "SOLD_PENDING_DISPATCH",
    allowedFrom: [
      "NEGOTIATING",
      "SAMPLING_SENT",
      "PENDING",
      "IN_TRANSIT",
      "AWR_PENDING",
      "AWR_RECEIVED",
      "CATALOGUED",
      "RESERVE_SET",
      "OUT",
      "WITHDRAW",
      "REPRINT",
      "HOLD"
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
    resultingStatus: "PENDING",
    allowedFrom: ["CANCELLED"],
    schema: z.object({
      reinvoice_date: z.string().min(1),
      new_lot_number: z.string().min(1),
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

export function normalizeCurrentStatus(statuses: GlobalLotStatus[]): GlobalLotStatus {
  if (!statuses.length) return "PENDING";
  const priority: GlobalLotStatus[] = [
    "CLOSED",
    "CANCELLED",
    "SOLD",
    "SOLD_PENDING_DISPATCH",
    "NEGOTIATING",
    "SAMPLING_SENT",
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

export function isActionAllowedFrom(action: LotActionName, currentStatus: GlobalLotStatus): boolean {
  if (currentStatus === "CLOSED") return false;
  return actionRules[action].allowedFrom.includes(currentStatus);
}

export function actionLabel(action: LotActionName): string {
  return action
    .toLowerCase()
    .replaceAll("_", " ")
    .replace(/\b\w/g, (c) => c.toUpperCase());
}
