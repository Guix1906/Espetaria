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
  discount: number;
  total: number;
  notes: string | null;
  opened_at: string;
  closed_at: string | null;
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
  | 'PENDING'
  | 'CONFIRMED'
  | 'PREPARING'
  | 'OUT_FOR_DELIVERY'
  | 'DELIVERED'
  | 'CANCELLED';

export type DeliveryPaymentMethod = 'PIX' | 'DINHEIRO' | 'CARTAO_ENTREGA';

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
  dispatched_at: string | null;
  delivered_at: string | null;
  items: DeliveryOrderItem[];
}
