insert into public.buyers (id, name, contact_info)
values
  ('00000000-0000-0000-0000-000000000101', 'Kolkata Tea Traders', '{"phone":"+91-33-1111-1111"}'),
  ('00000000-0000-0000-0000-000000000102', 'Assam Blend House', '{"phone":"+91-361-222-3333"}')
on conflict (id) do nothing;

insert into public.lots (
  id, mark, invoice_number, grade, bags, net_weight_kg, factory, date_created, master_status
)
values
  ('10000000-0000-0000-0000-000000000001', 'MK-21', 'INV-5001', 'BOP', 120, 6200.500, 'Dibrugarh', current_date - interval '10 day', 'IN_TRANSIT'),
  ('10000000-0000-0000-0000-000000000002', 'MK-22', 'INV-5002', 'CTC', 90, 4500.000, 'Jorhat', current_date - interval '38 day', 'ACTIVE')
on conflict (mark, invoice_number) do nothing;

insert into public.auction_tracks (lot_id, auction_status, reserve_price_inr)
values
  ('10000000-0000-0000-0000-000000000001', 'IN_TRANSIT', 210.00)
on conflict (lot_id) do nothing;

insert into public.private_deals (
  id, lot_id, buyer_id, status, offered_price_inr, final_sale_price_inr, payment_term, payment_term_days, due_date, notes
)
values
  ('20000000-0000-0000-0000-000000000001', '10000000-0000-0000-0000-000000000002', '00000000-0000-0000-0000-000000000101', 'NEGOTIATING', 198.00, null, 'DUE', 7, current_date + interval '7 day', 'Waiting final bid')
on conflict (id) do nothing;
