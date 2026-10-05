import type { AnchorHTMLAttributes, ButtonHTMLAttributes, ReactNode } from 'react';
import styles from './button.module.css';
import { Spinner } from './spinner';

export type ButtonVariant = 'primary' | 'secondary' | 'ghost';
export type ButtonSize = 'md' | 'sm';

interface ButtonStyleProps {
  variant?: ButtonVariant;
  size?: ButtonSize;
  block?: boolean;
}

export function buttonClassName({ variant = 'primary', size = 'md', block = false }: ButtonStyleProps, extra?: string): string {
  return [styles.button, styles[variant], styles[size], block ? styles.block : '', extra ?? ''].filter(Boolean).join(' ');
}

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement>, ButtonStyleProps {
  loading?: boolean;
  icon?: ReactNode;
}

export function Button({ variant, size, block, loading = false, icon, children, className, disabled, type = 'button', ...rest }: ButtonProps) {
  return (
    <button
      {...rest}
      type={type}
      className={buttonClassName({ variant, size, block }, className)}
      disabled={disabled || loading}
      aria-busy={loading || undefined}
    >
      {loading ? <Spinner size={16} /> : icon}
      <span>{children}</span>
    </button>
  );
}

interface ButtonLinkProps extends AnchorHTMLAttributes<HTMLAnchorElement>, ButtonStyleProps {
  icon?: ReactNode;
}

export function ButtonLink({ variant, size, block, icon, children, className, ...rest }: ButtonLinkProps) {
  return (
    <a {...rest} className={buttonClassName({ variant, size, block }, className)}>
      {icon}
      <span>{children}</span>
    </a>
  );
}
