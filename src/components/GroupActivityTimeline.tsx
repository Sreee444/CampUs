// Group Activity Timeline Component
import React, { useState, useEffect } from "react";
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  ActivityIndicator,
  TouchableOpacity,
} from "react-native";
import { MaterialIcons } from "@expo/vector-icons";
import { Colors, Spacing, BorderRadius, FontSizes, FontWeights } from "../theme";
import { UserAvatar } from "./UserAvatar";
import { getGroupActivityLogs } from "../api/chat";

interface ActivityLog {
  id: string;
  action: string;
  actor_id: string;
  target_user_id?: string;
  details?: string;
  created_at: string;
  actor?: {
    full_name: string;
    avatar_url?: string;
  };
  target_user?: {
    full_name: string;
  };
}

interface GroupActivityTimelineProps {
  conversationId: string;
  adminOnly?: boolean;
}

const GroupActivityTimeline: React.FC<GroupActivityTimelineProps> = ({
  conversationId,
  adminOnly = false,
}) => {
  const [logs, setLogs] = useState<ActivityLog[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadActivityLogs();
  }, [conversationId]);

  const loadActivityLogs = async () => {
    try {
      setLoading(true);
      const data = await getGroupActivityLogs(conversationId, adminOnly);
      setLogs(data || []);
    } catch (error) {
      console.error("Error loading activity logs:", error);
    } finally {
      setLoading(false);
    }
  };

  const getActivityMessage = (log: ActivityLog): string => {
    const actor = log.actor?.full_name || "User";
    const target = log.target_user?.full_name || "User";

    switch (log.action) {
      case "joined":
        return `${actor} joined the group`;
      case "left":
        return `${actor} left the group`;
      case "promoted":
        return `${actor} promoted ${target} to moderator`;
      case "demoted":
        return `${actor} demoted ${target} to member`;
      case "removed":
        return `${actor} removed ${target} from the group`;
      case "admin_changed":
        return `${actor} changed admin status for ${target}`;
      case "group_name_changed":
        return `${actor} changed the group name${log.details ? ` to "${log.details}"` : ""}`;
      case "group_avatar_changed":
        return `${actor} changed the group avatar`;
      default:
        return `${actor} ${log.action}`;
    }
  };

  const getActivityIcon = (action: string): string => {
    switch (action) {
      case "joined":
        return "login";
      case "left":
        return "logout";
      case "promoted":
      case "demoted":
      case "admin_changed":
        return "security";
      case "removed":
        return "close";
      case "group_name_changed":
      case "group_avatar_changed":
        return "edit";
      default:
        return "info";
    }
  };

  const getActivityColor = (action: string): string => {
    switch (action) {
      case "promoted":
      case "admin_changed":
        return Colors.success;
      case "removed":
      case "demoted":
        return Colors.error;
      case "joined":
        return Colors.info;
      case "left":
        return Colors.warning;
      default:
        return Colors.primary;
    }
  };

  const renderActivityItem = ({ item }: { item: ActivityLog }) => {
    const timestamp = new Date(item.created_at);
    const timeString = formatTime(timestamp);
    const message = getActivityMessage(item);
    const icon = getActivityIcon(item.action);
    const color = getActivityColor(item.action);

    return (
      <View style={styles.activityItem}>
        <View style={[styles.timeline, { backgroundColor: color }]}>
          <MaterialIcons name={icon as any} size={16} color={"#ffffff"} />
        </View>

        <View style={styles.activityContent}>
          <View style={styles.activityHeader}>
            <Text style={styles.activityMessage}>{message}</Text>
            <Text style={styles.timestamp}>{timeString}</Text>
          </View>

          {item.actor && (
            <View style={styles.actorContainer}>
              <UserAvatar
                uri={item.actor.avatar_url}
                name={item.actor.full_name}
                size={32}
              />
              <Text style={styles.actorName}>{item.actor.full_name}</Text>
            </View>
          )}
        </View>
      </View>
    );
  };

  if (loading) {
    return (
      <View style={styles.centerContainer}>
        <ActivityIndicator color={Colors.primary} />
      </View>
    );
  }

  if (logs.length === 0) {
    return (
      <View style={styles.emptyContainer}>
        <MaterialIcons name="history" size={40} color={Colors.textSecondary} />
        <Text style={styles.emptyText}>No activity yet</Text>
      </View>
    );
  }

  return (
    <FlatList
      scrollEnabled={false}
      data={logs}
      renderItem={renderActivityItem}
      keyExtractor={(item) => item.id}
      contentContainerStyle={styles.container}
    />
  );
};

const formatTime = (date: Date): string => {
  const now = new Date();
  const diffMinutes = Math.round((now.getTime() - date.getTime()) / 60000);

  if (diffMinutes < 1) return "Just now";
  if (diffMinutes < 60) return `${diffMinutes}m ago`;

  const diffHours = Math.round(diffMinutes / 60);
  if (diffHours < 24) return `${diffHours}h ago`;

  const diffDays = Math.round(diffHours / 24);
  if (diffDays < 7) return `${diffDays}d ago`;

  return date.toLocaleDateString();
};

const styles = StyleSheet.create({
  container: {
    paddingVertical: Spacing.md,
  },
  activityItem: {
    flexDirection: "row",
    paddingVertical: Spacing.md,
    paddingHorizontal: Spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: Colors.border,
  },
  timeline: {
    width: 40,
    height: 40,
    borderRadius: 20,
    justifyContent: "center",
    alignItems: "center",
    marginRight: Spacing.md,
  },
  activityContent: {
    flex: 1,
  },
  activityHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  activityMessage: {
    fontSize: FontSizes.sm,
    fontWeight: FontWeights.medium,
    color: Colors.text,
    flex: 1,
  },
  timestamp: {
    fontSize: FontSizes.xs,
    color: Colors.textSecondary,
    marginLeft: Spacing.sm,
  },
  actorContainer: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.sm,
    marginTop: Spacing.sm,
  },
  actorName: {
    fontSize: FontSizes.sm,
    color: Colors.textSecondary,
  },
  centerContainer: {
    paddingVertical: Spacing.lg,
    justifyContent: "center",
    alignItems: "center",
  },
  emptyContainer: {
    paddingVertical: Spacing.lg,
    justifyContent: "center",
    alignItems: "center",
  },
  emptyText: {
    fontSize: FontSizes.sm,
    color: Colors.textSecondary,
    marginTop: Spacing.sm,
  },
});

export default GroupActivityTimeline;
