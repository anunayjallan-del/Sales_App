import { Lot, PaymentTerm, PrivateDeal } from "@/lib/types";

type Buyer = { name: string };

export function buildDispatchAdviceSnapshot(input: {
  lot: Lot;
  deal: PrivateDeal;
  buyer: Buyer;
}) {
  const salePrice = input.deal.final_sale_price_inr ?? 0;
  return {
    private_deal_id: input.deal.id,
    mark: input.lot.mark,
    invoice_number: input.lot.invoice_number,
    grade: input.lot.grade,
    bags: input.lot.bags,
    weight: input.lot.net_weight_kg,
    buyer_name: input.buyer.name,
    sale_price_inr: salePrice,
    payment_term: (input.deal.payment_term ?? "CD") as PaymentTerm,
    total_value_inr: salePrice * input.lot.net_weight_kg,
    status: "GENERATED" as const
  };
}
