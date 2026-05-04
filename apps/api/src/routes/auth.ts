import { FastifyInstance, FastifyRequest, FastifyReply, preHandlerHookHandler } from 'fastify';
import { PrismaClient } from '@prisma/client';
import argon2 from 'argon2';
import { z } from 'zod';
import { verifyGoogleToken } from '../services/google.js';
import { verifyTurnstileToken } from '../services/turnstile.js';
import { sendResetPasswordEmail } from '../services/email.js';
import { v4 as uuidv4 } from 'uuid';
import crypto from 'crypto';
import { redis } from '../services/redis.js';
import { env } from '../config/env.js';

const prisma = new PrismaClient();
const SESSION_COOKIE = 'session_refresh';
const ACCESS_COOKIE = 'access_token';
const ACCESS_TTL_SECONDS = 7 * 24 * 60 * 60; // 15 minutes
const SHORT_SESSION_TTL_SECONDS = 7 * 24 * 60 * 60; // 7 days
const REMEMBER_ME_TTL_SECONDS = 7 * 24 * 60 * 60;
const DUMMY_PASSWORD_HASH = '$argon2id$v=19$m=65536,t=3,p=4$L6xFgaWnlJWevD6z02Nd0Q$P1S2lIgD+yQhWmBrB7wzAQ1r5vVvW5S3zck2Qw4hW8s';

const registerSchema = z.object({
  name: z.string().min(3).max(100),
  email: z.string().email(),
  password: z.string().min(8).regex(/^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)/, 'Password must contain uppercase, lowercase, and number'),
  phone: z.string().regex(/^(\+62|62|0)[0-9]{9,12}$/).optional(),
  role: z.enum(['CUSTOMER', 'EO_ADMIN', 'EO_STAFF', 'AFFILIATE', 'RESELLER']).optional(),
  referralCode: z.string().optional(),
  inviteToken: z.string().optional(),
  eoId: z.string().optional(),
});

const loginSchema = z.object({
  email: z.string().email(),
  password: z.string(),
  rememberMe: z.boolean().default(false),
  captchaToken: z.string().optional(), // Optional for now to avoid breaking dev
});

const verifyOtpSchema = z.object({
  email: z.string().email(),
  otp: z.string().length(6),
});

const verify2faSchema = z.object({
  tempToken: z.string(),
  code: z.string().min(1), // TOTP or backup code
});

const activate2faSchema = z.object({
  code: z.string().min(1),
  password: z.string().min(1),
});

const disable2faSchema = z.object({
  password: z.string().min(1),
});

const resendOtpSchema = z.object({
  email: z.string().email(),
});

const forgotPasswordSchema = z.object({
  email: z.string().email(),
});

const resetPasswordSchema = z.object({
  token: z.string(),
  password: z.string().min(8).regex(/^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)/),
});

function generateReferralCode(): string {
  return Math.random().toString(36).substring(2, 8).toUpperCase();
}

function generateOTP(): string {
  return Math.floor(100000 + Math.random() * 900000).toString();
}

function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

function getCookieValue(cookieHeader: string | undefined, name: string): string | null {
  if (!cookieHeader) return null;
  const cookies = cookieHeader.split(';');
  for (const cookie of cookies) {
    const [rawKey, ...rest] = cookie.trim().split('=');
    if (rawKey === name) return decodeURIComponent(rest.join('='));
  }
  return null;
}

function buildInviteToken(inviteId: string): string {
  return crypto.createHmac('sha256', env.JWT_SECRET).update(`invite:${inviteId}`).digest('hex').slice(0, 32);
}

function timingSafeEqualString(a: string, b: string): boolean {
  const aBuf = Buffer.from(a);
  const bBuf = Buffer.from(b);
  if (aBuf.length !== bBuf.length) return false;
  return crypto.timingSafeEqual(aBuf, bBuf);
}

function setAuthCookies(reply: FastifyReply, accessToken: string, refreshToken: string, refreshMaxAgeSeconds: number) {
  const secure = env.NODE_ENV === 'production';
  const refreshMaxAge = Math.max(1, Math.floor(refreshMaxAgeSeconds));
  reply.header('Set-Cookie', [
    `${ACCESS_COOKIE}=${encodeURIComponent(accessToken)}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${ACCESS_TTL_SECONDS}${secure ? '; Secure' : ''}`,
    `${SESSION_COOKIE}=${encodeURIComponent(refreshToken)}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${refreshMaxAge}${secure ? '; Secure' : ''}`,
  ]);
}

function logAudit(prisma: PrismaClient, event: string, userId: string | null, actorId: string | null, ipAddress: string, data: any) {
  return prisma.auditLog.create({
    data: {
      userId,
      actorId,
      event,
      level: event.includes('FAILED') || event.includes('SUSPENDED') ? 'WARN' : 'INFO',
      ipAddress,
      meta: JSON.stringify(data),
    },
  });
}

export const authenticate: preHandlerHookHandler = async (req, reply) => {
  try {
    const authHeader = req.headers.authorization;
    const cookieToken = getCookieValue(req.headers.cookie, ACCESS_COOKIE);
    const bearerToken = authHeader?.startsWith('Bearer ') ? authHeader.replace('Bearer ', '') : null;
    const token = bearerToken || cookieToken;

    if (!token) {
      return reply.code(401).send({ error: 'No token provided' });
    }
    const decoded = req.server.jwt.verify(token) as { id: string; email: string; role: string; sid?: string };
    if (!decoded?.sid) {
      return reply.code(401).send({ error: 'Invalid token' });
    }

    const session = await prisma.session.findUnique({ where: { id: decoded.sid } });
    if (!session || !session.isActive || session.expiresAt <= new Date()) {
      return reply.code(401).send({ error: 'Session expired' });
    }

    (req as any).user = decoded;
  } catch (err) {
    return reply.code(401).send({ error: 'Invalid token' });
  }
};

export async function authRoutes(fastify: FastifyInstance) {
  fastify.post('/register', { config: { rateLimit: { max: 10, timeWindow: '1 minute' } } }, async (req: FastifyRequest, reply: FastifyReply) => {
    const data = registerSchema.parse(req.body);
    const email = normalizeEmail(data.email);

    const existing = await prisma.user.findUnique({ where: { emailNormalized: email } });
    if (existing) {
      return reply.code(400).send({ error: 'Email sudah terdaftar', code: 'EMAIL_EXISTS' });
    }

    const isInvitedStaff = !!data.inviteToken && !!data.eoId;

    if (data.role === 'EO_STAFF' && !isInvitedStaff) {
      return reply.code(400).send({ error: 'EO Staff registration requires a valid invite', code: 'INVITE_REQUIRED' });
    }

    // Validate invite token if present
    let invitedBy: string | undefined;
    let targetEoId: string | undefined;
    if (isInvitedStaff) {
      const invite = await prisma.staffInvite.findFirst({
        where: {
          email,
          eoId: data.eoId,
          status: 'PENDING',
        },
      });
      if (!invite) {
        return reply.code(400).send({ error: 'Invalid or expired invite', code: 'INVALID_INVITE' });
      }
      const expectedInviteToken = buildInviteToken(invite.id);
      if (!data.inviteToken || !timingSafeEqualString(data.inviteToken, expectedInviteToken)) {
        return reply.code(400).send({ error: 'Invalid or expired invite', code: 'INVALID_INVITE' });
      }
      if (invite.expiresAt < new Date()) {
        await prisma.staffInvite.update({ where: { id: invite.id }, data: { status: 'EXPIRED' } });
        return reply.code(400).send({ error: 'Invite has expired', code: 'INVITE_EXPIRED' });
      }
      invitedBy = invite.invitedBy;
      targetEoId = invite.eoId;
    }

    // Check referral code if provided
    if (data.referralCode) {
      const referrer = await prisma.user.findUnique({ where: { referralCode: data.referralCode } });
      if (!referrer) {
        return reply.code(400).send({ error: 'Invalid referral code', code: 'INVALID_REFERRAL' });
      }
    }

    const passwordHash = await argon2.hash(data.password, { type: argon2.argon2id, memoryCost: 65536, timeCost: 3 });

    // Server-authoritative role assignment:
    // - EO_STAFF only via valid invite token flow
    // - Public registration may choose CUSTOMER/EO_ADMIN/AFFILIATE/RESELLER
    // - EO_ADMIN requires approval before fully active
    const requestedRole = data.role;
    const publicAllowedRoles = new Set(['CUSTOMER', 'EO_ADMIN', 'AFFILIATE', 'RESELLER']);
    const role = isInvitedStaff
      ? 'EO_STAFF'
      : (requestedRole && publicAllowedRoles.has(requestedRole) ? requestedRole : 'CUSTOMER');
    const status = role === 'EO_ADMIN' ? 'PENDING_APPROVAL' : 'ACTIVE';

    let user;
    try {
      user = await prisma.user.create({
        data: {
          email,
          emailNormalized: email,
          passwordHash,
          name: data.name,
          phone: data.phone,
          role,
          referralCode: generateReferralCode(),
          status,
          isVerified: isInvitedStaff,
          invitedBy: invitedBy,
          inviteToken: data.inviteToken,
        },
      });
    } catch (error: any) {
      if (error?.code === 'P2002') {
        return reply.code(400).send({ error: 'Email sudah terdaftar', code: 'EMAIL_EXISTS' });
      }
      throw error;
    }

    // Mark invite as accepted
    if (isInvitedStaff && targetEoId) {
      await prisma.staffInvite.updateMany({
        where: { email, eoId: targetEoId },
        data: { status: 'ACCEPTED' },
      });
    }

    // Handle referral
    if (data.referralCode) {
      const referrer = await prisma.user.findUnique({ where: { referralCode: data.referralCode } });
      if (referrer) {
        await prisma.referralTransaction.create({
          data: { referrerId: referrer.id, referredId: user.id, status: 'PENDING' },
        });
      }
    }

    // For invited staff, no OTP verification needed
    if (isInvitedStaff) {
      logAudit(prisma, 'REGISTER_STAFF', user.id, null, req.ip, { email: user.email, eoId: targetEoId });
      return reply.code(201).send({
        message: 'Account created successfully',
        userId: user.id,
        role: 'EO_STAFF',
      });
    }

    // Generate OTP and store in Redis for non-invited users
    const otp = generateOTP();
    await redis.setex(`otp:${user.email}`, 900, otp); // 15 minutes

    // Send OTP email
    try {
      const { sendOtpEmail } = await import('../services/email.js');
      const emailResult = await sendOtpEmail(user.email, otp, user.name);
      if (emailResult.provider === 'console') {
        console.warn('[EMAIL] OTP stored in console fallback for', user.email);
      }
    } catch (emailError) {
      console.error('[EMAIL] Failed to send OTP email:', emailError);
      if (process.env.NODE_ENV === 'production') {
        return reply.code(500).send({
          error: 'Gagal mengirim email verifikasi',
          code: 'EMAIL_SEND_FAILED',
        });
      }
    }

    logAudit(prisma, 'REGISTER', user.id, null, req.ip, { email: user.email, role: user.role });

    return reply.code(201).send({
      message: 'Account created. Please verify your email.',
      userId: user.id,
      requiresVerification: true,
      devOtp: process.env.NODE_ENV !== 'production' ? otp : undefined,
    });
  });

  fastify.get('/invite/:token', { config: { rateLimit: { max: 30, timeWindow: '1 minute' } } }, async (req: FastifyRequest, reply: FastifyReply) => {
    const { token } = req.params as { token: string };

    // Find invite by token (we need to search through pending invites)
    const invites = await prisma.staffInvite.findMany({
      where: { status: 'PENDING' },
    });

    // Verify invite token generated from invite id
    for (const invite of invites) {
      const expectedToken = buildInviteToken(invite.id);
      if (timingSafeEqualString(token, expectedToken)) {
        if (invite.expiresAt < new Date()) {
          return reply.code(410).send({ error: 'Invite has expired', code: 'INVITE_EXPIRED' });
        }
        return {
          valid: true,
          eoId: invite.eoId,
          email: invite.email,
          expiresAt: invite.expiresAt,
        };
      }
    }

    return reply.code(404).send({ error: 'Invalid invite', code: 'INVALID_INVITE' });
  });

  fastify.post('/verify-email', { config: { rateLimit: { max: 10, timeWindow: '10 minutes' } } }, async (req: FastifyRequest, reply: FastifyReply) => {
    try {
      const parsed = verifyOtpSchema.parse(req.body);
      const email = normalizeEmail(parsed.email);
      const { otp } = parsed;

      const storedOtp = await redis.get(`otp:${email}`);
      if (!storedOtp || storedOtp !== otp) {
        return reply.code(400).send({ error: 'Kode OTP salah atau sudah expired', code: 'INVALID_OTP' });
      }

      const user = await prisma.user.findUnique({ where: { emailNormalized: email } });
      if (!user) {
        return reply.code(400).send({ error: 'User tidak ditemukan', code: 'USER_NOT_FOUND' });
      }

      const verifiedUser = await prisma.user.update({
        where: { id: user.id },
        data: { isVerified: true },
      });

      if (verifiedUser.role === 'EO_ADMIN') {
        await (prisma as any).eoProfile.upsert({
          where: { userId: verifiedUser.id },
          update: {},
          create: {
            userId: verifiedUser.id,
            companyName: verifiedUser.name || 'My EO',
          },
        });
      }

      await redis.del(`otp:${email}`);

      try {
        await logAudit(prisma, 'EMAIL_VERIFIED', user.id, null, req.ip, { email });
      } catch (auditError) {
        console.error('[AUDIT] Failed to log email verification:', auditError);
      }

      // Send welcome email after successful verification (only once)
      try {
        const { sendWelcomeEmail } = await import('../services/email.js');
        await sendWelcomeEmail(user.email, user.name, '');
      } catch (emailError) {
        console.error('[EMAIL] Failed to send welcome email:', emailError);
      }

      const refreshToken = crypto.randomBytes(32).toString('hex');
      const session = await prisma.session.create({
        data: {
          userId: user.id,
          tokenHash: crypto.createHash('sha256').update(refreshToken).digest('hex'),
          ipAddress: req.ip,
          expiresAt: new Date(Date.now() + REMEMBER_ME_TTL_SECONDS * 1000),
          isActive: true,
        },
      });
      const accessToken = fastify.jwt.sign({ id: user.id, email: user.email, role: user.role, sid: session.id }, { expiresIn: '15m' });
      setAuthCookies(reply, accessToken, refreshToken, REMEMBER_ME_TTL_SECONDS);

      return {
        accessToken,
        refreshToken,
        user: {
          id: verifiedUser.id,
          name: verifiedUser.name,
          email: verifiedUser.email,
          role: verifiedUser.role,
          status: verifiedUser.status,
          isVerified: true,
        },
      };
    } catch (error) {
      console.error('[VERIFY_EMAIL] Error details:', {
        message: error instanceof Error ? error.message : 'Unknown error',
        stack: error instanceof Error ? error.stack : undefined,
        name: error instanceof Error ? error.constructor.name : 'Unknown',
      });
      return reply.code(500).send({ error: 'Terjadi kesalahan saat verifikasi email', code: 'VERIFICATION_ERROR' });
    }
  });

  fastify.post('/resend-otp', { config: { rateLimit: { max: 5, timeWindow: '30 minutes' } } }, async (req: FastifyRequest, reply: FastifyReply) => {
    const parsed = forgotPasswordSchema.parse(req.body);
    const email = normalizeEmail(parsed.email);

    const user = await prisma.user.findUnique({ where: { emailNormalized: email } });
    if (!user) {
      return reply.code(200).send({ message: 'If the email exists, an OTP will be sent' });
    }

    const resendKey = `resend:${email}`;
    const resendCount = await redis.incr(resendKey);
    if (resendCount === 1) {
      await redis.expire(resendKey, 30 * 60);
    }
    if (resendCount > 3) {
      return reply.code(429).send({ error: 'Too many requests, wait 30 minutes', code: 'RATE_LIMIT_EXCEEDED' });
    }

    const otp = generateOTP();
    await redis.setex(`otp:${email}`, 900, otp);

    // Send OTP email
    try {
      const { sendOtpEmail } = await import('../services/email.js');
      const emailResult = await sendOtpEmail(email, otp, user.name);
      if (emailResult.provider === 'console') {
        console.warn('[EMAIL] OTP stored in console fallback for', email);
      }
    } catch (emailError) {
      console.error('[EMAIL] Failed to send OTP email:', emailError);
      return reply.code(500).send({
        error: 'Gagal mengirim email verifikasi',
        code: 'EMAIL_SEND_FAILED',
      });
    }

    return {
      message: 'OTP resent',
      expiresIn: 900,
      devOtp: process.env.NODE_ENV !== 'production' ? otp : undefined,
    };
  });

  fastify.post('/login', { config: { rateLimit: { max: 10, timeWindow: '1 minute' } } }, async (req: FastifyRequest, reply: FastifyReply) => {
    try {
      const data = loginSchema.parse(req.body);

      // Verify CAPTCHA
      if (env.NODE_ENV === 'production' || data.captchaToken) {
        const isHuman = await verifyTurnstileToken(data.captchaToken || '', req.ip);
        if (!isHuman) {
          return reply.code(400).send({ error: 'CAPTCHA verification failed', code: 'CAPTCHA_FAILED' });
        }
      }

      const normalizedEmail = normalizeEmail(data.email);
      const user = await prisma.user.findUnique({ where: { emailNormalized: normalizedEmail } });
      if (!user) {
        await argon2.verify(DUMMY_PASSWORD_HASH, data.password).catch(() => null);
        return reply.code(401).send({ error: 'Invalid credentials', code: 'INVALID_CREDENTIALS' });
      }

      // Check if locked
      if (user.lockedUntil && user.lockedUntil > new Date()) {
        return reply.code(423).send({ error: 'Account locked. Try again later', code: 'ACCOUNT_LOCKED' });
      }

      if (!user.passwordHash) {
        return reply.code(401).send({ error: 'Invalid credentials', code: 'INVALID_CREDENTIALS' });
      }

      const valid = await argon2.verify(user.passwordHash, data.password);
      if (!valid) {
        const failedAttempts = user.failedAttempts + 1;
        const updateData: any = { failedAttempts };

        if (failedAttempts >= 5) {
          updateData.lockedUntil = new Date(Date.now() + 30 * 60 * 1000);
        }

        await prisma.user.update({ where: { id: user.id }, data: updateData });
        logAudit(prisma, 'LOGIN_FAILED', user.id, null, req.ip, { reason: 'Wrong password', attempts: failedAttempts });

        return reply.code(401).send({ error: 'Invalid credentials', code: 'INVALID_CREDENTIALS' });
      }

      // Reset failed attempts on successful login
      await prisma.user.update({ where: { id: user.id }, data: { failedAttempts: 0, lockedUntil: null } });

      if (!user.isVerified) {
        return reply.code(401).send({ error: 'Email not verified', code: 'EMAIL_NOT_VERIFIED' });
      }

      if (user.status === 'BANNED') {
        logAudit(prisma, 'LOGIN_BANNED', user.id, null, req.ip, {});
        return reply.code(403).send({ error: 'Akun dibanned', code: 'ACCOUNT_BANNED' });
      }

      if (user.status === 'SUSPENDED') {
        logAudit(prisma, 'LOGIN_SUSPENDED', user.id, null, req.ip, {});
        return reply.code(403).send({ error: 'Akun ditangguhkan', code: 'ACCOUNT_SUSPENDED' });
      }

      if (user.status === 'PENDING_APPROVAL') {
        logAudit(prisma, 'LOGIN_PENDING_APPROVAL', user.id, null, req.ip, {});
        return reply.code(200).send({
          user: {
            id: user.id,
            name: user.name,
            email: user.email,
            phone: user.phone,
            city: user.city,
            role: user.role,
            avatar: user.avatar,
            isVerified: user.isVerified,
            has2FA: true,
            status: user.status,
          },
          requiresApproval: true,
        });
      }

      // If 2FA enabled, return temp token for 2FA verification
      if (user.twoFAEnabled) {
        console.log('[LOGIN] 2FA required for user:', user.id);
        const tempToken = uuidv4();
        await redis.setex(`2fa:${tempToken}`, 300, user.id); // 5 minutes

        logAudit(prisma, 'LOGIN_REQUIRES_2FA', user.id, null, req.ip, {});

        return {
          requires2FA: true,
          tempToken,
          user: {
            id: user.id,
            name: user.name,
            email: user.email,
            role: user.role,
            avatar: user.avatar,
            isVerified: user.isVerified,
            has2FA: true,
            status: user.status,
          },
        };
      }

      const refreshToken = crypto.randomBytes(32).toString('hex');
      const refreshTtlSeconds = data.rememberMe ? REMEMBER_ME_TTL_SECONDS : SHORT_SESSION_TTL_SECONDS;
      const expiresAt = new Date(Date.now() + refreshTtlSeconds * 1000);

      const session = await prisma.session.create({
        data: {
          userId: user.id,
          tokenHash: crypto.createHash('sha256').update(refreshToken).digest('hex'),
          ipAddress: req.ip,
          expiresAt,
          isActive: true,
        },
      });
      const accessToken = fastify.jwt.sign({ id: user.id, email: user.email, role: user.role, sid: session.id }, { expiresIn: '15m' });
      setAuthCookies(reply, accessToken, refreshToken, refreshTtlSeconds);

      logAudit(prisma, 'LOGIN_SUCCESS', user.id, null, req.ip, { rememberMe: data.rememberMe });

      return {
        user: {
          id: user.id,
          name: user.name,
          email: user.email,
          phone: user.phone,
          city: user.city,
          role: user.role,
          avatar: user.avatar,
          isVerified: user.isVerified,
          has2FA: user.twoFAEnabled,
          status: user.status,
        },
        accessToken,
        refreshToken,
      };
    } catch (error) {
      console.error('[LOGIN] Error:', error);
      return reply.code(500).send({ error: 'Login failed', code: 'LOGIN_ERROR' });
    }
  });

  // Google OAuth - redirect to consent screen
  fastify.get('/google', async (req: FastifyRequest, reply: FastifyReply) => {
    const { redirect } = req.query as { redirect?: string };
    const clientId = env.GOOGLE_CLIENT_ID;
    const redirectUri = env.GOOGLE_REDIRECT_URI;

    // Debug: Log the redirect URI being used
    console.log('[GOOGLE OAuth] redirect_uri:', redirectUri);

    const scope = 'openid email profile';
    const authUrl = `https://accounts.google.com/o/oauth2/v2/auth?client_id=${clientId}&redirect_uri=${encodeURIComponent(redirectUri)}&response_type=code&scope=${encodeURIComponent(scope)}&access_type=offline&state=${encodeURIComponent(redirect || '')}`;

    return reply.redirect(authUrl);
  });

  // Google OAuth callback
  fastify.get('/google/callback', async (req: FastifyRequest, reply: FastifyReply) => {
    const { code, state } = req.query as { code?: string; state?: string };
    const redirect = state;
    const redirectUri = env.GOOGLE_REDIRECT_URI;

    // Debug log
    console.log('[GOOGLE callback] redirectUri:', redirectUri);

    if (!code) {
      console.error('[GOOGLE callback] No code received from Google');
      return reply.redirect(`${env.NEXT_PUBLIC_WEB_URL || 'http://localhost:3000'}/auth/google/callback?error=no_code`);
    }

    try {
      // Exchange code for tokens - use SAME redirect_uri as initial redirect
      const tokenRes = await fetch('https://oauth2.googleapis.com/token', {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({
          client_id: env.GOOGLE_CLIENT_ID || '',
          client_secret: env.GOOGLE_CLIENT_SECRET || '',
          code,
          grant_type: 'authorization_code',
          redirect_uri: redirectUri,
        }),
      });

      const tokens = await tokenRes.json();

      if (!tokens.access_token) {
        throw new Error('Failed to get access token');
      }

      // Get user info
      const userRes = await fetch('https://www.googleapis.com/oauth2/v2/userinfo', {
        headers: { Authorization: `Bearer ${tokens.access_token}` },
      });

      const googleUser = await userRes.json();

      // Find or create user
      let user = await prisma.user.findFirst({
        where: { OR: [{ email: googleUser.email }, { provider: 'google', providerId: googleUser.id }] },
      });

      if (!user) {
        user = await prisma.user.create({
          data: {
            email: googleUser.email,
            emailNormalized: googleUser.email.toLowerCase(),
            name: googleUser.name,
            avatar: googleUser.picture,
            provider: 'google',
            providerId: googleUser.id,
            isVerified: true,
            role: 'CUSTOMER',
            referralCode: generateReferralCode(),
          },
        });
        logAudit(prisma, 'GOOGLE_REGISTER', user.id, null, req.ip, { email: user.email });
      }

      const refreshToken = crypto.randomBytes(32).toString('hex');
      const session = await prisma.session.create({
        data: {
          userId: user.id,
          tokenHash: crypto.createHash('sha256').update(refreshToken).digest('hex'),
          ipAddress: req.ip,
          expiresAt: new Date(Date.now() + REMEMBER_ME_TTL_SECONDS * 1000),
          isActive: true,
        },
      });
      const token = fastify.jwt.sign({ id: user.id, email: user.email, role: user.role, sid: session.id }, { expiresIn: '15m' });
      setAuthCookies(reply, token, refreshToken, REMEMBER_ME_TTL_SECONDS);

      logAudit(prisma, 'GOOGLE_LOGIN', user.id, null, req.ip, {});

      // Keep tokens only in httpOnly cookies; avoid token leakage in URL.
      const redirectUrl = `${env.NEXT_PUBLIC_WEB_URL || 'http://localhost:3000'}/auth/google/callback${redirect ? `?redirect=${encodeURIComponent(redirect)}` : ''}`;
      return reply.redirect(redirectUrl);

    } catch (error) {
      console.error('[GOOGLE callback] OAuth error details:', error);
      return reply.redirect(`${env.NEXT_PUBLIC_WEB_URL || 'http://localhost:3000'}/auth/google/callback?error=oauth_failed`);
    }
  });

  // Legacy POST for idToken flow (keep for backward compatibility)
  fastify.post('/google', async (req: FastifyRequest, reply: FastifyReply) => {
    const { idToken } = z.object({ idToken: z.string() }).parse(req.body);

    const googleUser = await verifyGoogleToken(idToken);
    if (!googleUser) {
      return reply.code(401).send({ error: 'Invalid Google token', code: 'INVALID_TOKEN' });
    }

    let user = await prisma.user.findFirst({
      where: { OR: [{ email: googleUser.email }, { provider: 'google', providerId: googleUser.sub }] },
    });

    if (!user) {
      user = await prisma.user.create({
        data: {
          email: googleUser.email,
          emailNormalized: googleUser.email.toLowerCase(),
          name: googleUser.name,
          avatar: googleUser.picture,
          provider: 'google',
          providerId: googleUser.sub,
          isVerified: true,
          referralCode: generateReferralCode(),
          role: 'CUSTOMER',
        },
      });
      logAudit(prisma, 'GOOGLE_REGISTER', user.id, null, req.ip, { email: user.email });
    }

    const refreshToken = crypto.randomBytes(32).toString('hex');
    const session = await prisma.session.create({
      data: {
        userId: user.id,
        tokenHash: crypto.createHash('sha256').update(refreshToken).digest('hex'),
        ipAddress: req.ip,
        expiresAt: new Date(Date.now() + REMEMBER_ME_TTL_SECONDS * 1000),
        isActive: true,
      },
    });
    const token = fastify.jwt.sign({ id: user.id, email: user.email, role: user.role, sid: session.id }, { expiresIn: '15m' });
    setAuthCookies(reply, token, refreshToken, REMEMBER_ME_TTL_SECONDS);

    logAudit(prisma, 'GOOGLE_LOGIN', user.id, null, req.ip, {});

    return {
      user: { id: user.id, email: user.email, name: user.name, phone: user.phone, city: user.city, avatar: user.avatar, role: user.role, isVerified: user.isVerified, status: user.status },
      accessToken: token,
      refreshToken,
    };
  });

  fastify.post('/forgot-password', { config: { rateLimit: { max: 5, timeWindow: '15 minutes' } } }, async (req: FastifyRequest, reply: FastifyReply) => {
    const parsed = forgotPasswordSchema.parse(req.body);
    const email = normalizeEmail(parsed.email);

    const user = await prisma.user.findUnique({ where: { emailNormalized: email } });
    if (!user) {
      return reply.code(200).send({ message: 'If the email exists, a reset link will be sent' });
    }

    const resetToken = crypto.randomBytes(32).toString('hex');
    // Store token -> userId for O(1) lookup
    await redis.setex(`reset:${resetToken}`, 1800, user.id);

    // Send reset password email
    try {
      await sendResetPasswordEmail(user.email, resetToken);
    } catch (emailError) {
      console.error('[FORGOT_PASSWORD] Failed to send email:', emailError);
    }

    logAudit(prisma, 'PASSWORD_RESET_REQUEST', user.id, null, req.ip, {});

    return { message: 'Reset link sent if email exists' };
  });

  fastify.post('/reset-password', { config: { rateLimit: { max: 5, timeWindow: '15 minutes' } } }, async (req: FastifyRequest, reply: FastifyReply) => {
    const { token, password } = resetPasswordSchema.parse(req.body);

    // O(1) lookup by token
    const userId = await redis.get(`reset:${token}`);
    if (!userId) {
      return reply.code(400).send({ error: 'Invalid or expired token', code: 'INVALID_TOKEN' });
    }

    const user = await prisma.user.findUnique({ where: { id: userId } });
    if (!user) {
      return reply.code(404).send({ error: 'User not found' });
    }

    // Check password history
    if (user.passwordHash) {
      const isSameAsOld = await argon2.verify(user.passwordHash, password);
      if (isSameAsOld) {
        return reply.code(400).send({ error: 'Cannot use same password as previous', code: 'PASSWORD_REUSED' });
      }
    }

    const passwordHash = await argon2.hash(password, { type: argon2.argon2id, memoryCost: 65536, timeCost: 3 });

    await prisma.user.update({
      where: { id: userId },
      data: { passwordHash },
    });

    // Invalidate all sessions
    await prisma.session.updateMany({
      where: { userId, isActive: true },
      data: { isActive: false },
    });

    await redis.del(`reset:${token}`);
    logAudit(prisma, 'PASSWORD_RESET', userId, null, req.ip, {});

    return { message: 'Password reset successful' };
  });

  fastify.post('/2fa/verify', { config: { rateLimit: { max: 10, timeWindow: '10 minutes' } } }, async (req: FastifyRequest, reply: FastifyReply) => {
    const { tempToken, code } = verify2faSchema.parse(req.body);

    const userId = await redis.get(`2fa:${tempToken}`);
    if (!userId) {
      return reply.code(401).send({ error: 'Token expired or invalid', code: 'INVALID_2FA_TOKEN' });
    }

    const user = await prisma.user.findUnique({ where: { id: userId } });
    if (!user || !user.twoFAEnabled) {
      return reply.code(400).send({ error: '2FA not enabled', code: '2FA_NOT_ENABLED' });
    }

    let isValid = false;

    // Check TOTP
    if (user.twoFASecret) {
      const TOTP = require('otplib').authenticator;
      TOTP.options = { window: 1 };
      isValid = TOTP.verify({ secret: user.twoFASecret, token: code });
    }

    // Check backup code if not TOTP
    if (!isValid && user.backupCodes) {
      const codeHash = require('crypto').createHash('sha256').update(code).digest('hex');
      const backupIndex = user.backupCodes.indexOf(codeHash);
      if (backupIndex !== -1) {
        isValid = true;
        user.backupCodes.splice(backupIndex, 1);
        await prisma.user.update({
          where: { id: userId },
          data: { backupCodes: user.backupCodes },
        });
      }
    }

    if (!isValid) {
      const failedAttempts = (user.failedAttempts || 0) + 1;
      if (failedAttempts >= 5) {
        await prisma.user.update({
          where: { id: userId },
          data: { lockedUntil: new Date(Date.now() + 30 * 60 * 1000) },
        });
        await redis.del(`2fa:${tempToken}`);
        logAudit(prisma, '2FA_FAILED_LOCKED', userId, null, req.ip, { attempts: failedAttempts });
        return reply.code(423).send({ error: 'Account locked', code: 'ACCOUNT_LOCKED' });
      }
      logAudit(prisma, '2FA_FAILED', userId, null, req.ip, { attempts: failedAttempts });
      return reply.code(401).send({ error: 'Invalid code', code: 'INVALID_2FA_CODE' });
    }

    await redis.del(`2fa:${tempToken}`);

    const refreshToken = crypto.randomBytes(32).toString('hex');
    const session = await prisma.session.create({
      data: {
        userId: user.id,
        tokenHash: crypto.createHash('sha256').update(refreshToken).digest('hex'),
        ipAddress: req.ip,
        expiresAt: new Date(Date.now() + REMEMBER_ME_TTL_SECONDS * 1000),
        isActive: true,
      },
    });
    const token = fastify.jwt.sign({ id: user.id, email: user.email, role: user.role, sid: session.id }, { expiresIn: '15m' });
    setAuthCookies(reply, token, refreshToken, REMEMBER_ME_TTL_SECONDS);

    await prisma.user.update({
      where: { id: userId },
      data: { failedAttempts: 0, lockedUntil: null },
    });

    logAudit(prisma, 'LOGIN_SUCCESS_2FA', user.id, null, req.ip, {});

    return {
      user: {
        id: user.id,
        name: user.name,
        email: user.email,
        role: user.role,
        avatar: user.avatar,
        isVerified: user.isVerified,
        has2FA: true,
      },
      accessToken: token,
      refreshToken,
    };
  });

  // 2FA Setup - generate secret and QR code
  fastify.post('/2fa/setup', { preHandler: [authenticate] }, async (req: FastifyRequest, reply: FastifyReply) => {
    const user = (req as any).user as { id: string; email: string };

    const dbUser = await prisma.user.findUnique({ where: { id: user.id } });

    if (dbUser?.twoFAEnabled) {
      return reply.code(400).send({ error: '2FA already enabled' });
    }

    if (!dbUser?.passwordHash) {
      return reply.code(400).send({ error: 'Set password first to enable 2FA' });
    }

    const secret = require('otpauth').TOTP.generate({
      issuer: 'TiketPro',
      label: dbUser.email,
      algorithm: 'SHA1',
      digits: 6,
      period: 30,
    });

    // Store temp secret in Redis for 5 minutes
    await redis.setex(`2fa_setup:${user.id}`, 300, secret.toString());

    return {
      secret: secret.toString(),
      qrCodeUrl: secret.toQRCodeURL(),
    };
  });

  // 2FA Activate - verify code and enable
  fastify.post('/2fa/activate', { preHandler: [authenticate] }, async (req: FastifyRequest, reply: FastifyReply) => {
    const user = (req as any).user as { id: string };
    const { code, password } = activate2faSchema.parse(req.body);

    const dbUser = await prisma.user.findUnique({ where: { id: user.id } });
    if (!dbUser) {
      return reply.code(404).send({ error: 'User not found' });
    }

    // Verify password
    if (!dbUser.passwordHash) {
      return reply.code(400).send({ error: 'Password not set', code: 'PASSWORD_NOT_SET' });
    }
    const argon2 = (await import('argon2')).default;
    const valid = await argon2.verify(dbUser.passwordHash, password);
    if (!valid) {
      return reply.code(401).send({ error: 'Incorrect password', code: 'INVALID_PASSWORD' });
    }

    // Get temp secret
    const tempSecret = await redis.get(`2fa_setup:${user.id}`);
    if (!tempSecret) {
      return reply.code(400).send({ error: 'Setup expired. Please try again.', code: 'SETUP_EXPIRED' });
    }

    // Verify TOTP code
    const TOTP = require('otplib').authenticator;
    TOTP.options = { window: 1 };
    const isValid = TOTP.verify({ secret: tempSecret, token: code });

    if (!isValid) {
      return reply.code(400).send({ error: 'Invalid code', code: 'INVALID_CODE' });
    }

    // Generate backup codes
    const backupCodes = Array.from({ length: 8 }, () =>
      Math.random().toString(36).substring(2, 10).toUpperCase()
    );
    const backupCodesHashed = backupCodes.map(code =>
      require('crypto').createHash('sha256').update(code).digest('hex')
    );

    // Enable 2FA
    await prisma.user.update({
      where: { id: user.id },
      data: {
        twoFASecret: tempSecret,
        twoFAEnabled: true,
        backupCodes: backupCodesHashed,
      },
    });

    await redis.del(`2fa_setup:${user.id}`);
    logAudit(prisma, '2FA_ENABLED', user.id, null, req.ip, {});

    return {
      message: '2FA enabled successfully',
      backupCodes, // Only shown once
    };
  });

  // 2FA Disable
  fastify.delete('/2fa', { preHandler: [authenticate] }, async (req: FastifyRequest, reply: FastifyReply) => {
    const user = (req as any).user as { id: string };
    const { password } = disable2faSchema.parse(req.body);

    const dbUser = await prisma.user.findUnique({ where: { id: user.id } });
    if (!dbUser) {
      return reply.code(404).send({ error: 'User not found' });
    }

    // Verify password
    if (!dbUser.passwordHash) {
      return reply.code(400).send({ error: 'Password not set', code: 'PASSWORD_NOT_SET' });
    }
    const argon2 = (await import('argon2')).default;
    const valid = await argon2.verify(dbUser.passwordHash, password);
    if (!valid) {
      return reply.code(401).send({ error: 'Incorrect password', code: 'INVALID_PASSWORD' });
    }

    await prisma.user.update({
      where: { id: user.id },
      data: {
        twoFASecret: null,
        twoFAEnabled: false,
        backupCodes: [],
      },
    });

    logAudit(prisma, '2FA_DISABLED', user.id, null, req.ip, {});

    return { message: '2FA disabled successfully' };
  });

  fastify.post('/logout', async (req: FastifyRequest, reply: FastifyReply) => {
    const authHeader = req.headers.authorization;
    const cookieAccessToken = getCookieValue(req.headers.cookie, ACCESS_COOKIE);
    const cookieRefreshToken = getCookieValue(req.headers.cookie, SESSION_COOKIE);
    const bearerToken = authHeader?.startsWith('Bearer ') ? authHeader.replace('Bearer ', '') : null;
    const accessToken = bearerToken || cookieAccessToken;

    let userId: string | null = null;

    // Best effort invalidation:
    // 1) Try access token -> session id
    // 2) Fallback to refresh token hash
    try {
      if (accessToken) {
        const decoded = fastify.jwt.verify(accessToken) as { id?: string; sid?: string };
        if (decoded?.sid) {
          await prisma.session.update({
            where: { id: decoded.sid },
            data: { isActive: false },
          }).catch(() => null);
        }
        if (decoded?.id) {
          userId = decoded.id;
        }
      }
    } catch {
      // Ignore invalid/expired access token on logout
    }

    if (cookieRefreshToken) {
      const tokenHash = crypto.createHash('sha256').update(cookieRefreshToken).digest('hex');
      const session = await prisma.session.findUnique({ where: { tokenHash } });
      if (session) {
        await prisma.session.update({
          where: { id: session.id },
          data: { isActive: false },
        }).catch(() => null);
        if (!userId) userId = session.userId;
      }
    }

    if (userId) {
      logAudit(prisma, 'LOGOUT', userId, null, req.ip, {});
    }

    const secure = env.NODE_ENV === 'production';
    reply.header('Set-Cookie', [
      `${ACCESS_COOKIE}=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0${secure ? '; Secure' : ''}`,
      `${SESSION_COOKIE}=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0${secure ? '; Secure' : ''}`,
    ]);

    return { message: 'Logged out successfully' };
  });

  fastify.post('/refresh', { config: { rateLimit: { max: 20, timeWindow: '15 minutes' } } }, async (req: FastifyRequest, reply: FastifyReply) => {
    const body = (req.body || {}) as { refreshToken?: string };
    const cookieToken = getCookieValue(req.headers.cookie, SESSION_COOKIE);
    const refreshToken = body.refreshToken || cookieToken;

    if (!refreshToken) {
      return reply.code(401).send({ error: 'Refresh token missing', code: 'REFRESH_TOKEN_MISSING' });
    }

    const tokenHash = crypto.createHash('sha256').update(refreshToken).digest('hex');
    const session = await prisma.session.findUnique({
      where: { tokenHash },
      include: { user: { select: { id: true, email: true, role: true } } },
    });

    if (!session || !session.isActive || session.expiresAt <= new Date()) {
      return reply.code(401).send({ error: 'Invalid refresh token', code: 'INVALID_REFRESH_TOKEN' });
    }

    const newRefreshToken = crypto.randomBytes(32).toString('hex');
    const newTokenHash = crypto.createHash('sha256').update(newRefreshToken).digest('hex');

    await prisma.session.update({
      where: { id: session.id },
      data: {
        tokenHash: newTokenHash,
        expiresAt: session.expiresAt,
        isActive: true,
      },
    });

    const accessToken = fastify.jwt.sign(
      { id: session.user.id, email: session.user.email, role: session.user.role, sid: session.id },
      { expiresIn: '15m' }
    );
    const remainingSeconds = Math.floor((session.expiresAt.getTime() - Date.now()) / 1000);
    setAuthCookies(reply, accessToken, newRefreshToken, remainingSeconds);

    return { accessToken, refreshToken: newRefreshToken };
  });

  fastify.get('/me', { preHandler: [authenticate] }, async (req: FastifyRequest, reply: FastifyReply) => {
    const user = (req as any).user as { id: string };

    if (!user?.id) {
      return reply.code(401).send({ error: 'Unauthorized' });
    }

    try {
      const fullUser = await prisma.user.findUnique({
        where: { id: user.id },
        select: {
          id: true, email: true, name: true, phone: true, city: true, role: true, status: true,
          isVerified: true, avatar: true, referralCode: true, twoFAEnabled: true,
          createdAt: true,
        },
      });

      if (!fullUser) {
        return reply.code(404).send({ error: 'User not found' });
      }

      return fullUser;
    } catch (error) {
      console.error('[GET /me]', error);
      return reply.code(500).send({ error: 'Internal server error' });
    }
  });
}
