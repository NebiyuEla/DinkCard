import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { config } from './config.js';
import { sanitizeUser } from './utils.js';

const COOKIE_NAME = 'dinkcard_session';

export function hashPassword(password) {
  return bcrypt.hash(password, 12);
}

export function comparePassword(password, hash) {
  return bcrypt.compare(password, hash);
}

export function signAuthToken(user) {
  return jwt.sign(
    { sub: user.id, role: user.role, email: user.email },
    config.jwtSecret,
    { expiresIn: '7d' }
  );
}

export function setSessionCookie(res, user) {
  const token = signAuthToken(user);
  res.cookie(COOKIE_NAME, token, {
    httpOnly: true,
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
    maxAge: 7 * 24 * 60 * 60 * 1000
  });
}

export function clearSessionCookie(res) {
  res.clearCookie(COOKIE_NAME);
}

export function readSession(req) {
  const token = req.cookies?.[COOKIE_NAME];
  if (!token) return null;
  try {
    return jwt.verify(token, config.jwtSecret);
  } catch {
    return null;
  }
}

export function authMiddleware(db) {
  return (req, res, next) => {
    const session = readSession(req);
    if (!session) return res.status(401).json({ message: 'Authentication required' });
    const user = db.prepare('SELECT * FROM users WHERE id = ?').get(session.sub);
    if (!user) return res.status(401).json({ message: 'Authentication required' });
    if ((user.account_status || 'active') !== 'active') {
      return res.status(403).json({ message: 'This account is restricted. Contact support for help.' });
    }
    req.user = sanitizeUser(user);
    next();
  };
}

export function requireRole(...roles) {
  return (req, res, next) => {
    if (!req.user || !roles.includes(req.user.role)) {
      return res.status(403).json({ message: 'Forbidden' });
    }
    next();
  };
}
