// Team Formation Utility Functions – Frontend Only

// ─────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────

export type ParticipationType = 'individual' | 'team';

export type EligibilityType = 'college' | 'department' | 'year' | 'department_year';

export type TeamStatus = 'forming' | 'complete' | 'locked';

export type SkillRole = 'frontend' | 'backend' | 'ai' | 'design' | 'devops';

export interface TeamEvent {
    id: string;
    participation_type?: ParticipationType;
    eligibility_type?: EligibilityType;
    eligible_departments?: string[];
    eligible_years?: number[];
    min_team_size?: number;
    max_team_size?: number;
    registration_deadline?: string;
    [key: string]: any;
}

export interface UserProfileForEligibility {
    department?: string;
    year?: number;
    [key: string]: any;
}

// ─────────────────────────────────────────────
// Team Code Generator
// ─────────────────────────────────────────────

export function generateTeamCode(): string {
    const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; // no ambiguous chars
    let code = '';
    for (let i = 0; i < 6; i++) {
        code += chars[Math.floor(Math.random() * chars.length)];
    }
    return code;
}

// ─────────────────────────────────────────────
// Team Status Computation
// ─────────────────────────────────────────────

export function computeTeamStatus(
    membersCount: number,
    maxTeamSize: number,
    registrationDeadline?: string
): TeamStatus {
    // Check if event registration is closed → locked
    if (registrationDeadline) {
        const deadline = new Date(registrationDeadline);
        if (deadline <= new Date()) {
            return 'locked';
        }
    }
    // Check if team is full → complete
    if (membersCount >= maxTeamSize) {
        return 'complete';
    }
    // Default → forming
    return 'forming';
}

// ─────────────────────────────────────────────
// Eligibility Filter
// ─────────────────────────────────────────────

export function isEligible(
    event: TeamEvent,
    user: UserProfileForEligibility
): boolean {
    const eligibilityType = event.eligibility_type;

    // If no eligibility set or college-wide → everyone is eligible
    if (!eligibilityType || eligibilityType === 'college') {
        return true;
    }

    const userDept = user.department?.toLowerCase().trim();
    const userYear = user.year;

    if (eligibilityType === 'department') {
        if (!userDept || !event.eligible_departments || event.eligible_departments.length === 0) {
            return true; // no restriction set, allow
        }
        return event.eligible_departments
            .map((d: string) => d.toLowerCase().trim())
            .includes(userDept);
    }

    if (eligibilityType === 'year') {
        if (!userYear || !event.eligible_years || event.eligible_years.length === 0) {
            return true;
        }
        return event.eligible_years.includes(userYear);
    }

    if (eligibilityType === 'department_year') {
        const deptMatch =
            !event.eligible_departments ||
            event.eligible_departments.length === 0 ||
            (userDept
                ? event.eligible_departments
                    .map((d: string) => d.toLowerCase().trim())
                    .includes(userDept)
                : false);

        const yearMatch =
            !event.eligible_years ||
            event.eligible_years.length === 0 ||
            (userYear ? event.eligible_years.includes(userYear) : false);

        return deptMatch && yearMatch;
    }

    return true;
}

// ─────────────────────────────────────────────
// Constants
// ─────────────────────────────────────────────

export const DEPARTMENTS = [
    'CSE',
    'ECE',
    'EEE',
    'ME',
    'CE',
    'IT',
    'AIDS',
    'AIML',
    'DS',
    'Cybersecurity',
];

export const YEARS = [1, 2, 3, 4];

export const SKILL_ROLES: { id: SkillRole; label: string; icon: string; color: string }[] = [
    { id: 'frontend', label: 'Frontend', icon: '🎨', color: '#6366f1' },
    { id: 'backend', label: 'Backend', icon: '⚙️', color: '#10b981' },
    { id: 'ai', label: 'AI/ML', icon: '🤖', color: '#f59e0b' },
    { id: 'design', label: 'Design', icon: '✏️', color: '#ec4899' },
    { id: 'devops', label: 'DevOps', icon: '🚀', color: '#3b82f6' },
];

// ─────────────────────────────────────────────
// Team Strength Analysis
// ─────────────────────────────────────────────

export interface TeamStrengthAnalysis {
    overallScore: number; // 0-100
    rating: 'excellent' | 'good' | 'fair' | 'weak';
    color: string;
    icon: string;
    skillCoverage: number; // percentage of required roles filled
    teamCompleteness: number; // percentage of team slots filled
    insights: string[];
    recommendations: string[];
}

export function analyzeTeamStrength(
    membersCount: number,
    maxMembers: number,
    requiredRoles: string[],
    memberSkills?: string[][]
): TeamStrengthAnalysis {
    const insights: string[] = [];
    const recommendations: string[] = [];

    // Calculate team completeness
    const teamCompleteness = Math.round((membersCount / maxMembers) * 100);

    // Calculate skill coverage
    let skillCoverage = 0;
    const coveredRoles: string[] = [];
    
    if (requiredRoles.length > 0) {
        if (memberSkills && memberSkills.length > 0) {
            const allSkills = memberSkills.flat();
            requiredRoles.forEach(role => {
                if (allSkills.includes(role)) {
                    coveredRoles.push(role);
                }
            });
            skillCoverage = Math.round((coveredRoles.length / requiredRoles.length) * 100);
        }
    } else {
        // No required roles = 100% coverage
        skillCoverage = 100;
    }

    // Calculate overall score (weighted average)
    const overallScore = Math.round(
        skillCoverage * 0.6 + teamCompleteness * 0.4
    );

    // Determine rating
    let rating: 'excellent' | 'good' | 'fair' | 'weak';
    let color: string;
    let icon: string;

    if (overallScore >= 80) {
        rating = 'excellent';
        color = '#10b981';
        icon = '🌟';
        insights.push('Strong team with good skill coverage');
    } else if (overallScore >= 60) {
        rating = 'good';
        color = '#3b82f6';
        icon = '✨';
        insights.push('Well-balanced team');
    } else if (overallScore >= 40) {
        rating = 'fair';
        color = '#f59e0b';
        icon = '⚡';
        insights.push('Team has potential but needs improvement');
    } else {
        rating = 'weak';
        color = '#ef4444';
        icon = '⚠️';
        insights.push('Team needs significant strengthening');
    }

    // Add specific insights
    if (teamCompleteness < 50) {
        insights.push(`Only ${membersCount}/${maxMembers} members - needs more people`);
        recommendations.push('Recruit more team members');
    } else if (teamCompleteness === 100) {
        insights.push('Team is at full capacity');
    }

    if (requiredRoles.length > 0) {
        if (skillCoverage < 50) {
            const missingCount = requiredRoles.length - coveredRoles.length;
            insights.push(`Missing ${missingCount} key skills`);
            recommendations.push('Look for members with missing skills');
        } else if (skillCoverage === 100) {
            insights.push('All required skills are covered');
        } else {
            insights.push(`${coveredRoles.length}/${requiredRoles.length} roles covered`);
        }

        // Identify missing roles
        const missingRoles = requiredRoles.filter(r => !coveredRoles.includes(r));
        if (missingRoles.length > 0 && missingRoles.length <= 3) {
            const roleLabels = missingRoles.map(r => {
                const role = SKILL_ROLES.find(sr => sr.id === r);
                return role ? role.label : r;
            });
            recommendations.push(`Need: ${roleLabels.join(', ')}`);
        }
    }

    if (recommendations.length === 0) {
        recommendations.push('Team is well-prepared!');
    }

    return {
        overallScore,
        rating,
        color,
        icon,
        skillCoverage,
        teamCompleteness,
        insights,
        recommendations,
    };
}
