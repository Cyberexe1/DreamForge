import { config } from '../config.js';

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

/** A handful of passwords that show up in every breach list. Not a substitute for length. */
const OBVIOUS_PASSWORDS = new Set([
  'password',
  'password1',
  'password123',
  '1234567890',
  'qwertyuiop',
  'letmein123',
  'iloveyou1',
  'admin12345',
  'dreamforge',
  'dreamforge1',
]);

export class ValidationError extends Error {
  constructor(fields) {
    super('Validation failed');
    this.name = 'ValidationError';
    this.status = 400;
    this.fields = fields;
  }
}

export function normalizeEmail(value) {
  return String(value ?? '')
    .trim()
    .toLowerCase();
}

function checkEmail(value, fields) {
  const email = normalizeEmail(value);
  if (!email) fields.email = 'Email is required.';
  else if (email.length > 254) fields.email = 'That email is too long.';
  else if (!EMAIL_PATTERN.test(email)) fields.email = 'That does not look like an email address.';
  return email;
}

function checkPassword(value, fields) {
  const password = String(value ?? '');
  const { minLength, maxLength } = config.password;

  if (!password) fields.password = 'Password is required.';
  else if (password.length < minLength) {
    fields.password = `Use at least ${minLength} characters.`;
  } else if (password.length > maxLength) {
    fields.password = `Keep it under ${maxLength} characters.`;
  } else if (OBVIOUS_PASSWORDS.has(password.toLowerCase())) {
    fields.password = 'That password is too common. Pick something else.';
  }
  return password;
}

export function validateSignup(body) {
  const fields = {};
  const name = String(body?.name ?? '').trim();

  if (name.length < 2) fields.name = 'Tell us what to call you.';
  else if (name.length > 80) fields.name = 'That name is too long.';

  const email = checkEmail(body?.email, fields);
  const password = checkPassword(body?.password, fields);

  if (Object.keys(fields).length > 0) throw new ValidationError(fields);
  return { name, email, password };
}

export function validateLogin(body) {
  const fields = {};
  const email = checkEmail(body?.email, fields);
  const password = String(body?.password ?? '');

  // No strength rules on login — the stored password was validated at signup.
  if (!password) fields.password = 'Password is required.';

  if (Object.keys(fields).length > 0) throw new ValidationError(fields);
  return { email, password };
}

export function validateProfileUpdate(body) {
  const fields = {};
  const name = String(body?.name ?? '').trim();

  if (name.length < 2) fields.name = 'Tell us what to call you.';
  else if (name.length > 80) fields.name = 'That name is too long.';

  if (Object.keys(fields).length > 0) throw new ValidationError(fields);
  return { name };
}

/** Capsule dates are the primary key of the archive, so they must be exactly YYYY-MM-DD. */
export function validateCapsuleDate(value) {
  const date = String(value ?? '').trim();
  if (!DATE_PATTERN.test(date) || Number.isNaN(Date.parse(`${date}T00:00:00Z`))) {
    throw new ValidationError({ date: 'Expected a capsule date as YYYY-MM-DD.' });
  }
  return date;
}
