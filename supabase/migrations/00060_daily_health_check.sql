-- 00060 (05/11/2026): robô de verificação diária (17h, horário de Brasília).
-- 1) start_health_check(): confere o banco (funções, dados da loja, arroz do dia, tarefas
--    automáticas, impressora, fila de impressão, delivery e comandas travadas, cardápio) e
--    pede ao pg_net para abrir o site (painel e cardápio) como um cliente faria.
-- 2) finish_health_checks() (a cada minuto): lê as respostas do site, fecha o resultado e,
--    na rodada das 17h, deixa o aviso pronto para o WhatsApp do dono (whatsapp-dispatch envia).
-- Nada é gravado em pedidos/estoque: o teste de pedido é recusado de propósito (carrinho vazio).
-- Idempotente.

ALTER TABLE restaurant_settings ADD COLUMN IF NOT EXISTS health_alert_phone TEXT;
-- Aviso pelo WhatsApp da loja desligado a pedido do dono (05/11): não usar o número do delivery.
-- health_alert_phone fica vazio até existir outro remetente.

CREATE TABLE IF NOT EXISTS system_health_checks (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    finished_at TIMESTAMPTZ,
    trigger TEXT NOT NULL DEFAULT 'AGENDADO',          -- AGENDADO | MANUAL
    status TEXT NOT NULL DEFAULT 'RUNNING',            -- RUNNING | OK | AVISO | FALHA
    results JSONB NOT NULL DEFAULT '[]'::jsonb,        -- [{item, ok, nivel: erro|aviso, detalhe}]
    site_requests JSONB NOT NULL DEFAULT '{}'::jsonb,  -- {"Painel e área do garçom": request_id, ...}
    alert_phone TEXT,
    alert_status TEXT NOT NULL DEFAULT 'NONE',         -- NONE | PENDING | SENT | FAILED
    alert_error TEXT
);
CREATE INDEX IF NOT EXISTS system_health_checks_created_idx ON system_health_checks (created_at DESC);

ALTER TABLE system_health_checks ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Staff read health checks" ON system_health_checks;
CREATE POLICY "Staff read health checks" ON system_health_checks FOR SELECT TO authenticated
    USING (current_user_role() IN ('MASTER', 'GERENTE'));
GRANT SELECT ON system_health_checks TO authenticated;

CREATE OR REPLACE FUNCTION health_item(p_item TEXT, p_ok BOOLEAN, p_detail TEXT, p_level TEXT DEFAULT 'erro')
RETURNS JSONB LANGUAGE sql IMMUTABLE AS $$
    SELECT jsonb_build_array(jsonb_build_object('item', p_item, 'ok', p_ok, 'nivel', p_level, 'detalhe', p_detail));
$$;

CREATE OR REPLACE FUNCTION start_health_check(p_trigger TEXT DEFAULT 'AGENDADO')
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
    v_id UUID;
    r JSONB := '[]'::jsonb;
    v_site TEXT := 'https://sabordacarne.pontopdv.tech';
    v_missing TEXT;
    v_n INT;
    v_s restaurant_settings;
    v_ts TIMESTAMPTZ;
    v_menu JSONB;
    v_req JSONB := '{}'::jsonb;
BEGIN
    SELECT * INTO v_s FROM restaurant_settings LIMIT 1;

    -- Funções que o painel, o garçom e o cardápio usam
    SELECT string_agg(f, ', ') INTO v_missing
      FROM unnest(ARRAY[
        'open_tab_atomic', 'cancel_order_item_atomic', 'swap_order_item_atomic', 'update_order_item_status',
        'request_bill', 'add_payment_atomic', 'close_tab_atomic', 'close_tab_with_payment', 'reopen_tab_atomic',
        'release_empty_tab', 'void_tab_atomic', 'transfer_table_atomic', 'enqueue_bill_print', 'close_shift',
        'adjust_stock', 'toggle_exhaustion', 'get_public_menu', 'place_delivery_order', 'get_delivery_order_status',
        'update_delivery_status', 'cancel_delivery_order', 'mark_delivery_paid', 'get_delivery_tracking',
        'get_table_qr_info', 'create_table_qr_order', 'update_product', 'create_product',
        'release_idle_empty_tabs', 'delivery_hours_open', 'wake_whatsapp_dispatch'
      ]) AS f
     WHERE NOT EXISTS (SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
                        WHERE n.nspname = 'public' AND p.proname = f);
    r := r || health_item('Funções do sistema', v_missing IS NULL,
                          COALESCE('Faltando: ' || v_missing, 'Todas as funções do painel, garçom e cardápio existem.'));

    -- Dados da loja
    r := r || health_item('Dados da loja',
                          COALESCE(v_s.pix_key, '') <> '' AND COALESCE(v_s.phone, '') <> '' AND COALESCE(v_s.address, '') <> '',
                          CASE WHEN COALESCE(v_s.pix_key, '') = '' THEN 'Chave PIX vazia (sem QR Code de pagamento).'
                               WHEN COALESCE(v_s.phone, '') = '' THEN 'Telefone da loja vazio.'
                               WHEN COALESCE(v_s.address, '') = '' THEN 'Endereço da loja vazio.'
                               ELSE 'PIX, telefone e endereço preenchidos.' END);

    -- Arroz do dia (o Completo não sai sem ele)
    v_n := COALESCE(jsonb_array_length(to_jsonb(v_s.daily_rice_flavors)), 0);
    r := r || health_item('Arroz do dia', v_n > 0,
                          CASE WHEN v_n > 0 THEN v_n || ' opção(ões) cadastrada(s).' ELSE 'Nenhum arroz do dia cadastrado: o garçom não consegue lançar Completo.' END);

    -- Cardápio: produtos à venda
    BEGIN
        v_menu := to_jsonb(get_public_menu());
        SELECT COUNT(*) INTO v_n FROM products WHERE active;
        r := r || health_item('Cardápio', v_n > 0, v_n || ' produtos ativos; cardápio público responde.');
    EXCEPTION WHEN OTHERS THEN
        r := r || health_item('Cardápio', FALSE, 'Cardápio público com erro: ' || SQLERRM);
    END;

    -- Pedido de teste do delivery (recusado de propósito: nada é gravado)
    BEGIN
        PERFORM place_delivery_order('{"customer_name":"Robô de teste","phone":"11999999999","order_type":"PICKUP","payment_method":"PIX","items":[]}'::jsonb);
        r := r || health_item('Pedido do cardápio', FALSE, 'O teste deveria ser recusado e foi aceito.');
    EXCEPTION WHEN OTHERS THEN
        r := r || health_item('Pedido do cardápio', SQLERRM ILIKE '%carrinho est%vazio%',
                              CASE WHEN SQLERRM ILIKE '%carrinho est%vazio%' THEN 'Função de pedido responde normalmente.'
                                   ELSE 'Função de pedido com erro: ' || SQLERRM END);
    END;

    -- Horário do delivery
    BEGIN
        r := r || health_item('Horário do delivery',
                              delivery_hours_open('2026-11-05 19:00-03') AND NOT delivery_hours_open('2026-11-04 19:00-03')
                              OR (SELECT delivery_open_override_date FROM restaurant_settings LIMIT 1) IS NOT NULL,
                              'Abre 18h–23h e fecha às quartas.');
    EXCEPTION WHEN OTHERS THEN
        r := r || health_item('Horário do delivery', FALSE, 'Erro: ' || SQLERRM);
    END;

    -- Tarefas automáticas (pg_cron)
    SELECT string_agg(j, ', ') INTO v_missing
      FROM unnest(ARRAY['ponto-whatsapp-retry', 'ponto-liberar-mesas-vazias']) AS j
     WHERE NOT EXISTS (
        SELECT 1 FROM cron.job cj JOIN cron.job_run_details d ON d.jobid = cj.jobid
         WHERE cj.jobname = j AND cj.active AND d.status = 'succeeded' AND d.start_time > NOW() - INTERVAL '15 minutes');
    r := r || health_item('Tarefas automáticas', v_missing IS NULL,
                          COALESCE('Paradas: ' || v_missing, 'Reenvio de WhatsApp e liberação de mesas vazias rodando.'));

    -- Impressora da loja (programa do PC)
    SELECT MAX(last_heartbeat) INTO v_ts FROM printer_status;
    r := r || health_item('Programa de impressão', v_ts > NOW() - INTERVAL '10 minutes',
                          CASE WHEN v_ts IS NULL THEN 'Nunca deu sinal.'
                               WHEN v_ts > NOW() - INTERVAL '10 minutes' THEN 'Ligado no PC da loja.'
                               ELSE 'Sem sinal desde ' || to_char(v_ts AT TIME ZONE 'America/Sao_Paulo', 'DD/MM HH24:MI') || '. Ligue o programa de impressão no PC.' END,
                          'aviso');
    SELECT COUNT(*) INTO v_n FROM print_queue WHERE status::TEXT IN ('PENDING', 'PRINTING') AND created_at < NOW() - INTERVAL '30 minutes';
    r := r || health_item('Fila de impressão', v_n = 0,
                          CASE WHEN v_n = 0 THEN 'Sem cupom parado.' ELSE v_n || ' cupom(ns) parado(s) há mais de 30 min.' END, 'aviso');

    -- Coisas esquecidas de dias anteriores
    SELECT COUNT(*), string_agg('#' || order_number, ', ' ORDER BY order_number) INTO v_n, v_missing FROM delivery_orders
     WHERE status NOT IN ('DELIVERED', 'CANCELLED') AND created_at < NOW() - INTERVAL '12 hours';
    r := r || health_item('Delivery travado', v_n = 0,
                          CASE WHEN v_n = 0 THEN 'Nenhum pedido antigo em aberto.'
                               ELSE v_n || ' pedido(s) de dias anteriores ainda em aberto (' || v_missing || '). Marque como entregue ou cancele no Delivery.' END, 'aviso');
    SELECT COUNT(*) INTO v_n FROM tabs WHERE status = 'OPEN' AND opened_at < NOW() - INTERVAL '16 hours';
    r := r || health_item('Comandas esquecidas', v_n = 0,
                          CASE WHEN v_n = 0 THEN 'Nenhuma comanda de ontem aberta.' ELSE v_n || ' comanda(s) de dias anteriores ainda aberta(s).' END, 'aviso');
    SELECT COUNT(*) INTO v_n FROM shifts WHERE status = 'ABERTO' AND opened_at < NOW() - INTERVAL '20 hours';
    r := r || health_item('Turno', v_n = 0,
                          CASE WHEN v_n = 0 THEN 'Nenhum turno antigo aberto.' ELSE 'Turno de ontem ainda aberto: feche no caixa antes de abrir o de hoje.' END, 'aviso');

    -- WhatsApp automático
    SELECT COUNT(*) INTO v_n FROM whatsapp_outbox WHERE status = 'FAILED' AND created_at > NOW() - INTERVAL '24 hours';
    r := r || health_item('WhatsApp automático', COALESCE(v_s.whatsapp_auto_enabled, FALSE) AND v_n = 0,
                          CASE WHEN NOT COALESCE(v_s.whatsapp_auto_enabled, FALSE) THEN 'Desligado nas configurações.'
                               WHEN v_n > 0 THEN v_n || ' mensagem(ns) ao cliente falharam nas últimas 24 h.'
                               ELSE 'Ligado, sem falhas nas últimas 24 h.' END, 'aviso');

    -- Site: abre o painel/garçom e o cardápio como um visitante
    BEGIN
        v_req := jsonb_build_object(
            'Site (painel e área do garçom)', net.http_get(url := v_site || '/?robo=' || extract(epoch FROM NOW())::BIGINT, timeout_milliseconds := 15000),
            'Site do cardápio', net.http_get(url := v_site || '/cardapio?robo=' || extract(epoch FROM NOW())::BIGINT, timeout_milliseconds := 15000));
    EXCEPTION WHEN OTHERS THEN
        r := r || health_item('Site', FALSE, 'Não foi possível testar o site: ' || SQLERRM);
    END;

    INSERT INTO system_health_checks (trigger, results, site_requests, alert_phone)
    VALUES (p_trigger, r, v_req, v_s.health_alert_phone)
    RETURNING id INTO v_id;
    RETURN v_id;
END;
$$;

CREATE OR REPLACE FUNCTION finish_health_checks()
RETURNS INT
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
    v_check system_health_checks;
    v_key TEXT;
    v_req BIGINT;
    v_resp RECORD;
    r JSONB;
    v_status TEXT;
    v_done INT := 0;
    v_wake BOOLEAN := FALSE;
BEGIN
    FOR v_check IN SELECT * FROM system_health_checks WHERE status = 'RUNNING' AND created_at < NOW() - INTERVAL '20 seconds' FOR UPDATE SKIP LOCKED
    LOOP
        r := v_check.results;
        FOR v_key, v_req IN SELECT key, value::BIGINT FROM jsonb_each_text(v_check.site_requests)
        LOOP
            SELECT status_code, content, error_msg, timed_out INTO v_resp FROM net._http_response WHERE id = v_req;
            IF NOT FOUND THEN
                IF v_check.created_at > NOW() - INTERVAL '3 minutes' THEN
                    CONTINUE; -- ainda esperando resposta
                END IF;
                r := r || health_item(v_key, FALSE, 'O site não respondeu.');
            ELSIF v_resp.status_code = 200 AND v_resp.content ILIKE '%id="root"%' THEN
                r := r || health_item(v_key, TRUE, 'Abriu normalmente.');
            ELSE
                r := r || health_item(v_key, FALSE, 'Site com problema: ' ||
                                      COALESCE('código ' || v_resp.status_code, '') || COALESCE(' ' || v_resp.error_msg, '') ||
                                      CASE WHEN v_resp.timed_out THEN ' (demorou demais)' ELSE '' END);
            END IF;
        END LOOP;
        -- Ainda falta resposta de algum endereço: tenta de novo no próximo minuto
        IF jsonb_array_length(r) - jsonb_array_length(v_check.results) < (SELECT COUNT(*) FROM jsonb_object_keys(v_check.site_requests)) THEN
            CONTINUE;
        END IF;

        v_status := CASE WHEN EXISTS (SELECT 1 FROM jsonb_array_elements(r) e WHERE NOT (e->>'ok')::BOOLEAN AND e->>'nivel' = 'erro') THEN 'FALHA'
                         WHEN EXISTS (SELECT 1 FROM jsonb_array_elements(r) e WHERE NOT (e->>'ok')::BOOLEAN) THEN 'AVISO'
                         ELSE 'OK' END;
        UPDATE system_health_checks
           SET results = r, status = v_status, finished_at = NOW(),
               alert_status = CASE WHEN v_check.trigger = 'AGENDADO' AND COALESCE(v_check.alert_phone, '') <> '' THEN 'PENDING' ELSE 'NONE' END
         WHERE id = v_check.id;
        v_wake := v_wake OR (v_check.trigger = 'AGENDADO' AND COALESCE(v_check.alert_phone, '') <> '');
        v_done := v_done + 1;
    END LOOP;
    IF v_wake THEN PERFORM wake_whatsapp_dispatch(); END IF;
    RETURN v_done;
END;
$$;

-- Botão "Verificar agora" (Visão geral): só Master/Gerente; não manda WhatsApp
CREATE OR REPLACE FUNCTION run_health_check_now()
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
    PERFORM require_role(ARRAY['MASTER', 'GERENTE']::app_role[]);
    IF EXISTS (SELECT 1 FROM system_health_checks WHERE trigger = 'MANUAL' AND created_at > NOW() - INTERVAL '1 minute') THEN
        RAISE EXCEPTION 'Já tem uma verificação rodando. Aguarde um minuto.';
    END IF;
    RETURN start_health_check('MANUAL');
END;
$$;

-- Aviso pelo WhatsApp: a função whatsapp-dispatch busca aqui (service_role)
CREATE OR REPLACE FUNCTION claim_health_alerts()
RETURNS SETOF system_health_checks
LANGUAGE sql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
    UPDATE system_health_checks SET alert_status = 'SENDING'
     WHERE id IN (SELECT id FROM system_health_checks WHERE alert_status = 'PENDING' ORDER BY created_at LIMIT 3 FOR UPDATE SKIP LOCKED)
    RETURNING *;
$$;

REVOKE ALL ON FUNCTION start_health_check(TEXT) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION finish_health_checks() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION claim_health_alerts() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION claim_health_alerts() TO service_role;
REVOKE ALL ON FUNCTION run_health_check_now() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION run_health_check_now() TO authenticated;

-- Agenda: 17h de Brasília = 20h UTC (o Brasil não tem horário de verão)
DO $$
BEGIN
    PERFORM cron.unschedule(jobname) FROM cron.job WHERE jobname IN ('ponto-verificacao-diaria', 'ponto-verificacao-concluir');
    PERFORM cron.schedule('ponto-verificacao-diaria', '0 20 * * *', 'SELECT public.start_health_check(''AGENDADO'')');
    PERFORM cron.schedule('ponto-verificacao-concluir', '* * * * *', 'SELECT public.finish_health_checks()');
END $$;

NOTIFY pgrst, 'reload schema';
