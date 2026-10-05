import styles from './spinner.module.css';

export function Spinner({ size = 20 }: { size?: number }) {
  return <span className={styles.spinner} style={{ width: size, height: size }} aria-hidden="true" />;
}
