// Rule-Based Team Matching Utilities – Frontend Only

import { SkillRole, SKILL_ROLES } from './teamUtils';

// ─────────────────────────────────────────────
// Skill Keyword → Category Mapping
// ─────────────────────────────────────────────

const SKILL_KEYWORDS: Record<SkillRole, string[]> = {
    frontend: ['react', 'react native', 'html', 'css', 'javascript', 'typescript', 'flutter', 'ui', 'ux', 'svelte', 'vue', 'angular', 'expo'],
    backend: ['node', 'express', 'python', 'django', 'flask', 'java', 'spring', 'go', 'rust', 'php', 'laravel', 'api', 'database', 'sql', 'postgres', 'mysql', 'mongodb', 'supabase', 'firebase'],
    ai: ['machine learning', 'ml', 'ai', 'deep learning', 'nlp', 'tensorflow', 'pytorch', 'sklearn', 'opencv', 'data science', 'data analysis', 'pandas', 'numpy'],
    design: ['figma', 'canva', 'photoshop', 'illustrator', 'sketch', 'ui design', 'ux design', 'wireframe', 'prototype', 'graphic'],
    devops: ['devops', 'docker', 'kubernetes', 'ci/cd', 'github actions', 'aws', 'azure', 'gcp', 'linux', 'bash', 'terraform', 'nginx', 'cloud'],
};

// Map user's skill strings → detected roles
export function detectSkillRoles(skills: string[]): SkillRole[] {
    const detected = new Set<SkillRole>();
    if (!skills || skills.length === 0) return [];

    const lowerSkills = skills.map((s) => s.toLowerCase());

    for (const [role, keywords] of Object.entries(SKILL_KEYWORDS) as [SkillRole, string[]][]) {
        for (const skill of lowerSkills) {
            if (keywords.some((kw) => skill.includes(kw))) {
                detected.add(role);
                break;
            }
        }
    }
    return Array.from(detected);
}

// ─────────────────────────────────────────────
// Match Score Computation
// ─────────────────────────────────────────────

export interface MatchResult {
    score: number;
    percentage: number;
    reasons: string[];
    detectedRoles: SkillRole[];
}

export function computeMatchScore(
    userSkills: string[],
    teamRequiredRoles: SkillRole[]
): MatchResult {
    const userRoles = detectSkillRoles(userSkills);
    const reasons: string[] = [];
    let score = 0;
    const maxScore = teamRequiredRoles.length > 0 ? teamRequiredRoles.length * 10 : 10;

    if (teamRequiredRoles.length === 0) {
        return {
            score: 5,
            percentage: 50,
            reasons: ['No specific roles required – general match'],
            detectedRoles: userRoles,
        };
    }

    // Reward: user has a required role
    for (const role of teamRequiredRoles) {
        if (userRoles.includes(role)) {
            score += 10;
            const roleInfo = SKILL_ROLES.find((r) => r.id === role);
            reasons.push(`✅ Covers required ${roleInfo?.label ?? role} role`);
        }
    }

    // Bonus: user has extra complementary roles (not all required)
    const extraRoles = userRoles.filter((r) => !teamRequiredRoles.includes(r));
    if (extraRoles.length > 0 && score > 0) {
        score += Math.min(extraRoles.length * 2, 6); // up to +6 bonus
        reasons.push(`⭐ Bonus: also has ${extraRoles.map((r) => SKILL_ROLES.find((s) => s.id === r)?.label ?? r).join(', ')} skills`);
    }

    // Penalize: user has NONE of the required roles
    if (score === 0) {
        reasons.push('⚠️ None of the required roles matched');
    }

    // Penalize: duplicate overload (user only has one role type – same as already covered)
    if (userRoles.length === 1 && teamRequiredRoles.length > 1) {
        score = Math.max(0, score - 2);
        reasons.push('↘ Limited to a single skill area');
    }

    const cappedScore = Math.min(score, maxScore + 6);
    const percentage = Math.round((cappedScore / (maxScore + 6)) * 100);

    return {
        score: cappedScore,
        percentage,
        reasons,
        detectedRoles: userRoles,
    };
}

// ─────────────────────────────────────────────
// Sort participants by match score
// ─────────────────────────────────────────────

export interface ParticipantWithMatch {
    id: string;
    full_name?: string;
    avatar_url?: string;
    department?: string;
    year?: number;
    skills?: string[];
    is_looking_for_team?: boolean;
    match: MatchResult;
}

export function sortByMatch(
    participants: Omit<ParticipantWithMatch, 'match'>[],
    requiredRoles: SkillRole[]
): ParticipantWithMatch[] {
    return participants
        .map((p) => ({
            ...p,
            match: computeMatchScore(p.skills ?? [], requiredRoles),
        }))
        .sort((a, b) => b.match.score - a.match.score);
}
