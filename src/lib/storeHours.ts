/** Horário do delivery informado pelo dono: 18h às 23h, fechado às quartas. */
const OPENS_AT = 18;
const CLOSES_AT = 23;
const CLOSED_WEEKDAY = 3;
const WEEKDAY_NAMES = ['domingo', 'segunda', 'terça', 'quarta', 'quinta', 'sexta', 'sábado'];

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
