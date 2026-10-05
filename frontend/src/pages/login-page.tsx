import { useState, type FormEvent } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { Button } from '../components/ui/button';
import { TextField } from '../components/ui/fields';
import { InlineError } from '../components/ui/states';
import { AuthLayout } from '../layouts/auth-layout';
import styles from '../layouts/auth-layout.module.css';
import { useSession } from '../state/session-context';
import { errorMessage } from '../utils/error-messages';

interface LocationState {
  from?: string;
}

export function LoginPage() {
  const { logIn, expired } = useSession();
  const navigate = useNavigate();
  const location = useLocation();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const handleSubmit = async (event: FormEvent) => {
    event.preventDefault();
    if (!email.trim() || !password) {
      setError('Enter your email and password.');
      return;
    }
    setSubmitting(true);
    setError(null);
    try {
      await logIn({ email, password });
      navigate((location.state as LocationState | null)?.from ?? '/chat', { replace: true });
    } catch (caught) {
      setError(errorMessage(caught));
      setSubmitting(false);
    }
  };

  return (
    <AuthLayout title="Log in to Forms AI">
      <form className={styles.form} onSubmit={handleSubmit} noValidate>
        {expired ? <p className={styles.notice}>Your session has expired. Please log in again.</p> : null}
        {error ? <InlineError message={error} /> : null}
        <TextField
          label="Email"
          hideLabel
          type="email"
          autoComplete="email"
          placeholder="Enter Your Email"
          value={email}
          onChange={(event) => setEmail(event.target.value)}
          required
        />
        <TextField
          label="Password"
          hideLabel
          type="password"
          autoComplete="current-password"
          placeholder="Enter Your Password"
          value={password}
          onChange={(event) => setPassword(event.target.value)}
          required
        />
        <Button type="submit" block loading={submitting}>
          Login
        </Button>
        <Link to="/signup" className={styles.switchLink}>
          don&apos;t have an account? sign up here
        </Link>
      </form>
    </AuthLayout>
  );
}
