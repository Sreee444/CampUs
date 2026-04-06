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

const parseOptionalNumber = (value) => {
  if (value === null || value === undefined || value === '') return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
};

const LEADERSHIP_DESIGNATIONS = ['principal', 'vice_principal'];

const normalizeDesignation = (value) =>
  String(value || '')
    .trim()
    .toLowerCase()
    .replace(/[\s-]+/g, '_')
    .replace(/_+/g, '_');

const toLeadershipDesignation = (designation) => {
  const normalized = normalizeDesignation(designation);
  if (!normalized) return null;

  if (normalized === 'principal') return 'principal';
  if (
    normalized === 'vice_principal' ||
    normalized === 'viceprincipal' ||
    normalized === 'vice_principle' ||
    normalized === 'viceprinciple'
  ) {
    return 'vice_principal';
  }

  return null;
};

const createUserAndProfile = async (payload) => {
  const {
    email,
    full_name,
    role,
    department,
    faculty_designation,
    year,
    semester,
    section,
    password,
  } = payload || {};

  const normalizedEmail = String(email || '').trim().toLowerCase();
  if (!normalizedEmail) {
    throw new Error('Email is required');
  }

  const safeRole = String(role || 'student').trim().toLowerCase();
  const allowedRoles = ['student', 'faculty', 'alumni', 'admin', 'developer'];
  if (!allowedRoles.includes(safeRole)) {
    throw new Error('Invalid role provided');
  }

  const rawPassword = String(password || '').trim();
  const passwordToUse = rawPassword ? rawPassword : '123456';
  if (passwordToUse.length < 6) {
    throw new Error('Password must be at least 6 characters');
  }

  const normalizedDesignation = normalizeDesignation(faculty_designation);
  if ((safeRole === 'faculty' || safeRole === 'admin' || safeRole === 'developer') && !normalizedDesignation) {
    throw new Error('Faculty designation is required');
  }
  if (!normalizedDesignation && (safeRole === 'student' || safeRole === 'alumni')) {
    // keep other roles cleanly designation-free
  }

  const leadershipDesignation = toLeadershipDesignation(normalizedDesignation);
  if (leadershipDesignation && LEADERSHIP_DESIGNATIONS.includes(leadershipDesignation)) {
    const { data: existingDesignation, error: designationError } = await supabaseAdmin
      .from('profiles')
      .select('id')
      .eq('faculty_designation', leadershipDesignation)
      .maybeSingle();

    if (designationError) {
      throw new Error('Unable to verify designation ownership');
    }

    if (existingDesignation?.id) {
      throw new Error(`${leadershipDesignation.replace('_', ' ')} is already assigned to another user`);
    }
  }

  const { data: createdUser, error: createError } = await supabaseAdmin.auth.admin.createUser({
    email: normalizedEmail,
    password: passwordToUse,
    email_confirm: true,
  });

  if (createError || !createdUser?.user?.id) {
    const message = createError?.message || 'Failed to create user';
    throw new Error(message);
  }

  const userId = createdUser.user.id;
  const profilePayload = {
    id: userId,
    email: normalizedEmail,
    full_name: String(full_name || '').trim() || null,
    role: safeRole,
    department: String(department || '').trim() || null,
    faculty_designation: normalizedDesignation || null,
    year: parseOptionalNumber(year),
    semester: parseOptionalNumber(semester),
    section: String(section || '').trim().toUpperCase() || null,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  };

  const { error: profileError } = await supabaseAdmin
    .from('profiles')
    .upsert(profilePayload, { onConflict: 'id' });

  if (profileError) {
    throw new Error('User created but profile insert failed');
  }

  return {
    user_id: userId,
    email: normalizedEmail,
    role: safeRole,
    full_name: profilePayload.full_name,
    department: profilePayload.department,
    faculty_designation: profilePayload.faculty_designation,
    year: profilePayload.year,
    semester: profilePayload.semester,
    section: profilePayload.section,
  };
};

const validateBulkRow = (row = {}) => {
  const role = String(row.role || '').trim().toLowerCase();
  const fullName = String(row.full_name || '').trim();
  const email = String(row.email || '').trim();
  const department = String(row.department || '').trim();
  const facultyDesignation = normalizeDesignation(row.faculty_designation || row.designation);
  const section = String(row.section || '').trim();
  const year = parseOptionalNumber(row.year);
  const semester = parseOptionalNumber(row.semester);

  if (!fullName) return 'full_name is required';
  if (!email) return 'email is required';
  if (!['student', 'faculty', 'alumni', 'admin', 'developer'].includes(role)) {
    return 'role must be one of: student, faculty, alumni, admin, developer';
  }

  if (role === 'student') {
    if (!department) return 'department is required for student';
    if (!Number.isFinite(year)) return 'year is required for student';
    if (!Number.isFinite(semester)) return 'semester is required for student';
    if (!section) return 'section is required for student';
  }

  if ((role === 'faculty' || role === 'alumni') && !department) {
    return `department is required for ${role}`;
  }

  if (role === 'faculty' || role === 'admin' || role === 'developer') {
    if (!facultyDesignation) return 'faculty_designation is required for faculty';
  }

  return null;
};

router.post('/create-user', requireSupabaseConfig, requireAdmin, async (req, res) => {
  try {
    const created = await createUserAndProfile(req.body || {});
    return res.status(200).json(created);
  } catch (error) {
    const message = String(error?.message || 'Failed to create user');
    const lower = message.toLowerCase();
    const status = lower.includes('already') ? 409 : lower.includes('profile insert failed') ? 500 : 400;
    console.error('[admin-users] create-user failed:', message);
    return res.status(status).json({ error: message });
  }
});

router.post('/bulk-create-users', requireSupabaseConfig, requireAdmin, async (req, res) => {
  try {
    const users = Array.isArray(req.body?.users) ? req.body.users : [];
    if (!users.length) {
      return res.status(400).json({ error: 'users array is required' });
    }

    const created = [];
    const failed = [];

    for (let i = 0; i < users.length; i += 1) {
      const row = users[i] || {};
      const rowIndex = i + 1;
      const email = String(row.email || '').trim().toLowerCase();

      const rowError = validateBulkRow(row);
      if (rowError) {
        failed.push({ index: rowIndex, email, error: rowError });
        continue;
      }

      try {
        const createdUser = await createUserAndProfile(row);
        created.push({ index: rowIndex, ...createdUser });
      } catch (error) {
        failed.push({
          index: rowIndex,
          email,
          error: String(error?.message || 'Failed to create user'),
        });
      }
    }

    return res.status(200).json({
      total: users.length,
      created_count: created.length,
      failed_count: failed.length,
      created,
      failed,
    });
  } catch (error) {
    console.error('[admin-users] bulk-create-users error:', error?.message || error);
    return res.status(500).json({ error: 'Internal server error' });
  }
});

module.exports = router;
