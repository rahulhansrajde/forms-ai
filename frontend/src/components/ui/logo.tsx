import styles from './logo.module.css';

interface LogoProps {
  size?: number;
  withWordmark?: boolean;
  decorative?: boolean;
}

export function Logo({ size = 32, withWordmark = false, decorative = false }: LogoProps) {
  const source = size > 64 ? '/brand/forms-ai-logo-512.png' : '/brand/forms-ai-logo-192.png';
  return (
    <span className={styles.logo}>
      <img
        className={styles.mark}
        src={source}
        width={size}
        height={size}
        alt={decorative || withWordmark ? '' : 'Forms AI'}
        draggable={false}
      />
      {withWordmark ? <span className={styles.wordmark}>Forms AI</span> : null}
    </span>
  );
}
