-- 00063 (06/11/2026): robô das 17h deixa de conferir "Delivery travado" (pedido do dono).
-- Mesma função start_health_check da 00060, sem esse item. Idempotente.

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


NOTIFY pgrst, 'reload schema';
