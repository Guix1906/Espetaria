/**
 * "Consumo local" (28/11): pedido do cardápio digital de quem vai comer na loja.
 * Vira uma comanda normal (acrescentar itens, conta, caixa), mas numa "mesa" interna
 * a partir do número 900, que não aparece no salão. A RPC `create_local_order` (00074)
 * escolhe/cria essas mesas sozinha; a equipe acha o pedido pelo nome do cliente.
 */
export const LOCAL_TABLE_START = 900;

export function isLocalTable(table: { number: number } | null | undefined): boolean {
  return !!table && table.number >= LOCAL_TABLE_START;
}

export function isLocalTableNumber(number: number | null | undefined): boolean {
  return typeof number === 'number' && number >= LOCAL_TABLE_START;
}

const pad2 = (n: number) => String(n).padStart(2, '0');

/** Nome do cliente da comanda, sem o "Mesa 12" que entra quando ninguém informou o nome. */
export function tabCustomerName(table: { number: number } | null | undefined, customerName: string | null | undefined): string | null {
  const name = customerName?.trim();
  if (!name || (table && name === `Mesa ${table.number}`)) return null;
  return name;
}

/** "Mesa 05" ou "Consumo local". */
export function tableLabel(table: { number: number } | null | undefined): string {
  if (!table) return 'Mesa ??';
  return isLocalTable(table) ? 'Consumo local' : `Mesa ${pad2(table.number)}`;
}

/** Rótulo curto com o cliente para listas e avisos: "Mesa 05" ou "Local · Ana". */
export function tableShortLabel(table: { number: number } | null | undefined, customerName?: string | null): string {
  if (!table) return 'Mesa ??';
  if (!isLocalTable(table)) return `Mesa ${pad2(table.number)}`;
  const name = tabCustomerName(table, customerName);
  return name ? `Local · ${name}` : 'Consumo local';
}

/** WhatsApp gravado nas observações da comanda de consumo local ("CONSUMO LOCAL · WhatsApp 11999998888"). */
export function localTabPhone(notes: string | null | undefined): string | null {
  const match = /WhatsApp\s+(\d{10,13})/i.exec(notes ?? '');
  if (!match) return null;
  const d = match[1]!.replace(/^55(?=\d{10,11}$)/, '');
  if (d.length === 11) return `(${d.slice(0, 2)}) ${d.slice(2, 7)}-${d.slice(7)}`;
  if (d.length === 10) return `(${d.slice(0, 2)}) ${d.slice(2, 6)}-${d.slice(6)}`;
  return d;
}
