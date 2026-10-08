import { useState, type FormEvent } from 'react';
import { useGoogleConnection } from '../../hooks/use-google-connection';
import { useServices } from '../../state/services-context';
import { usePreferences } from '../../state/preferences-context';
import { useSession } from '../../state/session-context';
import { useToast } from '../../state/toast-context';
import { errorMessage } from '../../utils/error-messages';
import { Button, ButtonLink } from '../ui/button';
import { TextField } from '../ui/fields';
import { Modal } from '../ui/modal';
import { InlineError, LoadingState } from '../ui/states';
import { Switch } from '../ui/switch';
import styles from './settings-sections.module.css';

export function ProfileSection() {
  const { user, replaceUser } = useSession();
  const { auth } = useServices();
  const { notify } = useToast();
  const [firstName, setFirstName] = useState(user?.firstName ?? '');
  const [lastName, setLastName] = useState(user?.lastName ?? '');
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const save = async (event: FormEvent) => {
    event.preventDefault();
    setSaving(true);
    setError(null);
    try {
      replaceUser(await auth.updateProfile({ firstName, lastName }));
      notify('Profile updated.');
    } catch (caught) {
      setError(errorMessage(caught));
    } finally {
      setSaving(false);
    }
  };

  return (
    <form className={styles.section} onSubmit={save} noValidate>
      <h2 className={styles.heading}>Profile</h2>
      {error ? <InlineError message={error} /> : null}
      <div className={styles.row}>
        <TextField label="First name" autoComplete="given-name" value={firstName} onChange={(event) => setFirstName(event.target.value)} required />
        <TextField label="Last name" autoComplete="family-name" value={lastName} onChange={(event) => setLastName(event.target.value)} required />
      </div>
      <TextField label="Email" type="email" value={user?.email ?? ''} readOnly hint="Your email is used to log in to Forms AI." />
      <div className={styles.actions}>
        <Button type="submit" loading={saving}>
          Save profile
        </Button>
      </div>
    </form>
  );
}

export function SecuritySection() {
  const { auth } = useServices();
  const { notify } = useToast();
  const [form, setForm] = useState({ currentPassword: '', newPassword: '', confirmPassword: '' });
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const update = (field: keyof typeof form) => (value: string) => setForm((current) => ({ ...current, [field]: value }));

  const changePassword = async (event: FormEvent) => {
    event.preventDefault();
    if (form.newPassword !== form.confirmPassword) {
      setError('Passwords do not match.');
      return;
    }
    setSaving(true);
    setError(null);
    try {
      await auth.changePassword(form);
      setForm({ currentPassword: '', newPassword: '', confirmPassword: '' });
      notify('Password changed. Other sessions were signed out.');
    } catch (caught) {
      setError(errorMessage(caught));
    } finally {
      setSaving(false);
    }
  };

  return (
    <form className={styles.section} onSubmit={changePassword} noValidate>
      <h2 className={styles.heading}>Security</h2>
      {error ? <InlineError message={error} /> : null}
      <TextField label="Current password" type="password" autoComplete="current-password" value={form.currentPassword} onChange={(event) => update('currentPassword')(event.target.value)} />
      <TextField
        label="New password"
        type="password"
        autoComplete="new-password"
        hint="At least 8 characters, including a letter and a number."
        value={form.newPassword}
        onChange={(event) => update('newPassword')(event.target.value)}
      />
      <TextField label="Confirm new password" type="password" autoComplete="new-password" value={form.confirmPassword} onChange={(event) => update('confirmPassword')(event.target.value)} />
      <div className={styles.actions}>
        <Button type="submit" loading={saving}>
          Change password
        </Button>
      </div>
    </form>
  );
}

export function GoogleSection() {
  const google = useGoogleConnection();
  const { notify } = useToast();
  const [confirming, setConfirming] = useState(false);
  const [working, setWorking] = useState(false);
  const connection = google.connection;

  const disconnect = async () => {
    setWorking(true);
    try {
      await google.disconnect();
      notify('Google disconnected.');
    } catch (caught) {
      notify(errorMessage(caught));
    } finally {
      setWorking(false);
      setConfirming(false);
    }
  };

  const missingSheets = connection?.connected === true && !connection.capabilities.sheets;

  return (
    <div className={styles.section}>
      <h2 className={styles.heading}>Google Forms &amp; Sheets</h2>
      {google.status === 'loading' ? <LoadingState label="Checking connection…" /> : null}
      {google.status === 'error' ? <InlineError message="The connection status could not be loaded." /> : null}
      {connection ? (
        <div className={styles.connection}>
          <span className={connection.connected ? styles.statusOn : styles.statusOff}>{connection.connected ? 'Connected' : 'Not connected'}</span>
          {connection.connected ? (
            <p>
              Signed in as <strong>{connection.email}</strong>
              {connection.connectedAt ? ` since ${new Date(connection.connectedAt).toLocaleDateString()}` : ''}.
            </p>
          ) : (
            <p className={styles.muted}>
              Connect your Google account to publish drafts as real Google Forms and to create, read and edit Google Sheets from chat. Forms AI only acts when
              you click a button.
            </p>
          )}
          <ul className={styles.capabilities} aria-label="Google permissions">
            <Capability name="Google Forms" description="Create and edit forms" allowed={connection.capabilities.forms} />
            <Capability name="Google Sheets" description="Create, read and edit spreadsheets" allowed={connection.capabilities.sheets} />
          </ul>
          {missingSheets ? (
            <p className={styles.muted}>Your connection was made before Google Sheets was available. Allow access once to use Google Sheets from chat.</p>
          ) : null}
        </div>
      ) : null}
      <div className={styles.actions}>
        {missingSheets ? <ButtonLink href={google.authorizationPath('/settings')}>Allow Google Sheets</ButtonLink> : null}
        {connection?.connected ? (
          <Button variant="secondary" onClick={() => setConfirming(true)}>
            Disconnect
          </Button>
        ) : (
          <ButtonLink href={google.authorizationPath('/settings')}>Connect Google</ButtonLink>
        )}
      </div>
      <Modal
        open={confirming}
        title="Disconnect Google?"
        onClose={() => setConfirming(false)}
        actions={
          <>
            <Button variant="secondary" onClick={() => setConfirming(false)}>
              Cancel
            </Button>
            <Button loading={working} onClick={() => void disconnect()}>
              Disconnect
            </Button>
          </>
        }
      >
        <p>
          Forms AI will no longer be able to create Google Forms or work with Google Sheets for you. Your account, chats, drafts and the files already in your
          Google Drive stay as they are.
        </p>
      </Modal>
    </div>
  );
}

function Capability({ name, description, allowed }: { name: string; description: string; allowed: boolean }) {
  return (
    <li className={styles.capability}>
      <span className={styles.capabilityText}>
        <strong>{name}</strong>
        <span className={styles.muted}>{description}</span>
      </span>
      <span className={allowed ? styles.allowed : styles.notAllowed}>{allowed ? 'Allowed' : 'Not allowed'}</span>
    </li>
  );
}

export function PreferencesSection() {
  const { sendWithEnter, reduceMotion, update } = usePreferences();
  return (
    <div className={styles.section}>
      <h2 className={styles.heading}>Application preferences</h2>
      <div className={styles.toggleList}>
        <Switch
          label="Send with Enter"
          description="When off, press Control+Enter to send and Enter for a new line."
          checked={sendWithEnter}
          onChange={(checked) => update({ sendWithEnter: checked })}
        />
        <Switch
          label="Reduce motion"
          description="Minimise animations across Forms AI."
          checked={reduceMotion}
          onChange={(checked) => update({ reduceMotion: checked })}
        />
      </div>
    </div>
  );
}
