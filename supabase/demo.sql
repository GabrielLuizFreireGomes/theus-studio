do $demo$
declare
  today date := (now() at time zone 'America/Sao_Paulo')::date;
  future_start timestamptz := (today + 1 + time '10:00') at time zone 'America/Sao_Paulo';
  past_start timestamptz := (today - 1 + time '10:00') at time zone 'America/Sao_Paulo';
  demo_cut uuid := '41ef0301-f3ce-412a-9acf-7628eec6ea75';
  demo_customer uuid := '5859b671-06f7-414c-a239-218ab9c875c1';
begin
  if exists (select from services where id = demo_cut) then return; end if;
  if exists (select from services) or exists (select from customers) or exists (select from hours) or
    exists (select from agenda) or exists (select from settings where loyalty_goal is not null) then
    raise exception 'Use um banco local vazio para carregar a demonstração.';
  end if;
  insert into services (id, name, description, price, duration, is_cut) values
    (demo_cut, 'Corte', 'Corte na tesoura ou máquina, com finalização.', 4500, 35, true);
  insert into services (name, description, price, duration) values
    ('Barba', 'Aparo, desenho e acabamento.', 3000, 25),
    ('Corte e barba', 'Os dois serviços no mesmo horário.', 6500, 55);
  insert into hours (weekday, opens, closes, break_start, break_end)
    select week_day, 540, 1140, 720, 780 from generate_series(1, 7) as week_day;
  insert into customers (id, name, email) values (demo_customer, 'Rafael Demo', 'cliente@example.com');
  insert into agenda (kind, status, starts_at, ends_at, customer_id, service_id, title, price, total, is_cut)
    values ('booking', 'scheduled', future_start, future_start + interval '35 minutes', demo_customer, demo_cut, 'Corte', 4500, 4500, true),
    ('booking', 'scheduled', past_start, past_start + interval '35 minutes', demo_customer, demo_cut, 'Corte', 4500, 4500, true);
end
$demo$;
