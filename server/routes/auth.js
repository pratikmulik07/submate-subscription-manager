import { createHash, randomBytes, scryptSync, timingSafeEqual } from 'node:crypto';
import { Router } from 'express';
import { HttpError, ValidationError } from '../utils/errors.js';

const COOKIE_NAME = 'submate_session';
const SESSION_SECONDS = 7 * 24 * 60 * 60;

function sessionTokenFrom(req) {
  const cookies = String(req.headers.cookie || '').split(';');
  for (const cookie of cookies) {
    const [name, ...parts] = cookie.trim().split('=');
    if (name === COOKIE_NAME) return decodeURIComponent(parts.join('='));
  }
  return null;
}

function tokenHash(token) {
  return createHash('sha256').update(token).digest('hex');
}

function setSessionCookie(res, token) {
  const secure = process.env.NODE_ENV === 'production' ? '; Secure' : '';
  res.setHeader('Set-Cookie', `${COOKIE_NAME}=${encodeURIComponent(token)}; Path=/; HttpOnly; SameSite=Strict; Max-Age=${SESSION_SECONDS}${secure}`);
}

function clearSessionCookie(res) {
  res.setHeader('Set-Cookie', `${COOKIE_NAME}=; Path=/; HttpOnly; SameSite=Strict; Max-Age=0`);
}

export function isLocalAccountConfigured(db) {
  return Boolean(db.prepare('SELECT id FROM local_account WHERE id = 1').get());
}

export function hasValidSession(db, req) {
  const token = sessionTokenFrom(req);
  if (!token) return false;
  const hash = tokenHash(token);
  const now = new Date().toISOString();
  db.prepare('DELETE FROM auth_sessions WHERE expires_at <= ?').run(now);
  return Boolean(db.prepare('SELECT token_hash FROM auth_sessions WHERE token_hash = ? AND expires_at > ?').get(hash, now));
}

function issueSession(db, res) {
  const token = randomBytes(32).toString('base64url');
  const expiresAt = new Date(Date.now() + SESSION_SECONDS * 1000).toISOString();
  db.prepare('DELETE FROM auth_sessions WHERE expires_at <= ?').run(new Date().toISOString());
  db.prepare('INSERT INTO auth_sessions (token_hash, expires_at) VALUES (?, ?)').run(tokenHash(token), expiresAt);
  setSessionCookie(res, token);
}

function validateCredentials(body, { setup = false } = {}) {
  const fields = {};
  const username = String(body?.username || '').trim();
  const password = String(body?.password || '');
  if (setup && (username.length < 2 || username.length > 60)) fields.username = 'Enter a name between 2 and 60 characters.';
  if (!password || password.length < 10) fields.password = 'Use a passphrase with at least 10 characters.';
  if (password.length > 200) fields.password = 'Passphrase must be 200 characters or fewer.';
  if (Object.keys(fields).length) throw new ValidationError(fields, 'Please check your sign-in details.');
  return { username, password };
}

export function createAuthRouter(db) {
  const router = Router();

  router.get('/status', (req, res) => {
    const account = db.prepare('SELECT username FROM local_account WHERE id = 1').get();
    res.json({
      configured: Boolean(account),
      authenticated: account ? hasValidSession(db, req) : false,
      username: account?.username || null,
    });
  });

  router.post('/setup', (req, res, next) => {
    try {
      if (isLocalAccountConfigured(db)) throw new HttpError(409, 'This local tracker already has an owner.', { code: 'ALREADY_CONFIGURED' });
      const { username, password } = validateCredentials(req.body, { setup: true });
      const salt = randomBytes(16);
      const hash = scryptSync(password, salt, 64);
      db.prepare('INSERT INTO local_account (id, username, password_salt, password_hash) VALUES (1, ?, ?, ?)').run(username, salt, hash);
      issueSession(db, res);
      res.status(201).json({ authenticated: true, username });
    } catch (error) {
      next(error);
    }
  });

  router.post('/login', (req, res, next) => {
    try {
      const account = db.prepare('SELECT username, password_salt, password_hash FROM local_account WHERE id = 1').get();
      if (!account) throw new HttpError(409, 'Set up your local tracker first.', { code: 'SETUP_REQUIRED' });
      const { password } = validateCredentials({ password: req.body?.password });
      const candidate = scryptSync(password, account.password_salt, 64);
      if (!timingSafeEqual(candidate, account.password_hash)) throw new HttpError(401, 'That passphrase did not match. Try again.', { code: 'INVALID_CREDENTIALS' });
      issueSession(db, res);
      res.json({ authenticated: true, username: account.username });
    } catch (error) {
      next(error);
    }
  });

  router.post('/logout', (req, res) => {
    const token = sessionTokenFrom(req);
    if (token) db.prepare('DELETE FROM auth_sessions WHERE token_hash = ?').run(tokenHash(token));
    clearSessionCookie(res);
    res.json({ authenticated: false });
  });

  return router;
}

export function requireLocalSession(db) {
  return (req, res, next) => {
    if (!isLocalAccountConfigured(db)) {
      return res.status(401).json({ error: { message: 'Set up this local tracker before opening its data.', code: 'SETUP_REQUIRED' } });
    }
    if (!hasValidSession(db, req)) {
      return res.status(401).json({ error: { message: 'Unlock your local tracker to continue.', code: 'AUTH_REQUIRED' } });
    }
    next();
  };
}
