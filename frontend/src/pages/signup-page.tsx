import type { SignUpRequest } from '@forms-ai/contracts';
import { useState, type FormEvent } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Button } from '../components/ui/button';
import { TextField } from '../components/ui/fields';
import { InlineError } from '../components/ui/states';
import { AuthLayout } from '../layouts/auth-layout';
import styles from '../layouts/auth-layout.module.css';
import { useSession } from '../state/session-context';
import { errorField, errorMessage } from '../utils/error-messages';

type SignUpField = keyof SignUpRequest;

const EMPTY_FORM: SignUpRequest = { firstName: '', lastName: '', email: '', password: '', confirmPassword: '' };

function validate(form: SignUpRequest): Partial<Record<SignUpField, string>> {
  const errors: Partial<Record<SignUpField, string>> = {};
  if (!form.firstName.trim()) errors.firstName = 'First name is required.';
  if (!form.lastName.trim()) errors.lastName = 'Last name is required.';
  if (!form.email.trim()) errors.email = 'Email is required.';
  if (form.password.length < 8) errors.password = 'Use at least 8 characters, including a letter and a number.';
  if (form.confirmPassword !== form.password) errors.confirmPassword = 'Passwords do not match.';
  return errors;
}

export function SignupPage() {
  const { signUp } = useSession();
  const navigate = useNavigate();
  const [form, setForm] = useState<SignUpRequest>(EMPTY_FORM);
  const [fieldErrors, setFieldErrors] = useState<Partial<Record<SignUpField, string>>>({});
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const update = (field: SignUpField) => (value: string) => setForm((current) => ({ ...current, [field]: value }));

  const handleSubmit = async (event: FormEvent) => {
    event.preventDefault();
    const errors = validate(form);
    setFieldErrors(errors);
    setError(null);
    if (Object.keys(errors).length > 0) {
      return;
    }
    setSubmitting(true);
    try {
      await signUp(form);
      navigate('/chat', { replace: true });
    } catch (caught) {
      const field = errorField(caught) as SignUpField | null;
      if (field && field in EMPTY_FORM) {
        setFieldErrors({ [field]: errorMessage(caught) });
      } else {
        setError(errorMessage(caught));
      }
      setSubmitting(false);
    }
  };

  return (
    <AuthLayout title="Create your Forms AI account">
      <form className={styles.form} onSubmit={handleSubmit} noValidate>
        {error ? <InlineError message={error} /> : null}
        <div className={styles.nameRow}>
          <TextField
            label="First name"
            hideLabel
            placeholder="First Name"
            autoComplete="given-name"
            value={form.firstName}
            error={fieldErrors.firstName}
            onChange={(event) => update('firstName')(event.target.value)}
            required
          />
          <TextField
            label="Last name"
            hideLabel
            placeholder="Last Name"
            autoComplete="family-name"
            value={form.lastName}
            error={fieldErrors.lastName}
            onChange={(event) => update('lastName')(event.target.value)}
            required
          />
        </div>
        <TextField
          label="Email address"
          hideLabel
          type="email"
          placeholder="Email Address"
          autoComplete="email"
          value={form.email}
          error={fieldErrors.email}
          onChange={(event) => update('email')(event.target.value)}
          required
        />
        <TextField
          label="New password"
          hideLabel
          type="password"
          placeholder="Enter Your New Password"
          autoComplete="new-password"
          value={form.password}
          error={fieldErrors.password}
          onChange={(event) => update('password')(event.target.value)}
          required
        />
        <TextField
          label="Re-enter password"
          hideLabel
          type="password"
          placeholder="Re-enter Password"
          autoComplete="new-password"
          value={form.confirmPassword}
          error={fieldErrors.confirmPassword}
          onChange={(event) => update('confirmPassword')(event.target.value)}
          required
        />
        <Button type="submit" block loading={submitting}>
          Sign up
        </Button>
        <Link to="/login" className={styles.switchLink}>
          have an account? login here
        </Link>
      </form>
    </AuthLayout>
  );
}
