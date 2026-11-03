import { describe, expect, it } from 'vitest';
import type { OrderItem } from '../../../types/domain';
import { groupItemsByTab } from '../tableItems';

const item = (id: string, order_id: string) => ({ id, order_id }) as OrderItem;

describe('itens da mesa no Salão e na área do garçom', () => {
  it('junta os itens de todos os pedidos da mesma comanda', () => {
    const map = groupItemsByTab([{ id: 'o1', tab_id: 'tab50' }, { id: 'o2', tab_id: 'tab50' }, { id: 'o3', tab_id: 'tab45' }], [item('a', 'o1'), item('b', 'o2'), item('c', 'o3')]);
    expect(map.get('tab50')?.map((i) => i.id)).toEqual(['a', 'b']);
    expect(map.get('tab45')?.map((i) => i.id)).toEqual(['c']);
  });
  it('comanda sem pedido e item de pedido desconhecido ficam de fora', () => {
    const map = groupItemsByTab([{ id: 'o1', tab_id: 'tab1' }], [item('x', 'outro')]);
    expect(map.get('tab1')).toBeUndefined();
    expect(map.size).toBe(0);
  });
});
