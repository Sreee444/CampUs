import { supabase } from "./supabase";
import { Profile } from "../types/database";

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

  let suggestions = {
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
