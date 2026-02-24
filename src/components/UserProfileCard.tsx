// Enhanced User Profile Card Component with new features
import React, { useState, useEffect } from "react";
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ActivityIndicator,
  Dimensions,
} from "react-native";
import { MaterialIcons } from "@expo/vector-icons";
import { LinearGradient } from "expo-linear-gradient";
import { Colors, Spacing, BorderRadius, FontSizes, FontWeights } from "../theme";
import { UserAvatar } from "./UserAvatar";
import { getUserBadges, getUserOnlineStatus, getMutualConnectionsText } from "../api/userUtils";
import { getMutualConnections } from "../api/chat";

const window = Dimensions.get("window");

interface Profile {
  id: string;
  full_name: string;
  avatar_url?: string;
  bio?: string;
  role: string;
  is_verified?: boolean;
  skills?: string[];
  interests?: string[];
}

interface UserProfileCardProps {
  profile: Profile;
  currentUserId: string;
  onPress?: () => void;
  showBio?: boolean;
  showMutualConnections?: boolean;
  showStatus?: boolean;
}

const UserProfileCard: React.FC<UserProfileCardProps> = ({
  profile,
  currentUserId,
  onPress,
  showBio = true,
  showMutualConnections = true,
  showStatus = true,
}) => {
  const [badges, setBadges] = useState<any[]>([]);
  const [userStatus, setUserStatus] = useState<any>(null);
  const [mutualConnections, setMutualConnections] = useState<any>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    loadProfileData();
  }, [profile.id]);

  const loadProfileData = async () => {
    try {
      setLoading(true);

      // Load badges, status, and mutual connections in parallel
      const [badgesData, statusData, mutualData] = await Promise.all([
        getUserBadges(profile.id),
        showStatus ? getUserOnlineStatus(profile.id) : null,
        showMutualConnections && profile.id !== currentUserId
          ? getMutualConnections(currentUserId, profile.id)
          : null,
      ]);

      setBadges(badgesData);
      setUserStatus(statusData);
      setMutualConnections(mutualData);
    } catch (error) {
      console.error("Error loading profile data:", error);
    } finally {
      setLoading(false);
    }
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case "online":
        return Colors.success;
      case "away":
        return Colors.warning;
      default:
        return Colors.textSecondary;
    }
  };

  return (
    <TouchableOpacity activeOpacity={0.7} onPress={onPress}>
      <View style={[styles.card, { backgroundColor: Colors.card, borderColor: Colors.border }]}>
        {/* Header with avatar and status */}
        <View style={styles.headerContainer}>
          <View style={styles.avatarContainer}>
            <UserAvatar
              uri={profile.avatar_url}
              name={profile.full_name}
              size={60}
              role={profile.role}
            />
            {showStatus && userStatus && (
              <View
                style={[
                  styles.statusDot,
                  { backgroundColor: getStatusColor(userStatus.status) },
                ]}
              />
            )}
          </View>

          {/* Badges */}
          {badges.length > 0 && (
            <View style={styles.badgesContainer}>
              {badges.map((badge, idx) => (
                <View
                  key={idx}
                  style={[styles.badge, badge.active && styles.badgeActive]}
                >
                  <MaterialIcons
                    name={badge.type === "mentor" ? "school" : "verified"}
                    size={14}
                    color={Colors.primary}
                  />
                </View>
              ))}
            </View>
          )}
        </View>

        {/* Name and Role */}
        <Text style={styles.name}>{profile.full_name}</Text>
        <Text style={styles.role}>{profile.role}</Text>

        {/* Online Status */}
        {showStatus && userStatus && (
          <Text style={[styles.status, { color: getStatusColor(userStatus.status) }]}>
            {userStatus.status.charAt(0).toUpperCase() + userStatus.status.slice(1)}
            {userStatus.status === "offline" && userStatus.last_active
              ? ` • ${formatLastActive(userStatus.last_active)}`
              : ""}
          </Text>
        )}

        {/* Bio */}
        {showBio && profile.bio && <Text style={styles.bio}>{profile.bio}</Text>}

        {/* Skills Tags */}
        {profile.skills && profile.skills.length > 0 && (
          <View style={styles.tagsContainer}>
            {profile.skills.slice(0, 3).map((skill, idx) => (
              <View key={idx} style={[styles.tag, { backgroundColor: Colors.primary }]}>
                <Text style={styles.tagText}>{skill}</Text>
              </View>
            ))}
            {profile.skills.length > 3 && (
              <Text style={styles.moreText}>+{profile.skills.length - 3}</Text>
            )}
          </View>
        )}

        {/* Mutual Connections */}
        {showMutualConnections && mutualConnections && (
          <View style={styles.mutualContainer}>
            <MaterialIcons name="group" size={16} color={Colors.primary} />
            <Text style={styles.mutualText}>
              {getMutualConnectionsText(mutualConnections.mutual_count)}
            </Text>
          </View>
        )}

        {/* Loading indicator */}
        {loading && (
          <View style={styles.loadingOverlay}>
            <ActivityIndicator color={Colors.primary} />
          </View>
        )}
      </View>
    </TouchableOpacity>
  );
};

const formatLastActive = (lastActive: string): string => {
  const date = new Date(lastActive);
  const now = new Date();
  const diffMinutes = Math.round((now.getTime() - date.getTime()) / 60000);

  if (diffMinutes < 1) return "now";
  if (diffMinutes < 60) return `${diffMinutes}m ago`;
  if (diffMinutes < 1440) return `${Math.round(diffMinutes / 60)}h ago`;
  return `${Math.round(diffMinutes / 1440)}d ago`;
};

const styles = StyleSheet.create({
  card: {
    borderRadius: BorderRadius.lg,
    padding: Spacing.md,
    marginVertical: Spacing.sm,
    borderWidth: 1,
    borderColor: Colors.border,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 3,
  },
  headerContainer: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "flex-start",
    marginBottom: Spacing.md,
  },
  avatarContainer: {
    position: "relative",
  },
  statusDot: {
    position: "absolute",
    bottom: 0,
    right: 0,
    width: 16,
    height: 16,
    borderRadius: 8,
    borderWidth: 3,
    borderColor: Colors.card,
  },
  badgesContainer: {
    flexDirection: "row",
    gap: Spacing.xs,
  },
  badge: {
    width: 32,
    height: 32,
    borderRadius: BorderRadius.md,
    backgroundColor: Colors.surface,
    justifyContent: "center",
    alignItems: "center",
    borderWidth: 1,
    borderColor: Colors.primary,
  },
  badgeActive: {
    backgroundColor: Colors.primary,
  },
  name: {
    fontSize: FontSizes.lg,
    fontWeight: FontWeights.bold,
    color: Colors.text,
    marginBottom: Spacing.xs,
  },
  role: {
    fontSize: FontSizes.sm,
    color: Colors.textSecondary,
    marginBottom: Spacing.xs,
    textTransform: "capitalize",
  },
  status: {
    fontSize: FontSizes.xs,
    fontWeight: FontWeights.medium,
    marginBottom: Spacing.sm,
  },
  bio: {
    fontSize: FontSizes.sm,
    color: Colors.textSecondary,
    marginVertical: Spacing.sm,
    lineHeight: 18,
  },
  tagsContainer: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: Spacing.xs,
    marginVertical: Spacing.sm,
  },
  tag: {
    paddingHorizontal: Spacing.sm,
    paddingVertical: Spacing.xs,
    borderRadius: BorderRadius.sm,
  },
  tagText: {
    fontSize: FontSizes.xs,
    color: "#ffffff",
    fontWeight: FontWeights.medium,
  },
  moreText: {
    fontSize: FontSizes.xs,
    color: Colors.primary,
    fontWeight: FontWeights.medium,
    paddingHorizontal: Spacing.sm,
  },
  mutualContainer: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.xs,
    marginTop: Spacing.sm,
  },
  mutualText: {
    fontSize: FontSizes.sm,
    color: Colors.primary,
    fontWeight: FontWeights.medium,
  },
  loadingOverlay: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    justifyContent: "center",
    alignItems: "center",
    backgroundColor: "rgba(255,255,255,0.5)",
    borderRadius: BorderRadius.lg,
  },
});

export default UserProfileCard;
