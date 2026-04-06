const express = require('express');
const crypto = require('crypto');
const { createClient } = require('@supabase/supabase-js');

const router = express.Router();

const OTP_RESEND_COOLDOWN_SECONDS = Number(process.env.OTP_RESEND_COOLDOWN_SECONDS || 60);
const OTP_MAX_VERIFY_ATTEMPTS = Number(process.env.OTP_MAX_VERIFY_ATTEMPTS || 5);
const OTP_VERIFY_LOCK_MINUTES = Number(process.env.OTP_VERIFY_LOCK_MINUTES || 15);

// Basic in-memory guard for brute-force attempts. For multi-instance deployments,
// replace this with Redis or DB-backed counters.
const verifyAttemptState = new Map();

const SUPABASE_URL = process.env.SUPABASE_URL || process.env.EXPO_PUBLIC_SUPABASE_URL;
const SUPABASE_SERVICE_ROLE_KEY =
  process.env.SUPABASE_SERVICE_ROLE_KEY ||
  process.env.SUPABASE_SERVICE_KEY ||
  process.env.EXPO_PUBLIC_SUPABASE_SERVICE_ROLE_KEY ||
  process.env.EXPO_PUBLIC_SUPABASE_SERVICE_KEY ||
  process.env.SUPABASE_KEY;

let supabaseAdmin = null;

if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
  console.warn(
    '[auth-otp] Missing Supabase config. Provide SUPABASE_URL (or EXPO_PUBLIC_SUPABASE_URL) and SUPABASE_SERVICE_ROLE_KEY (or SUPABASE_SERVICE_KEY). OTP password reset routes will be unavailable.'
  );
} else {
  supabaseAdmin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

const requireSupabaseConfig = (_req, res, next) => {
  if (!supabaseAdmin) {
    return res.status(503).json({
      success: false,
      error:
        'Auth OTP service is unavailable. Missing Supabase config: SUPABASE_URL (or EXPO_PUBLIC_SUPABASE_URL) and SUPABASE_SERVICE_ROLE_KEY (or SUPABASE_SERVICE_KEY).',
    });
  }
  return next();
};

const normalizeEmail = (email) => String(email || '').trim().toLowerCase();

const generateOtp = () => String(crypto.randomInt(0, 1000000)).padStart(6, '0');

const getExpiresAtIso = () => new Date(Date.now() + 10 * 60 * 1000).toISOString();

const isExpired = (expiresAt) => {
  const expiresMs = new Date(expiresAt).getTime();
  return Number.isNaN(expiresMs) || Date.now() > expiresMs;
};

const findAuthUserByEmail = async (email) => {
  const perPage = 1000;
  let page = 1;

  while (true) {
    const { data, error } = await supabaseAdmin.auth.admin.listUsers({ page, perPage });
    if (error) throw new Error(`Failed to list users: ${error.message}`);

    const users = data?.users || [];
    const matched = users.find((user) => normalizeEmail(user?.email) === email);
    if (matched) return matched;

    if (users.length < perPage) break;
    page += 1;
  }

  return null;
};

const getAttemptState = (email) => verifyAttemptState.get(email) || null;

const clearAttemptState = (email) => {
  verifyAttemptState.delete(email);
};

const registerFailedAttempt = (email, otpRowId) => {
  const now = Date.now();
  const lockMs = OTP_VERIFY_LOCK_MINUTES * 60 * 1000;
  const existing = getAttemptState(email);

  const next =
    existing && existing.otpRowId === otpRowId
      ? { ...existing, count: existing.count + 1 }
      : { otpRowId, count: 1, lockUntil: 0 };

  if (next.count >= OTP_MAX_VERIFY_ATTEMPTS) {
    next.lockUntil = now + lockMs;
  }

  verifyAttemptState.set(email, next);
  return next;
};

router.post('/send-otp', requireSupabaseConfig, async (req, res) => {
  try {
    const email = normalizeEmail(req.body?.email);
    if (!email) {
      return res.status(400).json({ success: false, error: 'email is required' });
    }

    const { data: latestOtp, error: latestOtpError } = await supabaseAdmin
      .from('password_resets')
      .select('created_at')
      .eq('email', email)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle();

    if (latestOtpError) {
      console.error('[auth-otp] send-otp latest check failed:', latestOtpError.message);
      return res.status(500).json({ success: false, error: 'Failed to process OTP request' });
    }

    if (latestOtp?.created_at) {
      const latestCreatedMs = new Date(latestOtp.created_at).getTime();
      const elapsedMs = Date.now() - latestCreatedMs;
      const cooldownMs = OTP_RESEND_COOLDOWN_SECONDS * 1000;
      if (Number.isFinite(latestCreatedMs) && elapsedMs < cooldownMs) {
        const retryAfterSeconds = Math.ceil((cooldownMs - elapsedMs) / 1000);
        return res.status(429).json({
          success: false,
          error: `Please wait ${retryAfterSeconds}s before requesting another OTP`,
          retry_after_seconds: retryAfterSeconds,
        });
      }
    }

    const otp = generateOtp();
    const expiresAt = getExpiresAtIso();

    // Keep only one active OTP per email.
    await supabaseAdmin.from('password_resets').delete().eq('email', email);

    const { error: insertError } = await supabaseAdmin.from('password_resets').insert({
      email,
      otp,
      expires_at: expiresAt,
      verified: false,
    });

    if (insertError) {
      console.error('[auth-otp] send-otp insert failed:', insertError.message);
      return res.status(500).json({ success: false, error: 'Failed to generate OTP' });
    }

    // For now: OTP is logged, not emailed.
    console.log(`[auth-otp] OTP for ${email}: ${otp} (expires ${expiresAt})`);

    clearAttemptState(email);

    return res.status(200).json({ success: true, message: 'OTP sent successfully' });
  } catch (error) {
    console.error('[auth-otp] send-otp failed:', error?.message || error);
    return res.status(500).json({ success: false, error: 'Internal server error' });
  }
});

router.post('/verify-otp', requireSupabaseConfig, async (req, res) => {
  try {
    const email = normalizeEmail(req.body?.email);
    const otp = String(req.body?.otp || '').trim();

    if (!email || !otp) {
      return res.status(400).json({ success: false, error: 'email and otp are required' });
    }

    const currentAttemptState = getAttemptState(email);
    if (currentAttemptState?.lockUntil && Date.now() < currentAttemptState.lockUntil) {
      const retryAfterSeconds = Math.ceil((currentAttemptState.lockUntil - Date.now()) / 1000);
      return res.status(429).json({
        success: false,
        error: `Too many invalid attempts. Try again in ${retryAfterSeconds}s`,
        retry_after_seconds: retryAfterSeconds,
      });
    }

    const { data: latestOtp, error: fetchError } = await supabaseAdmin
      .from('password_resets')
      .select('id, otp, expires_at, verified, created_at')
      .eq('email', email)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle();

    if (fetchError) {
      console.error('[auth-otp] verify-otp fetch failed:', fetchError.message);
      return res.status(500).json({ success: false, error: 'Failed to verify OTP' });
    }

    if (!latestOtp) {
      return res.status(400).json({ success: false, error: 'No OTP found for this email' });
    }

    if (latestOtp.otp !== otp) {
      const state = registerFailedAttempt(email, latestOtp.id);
      if (state.lockUntil && Date.now() < state.lockUntil) {
        const retryAfterSeconds = Math.ceil((state.lockUntil - Date.now()) / 1000);
        return res.status(429).json({
          success: false,
          error: `Too many invalid attempts. Try again in ${retryAfterSeconds}s`,
          retry_after_seconds: retryAfterSeconds,
        });
      }

      const attemptsRemaining = Math.max(OTP_MAX_VERIFY_ATTEMPTS - state.count, 0);
      return res.status(400).json({
        success: false,
        error: 'Invalid OTP',
        attempts_remaining: attemptsRemaining,
      });
    }

    if (isExpired(latestOtp.expires_at)) {
      clearAttemptState(email);
      return res.status(400).json({ success: false, error: 'OTP expired' });
    }

    const { error: updateError } = await supabaseAdmin
      .from('password_resets')
      .update({ verified: true })
      .eq('id', latestOtp.id);

    if (updateError) {
      console.error('[auth-otp] verify-otp update failed:', updateError.message);
      return res.status(500).json({ success: false, error: 'Failed to mark OTP as verified' });
    }

    clearAttemptState(email);

    return res.status(200).json({ success: true, message: 'OTP verified successfully' });
  } catch (error) {
    console.error('[auth-otp] verify-otp failed:', error?.message || error);
    return res.status(500).json({ success: false, error: 'Internal server error' });
  }
});

router.post('/reset-password', requireSupabaseConfig, async (req, res) => {
  try {
    const email = normalizeEmail(req.body?.email);
    const newPassword = String(req.body?.newPassword || '');

    if (!email || !newPassword) {
      return res.status(400).json({ success: false, error: 'email and newPassword are required' });
    }

    if (newPassword.length < 6) {
      return res.status(400).json({ success: false, error: 'Password must be at least 6 characters' });
    }

    const { data: latestVerifiedOtp, error: otpError } = await supabaseAdmin
      .from('password_resets')
      .select('id, expires_at, created_at')
      .eq('email', email)
      .eq('verified', true)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle();

    if (otpError) {
      console.error('[auth-otp] reset-password otp check failed:', otpError.message);
      return res.status(500).json({ success: false, error: 'Failed to validate OTP verification' });
    }

    if (!latestVerifiedOtp) {
      return res.status(400).json({ success: false, error: 'OTP not verified for this email' });
    }

    if (isExpired(latestVerifiedOtp.expires_at)) {
      return res.status(400).json({ success: false, error: 'Verified OTP expired' });
    }

    const authUser = await findAuthUserByEmail(email);
    if (!authUser?.id) {
      return res.status(404).json({ success: false, error: 'User not found' });
    }

    const { error: passwordError } = await supabaseAdmin.auth.admin.updateUserById(authUser.id, {
      password: newPassword,
    });

    if (passwordError) {
      console.error('[auth-otp] reset-password updateUserById failed:', passwordError.message);
      return res.status(500).json({ success: false, error: 'Failed to reset password' });
    }

    const { error: cleanupError } = await supabaseAdmin
      .from('password_resets')
      .delete()
      .eq('email', email);

    if (cleanupError) {
      console.error('[auth-otp] reset-password cleanup failed:', cleanupError.message);
    }

    clearAttemptState(email);

    return res.status(200).json({ success: true, message: 'Password reset successful' });
  } catch (error) {
    console.error('[auth-otp] reset-password failed:', error?.message || error);
    return res.status(500).json({ success: false, error: 'Internal server error' });
  }
});

module.exports = router;
