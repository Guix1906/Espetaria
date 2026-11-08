import type { AppRole } from '../../types/enums';
import {
  BarChart3,
  Bike,
  Flame,
  Landmark,
  LayoutDashboard,
  PackageCheck,
  PackagePlus,
  QrCode,
  Receipt,
  Settings,
  ShieldCheck,
  Users,
  Utensils,
} from 'lucide-react';

export type ActiveTab = 'waiter' | 'tables' | 'kds' | 'cashier' | 'delivery' | 'menu' | 'whatsapp' | 'products' | 'master' | 'finance' | 'reports' | 'stock' | 'audit' | 'team' | 'settings';

export const PAGE_TITLES: Record<ActiveTab, string> = {
  master: 'Visão geral',
  finance: 'Financeiro',
  reports: 'Relatórios',
  waiter: 'Salão',
  tables: 'Salão',
  kds: 'Produção',
  cashier: 'Caixa',
  delivery: 'Delivery',
  menu: 'Cardápio digital',
  whatsapp: 'WhatsApp',
  products: 'Produtos',
  stock: 'Estoque',
  audit: 'Auditoria',
  team: 'Equipe',
  settings: 'Configurações',
};

export const NAVIGATION_GROUPS = [
  {
    label: 'Principal',
    items: [
      { id: 'master', icon: LayoutDashboard },
      { id: 'finance', icon: Landmark },
      { id: 'reports', icon: BarChart3 },
    ],
  },
  {
    label: 'Operação',
    items: [
      { id: 'waiter', icon: Utensils },
      { id: 'delivery', icon: Bike },
      { id: 'kds', icon: Flame },
      { id: 'stock', icon: PackageCheck },
      { id: 'cashier', icon: Receipt },
    ],
  },
  {
    label: 'Administração',
    items: [
      { id: 'products', icon: PackagePlus },
      { id: 'menu', icon: QrCode },
      { id: 'team', icon: Users },
      { id: 'audit', icon: ShieldCheck },
      { id: 'settings', icon: Settings },
    ],
  },
] satisfies { label: string; items: { id: ActiveTab; icon: typeof LayoutDashboard }[] }[];

const ALL_TABS = Object.keys(PAGE_TITLES) as ActiveTab[];

/** Telas que cada papel pode acessar (a primeira é a tela inicial). */
export const ROLE_TABS: Record<AppRole, ActiveTab[]> = {
  MASTER: ['master', ...ALL_TABS.filter((t) => t !== 'master')],
  GERENTE: ['master', 'finance', 'reports', 'waiter', 'tables', 'delivery', 'kds', 'stock', 'cashier', 'products', 'menu', 'team', 'audit', 'settings', 'whatsapp'],
  CAIXA: ['cashier', 'waiter', 'tables', 'delivery', 'menu'],
  CHURRASQUEIRA: ['kds', 'stock'],
  COZINHA: ['kds', 'stock'],
  BAR: ['kds', 'stock'],
  ENTREGADOR: ['delivery'],
  GARCOM: ['waiter', 'tables'],
};

export function tabsForRole(role: AppRole): ActiveTab[] {
  return ROLE_TABS[role] ?? [];
}
