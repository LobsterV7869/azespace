import { SignJWT, jwtVerify } from 'jose';
import { stringifySetCookie } from 'cookie';

const SECRET = new TextEncoder().encode(process.env.SESSION_SECRET || '');

export async function createSession(userData) {
  const token = await new SignJWT(userData)
    .setProtectedHeader({ alg: 'HS256', typ: 'JWT' })
    .setIssuedAt()
    .setExpirationTime('7d')
    .sign(SECRET);
  return stringifySetCookie({
    name: 'session',
    value: token,
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    path: '/',
    maxAge: 60 * 60 * 24 * 7,
  });
}

export async function verifySession(token) {
  try {
    const { payload } = await jwtVerify(token, SECRET, { algorithms: ['HS256'] });
    return payload;
  } catch (err) {
    return null;
  }
}
