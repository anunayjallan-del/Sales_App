import { z } from "zod";
import { auctionStatuses, globalLotStatuses, lotStatusEventSources, privateDealStatuses } from "@/lib/types";
import { acceptedConflictPromptTypes, actionNames } from "@/server/services/lot-actions";

export const lotQuerySchema = z.object({
  search: z.string().optional(),
  mark: z.string().optional(),
  factory: z.string().optional(),
  grade: z.string().optional(),
  masterStatus: z.string().optional(),
  status: z.string().optional(),
  sampled: z.coerce.boolean().optional(),
  sortBy: z.enum(["LOT_NO", "PACKING_DATE", "QUANTITY"]).optional(),
  sortDir: z.enum(["asc", "desc"]).optional(),
  bagsMin: z.coerce.number().optional(),
  bagsMax: z.coerce.number().optional(),
  weightMin: z.coerce.number().optional(),
  weightMax: z.coerce.number().optional(),
  packingDateFrom: z.string().optional(),
  packingDateTo: z.string().optional(),
  buyer: z.string().optional(),
  overdueOnly: z.coerce.boolean().optional(),
  agingDays: z.coerce.number().optional(),
  page: z.coerce.number().int().positive().default(1),
  pageSize: z.coerce.number().int().positive().max(200).default(20)
});

export const patchAuctionSchema = z.object({
  auction_status: z.enum(auctionStatuses).optional(),
  sale_number: z.string().nullable().optional(),
  reserve_price_inr: z.number().nullable().optional(),
  hammer_price_inr: z.number().nullable().optional(),
  in_transit_date: z.string().nullable().optional(),
  print_date: z.string().nullable().optional(),
  sale_date: z.string().nullable().optional(),
  auction_sold_date: z.string().nullable().optional(),
  out_date: z.string().nullable().optional(),
  settlement_due_date: z.string().nullable().optional(),
  payment_received_date: z.string().nullable().optional()
});

export const createPrivateDealSchema = z.object({
  lot_id: z.string().uuid(),
  buyer_id: z.string().uuid(),
  status: z.enum(privateDealStatuses),
  offered_price_inr: z.number().nullable().optional(),
  final_sale_price_inr: z.number().nullable().optional(),
  payment_term: z.enum(["CD", "DUE"]).nullable().optional(),
  payment_term_days: z.number().int().nullable().optional(),
  payment_received_date: z.string().nullable().optional(),
  notes: z.string().nullable().optional()
});

export const patchPrivateDealSchema = createPrivateDealSchema.partial().omit({ lot_id: true, buyer_id: true });

export const bulkSamplingSchema = z.object({
  lot_ids: z.array(z.string().uuid()).min(1),
  buyer_id: z.string().uuid(),
  notes: z.string().optional()
});

export const bulkSellPendingDispatchSchema = z.object({
  lot_ids: z.array(z.string().uuid()).min(1),
  buyer_id: z.string().uuid(),
  final_sale_price_inr: z.number(),
  payment_term: z.enum(["CD", "DUE"]),
  payment_term_days: z.number().int().nullable().optional(),
  notes: z.string().optional()
});

export const bulkAuctionReserveSchema = z.object({
  lot_ids: z.array(z.string().uuid()).min(1),
  reserve_price_inr: z.number()
});

export const bulkAuctionStatusSchema = z.object({
  lot_ids: z.array(z.string().uuid()).min(1),
  auction_status: z.enum(auctionStatuses)
});

export const repackSchema = z.object({
  old_lot_id: z.string().uuid(),
  new_lot: z.object({
    mark: z.string().min(1),
    invoice_number: z.string().min(1),
    grade: z.string().min(1),
    bags: z.number().int().nonnegative(),
    net_weight_kg: z.number().nonnegative(),
    factory: z.string().nullable().optional(),
    date_created: z.string()
  })
});

export const createLotStatusEventSchema = z.object({
  status: z.enum(globalLotStatuses),
  source: z.enum(lotStatusEventSources).default("MANUAL"),
  effective_at: z.string().datetime().optional(),
  meta: z.record(z.string(), z.any()).optional()
});

export const createLotActionSchema = z.object({
  action: z.enum(actionNames),
  data: z.record(z.string(), z.any()).default({}),
  conflict_acknowledged: z.boolean().optional(),
  conflict_prompt_type: z.enum(acceptedConflictPromptTypes).optional(),
  conflict_acknowledged_at: z.string().optional()
});
