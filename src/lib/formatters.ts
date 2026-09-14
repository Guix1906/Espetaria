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
 * Calcula tempo decorrido em minutos (ex: "14 min")
 */
export function formatElapsedMinutes(startDateStr: string): string {
  const start = new Date(startDateStr).getTime();
  const now = Date.now();
  const elapsedMinutes = Math.max(0, Math.floor((now - start) / 60000));
  return `${elapsedMinutes} min`;
}

/**
 * Rótulos humanizados para Ponto da Carne
 */
export function formatDoneness(doneness: MeatDoneness | null | undefined): string {
  switch (doneness) {
    case 'MAL_PASSADA': return 'Mal Passada';
    case 'AO_PONTO_PARA_MAL': return 'Ao Ponto p/ Mal';
    case 'AO_PONTO': return 'Ao Ponto';
    case 'AO_PONTO_PARA_BEM': return 'Ao Ponto p/ Bem';
    case 'BEM_PASSADA': return 'Bem Passada';
    default: return 'Padrão';
  }
}

/**
 * Rótulos humanizados e cores para status de mesa
 */
export function getTableStatusConfig(status: TableStatus): { label: string; color: string; badgeBg: string } {
  switch (status) {
    case 'LIVRE':
      return { label: 'Livre', color: 'text-emerald-400', badgeBg: 'bg-emerald-950/80 border-emerald-700 text-emerald-300' };
    case 'OCUPADA':
      return { label: 'Ocupada', color: 'text-amber-400', badgeBg: 'bg-amber-950/80 border-amber-700 text-amber-300' };
    case 'AGUARDANDO_CONTA':
      return { label: 'Aguardando Conta', color: 'text-rose-400', badgeBg: 'bg-rose-950/80 border-rose-700 text-rose-300' };
    case 'RESERVADA':
      return { label: 'Reservada', color: 'text-blue-400', badgeBg: 'bg-blue-950/80 border-blue-700 text-blue-300' };
  }
}

/**
 * Rótulo e cor para status do item de pedido
 */
export function getOrderItemStatusConfig(status: OrderItemStatus): { label: string; color: string; bg: string } {
  switch (status) {
    case 'RECEIVED':
      return { label: 'Recebido', color: 'text-amber-400', bg: 'bg-amber-950/80 border-amber-600' };
    case 'IN_PREPARATION':
      return { label: 'Na Grelha / Preparo', color: 'text-blue-400', bg: 'bg-blue-950/80 border-blue-600' };
    case 'READY':
      return { label: 'Pronto', color: 'text-emerald-400', bg: 'bg-emerald-950/80 border-emerald-600' };
    case 'DELIVERED':
      return { label: 'Entregue', color: 'text-slate-400', bg: 'bg-slate-800 border-slate-700' };
    case 'CANCELLED':
      return { label: 'Cancelado', color: 'text-rose-400', bg: 'bg-rose-950/80 border-rose-800' };
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
