-- ==========================================================================
-- Acesso restrito do printer-bridge (substitui a service_role no PC da loja)
-- Rode UMA vez no Supabase: SQL Editor -> cole tudo -> Run.
-- Antes: crie o usuário em Authentication -> Users -> Add user
--        (ex.: impressora@saborcarne.local, senha forte, "Auto confirm" marcado)
--        e troque o e-mail no passo 1 abaixo.
-- ==========================================================================

-- 1) Marca o usuário como "impressora" (app_metadata só pode ser alterado pelo admin)
update auth.users
   set raw_app_meta_data = coalesce(raw_app_meta_data, '{}'::jsonb) || '{"role":"printer"}'
 where email = 'impressora@saborcarne.local';

-- 2) Função que diz se quem está logado é a impressora
create or replace function public.is_printer()
returns boolean language sql stable as $$
  select coalesce(auth.jwt() -> 'app_metadata' ->> 'role', '') = 'printer'
$$;

-- 3) Leitura: só o necessário para imprimir (inclusive Realtime da fila)
drop policy if exists printer_read_queue on public.print_queue;
create policy printer_read_queue on public.print_queue
  for select to authenticated using (public.is_printer());

drop policy if exists printer_read_settings on public.restaurant_settings;
create policy printer_read_settings on public.restaurant_settings
  for select to authenticated using (public.is_printer());

drop policy if exists printer_read_delivery on public.delivery_orders;
create policy printer_read_delivery on public.delivery_orders
  for select to authenticated using (public.is_printer());

-- 4) Wrappers das RPCs da fila: recusam qualquer usuário que não seja a impressora
create or replace function public.printer_claim_print_jobs(p_worker text, p_limit int)
returns jsonb language plpgsql security definer set search_path = public as $$
declare result jsonb;
begin
  if not public.is_printer() then raise exception 'acesso negado'; end if;
  select coalesce(jsonb_agg(to_jsonb(j)), '[]'::jsonb) into result
    from public.claim_print_jobs(p_worker => p_worker, p_limit => p_limit) j;
  return result;
end $$;

create or replace function public.printer_complete_print_job(p_job_id uuid, p_success boolean, p_error text, p_printer text)
returns void language plpgsql security definer set search_path = public as $$
begin
  if not public.is_printer() then raise exception 'acesso negado'; end if;
  perform public.complete_print_job(p_job_id => p_job_id, p_success => p_success, p_error => p_error, p_printer => p_printer);
end $$;

create or replace function public.printer_requeue_print_job(p_job_id uuid, p_error text)
returns void language plpgsql security definer set search_path = public as $$
begin
  if not public.is_printer() then raise exception 'acesso negado'; end if;
  perform public.requeue_print_job(p_job_id => p_job_id, p_error => p_error);
end $$;

revoke all on function public.printer_claim_print_jobs(text, int) from public, anon;
revoke all on function public.printer_complete_print_job(uuid, boolean, text, text) from public, anon;
revoke all on function public.printer_requeue_print_job(uuid, text) from public, anon;
grant execute on function public.printer_claim_print_jobs(text, int) to authenticated;
grant execute on function public.printer_complete_print_job(uuid, boolean, text, text) to authenticated;
grant execute on function public.printer_requeue_print_job(uuid, text) to authenticated;
