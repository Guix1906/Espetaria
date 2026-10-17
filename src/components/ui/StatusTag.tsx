import type { ReactNode } from 'react';
import { STATUS_STYLES, type StatusKind } from '../../lib/statusStyles';

/** Etiqueta de status do mapa único (src/lib/statusStyles.ts). */
export function StatusTag({ kind, children, className = '' }: { kind: StatusKind; children: ReactNode; className?: string }) {
  return <span className={`status-badge whitespace-nowrap ${STATUS_STYLES[kind]} ${className}`}>{children}</span>;
}
