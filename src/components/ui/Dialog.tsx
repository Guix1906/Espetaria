import { useEffect, useRef, type KeyboardEvent, type ReactNode } from 'react';
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
      if (previousFocus instanceof HTMLElement && previousFocus.isConnected) previousFocus.focus({ preventScroll: true });
    };
  }, []);

  const keepKeyboardFocus = (event: KeyboardEvent<HTMLDialogElement>) => {
    if (event.key !== 'Tab') return;
    const dialog = event.currentTarget;
    if ([...document.querySelectorAll('dialog[open]')].at(-1) !== dialog) return;
    const controls = [...dialog.querySelectorAll<HTMLElement>('a[href],button:not(:disabled),input:not(:disabled):not([type="hidden"]),select:not(:disabled),textarea:not(:disabled),summary,[tabindex]')]
      .filter((element) => element.tabIndex >= 0 && element.getClientRects().length > 0 && getComputedStyle(element).visibility !== 'hidden');
    const first = controls[0];
    const last = controls.at(-1);
    if (!first || !last) { event.preventDefault(); dialog.focus(); return; }
    const active = document.activeElement;
    if (event.shiftKey && (active === first || active === dialog)) { event.preventDefault(); last.focus(); }
    else if (!event.shiftKey && active === last) { event.preventDefault(); first.focus(); }
  };

  const content = (
    <dialog
      ref={dialogRef}
      tabIndex={-1}
      aria-label={label}
      className={`dialog-root dialog-root--${placement}`}
      onKeyDown={keepKeyboardFocus}
      onCancel={(event) => { event.preventDefault(); onCloseRef.current(); }}
    >
      {children}
    </dialog>
  );

  return typeof document !== 'undefined' ? createPortal(content, document.body) : content;
}
