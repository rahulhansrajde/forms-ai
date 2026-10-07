import type { PublishedFormView } from '@forms-ai/contracts';
import { ButtonLink } from '../ui/button';
import { Icon } from '../ui/icon';
import { QrCode } from '../ui/qr-code';
import styles from './google-form-created-message.module.css';

interface GoogleFormCreatedMessageProps {
  content: string;
  form: PublishedFormView;
}

export function GoogleFormCreatedMessage({ content, form }: GoogleFormCreatedMessageProps) {
  return (
    <section className={styles.card} aria-label="Google Form created">
      <p className={styles.headline}>
        <Icon name="check" size={18} />
        <span>{content}</span>
      </p>
      <p className={styles.details}>
        “{form.title}” · version {form.versionNumber}
      </p>
      <div className={styles.links}>
        <ButtonLink href={form.responderUrl} target="_blank" rel="noopener noreferrer" size="sm" icon={<Icon name="external" size={16} />}>
          Open form
        </ButtonLink>
        <ButtonLink href={form.editUrl} target="_blank" rel="noopener noreferrer" variant="secondary" size="sm" icon={<Icon name="external" size={16} />}>
          Open editor
        </ButtonLink>
      </div>
      <figure className={styles.qr}>
        <QrCode value={form.responderUrl} label={`QR code that opens the form “${form.title}”`} className={styles.qrImage} />
        <figcaption className={styles.caption}>Scan to open the form.</figcaption>
      </figure>
    </section>
  );
}
