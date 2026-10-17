import { describe, expect, it } from 'vitest';
import { auditEventFromLog } from '../auditData';

const names = new Map([['u1', 'Ana Gerente']]);
const row = (action: string, data: Record<string, unknown> | null = null) => ({ id: 'a1', created_at: '2026-10-17T22:00:00Z', user_id: 'u1', action, entity_type: 'tabs', old_data: null, new_data: data });

describe('auditoria', () => {
  it('mostra quem anulou a comanda e o motivo', () => {
    const e = auditEventFromLog(row('ANULAR_COMANDA', { reason: 'Cliente foi embora' }), names)!;
    expect(e.kind).toBe('ANULACAO');
    expect(e.userName).toBe('Ana Gerente');
    expect(e.reason).toBe('Cliente foi embora');
  });
  it('agrupa estornos e correções de pagamento', () => {
    expect(auditEventFromLog(row('ESTORNAR_VENDA'), names)!.kind).toBe('ESTORNO');
    expect(auditEventFromLog(row('CORRIGIR_VENDA'), names)!.kind).toBe('CORRECAO_PAGAMENTO');
    expect(auditEventFromLog(row('CANCELAR_DELIVERY', { cancel_reason: 'Sem entregador' }), names)!.reason).toBe('Sem entregador');
  });
  it('ignora ações de rotina e marca autor desconhecido como Sistema', () => {
    expect(auditEventFromLog(row('CRIAR_PEDIDO'), names)).toBeNull();
    expect(auditEventFromLog({ ...row('REABRIR_COMANDA'), user_id: null }, names)!.userName).toBe('Sistema');
  });
});
