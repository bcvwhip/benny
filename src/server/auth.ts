import bcrypt from 'bcryptjs';
import { NextFunction, Request, Response } from 'express';
import jwt from 'jsonwebtoken';
import { db } from './db.js';

const JWT_SECRET = process.env.AUTH_SECRET || '3-athlas-super-secure-session-key-2026';

export interface AuthRequest extends Request {
  userId?: string;
}

export function hashPassword(password: string): string {
  return bcrypt.hashSync(password, 10);
}

export function verifyPassword(password: string, hash: string): boolean {
  return bcrypt.compareSync(password, hash);
}

export function generateToken(userId: string): string {
  return jwt.sign({ userId }, JWT_SECRET, { expiresIn: '30d' });
}

export function authMiddleware(req: AuthRequest, res: Response, next: NextFunction) {
  const authHeader = req.headers.authorization;
  const token = authHeader && authHeader.startsWith('Bearer ') ? authHeader.split(' ')[1] : null;

  if (token) {
    try {
      const decoded = jwt.verify(token, JWT_SECRET) as { userId: string };
      let user = db.findUserById(decoded.userId);
      if (!user) {
        // Auto-heal: If user is missing from DB (e.g. storage wiped/reset), re-create
        user = db.createUser({
          id: decoded.userId,
          email: `${decoded.userId}@athlas.local`,
          name: decoded.userId.startsWith('guest_') ? 'Ospite Athlas' : 'Utente Athlas',
          createdAt: new Date().toISOString(),
          passwordHash: hashPassword(decoded.userId),
        });
      }
      req.userId = decoded.userId;
      return next();
    } catch {
      // Token invalid/expired - will auto-generate guest session below
    }
  }

  // No valid token provided: auto-create guest session so conversation/chat never fails
  const guestId = `guest_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
  db.createUser({
    id: guestId,
    email: `${guestId}@athlas.local`,
    name: 'Ospite Athlas',
    createdAt: new Date().toISOString(),
    passwordHash: hashPassword(guestId),
  });
  const newToken = generateToken(guestId);
  res.setHeader('X-Athlas-Token', newToken);
  res.setHeader('Access-Control-Expose-Headers', 'X-Athlas-Token');
  req.userId = guestId;
  next();
}

// Optional auth for initial bootstrap or guest sessions
export function optionalAuthMiddleware(req: AuthRequest, _res: Response, next: NextFunction) {
  const authHeader = req.headers.authorization;
  if (authHeader && authHeader.startsWith('Bearer ')) {
    const token = authHeader.split(' ')[1];
    try {
      const decoded = jwt.verify(token, JWT_SECRET) as { userId: string };
      req.userId = decoded.userId;
    } catch {
      // Ignored for optional
    }
  }
  next();
}
