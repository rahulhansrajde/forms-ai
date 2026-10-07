import { useTheme } from '../../state/theme-context';
import { Icon } from './icon';
import styles from './theme-toggle.module.css';

export function ThemeToggle() {
  const { theme, toggle } = useTheme();
  const dark = theme === 'dark';
  return (
    <button
      type="button"
      role="switch"
      aria-checked={dark}
      aria-label="Dark mode"
      title={dark ? 'Switch to light mode' : 'Switch to dark mode'}
      className={styles.toggle}
      onClick={toggle}
    >
      <span className={styles.track} aria-hidden="true">
        <Icon name="sun" size={14} />
        <Icon name="moon" size={14} />
      </span>
      <span className={styles.knob} aria-hidden="true">
        <Icon name={dark ? 'moon' : 'sun'} size={14} />
      </span>
    </button>
  );
}
