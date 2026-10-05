import { useHeroPhrase } from '../../hooks/use-hero-phrase';
import { useReducedMotion } from '../../hooks/use-media-query';
import styles from './new-chat-hero.module.css';

export function NewChatHero() {
  const reducedMotion = useReducedMotion();
  const { phrase, phase } = useHeroPhrase(!reducedMotion);
  return (
    <div className={styles.hero}>
      <h1 className="visually-hidden">Start a new chat</h1>
      <p className={styles.phrase} data-phase={phase} aria-hidden="true">
        {phrase}
      </p>
    </div>
  );
}
