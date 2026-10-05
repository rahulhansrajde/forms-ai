import { forwardRef, type ButtonHTMLAttributes } from 'react';
import { Icon, type IconName } from './icon';
import styles from './icon-button.module.css';

export type IconButtonVariant = 'plain' | 'outlined' | 'solid' | 'round';

interface IconButtonProps extends Omit<ButtonHTMLAttributes<HTMLButtonElement>, 'children'> {
  icon: IconName;
  label: string;
  variant?: IconButtonVariant;
  tooltip?: boolean;
  iconSize?: number;
}

export const IconButton = forwardRef<HTMLButtonElement, IconButtonProps>(function IconButton(
  { icon, label, variant = 'plain', tooltip = true, iconSize = 20, className, type = 'button', ...rest },
  ref,
) {
  return (
    <span className={styles.wrapper}>
      <button
        {...rest}
        ref={ref}
        type={type}
        aria-label={label}
        className={[styles.button, styles[variant], className ?? ''].filter(Boolean).join(' ')}
      >
        <Icon name={icon} size={iconSize} />
      </button>
      {tooltip ? (
        <span className={styles.tooltip} role="presentation" aria-hidden="true">
          {label}
        </span>
      ) : null}
    </span>
  );
});
