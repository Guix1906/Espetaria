import { MeatDoneness, TableStatus, OrderItemStatus, AppRole } from '../types/enums';

/**
 * Formata valores monetários no padrão Real Brasileiro (BRL)
 */
export function formatBRL(value: number | null | undefined): string {
  if (value === null || value === undefined || isNaN(value)) {
    return 'R$ 0,00';
  }
  return new Intl.NumberFormat('pt-BR', {
    style: 'currency',
    currency: 'BRL',
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(value);
}

/**
 * Converte e exibe datas no fuso horário do Brasil
 */
export function formatDateTime(dateStr: string | null | undefined): string {
  if (!dateStr) return '--:--';
  const date = new Date(dateStr);
  return new Intl.DateTimeFormat('pt-BR', {
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    day: '2-digit',
    month: '2-digit',
    timeZone: 'America/Sao_Paulo'
  }).format(date);
}

/**
 * Exibe apenas hora e minuto
 */
export function formatTime(dateStr: string | null | undefined): string {
  if (!dateStr) return '--:--';
  const date = new Date(dateStr);
  return new Intl.DateTimeFormat('pt-BR', {
    hour: '2-digit',
    minute: '2-digit',
    timeZone: 'America/Sao_Paulo'
  }).format(date);
}

/**
 * Tempo decorrido: "14 min", "1h05", "10h30" (nunca "630 min")
 */
export function formatElapsedMinutes(startDateStr: string, now = Date.now()): string {
  const start = new Date(startDateStr).getTime();
  const elapsedMinutes = Number.isFinite(start) ? Math.max(0, Math.floor((now - start) / 60000)) : 0;
  if (elapsedMinutes < 60) return `${elapsedMinutes} min`;
  return `${Math.floor(elapsedMinutes / 60)}h${String(elapsedMinutes % 60).padStart(2, '0')}`;
}

/**
 * Rótulos humanizados para Ponto da Carne
 */
export function formatDoneness(doneness: MeatDoneness | null | undefined): string {
  switch (doneness) {
    case 'MAL_PASSADA': return 'Mal passada';
    case 'AO_PONTO_PARA_MAL': return 'Ao ponto p/ mal';
    case 'AO_PONTO': return 'Ao ponto';
    case 'AO_PONTO_PARA_BEM': return 'Ao ponto p/ bem';
    case 'BEM_PASSADA': return 'Bem passada';
    default: return 'Padrão';
  }
}

/**
 * Rótulos humanizados e cores para status de mesa
 */
export function getTableStatusConfig(status: TableStatus): { label: string; color: string; badgeBg: string } {
  switch (status) {
    case 'LIVRE':
      return { label: 'Livre', color: 'text-emerald-700', badgeBg: 'bg-emerald-50 text-emerald-800' };
    case 'OCUPADA':
      return { label: 'Ocupada', color: 'text-amber-800', badgeBg: 'bg-amber-50 text-amber-800' };
    case 'AGUARDANDO_CONTA':
      return { label: 'Conta solicitada', color: 'text-rose-700', badgeBg: 'bg-rose-50 text-rose-800' };
    case 'RESERVADA':
      return { label: 'Reservada', color: 'text-sky-700', badgeBg: 'bg-sky-50 text-sky-800' };
  }
}

/**
 * Rótulo e cor para status do item de pedido
 */
export function getOrderItemStatusConfig(status: OrderItemStatus): { label: string; color: string; bg: string } {
  switch (status) {
    case 'RECEIVED':
      return { label: 'Recebido', color: 'text-amber-800', bg: 'bg-amber-50 text-amber-800' };
    case 'IN_PREPARATION':
      return { label: 'Em preparo', color: 'text-brand-700', bg: 'bg-brand-50 text-brand-800' };
    case 'READY':
      return { label: 'Pronto', color: 'text-emerald-700', bg: 'bg-emerald-50 text-emerald-800' };
    case 'DELIVERED':
      return { label: 'Entregue', color: 'text-ink-muted', bg: 'bg-surface-muted border-line text-ink-muted' };
    case 'CANCELLED':
      return { label: 'Cancelado', color: 'text-rose-700', bg: 'bg-rose-50 text-rose-800 line-through' };
  }
}

/**
 * Rótulos humanizados para Roles
 */
export function formatRole(role: AppRole): string {
  switch (role) {
    case 'MASTER': return 'Proprietário (Master)';
    case 'GERENTE': return 'Gerente Geral';
    case 'GARCOM': return 'Garçom / Atendimento';
    case 'CHURRASQUEIRA': return 'Churrasqueiro (Grelha)';
    case 'COZINHA': return 'Cozinha (Acompanhamentos)';
    case 'BAR': return 'Bar / Bebidas';
    case 'CAIXA': return 'Operador de Caixa';
    case 'ENTREGADOR': return 'Entregador';
  }
}
