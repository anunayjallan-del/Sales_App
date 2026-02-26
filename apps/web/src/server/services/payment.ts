import { calculateDaysDelayed, calculateDueDate } from "@/lib/date";

export function derivePrivatePaymentFields(input: {
  soldDate: string;
  paymentTerm: "CD" | "DUE";
  paymentTermDays?: number | null;
  paymentReceivedDate?: string | null;
}) {
  const dueDate =
    input.paymentTerm === "CD"
      ? input.soldDate
      : calculateDueDate(input.soldDate, input.paymentTermDays ?? 0);

  const daysDelayed = calculateDaysDelayed(dueDate, input.paymentReceivedDate ?? null);
  return { dueDate, daysDelayed };
}
