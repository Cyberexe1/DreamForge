import { useEffect, useState } from 'react';
import {
  EMAIL_PATTERN,
  MIN_PASSWORD_LENGTH,
  logIn,
  signUp,
  useAuth,
} from '../auth';
import { ApiError, type FieldErrors } from '../lib/backend';
import { href, navigate } from '../lib/router';

type Mode = 'login' | 'signup';

export function AuthPage({ mode }: { mode: Mode }) {
  const auth = useAuth();
  const isSignup = mode === 'signup';

  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [fieldErrors, setFieldErrors] = useState<FieldErrors>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (auth.status === 'authenticated') navigate('/dashboard');
  }, [auth.status]);

  /** Cheap pre-flight only. The server is the authority on validity. */
  function localErrors(): FieldErrors {
    const errors: FieldErrors = {};
    if (isSignup && name.trim().length < 2) {
      errors.name = 'Tell us what to call you.';
    }
    if (!EMAIL_PATTERN.test(email.trim())) {
      errors.email = 'That does not look like an email address.';
    }
    if (password.length < MIN_PASSWORD_LENGTH) {
      errors.password = `Use at least ${MIN_PASSWORD_LENGTH} characters.`;
    }
    return errors;
  }

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setFormError(null);

    const found = localErrors();
    setFieldErrors(found);
    if (Object.keys(found).length > 0) return;

    setSubmitting(true);
    try {
      if (isSignup) await signUp({ name: name.trim(), email: email.trim(), password });
      else await logIn({ email: email.trim(), password });

      setPassword('');
      navigate('/dashboard');
    } catch (err) {
      if (err instanceof ApiError) {
        setFieldErrors(err.fields);
        // Field-level messages render inline; only show a banner without them.
        if (Object.keys(err.fields).length === 0) setFormError(err.message);
      } else {
        setFormError('Something went wrong. Try again.');
      }
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="relative mx-auto flex min-h-screen max-w-md flex-col justify-center px-5 py-28">
      <div
        aria-hidden="true"
        className="aurora pointer-events-none absolute inset-0 -top-32 opacity-70"
      />

      <div className="card relative animate-reveal p-7 sm:p-9">
        <h1 className="font-display text-3xl font-light text-white">
          {isSignup ? 'Create an account' : 'Welcome back'}
        </h1>
        <p className="mt-3 text-sm leading-relaxed text-slate-400">
          {isSignup
            ? 'Keep the capsules you like and track what the agent has published.'
            : 'Pick up where the agent left off.'}
        </p>

        {formError && (
          <p
            role="alert"
            className="mt-6 rounded-2xl border border-rose-400/25 bg-rose-400/[0.07] px-4 py-3 text-sm text-rose-200"
          >
            {formError}
          </p>
        )}

        <form onSubmit={onSubmit} noValidate className="mt-7 space-y-5">
          {isSignup && (
            <Field
              id="name"
              label="Name"
              type="text"
              autoComplete="name"
              placeholder="Ada Lovelace"
              value={name}
              onChange={setName}
              error={fieldErrors.name}
              disabled={submitting}
            />
          )}

          <Field
            id="email"
            label="Email"
            type="email"
            autoComplete="email"
            placeholder="you@example.com"
            value={email}
            onChange={setEmail}
            error={fieldErrors.email}
            disabled={submitting}
          />

          <Field
            id="password"
            label="Password"
            type="password"
            autoComplete={isSignup ? 'new-password' : 'current-password'}
            placeholder={`At least ${MIN_PASSWORD_LENGTH} characters`}
            value={password}
            onChange={setPassword}
            error={fieldErrors.password}
            disabled={submitting}
            hint={isSignup ? 'Longer beats complicated. A short sentence works well.' : undefined}
          />

          <button type="submit" disabled={submitting} className="btn-primary w-full py-3">
            {submitting ? 'One moment…' : isSignup ? 'Create account' : 'Log in'}
          </button>
        </form>

        <p className="mt-6 text-center text-sm text-slate-500">
          {isSignup ? 'Already have an account? ' : 'New here? '}
          <a
            href={href(isSignup ? '/login' : '/signup')}
            className="rounded text-slate-200 underline decoration-white/25 underline-offset-4 hover:decoration-white"
          >
            {isSignup ? 'Log in' : 'Create one'}
          </a>
        </p>
      </div>

      <p className="relative mt-6 text-center text-xs text-slate-600">
        <a href={href('/')} className="rounded hover:text-slate-400">
          ← Back to today&apos;s capsule
        </a>
      </p>
    </div>
  );
}

function Field({
  id,
  label,
  type,
  autoComplete,
  placeholder,
  value,
  onChange,
  error,
  hint,
  disabled,
}: {
  id: string;
  label: string;
  type: 'text' | 'email' | 'password';
  autoComplete: string;
  placeholder: string;
  value: string;
  onChange: (v: string) => void;
  error?: string | undefined;
  hint?: string | undefined;
  disabled?: boolean;
}) {
  const errorId = `${id}-error`;
  const hintId = `${id}-hint`;

  return (
    <div>
      <label htmlFor={id} className="label block">
        {label}
      </label>
      <input
        id={id}
        name={id}
        type={type}
        autoComplete={autoComplete}
        placeholder={placeholder}
        value={value}
        disabled={disabled}
        onChange={(e) => onChange(e.target.value)}
        aria-invalid={error ? true : undefined}
        aria-describedby={error ? errorId : hint ? hintId : undefined}
        className={`mt-2 w-full rounded-2xl border bg-ink-950/60 px-4 py-3 text-sm text-white
                    placeholder:text-slate-600 transition-colors disabled:opacity-60
                    ${error ? 'border-rose-400/50' : 'border-white/10 hover:border-white/20'}`}
      />
      {error ? (
        <p id={errorId} role="alert" className="mt-2 text-xs text-rose-300">
          {error}
        </p>
      ) : (
        hint && (
          <p id={hintId} className="mt-2 text-xs text-slate-600">
            {hint}
          </p>
        )
      )}
    </div>
  );
}
