import { describe, expect, it } from 'vitest';
import type { MeatDoneness } from '../../../types/enums';
import { expandUnits, groupUnits } from '../orderUnits';

const order: MeatDoneness[] = ['MAL_PASSADA', 'AO_PONTO', 'BEM_PASSADA'];

describe('um arroz para cada Completo', () => {
  it('abre os pontos em unidades, na ordem da tela', () => {
    expect(expandUnits(order, { BEM_PASSADA: 1, AO_PONTO: 2 }, 0).map((u) => u.key)).toEqual(['AO_PONTO:1', 'AO_PONTO:2', 'BEM_PASSADA:1']);
    expect(expandUnits(order, null, 2)).toEqual([{ key: 'q:1', doneness: null }, { key: 'q:2', doneness: null }]);
  });

  it('mesmo ponto com arroz diferente vira duas linhas; observação acompanha', () => {
    const units = expandUnits(order, { AO_PONTO: 2 }, 0);
    const rice: Record<string, string> = { 'AO_PONTO:1': 'Baião de Dois', 'AO_PONTO:2': 'Arroz Branco' };
    expect(groupUnits(units, (u) => rice[u.key] ?? null, 'Pouco sal')).toEqual([
      { doneness: 'AO_PONTO', notes: 'Baião de Dois, Pouco sal', quantity: 1 },
      { doneness: 'AO_PONTO', notes: 'Arroz Branco, Pouco sal', quantity: 1 },
    ]);
  });

  it('unidades iguais somam na mesma linha', () => {
    const units = expandUnits(order, { MAL_PASSADA: 1, BEM_PASSADA: 2 }, 0);
    expect(groupUnits(units, () => 'Arroz Branco', '')).toEqual([
      { doneness: 'MAL_PASSADA', notes: 'Arroz Branco', quantity: 1 },
      { doneness: 'BEM_PASSADA', notes: 'Arroz Branco', quantity: 2 },
    ]);
  });

  it('dois refrigerantes de sabores diferentes, sem ponto', () => {
    const flavor: Record<string, string> = { 'q:1': 'Sprite', 'q:2': 'Fanta Uva' };
    expect(groupUnits(expandUnits(order, null, 2), (u) => flavor[u.key] ?? null, '')).toEqual([
      { doneness: null, notes: 'Sprite', quantity: 1 },
      { doneness: null, notes: 'Fanta Uva', quantity: 1 },
    ]);
  });
});
