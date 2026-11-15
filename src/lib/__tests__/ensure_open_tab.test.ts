import { beforeEach, describe, expect, it } from 'vitest';
import { useTableStore } from '../../stores/useTableStore';

// Sábado 14/11: a comanda sumia do celular do garçom e a mesa travava em "comanda não encontrada".
// Agora, ao lançar, o celular usa a comanda que tiver, ou abre outra se a mesa estiver livre.
describe('ensureOpenTab', () => {
  const shiftId = 'turno-1';
  const userId = 'garcom-1';

  beforeEach(() => {
    const tables = useTableStore.getState().tables.map((t) => ({ ...t, status: 'LIVRE' as const, current_tab: undefined }));
    useTableStore.setState({ tables, tabs: [], orders: [], orderItems: [], payments: [] });
  });

  it('usa a comanda aberta que o aparelho já tem', async () => {
    const table = useTableStore.getState().tables[0]!;
    const opened = useTableStore.getState().openTab(table.id, 'Mesa', 2, '', userId, shiftId);
    const tab = await useTableStore.getState().ensureOpenTab(table.id, userId, shiftId);
    expect(tab?.id).toBe(opened.id);
    expect(useTableStore.getState().tabs.filter((t) => t.status === 'OPEN')).toHaveLength(1);
  });

  it('comanda sumiu do aparelho: abre outra e o pedido pode ser lançado', async () => {
    const table = useTableStore.getState().tables[0]!;
    const tab = await useTableStore.getState().ensureOpenTab(table.id, userId, shiftId);
    expect(tab).not.toBeNull();
    expect(tab!.status).toBe('OPEN');
    expect(useTableStore.getState().getTabByTableId(table.id)?.id).toBe(tab!.id);
  });

  it('só confere, sem abrir, quando pedido para não abrir', async () => {
    const table = useTableStore.getState().tables[0]!;
    const tab = await useTableStore.getState().ensureOpenTab(table.id, userId, shiftId, false);
    expect(tab).toBeNull();
    expect(useTableStore.getState().tabs).toHaveLength(0);
  });
});
