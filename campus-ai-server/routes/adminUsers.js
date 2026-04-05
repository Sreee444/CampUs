const express = require('express');
const { createClient } = require('@supabase/supabase-js');

const router = express.Router();

// Accept common Supabase naming variants used across hosting setups.
const SUPABASE_URL = process.env.SUPABASE_URL || process.env.EXPO_PUBLIC_SUPABASE_URL;
const SUPABASE_SERVICE_KEY =
  process.env.SUPABASE_SERVICE_KEY ||
  process.env.SUPABASE_SERVICE_ROLE_KEY ||
  process.env.EXPO_PUBLIC_SUPABASE_SERVICE_KEY ||
  process.env.EXPO_PUBLIC_SUPABASE_SERVICE_ROLE_KEY ||
  process.env.SUPABASE_KEY;
const SUPABASE_ANON_KEY = process.env.SUPABASE_ANON_KEY || process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY;

let supabaseAdmin = null;

if (!SUPABASE_URL || !SUPABASE_SERVICE_KEY) {
  const hasAnonOnly = Boolean(SUPABASE_ANON_KEY) && !SUPABASE_SERVICE_KEY;
  const extraHint = hasAnonOnly
    ? ' Anon key is present, but admin user creation requires a service-role key.'
    : '';
  console.warn(
    '[admin-users] Missing Supabase config. Provide SUPABASE_URL (or EXPO_PUBLIC_SUPABASE_URL) and SUPABASE_SERVICE_KEY (or SUPABASE_SERVICE_ROLE_KEY). Admin user creation will fail.' +
      extraHint
  );
} else {
  supabaseAdmin = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

const requireSupabaseConfig = (_req, res, next) => {
  if (!supabaseAdmin) {
    return res.status(503).json({
      error:
        'Admin user service is unavailable. Missing Supabase config: SUPABASE_URL (or EXPO_PUBLIC_SUPABASE_URL) and SUPABASE_SERVICE_KEY (or SUPABASE_SERVICE_ROLE_KEY).',
    });
  }
  next();
};

const getBearerToken = (req) => {
  const header = String(req.headers.authorization || '');
  const match = header.match(/^Bearer\s+(.+)$/i);
  return match ? match[1] : '';
};

const requireAdmin = async (req, res, next) => {
  if (!supabaseAdmin) {
    return res.status(503).json({
      error:
        'Admin user service is unavailable. Missing Supabase config: SUPABASE_URL (or EXPO_PUBLIC_SUPABASE_URL) and SUPABASE_SERVICE_KEY (or SUPABASE_SERVICE_ROLE_KEY).',
    });
  }

  const token = getBearerToken(req);
  if (!token) {
    return res.status(401).json({ error: 'Missing authorization token' });
  }

  const { data: authData, error: authError } = await supabaseAdmin.auth.getUser(token);
  if (authError || !authData?.user?.id) {
    return res.status(401).json({ error: 'Invalid or expired token' });
  }

  const userId = authData.user.id;
  const { data: profile, error: profileError } = await supabaseAdmin
    .from('profiles')
    .select('role')
    .eq('id', userId)
    .single();

  if (profileError) {
    return res.status(403).json({ error: 'Unable to verify admin permissions' });
  }

  const role = String(profile?.role || '').toLowerCase();
  if (role !== 'admin' && role !== 'developer') {
    return res.status(403).json({ error: 'Admin access required' });
  }

  req.adminUserId = userId;
  next();
};

router.post('/create-user', requireSupabaseConfig, requireAdmin, async (req, res) => {
  try {
    const {
      email,
      full_name,
      role,
      department,
      year,
      semester,
      section,
      password,
    } = req.body || {};

    const normalizedEmail = String(email || '').trim().toLowerCase();
    if (!normalizedEmail) {
      return res.status(400).json({ error: 'Email is required' });
    }

    const safeRole = String(role || 'student').trim().toLowerCase();
    const allowedRoles = ['student', 'faculty', 'alumni', 'admin'];
    if (!allowedRoles.includes(safeRole)) {
      return res.status(400).json({ error: 'Invalid role provided' });
    }

    const rawPassword = String(password || '').trim();
    const passwordToUse = rawPassword ? rawPassword : '123456';
    if (passwordToUse.length < 6) {
      return res.status(400).json({ error: 'Password must be at least 6 characters' });
    }

    const { data: createdUser, error: createError } = await supabaseAdmin.auth.admin.createUser({
      email: normalizedEmail,
      password: passwordToUse,
      email_confirm: true,
    });

    if (createError || !createdUser?.user?.id) {
      const message = createError?.message || 'Failed to create user';
      console.error('[admin-users] auth.createUser failed:', {
        email: normalizedEmail,
        role: safeRole,
        error: message,
      });
      const status = message.toLowerCase().includes('already') ? 409 : 400;
      return res.status(status).json({ error: message });
    }

    const userId = createdUser.user.id;
    const profilePayload = {
      id: userId,
      email: normalizedEmail,
      full_name: String(full_name || '').trim() || null,
      role: safeRole,
      department: String(department || '').trim() || null,
      year: Number.isFinite(Number(year)) ? Number(year) : null,
      semester: Number.isFinite(Number(semester)) ? Number(semester) : null,
      section: String(section || '').trim().toUpperCase() || null,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    };

    const { error: profileError } = await supabaseAdmin
      .from('profiles')
      .upsert(profilePayload, { onConflict: 'id' });

    if (profileError) {
      console.error('[admin-users] profile upsert failed:', {
        userId,
        email: normalizedEmail,
        role: safeRole,
        error: profileError?.message || profileError,
      });
      return res.status(500).json({ error: 'User created but profile insert failed' });
    }

    return res.status(200).json({
      user_id: userId,
      email: normalizedEmail,
      role: safeRole,
      full_name: profilePayload.full_name,
      department: profilePayload.department,
      year: profilePayload.year,
      semester: profilePayload.semester,
      section: profilePayload.section,
    });
  } catch (error) {
    console.error('[admin-users] create-user error:', error?.message || error);
    return res.status(500).json({ error: 'Internal server error' });
  }
});

module.exports = router;
