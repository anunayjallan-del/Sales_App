-- Sampling is tracked as action history (secondary context), not a primary lifecycle status.
-- Remove legacy primary-active SAMPLING_SENT rows from the active-status materialized table.
delete from public.lot_active_statuses
where status = 'SAMPLING_SENT';
