import { useRef, type ReactNode } from 'react';
import { useFocusTrap } from '../../hooks/use-focus-trap';
import styles from './drawer.module.css';

interface DrawerProps {
  open: boolean;
  side: 'left' | 'right';
  modal: boolean;
  label: string;
  onClose(): void;
  className?: string;
  children: ReactNode;
}

export function Drawer({ open, side, modal, label, onClose, className, children }: DrawerProps) {
  const panelRef = useRef<HTMLElement>(null);
  useFocusTrap(panelRef, open && modal, onClose);
  return (
    <>
      {modal ? (
        <div
          className={[styles.backdrop, open ? styles.backdropVisible : ''].join(' ')}
          aria-hidden="true"
          onClick={onClose}
        />
      ) : null}
      <aside
        ref={panelRef}
        aria-label={label}
        aria-hidden={!open}
        inert={!open}
        role={modal ? 'dialog' : undefined}
        aria-modal={modal && open ? true : undefined}
        className={[styles.drawer, styles[side], open ? styles.open : '', modal ? styles.modal : '', className ?? ''].join(' ')}
      >
        {children}
      </aside>
    </>
  );
}
