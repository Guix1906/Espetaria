import { useEffect, useRef, type ReactNode } from 'react';
import { createPortal } from 'react-dom';

interface DialogProps {
  label: string;
  onClose: () => void;
  children: ReactNode;
  placement?: 'center' | 'sheet' | 'navigation';
}

let openDialogCount = 0;
let previousOverflow = '';

export function Dialog({ label, onClose, children, placement = 'center' }: DialogProps) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;
    const previousFocus = document.activeElement;

    // Native dialogs keep nested payments above checkout and make the background inert.
    dialog.showModal();
    if (openDialogCount === 0) {
      previousOverflow = document.body.style.overflow;
      document.body.style.overflow = 'hidden';
    }
    openDialogCount += 1;

    return () => {
      dialog.close();
      openDialogCount -= 1;
      if (openDialogCount === 0) document.body.style.overflow = previousOverflow;
      if (previousFocus instanceof HTMLElement && previousFocus.isConnected) {
        previousFocus.focus({ preventScroll: true });
      }
    };
  }, []);

  return createPortal(
    <dialog
      ref={dialogRef}
      aria-label={label}
      className={`dialog-root dialog-root--${placement}`}
      onCancel={(event) => {
        event.preventDefault();
        onCloseRef.current();
      }}
    >
      {children}
    </dialog>,
    document.body,
  );
}
