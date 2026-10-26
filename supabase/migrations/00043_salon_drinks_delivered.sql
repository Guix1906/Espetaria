-- ============================================================================
-- MIGRATION 00043: BEBIDA DA MESA JÁ NASCE ENTREGUE
-- ----------------------------------------------------------------------------
-- No salão o garçom pega a bebida e leva na hora (sem cupom, 00042). Antes ela
-- ficava "Recebido" para sempre, deixava a mesa "em preparo" e aparecia no Bar.
-- Agora nasce DELIVERED. Só order_items (salão); delivery não muda. Idempotente.
-- ============================================================================
CREATE OR REPLACE FUNCTION trg_salon_drinks_delivered()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
    IF NEW.status = 'RECEIVED'
       AND (NEW.sector = 'BAR' OR EXISTS (SELECT 1 FROM products WHERE id = NEW.product_id AND type = 'BEBIDA')) THEN
        NEW.status := 'DELIVERED';
        NEW.delivered_at := COALESCE(NEW.delivered_at, NOW());
    END IF;
    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS salon_drinks_delivered ON order_items;
CREATE TRIGGER salon_drinks_delivered
    BEFORE INSERT ON order_items
    FOR EACH ROW EXECUTE FUNCTION trg_salon_drinks_delivered();

-- Pedido só de bebida fica com o status certo
CREATE OR REPLACE FUNCTION trg_salon_drinks_recompute()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
    IF NEW.status = 'DELIVERED' THEN
        PERFORM recompute_order_status(NEW.order_id);
    END IF;
    RETURN NULL;
END;
$$;
REVOKE ALL ON FUNCTION trg_salon_drinks_recompute() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS salon_drinks_recompute ON order_items;
CREATE TRIGGER salon_drinks_recompute
    AFTER INSERT ON order_items
    FOR EACH ROW EXECUTE FUNCTION trg_salon_drinks_recompute();
