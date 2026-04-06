import { supabase } from "./supabase";
import { Profile } from "../types/database";
import { BASE_URL } from "../config/api";

type UserMatchData = Pick<Profile, 'id' | 'skills' | 'interests' | 'department'>;

/**
 * 🔹 AI TEAM MATCHING (CORE USP)
 * Returns top 5 best matched collaborators for a user
 */
export const recommendTeams = async (userId: string) => {
  const { data: user, error: userErr } = await supabase
    .from("profiles")
    .select("skills, interests, department")
    .eq("id", userId)
    .single() as { data: Pick<Profile, 'skills' | 'interests' | 'department'> | null, error: any };

  if (userErr || !user) {
    console.error("User not found", userErr);
    return [];
  }

  const { data: allUsers, error: usersErr } = await supabase
    .from("profiles")
    .select("id, skills, interests, department")
    .returns<UserMatchData[]>();

  if (usersErr || !allUsers) {
    console.error("Failed to fetch users", usersErr);
    return [];
  }

  const scoredUsers = allUsers
    .filter((u) => u.id !== userId) // don't recommend yourself
    .map((u) => {
      let score = 0;

      const sharedSkills =
        u.skills?.filter((s: string) => user.skills?.includes(s)).length || 0;

      const sharedInterests =
        u.interests?.filter((i: string) => user.interests?.includes(i))
          .length || 0;

      const sameDept = u.department === user.department ? 2 : 0;

      score = sharedSkills * 3 + sharedInterests * 2 + sameDept;

      return { userId: u.id, score };
    });

  return scoredUsers.sort((a, b) => b.score - a.score).slice(0, 5);
};

/**
 * 🔹 AI MENTOR RECOMMENDATION
 * Returns top 3 alumni mentors based on skill overlap
 */
export const recommendMentor = async (studentId: string) => {
  const { data: student, error: sErr } = await supabase
    .from("profiles")
    .select("skills")
    .eq("id", studentId)
    .single() as { data: Pick<Profile, 'skills'> | null, error: any };

  if (sErr || !student) {
    console.error("Student not found", sErr);
    return [];
  }

  const { data: mentors, error: mErr } = await supabase
    .from("profiles")
    .select("id, skills")
    .eq("role", "alumni")
    .returns<Pick<Profile, 'id' | 'skills'>[]>();

  if (mErr || !mentors) {
    console.error("Failed to fetch mentors", mErr);
    return [];
  }

  return mentors
    .map((m) => ({
      id: m.id,
      matchScore:
        m.skills?.filter((s: string) =>
          student.skills?.includes(s)
        ).length || 0,
    }))
    .sort((a, b) => b.matchScore - a.matchScore)
    .slice(0, 3);
};

/**
 * 🔹 AI CONTENT MODERATION (GROUP CHATS ONLY)
 * Returns true if message is allowed, false if flagged
 */
export const moderateText = async (text: string) => {
  const bannedWords = ["spam", "abuse", "scam"];

  const flagged = bannedWords.some((w) =>
    text.toLowerCase().includes(w)
  );

  if (flagged) {
    await supabase.from("moderation_logs").insert({
      flagged_reason: "Policy Violation",
      text,
      created_at: new Date().toISOString(),
    } as any);
  }

  return !flagged;
};

/**
 * 🔹 GET COLLABORATOR SUGGESTIONS
 * Returns full user profiles of recommended collaborators
 */
export const getCollaboratorSuggestions = async (userId: string) => {
  try {
    const recommendations = await recommendTeams(userId);

    if (recommendations.length === 0) {
      return [];
    }

    const userIds = recommendations.map(r => r.userId);

    const { data: users, error } = await supabase
      .from("profiles")
      .select("id, full_name, department, skills, interests, avatar_url, role")
      .in("id", userIds)
      .returns<Pick<Profile, 'id' | 'full_name' | 'department' | 'skills' | 'interests' | 'avatar_url' | 'role'>[]>();

    if (error) {
      console.error("Failed to fetch collaborator profiles", error);
      return [];
    }

    // Sort users by the recommendation score
    const scoredUsers = users?.map(user => {
      const rec = recommendations.find(r => r.userId === user.id);
      return { ...user, matchScore: rec?.score || 0 };
    }).sort((a, b) => b.matchScore - a.matchScore) || [];

    return scoredUsers;
  } catch (error) {
    console.error("Error getting collaborator suggestions:", error);
    return [];
  }
};

type ProjectForAi = {
  id: string;
  title: string;
  required_skills: string[];
  created_by?: string;
};

type CandidateForAi = Pick<Profile, 'id' | 'full_name' | 'skills' | 'interests' | 'department' | 'year' | 'role'> & {
  overlapScore: number;
};

type SuggestBestProjectMembersResult = {
  project: ProjectForAi;
  candidates: CandidateForAi[];
  prompt: string;
  reply: string;
  usedFallback?: boolean;
  fromCache?: boolean;
};

type MentorForAi = {
  id: string;
  user_id: string;
  role?: string;
  expertise_tags?: string[];
  department?: string;
  company?: string;
  available?: boolean;
  max_mentees?: number;
  active_mentees_count?: number;
  available_slots?: number;
  profile?: {
    id?: string;
    full_name?: string;
    avatar_url?: string;
    department?: string;
    email?: string;
  };
};

type MentorPick = MentorForAi & {
  score: number;
  reasons: string[];
};

type SuggestBestMentorsResult = {
  needText: string;
  purpose: string;
  project?: {
    id: string;
    name: string;
    description?: string;
    required_skills: string[];
    category?: string;
  } | null;
  mentors: MentorPick[];
  prompt: string;
  reply: string;
  usedFallback?: boolean;
  fromCache?: boolean;
};

const SUGGESTION_CACHE_TTL_MS = 90 * 1000;
const suggestionCache = new Map<string, { expiresAt: number; data: SuggestBestProjectMembersResult }>();
const mentorSuggestionCache = new Map<string, { expiresAt: number; data: SuggestBestMentorsResult }>();

const buildSuggestionCacheKey = (projectId: string, requestingUserId?: string, maxCandidates?: number) => {
  return ['v2', projectId, requestingUserId || 'anon', String(maxCandidates || 8)].join('::');
};

const getCachedSuggestion = (key: string): SuggestBestProjectMembersResult | null => {
  const entry = suggestionCache.get(key);
  if (!entry) return null;
  if (Date.now() > entry.expiresAt) {
    suggestionCache.delete(key);
    return null;
  }
  return { ...entry.data, fromCache: true };
};

const setCachedSuggestion = (key: string, data: SuggestBestProjectMembersResult) => {
  suggestionCache.set(key, {
    expiresAt: Date.now() + SUGGESTION_CACHE_TTL_MS,
    data,
  });
};

const getCachedMentorSuggestion = (key: string): SuggestBestMentorsResult | null => {
  const entry = mentorSuggestionCache.get(key);
  if (!entry) return null;
  if (Date.now() > entry.expiresAt) {
    mentorSuggestionCache.delete(key);
    return null;
  }
  return { ...entry.data, fromCache: true };
};

const setCachedMentorSuggestion = (key: string, data: SuggestBestMentorsResult) => {
  mentorSuggestionCache.set(key, {
    expiresAt: Date.now() + SUGGESTION_CACHE_TTL_MS,
    data,
  });
};

const normalizeSkillsList = (value: unknown): string[] => {
  if (Array.isArray(value)) {
    return value.map((item) => String(item || '').trim()).filter(Boolean);
  }
  if (typeof value === 'string') {
    return value
      .split(',')
      .map((item) => item.trim())
      .filter(Boolean);
  }
  return [];
};

const normalizeText = (value: unknown) => String(value || '').toLowerCase().trim();

const overlapByIncludes = (keywords: string[], source: string[]) => {
  return keywords.filter((keyword) => {
    const token = normalizeText(keyword);
    if (!token) return false;
    return source.some((entry) => {
      const candidate = normalizeText(entry);
      return candidate.includes(token) || token.includes(candidate);
    });
  });
};

const extractRankedIdsFromReply = (reply: string, allowedIds: string[]) => {
  if (!reply) return [] as string[];

  const allowed = new Set(allowedIds.map((id) => String(id || '').toLowerCase()));
  const uuidMatches = reply.match(/[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}/gi) || [];
  const ranked: string[] = [];

  for (const match of uuidMatches) {
    const normalizedId = String(match || '').toLowerCase();
    if (!allowed.has(normalizedId)) continue;
    if (ranked.includes(normalizedId)) continue;
    ranked.push(normalizedId);
  }

  return ranked;
};

const extractRankedIdsByNames = (
  reply: string,
  items: Array<{ id: string; name?: string | null }>
) => {
  const text = String(reply || '').toLowerCase();
  if (!text.trim()) return [] as string[];

  const rankedFromLines: string[] = [];
  const numberedLines = text
    .split('\n')
    .map((line) => line.trim())
    .filter((line) => /^\d+[\)\.:\-]/.test(line));

  if (numberedLines.length) {
    for (const line of numberedLines) {
      for (const item of items) {
        const id = String(item?.id || '').toLowerCase();
        const name = String(item?.name || '').trim().toLowerCase();
        if (!id || !name) continue;
        if (!line.includes(name)) continue;
        if (rankedFromLines.includes(id)) continue;
        rankedFromLines.push(id);
      }
    }
  }

  if (rankedFromLines.length) {
    return rankedFromLines;
  }

  const indexed = items
    .map((item) => {
      const name = String(item?.name || '').trim().toLowerCase();
      if (!name) return null;
      const position = text.indexOf(name);
      if (position < 0) return null;
      return { id: String(item.id || '').toLowerCase(), position };
    })
    .filter(Boolean) as Array<{ id: string; position: number }>;

  indexed.sort((a, b) => a.position - b.position);

  const ranked: string[] = [];
  for (const item of indexed) {
    if (!item.id) continue;
    if (ranked.includes(item.id)) continue;
    ranked.push(item.id);
  }

  return ranked;
};

const formatCandidatesForPrompt = (users: CandidateForAi[]) => {
  if (!users.length) return 'No candidates available.';

  return users
    .map((user, idx) => {
      const skills = normalizeSkillsList(user.skills);
      const interests = normalizeSkillsList(user.interests);
      return [
        `${idx + 1}. Name: ${user.full_name || 'Unnamed User'} [id: ${user.id}]`,
        `   Skills: ${skills.length ? skills.join(', ') : 'Not listed'}`,
        `   Interests: ${interests.length ? interests.join(', ') : 'Not listed'}`,
        `   Department: ${user.department || 'Not listed'}`,
        `   Match Score: ${user.overlapScore}/10`,
      ].join('\n');
    })
    .join('\n\n');
};

export const suggestBestProjectMembers = async (
  projectId: string,
  options?: { maxCandidates?: number; requestingUserId?: string; resultCount?: number }
) => {
  const resultCount = Math.max(1, Math.min(options?.resultCount || 5, 10));
  const maxCandidates = Math.max(resultCount, Math.max(5, Math.min(options?.maxCandidates || 8, 25)));
  const cacheKey = buildSuggestionCacheKey(projectId, options?.requestingUserId, maxCandidates);

  try {
    const { data: projectRow, error: projectError } = await supabase
      .from('project_teams')
      .select('id, name, required_skills, created_by')
      .eq('id', projectId)
      .single();

    if (projectError || !projectRow) {
      throw projectError || new Error('Project not found');
    }

    const requiredSkills = normalizeSkillsList((projectRow as any).required_skills);
    const project: ProjectForAi = {
      id: (projectRow as any).id,
      title: String((projectRow as any).name || 'Untitled Project'),
      required_skills: requiredSkills,
      created_by: String((projectRow as any).created_by || ''),
    };

    const { data: memberRows, error: memberError } = await supabase
      .from('project_team_members')
      .select('user_id')
      .eq('team_id', projectId);

    if (memberError) {
      throw memberError;
    }

    const existingTeamMemberIds = new Set<string>((memberRows || []).map((row: any) => String(row.user_id || '')).filter(Boolean));
    if (project.created_by) {
      existingTeamMemberIds.add(project.created_by);
    }

    let leaderProfile: Pick<Profile, 'department' | 'year'> | null = null;
    if (project.created_by) {
      const { data: leader, error: leaderError } = await supabase
        .from('profiles')
        .select('department, year')
        .eq('id', project.created_by)
        .maybeSingle();
      if (!leaderError && leader) {
        leaderProfile = leader as Pick<Profile, 'department' | 'year'>;
      }
    }

    const profilesQuery = supabase
      .from('profiles')
      .select('id, full_name, skills, interests, department, year, role')
      .limit(120);

    const { data: profiles, error: profilesError } = await profilesQuery;
    if (profilesError || !profiles) {
      throw profilesError || new Error('Failed to load candidate users');
    }

    const requiredLower = requiredSkills.map((skill) => skill.toLowerCase());
    const requiredSkillTokens = requiredLower.flatMap((skill) => skill.split(/\s+/).filter(Boolean));
    const leaderDepartment = String(leaderProfile?.department || '').trim().toLowerCase();
    const leaderYear = Number(leaderProfile?.year || 0);

    const baseCandidates = profiles
      .filter((profile: any) => {
        const profileId = String(profile.id || '');
        if (!profileId) return false;
        if (profileId === options?.requestingUserId) return false;
        if (existingTeamMemberIds.has(profileId)) return false;
        return true;
      })
      .filter((profile: any) => String(profile.role || '').toLowerCase() === 'student');

    const scoredCandidates = baseCandidates.map((profile: any) => {
      const skills = normalizeSkillsList(profile.skills).map((s) => s.toLowerCase());
      const interests = normalizeSkillsList(profile.interests).map((i) => i.toLowerCase());
      const overlap = requiredLower.filter((skill) => skills.includes(skill)).length;

      const hasTokenMatch = requiredSkillTokens.some((token) => skills.some((skill) => skill.includes(token)));
      const interestMatch = requiredSkillTokens.some((token) => interests.some((interest) => interest.includes(token)));

      const profileDepartment = String(profile.department || '').trim().toLowerCase();
      const profileYear = Number(profile.year || 0);

      const sameDepartment = Boolean(leaderDepartment && profileDepartment && leaderDepartment === profileDepartment);
      const nearYear = Boolean(leaderYear && profileYear && Math.abs(profileYear - leaderYear) <= 1);

      const weighted = overlap * 4 + (hasTokenMatch ? 2 : 0) + (interestMatch ? 1 : 0) + (sameDepartment ? 1 : 0) + (nearYear ? 1 : 0);
      const overlapScore = Math.min(10, Math.max(0, weighted));

      return {
        id: profile.id,
        full_name: profile.full_name,
        skills: profile.skills,
        interests: profile.interests,
        department: profile.department,
        year: profile.year,
        role: profile.role,
        overlapScore,
        _overlap: overlap,
        _token: hasTokenMatch,
        _interest: interestMatch,
        _sameDepartment: sameDepartment,
        _nearYear: nearYear,
      };
    });

    const stronglyRelevant = scoredCandidates.filter((candidate: any) => candidate._overlap > 0 || candidate._token || candidate._interest);

    const departmentScoped =
      leaderDepartment && stronglyRelevant.length > maxCandidates * 2
        ? stronglyRelevant.filter((candidate: any) => candidate._sameDepartment)
        : stronglyRelevant;

    const yearScoped =
      leaderYear && departmentScoped.length > maxCandidates * 2
        ? departmentScoped.filter((candidate: any) => candidate._nearYear)
        : departmentScoped;

    const narrowed = (yearScoped.length ? yearScoped : departmentScoped.length ? departmentScoped : stronglyRelevant.length ? stronglyRelevant : scoredCandidates)
      .sort((a: any, b: any) => b.overlapScore - a.overlapScore)
      .slice(0, maxCandidates)
      .map((candidate: any) => ({
        id: candidate.id,
        full_name: candidate.full_name,
        skills: candidate.skills,
        interests: candidate.interests,
        department: candidate.department,
        year: candidate.year,
        role: candidate.role,
        overlapScore: candidate.overlapScore,
      } as CandidateForAi));

    const candidates: CandidateForAi[] = narrowed;

    const usersText = formatCandidatesForPrompt(candidates);

    const prompt = [
      'You are a campus assistant.',
      '',
      'Task:',
      'Help a project lead choose team members.',
      '',
      'Project:',
      project.title,
      '',
      'Required Skills:',
      project.required_skills.length ? project.required_skills.join(', ') : 'Not specified',
      '',
      'Top Candidates:',
      usersText,
      '',
      'Instructions:',
      `- Suggest best ${resultCount} users`,
      '- Explain WHY each is a good fit',
      '- Keep it short and clear',
      '- Include a match score out of 10 for each selected user',
      '- IMPORTANT: include the exact candidate id for each selected user',
      '',
      'Output format:',
      '1. <Name> [id:<candidate-id>] - <Match score>/10 - <Reason>',
      '2. <Name> [id:<candidate-id>] - <Match score>/10 - <Reason>',
      '3. <Name> [id:<candidate-id>] - <Match score>/10 - <Reason>',
    ].join('\n');

    const compactUsersText = candidates
      .slice(0, 8)
      .map((candidate, idx) => {
        return `${idx + 1}) ${candidate.full_name || 'Unnamed User'} [id:${candidate.id}] | score ${candidate.overlapScore}/10 | skills: ${normalizeSkillsList(candidate.skills).slice(0, 4).join(', ') || 'Not listed'}`;
      })
      .join('\n');

    const compactPrompt = [
      'Project member recommendation.',
      `Project: ${project.title}`,
      `Required skills: ${project.required_skills.length ? project.required_skills.join(', ') : 'Not specified'}`,
      'Candidates:',
      compactUsersText || 'No candidates.',
      `Return top ${resultCount} with short reasons and score out of 10, and include [id:<candidate-id>] for each.`,
    ].join('\n');

    const safePrompt = prompt.length > 7000 ? `${prompt.slice(0, 7000)}\n\n[Prompt truncated for reliability]` : prompt;
    const safeCompactPrompt = compactPrompt.length > 2500 ? `${compactPrompt.slice(0, 2500)}\n\n[Prompt truncated for reliability]` : compactPrompt;

    const requestAiReply = async (message: string) => {
      const response = await fetch(`${BASE_URL}/chat`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          message,
          userId: options?.requestingUserId,
          skipContext: true,
        }),
      });

      if (!response.ok) {
        return { reply: '', status: response.status };
      }

      const payload = await response.json();
      return { reply: String(payload?.reply || '').trim(), status: response.status };
    };
    let usedPrompt = safePrompt;
    let aiStatus: number | null = null;
    let reply = '';

    try {
      const first = await requestAiReply(safePrompt);
      aiStatus = first.status;
      reply = first.reply;

      if (!reply) {
        usedPrompt = safeCompactPrompt;
        const second = await requestAiReply(safeCompactPrompt);
        aiStatus = second.status;
        reply = second.reply;
      }
    } catch (aiError) {
      console.error('suggestBestProjectMembers AI fetch failed:', aiError);
    }

    if (!reply) {
      throw new Error(aiStatus ? `AI request failed with status ${aiStatus}` : 'AI request failed without a response');
    }

    const aiRankedCandidateIdsById = extractRankedIdsFromReply(reply, candidates.map((candidate) => candidate.id));
    const aiRankedCandidateIds = aiRankedCandidateIdsById.length
      ? aiRankedCandidateIdsById
      : extractRankedIdsByNames(
          reply,
          candidates.map((candidate) => ({ id: candidate.id, name: candidate.full_name }))
        );
    const aiSelectedSet = new Set(aiRankedCandidateIds);
    const aiRankedCandidates = aiRankedCandidateIds
      .map((id) => candidates.find((candidate) => String(candidate.id).toLowerCase() === id))
      .filter(Boolean) as CandidateForAi[];

    const orderedCandidates = aiRankedCandidates.slice(0, resultCount);

    if (!orderedCandidates.length) {
      throw new Error('AI response did not include a usable ranked user list');
    }

    const result: SuggestBestProjectMembersResult = {
      project,
      candidates: orderedCandidates,
      prompt: usedPrompt,
      reply,
      usedFallback: false,
    };

    // Cache intentionally disabled: each click should trigger a fresh AI request.
    return result;
  } catch (error) {
    console.error('suggestBestProjectMembers failed:', error);
    throw error;
  }
};

export const suggestBestMentors = async (
  needText: string,
  options?: {
    requestingUserId?: string;
    purpose?: 'career' | 'academic' | 'skill' | 'project' | 'startup';
    projectId?: string;
    maxMentors?: number;
    resultCount?: number;
    candidateMentors?: MentorForAi[];
  }
) => {
  const trimmedNeed = String(needText || '').trim();
  if (!trimmedNeed) {
    throw new Error('Need text is required for mentor suggestions.');
  }

  const resultCount = Math.max(1, Math.min(options?.resultCount || 5, 5));
  const maxMentors = Math.max(resultCount, Math.max(3, Math.min(options?.maxMentors || 8, 12)));
  const purpose = options?.purpose || 'career';
  const cacheKey = [
    'mentor-v2',
    options?.requestingUserId || 'anon',
    purpose,
    options?.projectId || 'none',
    trimmedNeed.toLowerCase(),
    String(maxMentors),
  ].join('::');

  try {
    const [profileResult, projectResult] = await Promise.all([
      options?.requestingUserId
        ? supabase
            .from('profiles')
            .select('id, department, year, skills, interests')
            .eq('id', options.requestingUserId)
            .maybeSingle()
        : Promise.resolve({ data: null, error: null } as any),
      purpose === 'project' && options?.projectId
        ? supabase
            .from('project_teams')
            .select('id, name, description, required_skills, category')
            .eq('id', options.projectId)
            .maybeSingle()
        : Promise.resolve({ data: null, error: null } as any),
    ]);

    if (profileResult?.error) throw profileResult.error;
    if (projectResult?.error) throw projectResult.error;

    const projectData = projectResult?.data
      ? {
          id: String((projectResult.data as any).id),
          name: String((projectResult.data as any).name || 'Untitled Project'),
          description: String((projectResult.data as any).description || ''),
          required_skills: normalizeSkillsList((projectResult.data as any).required_skills),
          category: String((projectResult.data as any).category || ''),
        }
      : null;

    let mentors: MentorForAi[] = options?.candidateMentors || [];
    if (!mentors.length) {
      const { data: mentorRows, error: mentorError } = await supabase
        .from('mentors')
        .select(`
          id, user_id, role, expertise_tags, department, company, available, max_mentees,
          profile:profiles!mentors_user_id_fkey(id, full_name, avatar_url, department, email)
        `)
        .eq('available', true)
        .limit(100);

      if (mentorError) throw mentorError;
      mentors = (mentorRows || []) as MentorForAi[];
    }

    const menteeSkills = normalizeSkillsList((profileResult?.data as any)?.skills);
    const menteeInterests = normalizeSkillsList((profileResult?.data as any)?.interests);
    const menteeDept = normalizeText((profileResult?.data as any)?.department);

    const needKeywords = [
      ...normalizeSkillsList(trimmedNeed),
      ...normalizeSkillsList(projectData?.name),
      ...normalizeSkillsList(projectData?.description),
      ...normalizeSkillsList(projectData?.category),
      ...projectData?.required_skills || [],
      ...menteeSkills,
      ...menteeInterests,
    ]
      .map((item) => normalizeText(item))
      .filter(Boolean);

    const ranked = mentors
      .filter((mentor) => mentor?.id && mentor?.profile?.id)
      .map((mentor) => {
        const expertise = normalizeSkillsList(mentor.expertise_tags);
        const companyTokens = normalizeSkillsList(mentor.company);
        const mentorDept = normalizeText(mentor.department || mentor.profile?.department);

        const expertiseMatches = overlapByIncludes(needKeywords, expertise);
        const companyMatches = overlapByIncludes(needKeywords, companyTokens);
        const skillMatches = overlapByIncludes(menteeSkills, expertise);
        const interestMatches = overlapByIncludes(menteeInterests, expertise);
        const sameDept = Boolean(menteeDept && mentorDept && menteeDept === mentorDept);

        let score = 0;
        score += expertiseMatches.length * 4;
        score += skillMatches.length * 3;
        score += interestMatches.length * 2;
        score += companyMatches.length * 2;
        if (sameDept) score += 1;
        if (mentor.available) score += 1;

        const reasons: string[] = [];
        if (expertiseMatches.length) {
          reasons.push(`Expertise match: ${expertiseMatches.slice(0, 3).join(', ')}`);
        }
        if (skillMatches.length) {
          reasons.push(`Matches your skills: ${skillMatches.slice(0, 3).join(', ')}`);
        }
        if (interestMatches.length) {
          reasons.push(`Aligned with your interests: ${interestMatches.slice(0, 2).join(', ')}`);
        }
        if (companyMatches.length && mentor.company) {
          reasons.push(`Industry/company relevance: ${mentor.company}`);
        }
        if (sameDept) {
          reasons.push('Same department context may help with practical guidance.');
        }
        if (!reasons.length) {
          reasons.push('No strong direct keyword match, but this mentor is available and still among the best current options.');
        }

        return {
          ...mentor,
          score,
          reasons: reasons.slice(0, 3),
        } as MentorPick;
      })
      .sort((a, b) => b.score - a.score)
      .slice(0, maxMentors);

    const mentorText = ranked
      .map((mentor, index) => {
        return [
          `${index + 1}. ${mentor.profile?.full_name || 'Mentor'} (${mentor.role || 'mentor'}) [id: ${mentor.id}]`,
          `   Expertise: ${normalizeSkillsList(mentor.expertise_tags).join(', ') || 'Not listed'}`,
          `   Company: ${mentor.company || 'Not listed'}`,
          `   Department: ${mentor.department || mentor.profile?.department || 'Not listed'}`,
          `   Availability: ${mentor.available ? 'Available' : 'Unavailable'}`,
        ].join('\n');
      })
      .join('\n\n');

    const prompt = [
      'You are a campus mentorship assistant.',
      '',
      `User mentorship purpose: ${purpose}`,
      `User need: ${trimmedNeed}`,
      `User skills: ${menteeSkills.join(', ') || 'Not listed'}`,
      `User interests: ${menteeInterests.join(', ') || 'Not listed'}`,
      '',
      projectData
        ? [
            'Project context:',
            `- Name: ${projectData.name}`,
            `- Description: ${projectData.description || 'Not provided'}`,
            `- Required skills: ${projectData.required_skills.join(', ') || 'Not listed'}`,
            `- Category: ${projectData.category || 'Not listed'}`,
            '',
          ].join('\n')
        : '',
      'Mentor candidates:',
      mentorText || 'No mentor candidates available.',
      '',
      'Task:',
      `- Recommend best ${resultCount} mentors for this user need.`,
      '- Explain why each mentor is suitable based on skills/interests/project context.',
      '- If there is no direct match, clearly state why they are still suggested.',
      '- Keep response short and clear.',
      '- IMPORTANT: include the exact mentor id for each selected mentor using [id:<mentor-id>].',
    ].join('\n');

    const compactMentorText = ranked
      .slice(0, 5)
      .map((mentor, index) => {
        const topExpertise = normalizeSkillsList(mentor.expertise_tags).slice(0, 4).join(', ') || 'Not listed';
        return `${index + 1}) ${mentor.profile?.full_name || 'Mentor'} [id:${mentor.id}] | ${mentor.role || 'mentor'} | Expertise: ${topExpertise} | Company: ${mentor.company || 'N/A'} | Score: ${mentor.score}`;
      })
      .join('\n');

    const compactPrompt = [
      'Mentor matching summary request.',
      `Purpose: ${purpose}`,
      `Need: ${trimmedNeed}`,
      `User skills: ${menteeSkills.join(', ') || 'Not listed'}`,
      `User interests: ${menteeInterests.join(', ') || 'Not listed'}`,
      projectData
        ? `Project: ${projectData.name}; Skills: ${projectData.required_skills.join(', ') || 'Not listed'}`
        : '',
      'Top mentor candidates:',
      compactMentorText || 'None',
      `Give a short ranked top ${resultCount} recommendation with reasons and include [id:<mentor-id>] for each.`,
    ]
      .filter(Boolean)
      .join('\n');

    const truncatedPrompt = prompt.length > 7000 ? `${prompt.slice(0, 7000)}\n\n[Prompt truncated for reliability]` : prompt;
    const truncatedCompactPrompt = compactPrompt.length > 2500 ? `${compactPrompt.slice(0, 2500)}\n\n[Prompt truncated for reliability]` : compactPrompt;

    let reply = '';
    let aiStatusCode: number | null = null;
    let usedPrompt = truncatedPrompt;

    const requestAiReply = async (message: string) => {
      console.info('[AI Picks][Mentor] Calling /chat for mentor selection', {
        purpose,
        requesterId: options?.requestingUserId || null,
        projectId: options?.projectId || null,
        promptChars: message.length,
      });

      const response = await fetch(`${BASE_URL}/chat`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          message,
          userId: options?.requestingUserId,
          skipContext: true,
        }),
      });

      aiStatusCode = response.status;
      console.info('[AI Picks][Mentor] /chat response received', {
        statusCode: aiStatusCode,
        ok: response.ok,
      });

      if (!response.ok) return '';
      const payload = await response.json();
      return String(payload?.reply || '').trim();
    };

    try {
      reply = await requestAiReply(truncatedPrompt);
      if (!reply) {
        // Retry once with compact prompt to avoid backend token/context failures.
        usedPrompt = truncatedCompactPrompt;
        reply = await requestAiReply(truncatedCompactPrompt);
      }
    } catch (aiError) {
      console.error('suggestBestMentors AI fetch failed:', aiError);
    }

    if (!reply) {
      throw new Error(aiStatusCode ? `AI request failed with status ${aiStatusCode}` : 'AI request failed without a response');
    }

    const aiRankedMentorIdsById = extractRankedIdsFromReply(reply, ranked.map((mentor) => mentor.id));
    const aiRankedMentorIds = aiRankedMentorIdsById.length
      ? aiRankedMentorIdsById
      : extractRankedIdsByNames(
          reply,
          ranked.map((mentor) => ({ id: mentor.id, name: mentor.profile?.full_name }))
        );
    console.info('[AI Picks][Mentor] Parsed AI mentor selection', {
      parsedByIdCount: aiRankedMentorIdsById.length,
      parsedFinalCount: aiRankedMentorIds.length,
      candidateMentorCount: ranked.length,
    });
    const aiMentorSet = new Set(aiRankedMentorIds);
    const aiRankedMentors = aiRankedMentorIds
      .map((id) => ranked.find((mentor) => String(mentor.id).toLowerCase() === id))
      .filter(Boolean) as MentorPick[];

    const orderedMentors = aiRankedMentors.slice(0, resultCount);

    if (!orderedMentors.length) {
      throw new Error('AI response did not include a usable ranked mentor list');
    }

    const result: SuggestBestMentorsResult = {
      needText: trimmedNeed,
      purpose,
      project: projectData,
      mentors: orderedMentors,
      prompt: usedPrompt,
      reply: reply || 'No AI summary generated.',
      usedFallback: false,
    };

    // Cache intentionally disabled: each click should trigger a fresh AI request.
    return result;
  } catch (error) {
    console.error('suggestBestMentors failed:', error);
    throw error;
  }
};

// ===== ENGAGEMENT PREDICTION =====

/**
 * 🤖 AI ENGAGEMENT PREDICTION
 * Predicts which users are at risk of low engagement
 */
export const predictEngagementRisk = async () => {
  try {
    // Get user activity metrics from profiles and their activities
    // Note: user_engagement_metrics table doesn't exist, so we calculate from available data
    const { data: profiles, error: profilesErr } = await supabase
      .from("profiles")
      .select("id, email, full_name, last_active")
      .gte("last_active", new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString());

    if (profilesErr) {
      console.error("Failed to fetch engagement metrics:", profilesErr);
      return [];
    }

    if (!profiles) return [];
    const engagementData = profiles;

    // Calculate engagement scores (0-100)
    // Simple calculation based on last activity
    const riskUsers = engagementData
      .map((user: any) => {
        // Days since last activity
        const daysSinceActive = (Date.now() - new Date(user.last_active || Date.now()).getTime()) / (1000 * 60 * 60 * 24);
        const activityScore = Math.max(0, 100 - (daysSinceActive * 5)); // Points decrease over time

        const engagementScore = activityScore;
        const riskLevel = engagementScore < 25 ? 'high' : engagementScore < 50 ? 'medium' : 'low';

        return {
          userId: user.id,
          engagementScore: Math.round(engagementScore),
          riskLevel,
          lastActivity: user.last_active,
          metrics: {
            posts: 0,
            messages: 0,
            eventsAttended: 0,
          }
        };
      })
      .filter((user) => user.riskLevel !== 'low')
      .sort((a, b) => a.engagementScore - b.engagementScore);

    return riskUsers;
  } catch (error) {
    console.error("Error predicting engagement risk:", error);
    return [];
  }
};

/**
 * 🤖 AI DISCUSSION QUALITY SCORING
 * Analyzes discussion threads for quality and sentiment
 */
export const scoreDiscussionQuality = async (discussionId: string) => {
  try {
    type DiscussionReplyRow = {
      id: string;
      content: string | null;
      created_at: string;
    };

    const { data: replies, error: repliesErr } = await supabase
      .from("discussion_replies")
      .select("id, content, created_at")
      .eq("topic_id", discussionId);

    if (repliesErr) {
      console.error("Failed to fetch discussion replies:", repliesErr);
      return null;
    }

    const typedReplies: DiscussionReplyRow[] = (replies || []) as DiscussionReplyRow[];

    if (typedReplies.length === 0) {
      return {
        discussionId,
        qualityScore: 0,
        replyCount: 0,
        avgEngagement: 0,
        sentiment: 'neutral',
        recommendations: ['No replies yet. Discussion may need promotion or clarification.']
      };
    }

    // Calculate metrics
    const totalEngagement = typedReplies.length; // Use reply count as engagement metric
    const avgEngagement = totalEngagement / typedReplies.length;
    const avgReplyLength = typedReplies.reduce((sum, r) => sum + (r.content?.length || 0), 0) / typedReplies.length;

    // Quality heuristics
    let qualityScore = 0;
    const recommendations: string[] = [];

    // More replies = better discussion
    if (typedReplies.length >= 10) qualityScore += 30;
    else if (typedReplies.length >= 5) qualityScore += 20;
    else if (typedReplies.length >= 3) qualityScore += 10;

    // Longer, more thoughtful replies
    if (avgReplyLength >= 150) qualityScore += 25;
    else if (avgReplyLength >= 75) qualityScore += 15;
    else qualityScore += 5;

    // Engagement (likes/reactions)
    if (avgEngagement >= 2) qualityScore += 25;
    else if (avgEngagement >= 1) qualityScore += 15;
    else {
      qualityScore += 5;
      recommendations.push('Low engagement - Consider featuring or promoting this discussion.');
    }

    // Activity recency
    const newestReply = new Date(typedReplies[0].created_at);
    const daysSinceActive = (Date.now() - newestReply.getTime()) / (1000 * 60 * 60 * 24);
    
    if (daysSinceActive <= 1) qualityScore += 15;
    else if (daysSinceActive <= 7) qualityScore += 10;
    else {
      recommendations.push('Discussion may be losing momentum - Consider posting a summary or follow-up.');
    }

    // Simple sentiment (presence of positive/negative words)
    let positiveCount = 0;
    let negativeCount = 0;
    const positiveWords = ['great', 'excellent', 'good', 'helpful', 'amazing', 'love', 'perfect'];
    const negativeWords = ['bad', 'poor', 'terrible', 'hate', 'awful', 'waste', 'disappointed'];

    typedReplies.forEach((reply) => {
      const content = (reply.content || '').toLowerCase();
      positiveWords.forEach(word => {
        if (content.includes(word)) positiveCount++;
      });
      negativeWords.forEach(word => {
        if (content.includes(word)) negativeCount++;
      });
    });

    let sentiment: 'positive' | 'negative' | 'neutral' = 'neutral';
    if (positiveCount > negativeCount * 2) sentiment = 'positive';
    else if (negativeCount > positiveCount * 2) sentiment = 'negative';

    if (sentiment === 'negative') {
      recommendations.push('Negative sentiment detected - Consider addressing concerns or moderating if needed.');
    }

    if (recommendations.length === 0) {
      recommendations.push('Excellent discussion! Consider pinning this thread.');
    }

    return {
      discussionId,
      qualityScore: Math.min(qualityScore, 100),
      replyCount: typedReplies.length,
      avgEngagement: Math.round(avgEngagement * 10) / 10,
      avgReplyLength: Math.round(avgReplyLength),
      sentiment,
      daysSinceLastReply: Math.round(daysSinceActive),
      recommendations
    };
  } catch (error) {
    console.error("Error scoring discussion quality:", error);
    return null;
  }
};

/**
 * 🤖 MODERATION ASSISTANT
 * Suggests moderation actions based on content analysis
 */
export const getContentModerationSuggestion = async (content: string) => {
  type SeverityLevel = 'low' | 'medium' | 'high';

  // Flagged words/patterns that might need review
  const flaggedPatterns: Array<{ pattern: RegExp; severity: SeverityLevel; reason: string }> = [
    { pattern: /hate|violence|kill/gi, severity: 'high', reason: 'Violent content' },
    { pattern: /spam|follow my|click here|buy now/gi, severity: 'medium', reason: 'Possible spam' },
    { pattern: /contact me privately|dm for/gi, severity: 'medium', reason: 'Potential phishing/recruitment' },
  ];

  let suggestions: {
    approve: boolean;
    severity: 'low' | 'medium' | 'high';
    reasons: string[];
  } = {
    approve: true,
    severity: 'low' as SeverityLevel,
    reasons: [] as string[],
  };

  for (const { pattern, severity, reason } of flaggedPatterns) {
    if (pattern.test(content)) {
      suggestions.approve = false;
      suggestions.severity = severity;
      suggestions.reasons.push(reason);
    }
  }

  return suggestions;
};
