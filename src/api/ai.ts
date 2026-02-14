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
