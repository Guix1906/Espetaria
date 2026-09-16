import { Bike, ClipboardList, LayoutDashboard, LayoutGrid, PackageCheck, PackagePlus, Receipt, Settings, ShieldCheck, Smartphone, UtensilsCrossed } from 'lucide-react';

export type ActiveTab = 'waiter' | 'tables' | 'kds' | 'cashier' | 'delivery' | 'menu' | 'products' | 'master' | 'stock' | 'audit' | 'settings';

export const PAGE_TITLES: Record<ActiveTab, string> = {
  master: 'Visão geral',
  waiter: 'Atendimento',
  tables: 'Salão e mesas',
  kds: 'Produção',
  cashier: 'Caixa',
  delivery: 'Delivery',
  menu: 'Cardápio digital',
  products: 'Cadastro de produtos',
  stock: 'Estoque diário',
  audit: 'Auditoria',
  settings: 'Configurações',
};

export const NAVIGATION_GROUPS = [
  { label: 'Principal', items: [{ id: 'master', icon: LayoutDashboard }] },
  { label: 'Operação', items: [
    { id: 'waiter', icon: Smartphone },
    { id: 'tables', icon: LayoutGrid },
    { id: 'kds', icon: UtensilsCrossed },
    { id: 'cashier', icon: Receipt },
    { id: 'delivery', icon: Bike },
    { id: 'menu', icon: ClipboardList },
  ] },
  { label: 'Controle', items: [
    { id: 'products', icon: PackagePlus },
    { id: 'stock', icon: PackageCheck },
    { id: 'audit', icon: ShieldCheck },
    { id: 'settings', icon: Settings },
  ] },
] satisfies { label: string; items: { id: ActiveTab; icon: typeof LayoutGrid }[] }[];

