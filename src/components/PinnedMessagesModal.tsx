// Pinned Messages & Group Announcements Component
import React, { useState, useEffect } from "react";
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  TouchableOpacity,
  ActivityIndicator,
  Modal,
  Alert,
} from "react-native";
import { MaterialIcons } from "@expo/vector-icons";
import { Colors, Spacing, BorderRadius, FontSizes, FontWeights } from "../theme";
import { getPinnedMessages, unpinMessage, getGroupAnnouncements } from "../api/chat";
import { UserAvatar } from "./UserAvatar";

interface PinnedMessage {
  id: string;
  message_id: string;
  message?: {
    content: string;
    created_at: string;
    sender?: {
      full_name: string;
      avatar_url?: string;
    };
  };
  pinned_by_user?: {
    full_name: string;
  };
}

interface GroupAnnouncement {
  id: string;
  title: string;
  content: string;
  created_by: string;
  created_at: string;
  creator?: {
    full_name: string;
    avatar_url?: string;
  };
}

interface PinnedMessagesModalProps {
  conversationId: string;
  visible: boolean;
  onClose: () => void;
  isAdmin?: boolean;
  onUnpin?: () => Promise<void>;
}

const PinnedMessagesModal: React.FC<PinnedMessagesModalProps> = ({
  conversationId,
  visible,
  onClose,
  isAdmin = false,
  onUnpin,
}) => {
  const [pinnedMessages, setPinnedMessages] = useState<PinnedMessage[]>([]);
  const [announcements, setAnnouncements] = useState<GroupAnnouncement[]>([]);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState<"pinned" | "announcements">("pinned");

  useEffect(() => {
    if (visible) {
      loadData();
    }
  }, [visible]);

  const loadData = async () => {
    try {
      setLoading(true);
      const [pinnedData, announcementData] = await Promise.all([
        getPinnedMessages(conversationId),
        getGroupAnnouncements(conversationId),
      ]);
      setPinnedMessages(pinnedData || []);
      setAnnouncements(announcementData || []);
    } catch (error) {
      console.error("Error loading pinned messages:", error);
    } finally {
      setLoading(false);
    }
  };

  const handleUnpin = async (messageId: string) => {
    Alert.alert("Unpin Message", "Remove this message from pinned?", [
      { text: "Cancel", style: "cancel" },
      {
        text: "Unpin",
        style: "destructive",
        onPress: async () => {
          try {
            await unpinMessage(messageId, conversationId);
            setPinnedMessages((prev) =>
              prev.filter((msg) => msg.message_id !== messageId)
            );
            if (onUnpin) {
              await onUnpin();
            }
          } catch (error) {
            Alert.alert("Error", "Failed to unpin message");
          }
        },
      },
    ]);
  };

  const renderPinnedMessage = ({ item }: { item: PinnedMessage }) => (
    <View style={[styles.card, { backgroundColor: Colors.surface }]}>
      <View style={styles.cardHeader}>
        {item.message?.sender && (
          <View style={styles.senderInfo}>
            <UserAvatar
              uri={item.message.sender.avatar_url}
              name={item.message.sender.full_name}
              size={36}
            />
            <View style={styles.senderDetails}>
              <Text style={styles.senderName}>
                {item.message.sender.full_name}
              </Text>
              <Text style={styles.timestamp}>
                {formatDate(item.message.created_at)}
              </Text>
            </View>
          </View>
        )}
        {isAdmin && (
          <TouchableOpacity
            onPress={() => handleUnpin(item.message_id)}
            hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
          >
            <MaterialIcons name="close" size={20} color={Colors.error} />
          </TouchableOpacity>
        )}
      </View>

      <Text style={styles.messageContent}>{item.message?.content}</Text>

      <View style={styles.pinnedByInfo}>
        <MaterialIcons name="push-pin" size={12} color={Colors.primary} />
        <Text style={styles.pinnedByText}>
          Pinned by {item.pinned_by_user?.full_name}
        </Text>
      </View>
    </View>
  );

  const renderAnnouncement = ({ item }: { item: GroupAnnouncement }) => (
    <View
      style={[
        styles.announcementCard,
        { backgroundColor: Colors.primary, opacity: 0.95 },
      ]}
    >
      <View style={styles.announcementHeader}>
        <View style={styles.announcementTitleContainer}>
          <MaterialIcons name="campaign" size={20} color={"#ffffff"} />
          <Text style={styles.announcementTitle}>{item.title}</Text>
        </View>
      </View>

      <Text style={styles.announcementContent}>{item.content}</Text>

      <View style={styles.announcementFooter}>
        <UserAvatar
          uri={item.creator?.avatar_url}
          name={item.creator?.full_name}
          size={24}
        />
        <View>
          <Text style={styles.announcementCreator}>
            By {item.creator?.full_name}
          </Text>
          <Text style={styles.announcementDate}>
            {formatDate(item.created_at)}
          </Text>
        </View>
      </View>
    </View>
  );

  if (!visible) return null;

  const hasMessages = pinnedMessages.length > 0;
  const hasAnnouncements = announcements.length > 0;

  return (
    <Modal visible={visible} animationType="slide" transparent={false}>
      <View style={[styles.container, { backgroundColor: Colors.background }]}>
        {/* Header */}
        <View style={styles.header}>
          <TouchableOpacity onPress={onClose}>
            <MaterialIcons name="arrow-back" size={24} color={Colors.text} />
          </TouchableOpacity>
          <Text style={styles.headerTitle}>Pinned & Announcements</Text>
          <View style={{ width: 24 }} />
        </View>

        {/* Tabs */}
        {(hasMessages || hasAnnouncements) && (
          <View style={[styles.tabContainer, { borderBottomColor: Colors.border }]}>
            {hasMessages && (
              <TouchableOpacity
                style={[
                  styles.tab,
                  tab === "pinned" && {
                    borderBottomColor: Colors.primary,
                    borderBottomWidth: 2,
                  },
                ]}
                onPress={() => setTab("pinned")}
              >
                <MaterialIcons name="push-pin" size={18} color={Colors.text} />
                <Text
                  style={[
                    styles.tabLabel,
                    tab === "pinned" && { color: Colors.primary },
                  ]}
                >
                  Pinned ({pinnedMessages.length})
                </Text>
              </TouchableOpacity>
            )}

            {hasAnnouncements && (
              <TouchableOpacity
                style={[
                  styles.tab,
                  tab === "announcements" && {
                    borderBottomColor: Colors.primary,
                    borderBottomWidth: 2,
                  },
                ]}
                onPress={() => setTab("announcements")}
              >
                <MaterialIcons name="campaign" size={18} color={Colors.text} />
                <Text
                  style={[
                    styles.tabLabel,
                    tab === "announcements" && { color: Colors.primary },
                  ]}
                >
                  Announcements ({announcements.length})
                </Text>
              </TouchableOpacity>
            )}
          </View>
        )}

        {/* Content */}
        {loading ? (
          <View style={styles.centerContainer}>
            <ActivityIndicator size="large" color={Colors.primary} />
          </View>
        ) : tab === "pinned" ? (
          pinnedMessages.length > 0 ? (
            <FlatList
              data={pinnedMessages}
              renderItem={renderPinnedMessage}
              keyExtractor={(item) => item.id}
              contentContainerStyle={styles.listContainer}
            />
          ) : (
            <EmptyState
              icon="push-pin"
              title="No Pinned Messages"
              subtitle="Messages pinned by admins will appear here"
            />
          )
        ) : announcements.length > 0 ? (
          <FlatList
            data={announcements}
            renderItem={renderAnnouncement}
            keyExtractor={(item) => item.id}
            contentContainerStyle={styles.listContainer}
          />
        ) : (
          <EmptyState
            icon="campaign"
            title="No Announcements"
            subtitle="Group announcements will appear here"
          />
        )}
      </View>
    </Modal>
  );
};

const EmptyState: React.FC<{
  icon: string;
  title: string;
  subtitle: string;
}> = ({ icon, title, subtitle }) => (
  <View style={styles.emptyContainer}>
    <MaterialIcons name={icon as any} size={48} color={Colors.textSecondary} />
    <Text style={styles.emptyTitle}>{title}</Text>
    <Text style={styles.emptySubtitle}>{subtitle}</Text>
  </View>
);

const formatDate = (dateString: string): string => {
  const date = new Date(dateString);
  const now = new Date();
  const diffMinutes = Math.round((now.getTime() - date.getTime()) / 60000);

  if (diffMinutes < 1) return "Just now";
  if (diffMinutes < 60) return `${diffMinutes}m ago`;

  const diffHours = Math.round(diffMinutes / 60);
  if (diffHours < 24) return `${diffHours}h ago`;

  const diffDays = Math.round(diffHours / 24);
  if (diffDays < 7) return `${diffDays}d ago`;

  return date.toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: date.getFullYear() !== now.getFullYear() ? "numeric" : undefined,
  });
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  header: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.md,
    paddingTop: Spacing.lg,
    borderBottomWidth: 1,
    borderBottomColor: Colors.border,
  },
  headerTitle: {
    fontSize: FontSizes.lg,
    fontWeight: FontWeights.bold,
    color: Colors.text,
  },
  tabContainer: {
    flexDirection: "row",
    borderBottomWidth: 1,
  },
  tab: {
    flex: 1,
    flexDirection: "row",
    justifyContent: "center",
    alignItems: "center",
    gap: Spacing.sm,
    paddingVertical: Spacing.md,
  },
  tabLabel: {
    fontSize: FontSizes.sm,
    fontWeight: FontWeights.medium,
    color: Colors.textSecondary,
  },
  listContainer: {
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.md,
  },
  card: {
    padding: Spacing.md,
    borderRadius: BorderRadius.md,
    marginBottom: Spacing.md,
  },
  cardHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: Spacing.md,
  },
  senderInfo: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.sm,
    flex: 1,
  },
  senderDetails: {
    flex: 1,
  },
  senderName: {
    fontSize: FontSizes.sm,
    fontWeight: FontWeights.bold,
    color: Colors.text,
  },
  timestamp: {
    fontSize: FontSizes.xs,
    color: Colors.textSecondary,
    marginTop: Spacing.xs,
  },
  messageContent: {
    fontSize: FontSizes.sm,
    color: Colors.text,
    lineHeight: 18,
    marginBottom: Spacing.md,
  },
  pinnedByInfo: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.xs,
  },
  pinnedByText: {
    fontSize: FontSizes.xs,
    color: Colors.primary,
    fontWeight: FontWeights.medium,
  },
  announcementCard: {
    padding: Spacing.md,
    borderRadius: BorderRadius.md,
    marginBottom: Spacing.md,
  },
  announcementHeader: {
    marginBottom: Spacing.md,
  },
  announcementTitleContainer: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.sm,
  },
  announcementTitle: {
    fontSize: FontSizes.md,
    fontWeight: FontWeights.bold,
    color: "#ffffff",
    flex: 1,
  },
  announcementContent: {
    fontSize: FontSizes.sm,
    color: "#ffffff",
    lineHeight: 18,
    marginBottom: Spacing.md,
  },
  announcementFooter: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.sm,
  },
  announcementCreator: {
    fontSize: FontSizes.xs,
    color: "#ffffff",
    fontWeight: FontWeights.medium,
  },
  announcementDate: {
    fontSize: FontSizes.xs,
    color: "rgba(255,255,255,0.7)",
  },
  centerContainer: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
  },
  emptyContainer: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
  },
  emptyTitle: {
    fontSize: FontSizes.md,
    fontWeight: FontWeights.bold,
    color: Colors.text,
    marginTop: Spacing.md,
  },
  emptySubtitle: {
    fontSize: FontSizes.sm,
    color: Colors.textSecondary,
    marginTop: Spacing.sm,
    textAlign: "center",
    paddingHorizontal: Spacing.lg,
  },
});

export default PinnedMessagesModal;
