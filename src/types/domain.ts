import {
  AppRole,
  ShiftStatus,
  ProductionSector,
  ProductType,
  StockMovementType,
  OrderStatus,
  OrderItemStatus,
  MeatDoneness,
  TableStatus,
  PaymentMethod,
  PaymentStatus,
  PixKeyType,
  PrintJobStatus,
} from './enums';

export interface Profile {
  id: string;
  name: string;
  email: string;
  role: AppRole;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

export interface Shift {
  id: string;
  date: string;
  name: string;
  status: ShiftStatus;
  opened_by: string;
  closed_by: string | null;
  opened_at: string;
  closed_at: string | null;
  initial_notes: string | null;
  closing_notes: string | null;
  cash_drawer_start: number;
  cash_drawer_end: number | null;
  created_at: string;
  updated_at: string;
  updated_by: string | null;
  version: number;
}

export interface Category {
  id: string;
  name: string;
  display_order: number;
  active: boolean;
  created_at: string;
}

export interface Product {
  id: string;
  category_id: string;
  name: string;
  description: string | null;
  price: number;
  image_url: string | null;
  active: boolean;
  available: boolean;
  sector: ProductionSector;
  type: ProductType;
  tracks_stock: boolean;
  is_cubas: boolean;
  portions_per_cuba: number;
  /** Abaixo disso o produto aparece como estoque baixo (padrão 5). Coluna da migração 00033. */
  low_stock_threshold?: number | null;
  allows_doneness: boolean;
  allows_notes: boolean;
  display_order: number;
  created_at: string;
  updated_at: string;
}

export interface DailyPrepStock {
  id: string;
  shift_id: string;
  product_id: string;
  cubas_count: number;
  portions_per_cuba: number;
  initial_quantity: number;
  current_quantity: number;
  reserved_quantity: number;
  consumed_quantity: number;
  discarded_quantity: number;
  adjusted_quantity: number;
  last_counted_quantity: number | null;
  count_difference: number | null;
  is_exhausted: boolean;
  exhausted_at: string | null;
  exhausted_by: string | null;
  exhaust_reason: string | null;
  created_at: string;
  updated_at: string;
  updated_by: string | null;
  version: number;
  product?: Product;
}

export interface StockMovement {
  id: string;
  shift_id: string;
  product_id: string;
  quantity: number;
  movement_type: StockMovementType;
  previous_balance: number;
  new_balance: number;
  order_id: string | null;
  order_item_id: string | null;
  reason: string | null;
  user_id: string;
  created_at: string;
  product_name?: string;
  user_name?: string;
}

export interface RestaurantTable {
  id: string;
  number: number;
  capacity: number;
  status: TableStatus;
  active: boolean;
  created_at: string;
  updated_at: string;
  updated_by: string | null;
  version: number;
  current_tab?: Tab;
}

export interface Tab {
  id: string;
  shift_id: string;
  table_id: string;
  customer_name: string | null;
  people_count: number;
  status: OrderStatus;
  opened_by: string;
  closed_by: string | null;
  subtotal: number;
  service_fee: number;
  /** Se a taxa de serviço está ativa nesta comanda (padrão: true). */
  service_fee_enabled?: boolean;
  discount: number;
  total: number;
  notes: string | null;
  opened_at: string;
  closed_at: string | null;
  updated_at: string;
  updated_by: string | null;
  version: number;
}

export interface Order {
  id: string;
  shift_id: string;
  tab_id: string;
  table_id: string;
  order_number: number;
  status: OrderStatus;
  notes: string | null;
  idempotency_key: string | null;
  created_by: string;
  created_at: string;
  updated_at: string;
  updated_by: string | null;
  version: number;
  items?: OrderItem[];
}

export interface OrderItem {
  id: string;
  order_id: string;
  shift_id: string;
  product_id: string;
  product_name: string;
  unit_price: number;
  quantity: number;
  doneness: MeatDoneness | null;
  notes: string | null;
  sector: ProductionSector;
  status: OrderItemStatus;
  created_at: string;
  prepared_at: string | null;
  delivered_at: string | null;
  updated_at: string;
  updated_by: string | null;
  version: number;
}

export interface Payment {
  id: string;
  shift_id: string;
  tab_id: string;
  amount: number;
  method: PaymentMethod;
  status: PaymentStatus;
  external_reference: string | null;
  notes: string | null;
  received_by: string;
  paid_at: string;
}

export interface AuditLog {
  id: string;
  shift_id: string | null;
  user_id: string | null;
  action: string;
  entity_type: string;
  entity_id: string;
  old_data: Record<string, unknown> | null;
  new_data: Record<string, unknown> | null;
  ip_address: string | null;
  created_at: string;
}

export type DeliveryStatus =
  /** PIX automático: esperando o pagamento (não imprime nem vai para a brasa). */
  | 'AWAITING_PAYMENT'
  | 'PENDING'
  | 'CONFIRMED'
  | 'PREPARING'
  | 'READY'
  | 'OUT_FOR_DELIVERY'
  | 'DELIVERED'
  | 'CANCELLED';

export type DeliveryPaymentMethod = 'PIX' | 'DINHEIRO' | 'CARTAO_ENTREGA';

/** Entrega no endereço do cliente ou retirada no local. */
export type DeliveryOrderType = 'DELIVERY' | 'PICKUP';

export interface DeliveryOrderItem {
  id: string;
  delivery_order_id: string;
  product_id: string;
  product_name: string;
  unit_price: number;
  quantity: number;
  doneness: MeatDoneness | null;
  notes: string | null;
  sector: ProductionSector;
}

export interface DeliveryOrder {
  id: string;
  order_number: number;
  shift_id: string;
  /** Pedidos antigos (antes da migração 00028) não têm o campo: são entrega. */
  order_type?: DeliveryOrderType;
  customer_name: string;
  phone: string;
  address_street: string;
  address_number: string;
  address_neighborhood: string;
  address_complement: string | null;
  address_reference: string | null;
  delivery_fee: number;
  subtotal: number;
  total: number;
  payment_method: DeliveryPaymentMethod;
  cash_change_for: number | null;
  status: DeliveryStatus;
  notes: string | null;
  driver_name: string | null;
  created_at: string;
  confirmed_at: string | null;
  /** Hora em que foi para a brasa / ficou pronto / foi cancelado. */
  preparing_at?: string | null;
  ready_at?: string | null;
  cancelled_at?: string | null;
  dispatched_at: string | null;
  delivered_at: string | null;
  /** Pagamento conferido pelo caixa (PIX recebido no banco). */
  paid_at?: string | null;
  cancel_reason?: string | null;
  /** PIX automático (Mercado Pago): Copia e Cola do pedido e validade. */
  pix_qr_code?: string | null;
  pix_expires_at?: string | null;
  items: DeliveryOrderItem[];
}

export type WhatsAppEvent = 'CONFIRMED' | 'PAID' | 'PREPARING' | 'READY' | 'OUT_FOR_DELIVERY' | 'DELIVERED' | 'CANCELLED';

/** Mensagem automática ao cliente (fila whatsapp_outbox). */
export interface WhatsAppMessage {
  id: string;
  delivery_order_id: string;
  event: WhatsAppEvent;
  status: 'PENDING' | 'SENDING' | 'SENT' | 'FAILED' | 'SKIPPED';
  attempts: number;
  last_error: string | null;
  created_at: string;
  sent_at: string | null;
}

export interface RestaurantSettings {
  id: string;
  name: string;
  cnpj: string;
  phone: string;
  address: string;
  service_fee_percent: number;
  allow_custom_service_fee: boolean;
  timezone: string;
  pix_key: string;
  pix_key_type: PixKeyType;
  pix_merchant_name: string;
  pix_merchant_city: string;
  auto_print_orders: boolean;
  print_paper_width: '80mm' | '58mm';
  printer_grill_enabled: boolean;
  printer_kitchen_enabled: boolean;
  printer_cashier_enabled: boolean;
  /** Envio automático de WhatsApp ao cliente do delivery. */
  whatsapp_auto_enabled?: boolean;
  /** PIX automático (Mercado Pago): pedido por PIX só vai para a produção depois de pago. */
  pix_auto_enabled?: boolean;
  /** Minutos para pagar o PIX antes do cancelamento automático. */
  pix_auto_minutes?: number;
  /** Texto do tempo de entrega e de retirada no cardápio digital (migração 00033). */
  delivery_eta?: string;
  pickup_eta?: string;
  /** Pagamento do entregador: valor por entrega e valor fixo por turno (migração 00036; padrão 0). */
  driver_per_delivery?: number;
  driver_fuel_fixed?: number;
  /** URL da Edge Function whatsapp-dispatch. */
  whatsapp_dispatch_url?: string | null;
  /** Chave pública (anon) enviada pelo banco ao chamar a função. */
  whatsapp_dispatch_token?: string | null;
  /** Texto e liga/desliga de cada mensagem automática. null = textos padrão. */
  whatsapp_templates?: Partial<import('../lib/whatsappTemplates').WhatsAppTemplates> | null;
  /** Robô de atendimento (respostas automáticas às mensagens dos clientes). */
  whatsapp_bot?: Partial<import('../lib/whatsappBot').BotSettings> | null;
  /** Modelos de impressão (churrasqueira, cozinha, etiqueta de delivery). null = padrão. */
  print_templates?: Partial<import('../lib/printTemplates').PrintTemplates> | null;
  updated_at: string;
}

export interface PrintJobItem {
  id?: string;
  name: string;
  quantity: number;
  doneness?: MeatDoneness | null;
  notes?: string | null;
}

export interface PrintJob {
  id: string;
  order_id: string;
  order_number: number;
  sector: ProductionSector;
  origin: 'SALAO' | 'DELIVERY' | 'SISTEMA';
  /** Tipo do cupom (banco): pedido, cancelamento, expedição de delivery ou teste. */
  kind?: 'ORDER' | 'CANCEL' | 'DELIVERY_SUMMARY' | 'TEST';
  /** Impressora que confirmou a impressão (preenchido pelo printer-bridge). */
  printer?: string | null;
  table_number?: number;
  customer_name?: string;
  items: PrintJobItem[];
  status: PrintJobStatus;
  idempotency_key: string;
  is_reprint: boolean;
  reprint_reason?: string;
  attempts: number;
  last_error?: string;
  created_at: string;
  updated_at: string;
  printed_at?: string;
}


export interface PrinterStatusRecord {
  id: string;
  worker_name: string;
  mode: string;
  last_heartbeat: string;
  grill_online: boolean;
  grill_ip: string | null;
  grill_latency_ms: number | null;
  grill_error: string | null;
  kitchen_online: boolean;
  kitchen_ip: string | null;
  kitchen_latency_ms: number | null;
  kitchen_error: string | null;
  updated_at: string;
}
