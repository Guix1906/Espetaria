/** Horário do delivery informado pelo dono: 18h às 23h, fechado às quartas. */
export const OPENS_AT = 18;
export const CLOSES_AT = 23;
export const CLOSED_WEEKDAY = 3;
export const WEEKDAY_NAMES = ['domingo', 'segunda', 'terça', 'quarta', 'quinta', 'sexta', 'sábado'];

/**
 * Obtém partes de data e hora garantindo o fuso horário oficial (America/Sao_Paulo).
 * Evita divergências entre clientes e servidores que executam em UTC ou fusos diferentes.
 */
export function getBrasiliaDateParts(date: Date = new Date()): {
  year: number;
  month: number;
  day: number;
  dayOfWeek: number;
  hour: number;
  minute: number;
  dateKey: string;
} {
  const dtf = new Intl.DateTimeFormat('en-US', {
    timeZone: 'America/Sao_Paulo',
    year: 'numeric',
    month: 'numeric',
    day: 'numeric',
    weekday: 'short',
    hour: 'numeric',
    minute: 'numeric',
    hourCycle: 'h23',
  });
  const parts = dtf.formatToParts(date);
  const map: Record<string, string> = {};
  for (const p of parts) map[p.type] = p.value;
  const weekdayMap: Record<string, number> = { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 };
  const year = parseInt(map.year ?? '0', 10);
  const month = parseInt(map.month ?? '0', 10);
  const day = parseInt(map.day ?? '0', 10);
  const hour = parseInt(map.hour ?? '0', 10);
  const minute = parseInt(map.minute ?? '0', 10);
  const dayOfWeek = (map.weekday ? weekdayMap[map.weekday] : undefined) ?? 0;
  const p = (n: number) => String(n).padStart(2, '0');
  const dateKey = `${year}-${p(month)}-${p(day)}`;
  return { year, month, day, dayOfWeek, hour, minute, dateKey };
}

/** Data no formato do banco (AAAA-MM-DD), em horário oficial de Brasília. */
export function localDateKey(now: Date): string {
  return getBrasiliaDateParts(now).dateKey;
}

/** Exceção "abrir delivery hoje mesmo assim" vale só no dia em que foi ligada. */
export function isOverrideActive(now: Date, overrideDate?: string | null): boolean {
  return !!overrideDate && overrideDate === localDateKey(now);
}

/**
 * Dentro do horário do delivery? Vale mesmo que alguém esqueça o turno aberto:
 * na quarta e fora das 18h–23h o cardápio fica fechado.
 */
export function isWithinStoreHours(now: Date, overrideDate?: string | null): boolean {
  const parts = getBrasiliaDateParts(now);
  if (overrideDate && overrideDate === parts.dateKey) return true;
  return parts.dayOfWeek !== CLOSED_WEEKDAY && parts.hour >= OPENS_AT && parts.hour < CLOSES_AT;
}

/**
 * Loja aberta para novos pedidos?
 * Deve obedecer fielmente ao horário de funcionamento estabelecido (18h às 23h, fechado às quartas),
 * mesmo se o cliente esquecer o turno aberto de um dia para o outro.
 */
export function isStoreOpen(hasOpenShift: boolean, now: Date, overrideDate?: string | null): boolean {
  return hasOpenShift && isWithinStoreHours(now, overrideDate);
}

/** Frase depois de "Fechado ·", com a loja fechada no sistema. */
export function storeClosedText(now: Date): string {
  const parts = getBrasiliaDateParts(now);
  const day = parts.dayOfWeek;
  const hour = parts.hour;
  if (day !== CLOSED_WEEKDAY) {
    if (hour < OPENS_AT) return `abre hoje às ${OPENS_AT}h`;
    if (hour < CLOSES_AT) return `atendimento hoje até ${CLOSES_AT}h`;
  }
  const tomorrow = (day + 1) % 7;
  if (tomorrow === CLOSED_WEEKDAY) return `abre ${WEEKDAY_NAMES[(tomorrow + 1) % 7]} às ${OPENS_AT}h`;
  return `abre amanhã às ${OPENS_AT}h`;
}
