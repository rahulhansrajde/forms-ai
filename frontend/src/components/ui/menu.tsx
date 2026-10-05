import { useEffect, useId, useRef, useState, type KeyboardEvent, type ReactNode } from 'react';
import styles from './menu.module.css';

export interface MenuItem {
  key: string;
  label: string;
  onSelect(): void;
  disabled?: boolean;
  description?: string;
}

interface MenuProps {
  label: string;
  items: readonly MenuItem[];
  renderTrigger(props: { open: boolean; toggle(): void; id: string; menuId: string }): ReactNode;
  align?: 'start' | 'end';
}

export function Menu({ label, items, renderTrigger, align = 'end' }: MenuProps) {
  const [open, setOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const itemRefs = useRef<Array<HTMLButtonElement | null>>([]);
  const triggerId = useId();
  const menuId = useId();

  useEffect(() => {
    if (!open) {
      return;
    }
    itemRefs.current.find((item) => item && !item.disabled)?.focus();
    const closeOnOutsideClick = (event: MouseEvent) => {
      if (!containerRef.current?.contains(event.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener('mousedown', closeOnOutsideClick);
    return () => document.removeEventListener('mousedown', closeOnOutsideClick);
  }, [open]);

  const moveFocus = (step: number) => {
    const enabled = itemRefs.current.filter((item): item is HTMLButtonElement => item !== null && !item.disabled);
    const index = enabled.indexOf(document.activeElement as HTMLButtonElement);
    enabled[(index + step + enabled.length) % enabled.length]?.focus();
  };

  const handleKeyDown = (event: KeyboardEvent) => {
    if (event.key === 'Escape') {
      setOpen(false);
      document.getElementById(triggerId)?.focus();
    } else if (event.key === 'ArrowDown') {
      event.preventDefault();
      moveFocus(1);
    } else if (event.key === 'ArrowUp') {
      event.preventDefault();
      moveFocus(-1);
    }
  };

  return (
    <div className={styles.container} ref={containerRef} onKeyDown={open ? handleKeyDown : undefined}>
      {renderTrigger({ open, toggle: () => setOpen((current) => !current), id: triggerId, menuId })}
      {open ? (
        <div id={menuId} role="menu" aria-label={label} className={[styles.menu, styles[align]].join(' ')}>
          {items.map((item, index) => (
            <button
              key={item.key}
              ref={(element) => {
                itemRefs.current[index] = element;
              }}
              type="button"
              role="menuitem"
              className={styles.item}
              disabled={item.disabled}
              onClick={() => {
                setOpen(false);
                item.onSelect();
              }}
            >
              <span>{item.label}</span>
              {item.description ? <span className={styles.description}>{item.description}</span> : null}
            </button>
          ))}
        </div>
      ) : null}
    </div>
  );
}
