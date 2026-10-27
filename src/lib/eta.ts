export const DEFAULT_DELIVERY_ETA = '40–55 min';
export const DEFAULT_PICKUP_ETA = '30–40 min';

/** Lê "40–55 min" (ou "40-55", "45 min") e devolve [mínimo, máximo] em minutos. */
export function parseEta(text: string | null | undefined, fallback: string): [number, number] {
  const nums = (text?.match(/\d+/g) ?? []).map(Number).filter((n) => n > 0);
  if (nums.length === 0) return fallback === text ? [0, 0] : parseEta(fallback, fallback);
  const [a = 0, b = a] = nums;
  const min = Math.min(a, b);
  const max = Math.max(a, b);
  return [min, max];
}

/** Previsão máxima (minutos) do pedido, conforme Configurações → tempos de entrega/retirada. */
export function etaMaxMinutes(settings: { delivery_eta?: string; pickup_eta?: string }, pickup: boolean): number {
  return pickup ? parseEta(settings.pickup_eta, DEFAULT_PICKUP_ETA)[1] : parseEta(settings.delivery_eta, DEFAULT_DELIVERY_ETA)[1];
}
