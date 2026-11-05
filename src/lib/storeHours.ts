/** Horário do delivery informado pelo dono: 18h às 23h, fechado às quartas. */
const OPENS_AT = 18;
const CLOSES_AT = 23;
const CLOSED_WEEKDAY = 3;
const WEEKDAY_NAMES = ['domingo', 'segunda', 'terça', 'quarta', 'quinta', 'sexta', 'sábado'];

/** Data do aparelho no formato do banco (AAAA-MM-DD). */
export function localDateKey(now: Date): string {
  const p = (n: number) => String(n).padStart(2, '0');
  return `${now.getFullYear()}-${p(now.getMonth() + 1)}-${p(now.getDate())}`;
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
  if (overrideDate && overrideDate === localDateKey(now)) return true;
  const hour = now.getHours();
  return now.getDay() !== CLOSED_WEEKDAY && hour >= OPENS_AT && hour < CLOSES_AT;
}

/** Frase depois de "Fechado ·", com a loja fechada no sistema. */
export function storeClosedText(now: Date): string {
  const day = now.getDay();
  const hour = now.getHours();
  if (day !== CLOSED_WEEKDAY) {
    if (hour < OPENS_AT) return `abre hoje às ${OPENS_AT}h`;
    if (hour < CLOSES_AT) return `atendimento hoje até ${CLOSES_AT}h`;
  }
  const tomorrow = (day + 1) % 7;
  if (tomorrow === CLOSED_WEEKDAY) return `abre ${WEEKDAY_NAMES[(tomorrow + 1) % 7]} às ${OPENS_AT}h`;
  return `abre amanhã às ${OPENS_AT}h`;
}
