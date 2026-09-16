// Domain Enums matching PostgreSQL types exactly

export type AppRole = 
  | 'MASTER'
  | 'GERENTE'
  | 'GARCOM'
  | 'CHURRASQUEIRA'
  | 'COZINHA'
  | 'BAR'
  | 'CAIXA'
  | 'ENTREGADOR';

export type ShiftStatus = 'ABERTO' | 'FECHADO';

export type ProductionSector = 'GRILL' | 'KITCHEN' | 'BAR' | 'NONE';

export type ProductType = 'ESPETO' | 'PORCAO' | 'BEBIDA' | 'SOBREMESA' | 'OUTROS';

export type StockMovementType = 
  | 'PRODUCAO'
  | 'VENDA'
  | 'CANCELAMENTO_RETORNO'
  | 'PERDA'
  | 'AJUSTE'
  | 'DESCARTE';

export type OrderStatus = 
  | 'OPEN'
  | 'CONFIRMED'
  | 'IN_PREPARATION'
  | 'PARTIALLY_READY'
  | 'READY'
  | 'DELIVERED'
  | 'CLOSED'
  | 'CANCELLED';

export type OrderItemStatus = 
  | 'RECEIVED'
  | 'IN_PREPARATION'
  | 'READY'
  | 'DELIVERED'
  | 'CANCELLED';

export type MeatDoneness = 
  | 'MAL_PASSADA'
  | 'AO_PONTO_PARA_MAL'
  | 'AO_PONTO'
  | 'AO_PONTO_PARA_BEM'
  | 'BEM_PASSADA';

export type TableStatus = 'LIVRE' | 'OCUPADA' | 'AGUARDANDO_CONTA' | 'RESERVADA';

export type PaymentMethod = 'DINHEIRO' | 'PIX' | 'DEBITO' | 'CREDITO' | 'OUTROS';

export type PaymentStatus = 
  | 'PENDING'
  | 'PROCESSING'
  | 'PAID'
  | 'FAILED'
  | 'REFUNDED'
  | 'CANCELLED';

export type PixKeyType = 'CNPJ' | 'CPF' | 'EMAIL' | 'TELEFONE' | 'ALEATORIA';

export type PrintJobStatus = 'PENDING' | 'PRINTING' | 'PRINTED' | 'FAILED';
