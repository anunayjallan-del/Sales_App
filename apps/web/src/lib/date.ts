import { addDays, differenceInCalendarDays } from "date-fns";

export function calculateDueDate(soldDateIso: string, paymentTermDays?: number | null): string | null {
  if (!paymentTermDays || paymentTermDays < 0) {
    return soldDateIso;
  }
  return addDays(new Date(soldDateIso), paymentTermDays).toISOString().slice(0, 10);
}

export function calculateDaysDelayed(dueDateIso: string | null, paidDateIso: string | null): number | null {
  if (!dueDateIso) return null;
  const dueDate = new Date(dueDateIso);
  const endDate = paidDateIso ? new Date(paidDateIso) : new Date();
  const days = differenceInCalendarDays(endDate, dueDate);
  return days > 0 ? days : 0;
}

export function calculateDaysSince(dateIso: string | null): number | null {
  if (!dateIso) return null;
  const days = differenceInCalendarDays(new Date(), new Date(dateIso));
  return days >= 0 ? days : 0;
}
