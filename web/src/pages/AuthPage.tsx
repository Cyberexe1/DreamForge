import { useEffect, useState } from 'react';
import { EMAIL_PATTERN, MIN_PASSWORD_LENGTH, startSession, useSession } from '../auth';
import { href, navigate } from '../lib/router';

type Mode = 'login' | 'signup';

interface Errors {
  name?: string;
  email?: string;
  password?: string;
}

/**
 * Local-session sign-in. Deliberately does not talk to a server — see the
 * warning at the top of src/auth.ts and D-019 in docs/MEMORY.md. The password
 * field is validated for length and then discarded; it is never stored or sent.
 */
export function AuthPage({ mode }: { mode: Mode }) {
  const session = useSession();
  const isSignup = mode === 'signup';

  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [errors, setErrors] = useState<Errors>({});
  const [submitted, setSubmitted] = useState(false);

  // Already signed in? Nothing to do here.
  useEffect(() => {
    if (session) navigate('/dashboard');
  }, [session]);

  function validate(): Errors {
    const next: Errors = {};
    if (isSignup && name.trim().length < 2) {
      next.name = 'Tell us what to call you — at least two characters.';
    }
    if (!EMAIL_PATTERN.test(email.trim())) {
      next.email = 'That does not look like an email address.';
    }
    if (password.length < MIN_PASSWORD_LENGTH) {
      next.password = `At least ${MIN_PASSWORD_LENGTH} characters.`;
    }
    return next;
  }

  function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setSubmitted(true);

    const found = validate();
    setErrors(found);
    if (Object.keys(found).length > 0) return;

    startSession(email, isSignup ? name : undefined);
    setPassword('');
    navigate('/dashboard');
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
            ? 'Your dashboard tracks what the agent has published and when it next wakes up.'
            : 'Pick up where the agent left off.'}
        </p>

        {/* Honesty banner. This is not real authentication and must not read like it is. */}
        <div className="mt-6 rounded-2xl border border-amber-400/20 bg-amber-400/[0.06] p-4">
          <p className="text-xs leading-relaxed text-amber-200/90">
            <strong className="font-semibold">Demo access.</strong> This sign-in is local to
            your browser. There is no auth server, no account is created, and your password
            is never stored or transmitted. Everything the dashboard shows is public.
          </p>
        </div>

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
              error={submitted ? errors.name : undefined}
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
            error={submitted ? errors.email : undefined}
          />

          <Field
            id="password"
            label="Password"
            type="password"
            autoComplete={isSignup ? 'new-password' : 'current-password'}
            placeholder="At least 8 characters"
            value={password}
            onChange={setPassword}
            error={submitted ? errors.password : undefined}
          />

          <button type="submit" className="btn-primary w-full py-3">
            {isSignup ? 'Create account' : 'Log in'}
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
}: {
  id: string;
  label: string;
  type: 'text' | 'email' | 'password';
  autoComplete: string;
  placeholder: string;
  value: string;
  onChange: (v: string) => void;
  error?: string | undefined;
}) {
  const errorId = `${id}-error`;

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
        onChange={(e) => onChange(e.target.value)}
        aria-invalid={error ? true : undefined}
        aria-describedby={error ? errorId : undefined}
        className={`mt-2 w-full rounded-2xl border bg-ink-950/60 px-4 py-3 text-sm text-white
                    placeholder:text-slate-600 transition-colors
                    ${error ? 'border-rose-400/50' : 'border-white/10 hover:border-white/20'}`}
      />
      {error && (
        <p id={errorId} role="alert" className="mt-2 text-xs text-rose-300">
          {error}
        </p>
      )}
    </div>
  );
}
