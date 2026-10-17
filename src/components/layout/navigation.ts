import type { AppRole } from '../../types/enums';
import { BarChart3, Bike, ClipboardList, Landmark, LayoutDashboard, LayoutGrid, PackageCheck, PackagePlus, Receipt, Settings, ShieldCheck, Users, UtensilsCrossed } from 'lucide-react';

export type ActiveTab = 'waiter' | 'tables' | 'kds' | 'cashier' | 'delivery' | 'menu' | 'products' | 'master' | 'finance' | 'reports' | 'stock' | 'audit' | 'team' | 'settings';

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
  products: 'Cadastro de produtos',
  stock: 'Estoque diário',
  audit: 'Auditoria',
  team: 'Equipe',
  settings: 'Configurações',
};

export const NAVIGATION_GROUPS = [
  { label: 'Principal', items: [{ id: 'master', icon: LayoutDashboard }, { id: 'finance', icon: Landmark }, { id: 'reports', icon: BarChart3 }] },
  { label: 'Operação', items: [
    { id: 'waiter', icon: LayoutGrid },
    { id: 'kds', icon: UtensilsCrossed },
    { id: 'cashier', icon: Receipt },
    { id: 'delivery', icon: Bike },
    { id: 'menu', icon: ClipboardList },
  ] },
  { label: 'Controle', items: [
    { id: 'products', icon: PackagePlus },
    { id: 'stock', icon: PackageCheck },
    { id: 'audit', icon: ShieldCheck },
    { id: 'team', icon: Users },
    { id: 'settings', icon: Settings },
  ] },
] satisfies { label: string; items: { id: ActiveTab; icon: typeof LayoutGrid }[] }[];

const ALL_TABS = Object.keys(PAGE_TITLES) as ActiveTab[];

/** Telas que cada papel pode acessar (a primeira é a tela inicial). */
export const ROLE_TABS: Record<AppRole, ActiveTab[]> = {
  MASTER: ['master', ...ALL_TABS.filter((t) => t !== 'master')],
  GERENTE: ['master', 'finance', 'reports', 'waiter', 'tables', 'kds', 'cashier', 'delivery', 'menu', 'products', 'stock', 'audit', 'team', 'settings'],
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

