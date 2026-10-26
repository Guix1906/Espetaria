import { type ClassValue, clsx } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

/** Taxa de serviço padrão (10%). */
export const SERVICE_FEE_RATE = 0.1;

/** Taxa em uso: segue `restaurant_settings.service_fee_percent` quando as configurações carregam (0 = loja sem taxa). */
let serviceFeeRate = SERVICE_FEE_RATE;
export function setServiceFeeRate(percent: number) {
  serviceFeeRate = Number.isFinite(percent) && percent > 0 ? percent / 100 : 0;
}
export function getServiceFeeRate() {
  return serviceFeeRate;
}

/** Converte reais para centavos inteiros, evitando erros de ponto flutuante. */
export function toCents(value: number): number {
  return Math.round(value * 100);
}

export function fromCents(cents: number): number {
  return cents / 100;
}

/** Soma valores monetários em centavos e devolve em reais. */
export function sumMoney(values: number[]): number {
  return fromCents(values.reduce((sum, v) => sum + toCents(v), 0));
}

/** Calcula taxa de serviço e total de uma comanda, tudo em centavos. */
export function computeTabTotals(subtotal: number, serviceFeeEnabled: boolean, discount: number) {
  const subtotalCents = Math.max(0, toCents(subtotal));
  const feeCents = serviceFeeEnabled ? Math.round(subtotalCents * serviceFeeRate) : 0;
  const discountCents = Math.max(0, Math.min(subtotalCents + feeCents, toCents(discount)));
  return {
    subtotal: fromCents(subtotalCents),
    service_fee: fromCents(feeCents),
    discount: fromCents(discountCents),
    total: fromCents(subtotalCents + feeCents - discountCents),
  };
}

export function generateId(): string {
  if (typeof crypto !== 'undefined' && crypto.randomUUID) {
    return crypto.randomUUID();
  }
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function(c) {
    const r = (Math.random() * 16) | 0;
    const v = c === 'x' ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}
