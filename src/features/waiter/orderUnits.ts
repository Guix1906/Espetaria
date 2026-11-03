import type { MeatDoneness } from '../../types/enums';

/** Uma unidade do item na folha do garçom: cada Completo escolhe o próprio arroz. */
export interface OrderUnit {
  key: string;
  doneness: MeatDoneness | null;
}

/** Abre as quantidades em unidades, na ordem em que os pontos aparecem na tela. */
export function expandUnits(order: MeatDoneness[], counts: Record<string, number> | null, quantity: number): OrderUnit[] {
  if (!counts) return Array.from({ length: quantity }, (_, i) => ({ key: `q:${i + 1}`, doneness: null }));
  return order.flatMap((doneness) => Array.from({ length: counts[doneness] || 0 }, (_, i) => ({ key: `${doneness}:${i + 1}`, doneness })));
}

/** Junta unidades iguais (mesmo ponto e mesma escolha) em uma linha do pedido, somando a quantidade. */
export function groupUnits(units: OrderUnit[], choiceOf: (unit: OrderUnit) => string | null, typedNotes: string) {
  const lines = new Map<string, { doneness: MeatDoneness | null; notes: string; quantity: number }>();
  for (const unit of units) {
    const notes = [choiceOf(unit), typedNotes].filter(Boolean).join(', ');
    const id = `${unit.doneness}|${notes}`;
    const line = lines.get(id);
    if (line) line.quantity += 1;
    else lines.set(id, { doneness: unit.doneness, notes, quantity: 1 });
  }
  return [...lines.values()];
}
