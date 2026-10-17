import type React from 'react';
import type { ActiveTab } from '../../components/layout/navigation';
import { WaiterModule } from '../waiter/WaiterModule';

interface TableGridViewProps {
  onOpenShiftClick?: () => void;
  onNavigateTab?: (tab: ActiveTab) => void;
}

/**
 * "Salão e mesas" virou a tela única "Salão": mesmo fluxo do garçom
 * (WaiterOpenTabSheet para abrir comanda, WaiterOrderPad para lançar pedido).
 * Mantido como atalho para links antigos.
 */
export const TableGridView: React.FC<TableGridViewProps> = ({ onOpenShiftClick }) => <WaiterModule onOpenShiftClick={onOpenShiftClick} />;
