import { useRef, type ReactNode } from 'react';
import { Dialog } from '../../components/ui/Dialog';

/** Folha que sobe de baixo (celular), com alça: arrastar para baixo fecha. */
export function WaiterSheet({ label, onClose, children, className = '' }: { label: string; onClose: () => void; children: ReactNode; className?: string }) {
  const startY = useRef<number | null>(null);
  const panel = useRef<HTMLDivElement>(null);
  const move = (y: number) => {
    if (startY.current === null || !panel.current) return;
    panel.current.style.transform = `translateY(${Math.max(0, y - startY.current)}px)`;
  };
  const end = (y: number) => {
    if (startY.current === null || !panel.current) return;
    const dy = y - startY.current;
    startY.current = null;
    panel.current.style.transform = '';
    if (dy > 80) onClose();
  };
  return (
    <Dialog label={label} onClose={onClose} placement="sheet">
      <div ref={panel} className={`dialog-panel waiter-sheet flex max-h-[92dvh] w-full max-w-lg flex-col rounded-t-[22px] bg-[#FBF8F4] transition-transform sm:rounded-[22px] ${className}`}>
        <div className="flex shrink-0 cursor-grab touch-none justify-center pb-1 pt-2.5" aria-hidden="true"
          onTouchStart={(e) => { startY.current = e.touches[0]?.clientY ?? null; }}
          onTouchMove={(e) => move(e.touches[0]?.clientY ?? 0)}
          onTouchEnd={(e) => end(e.changedTouches[0]?.clientY ?? 0)}>
          <span className="h-[5px] w-10 rounded-[3px] bg-[#D9CEC2]" />
        </div>
        {children}
      </div>
    </Dialog>
  );
}
