import React from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  SafeAreaView,
  ScrollView,
  TextInput,
} from 'react-native';
import { MaterialIcons } from '@expo/vector-icons';
import { useNavigation } from '@react-navigation/native';
import { CompositeNavigationProp } from '@react-navigation/native';
import { BottomTabNavigationProp } from '@react-navigation/bottom-tabs';
import { StackNavigationProp } from '@react-navigation/stack';
import { RootStackParamList, MainTabParamList } from '../../navigation/types';
import { getColors, Spacing, BorderRadius, FontSizes, FontWeights, Shadows } from '../../theme';
import { useTheme } from '../../contexts/ThemeContext';

type ChatScreenNavigationProp = CompositeNavigationProp<
  BottomTabNavigationProp<MainTabParamList, 'Chat'>,
  StackNavigationProp<RootStackParamList>
>;

const conversations = [
  {
    id: '1',
    name: 'Robotics Team',
    lastMessage: 'Sarah: The code review is done!',
    time: '2m ago',
    unread: 3,
    type: 'group',
    initials: 'RT',
    color: '#7c3aed',
  },
  {
    id: '2',
    name: 'Prof. H. Chen',
    lastMessage: 'See you at the meeting tomorrow',
    time: '1h ago',
    unread: 0,
    type: 'individual',
    initials: 'HC',
    color: '#3b82f6',
  },
  {
    id: '3',
    name: 'AI Research Group',
    lastMessage: 'Mark: Check out this paper!',
    time: '3h ago',
    unread: 1,
    type: 'group',
    initials: 'AI',
    color: '#10b981',
  },
  {
    id: '4',
    name: 'Emma Davis',
    lastMessage: 'Thanks for your help!',
    time: '5h ago',
    unread: 0,
    type: 'individual',
    initials: 'ED',
    color: '#ef4444',
  },
  {
    id: '5',
    name: 'Campus Events',
    lastMessage: 'Reminder: Showcase on Feb 15',
    time: '1d ago',
    unread: 0,
    type: 'group',
    initials: 'CE',
    color: '#f59e0b',
  },
];

export default function ChatScreen() {
  const navigation = useNavigation<ChatScreenNavigationProp>();
  const { isDark } = useTheme();
  const Colors = getColors(isDark);
  const styles = createStyles(Colors);

  return (
    <SafeAreaView style={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        <Text style={styles.headerTitle}>Messages</Text>
        <TouchableOpacity style={styles.composeButton} onPress={() => {}/* TODO: Navigate to new conversation screen */}>
          <MaterialIcons name="edit" size={20} color={Colors.primary} />
        </TouchableOpacity>
      </View>

      {/* Search Bar */}
      <View style={styles.searchSection}>
        <View style={styles.searchBar}>
          <MaterialIcons name="search" size={20} color="#94a3b8" />
          <TextInput
            style={styles.searchInput}
            placeholder="Search messages..."
            placeholderTextColor="#94a3b8"
          />
        </View>
      </View>

      {/* Conversations List */}
      <ScrollView
        style={styles.scrollView}
        showsVerticalScrollIndicator={false}
      >
        {conversations.map((conversation) => (
          <TouchableOpacity 
            key={conversation.id} 
            style={styles.conversationItem} 
            onPress={() => navigation.navigate('ChatConversation', {
              name: conversation.name,
              initials: conversation.initials,
              color: conversation.color
            })}
          >
            <View style={[styles.avatar, { backgroundColor: conversation.color }]}>
              {conversation.type === 'group' && (
                <View style={styles.groupBadge}>
                  <MaterialIcons name="people" size={12} color="#fff" />
                </View>
              )}
              <Text style={styles.avatarText}>{conversation.initials}</Text>
            </View>

            <View style={styles.conversationInfo}>
              <View style={styles.conversationHeader}>
                <Text style={styles.conversationName}>{conversation.name}</Text>
                <Text style={styles.conversationTime}>{conversation.time}</Text>
              </View>
              <View style={styles.messageRow}>
                <Text
                  style={[
                    styles.lastMessage,
                    conversation.unread > 0 && styles.lastMessageUnread,
                  ]}
                  numberOfLines={1}
                >
                  {conversation.lastMessage}
                </Text>
                {conversation.unread > 0 && (
                  <View style={styles.unreadBadge}>
                    <Text style={styles.unreadText}>{conversation.unread}</Text>
                  </View>
                )}
              </View>
            </View>
          </TouchableOpacity>
        ))}

        <View style={{ height: 32 }} />
      </ScrollView>

      {/* AI Chat Assistant FAB */}
      <TouchableOpacity style={styles.aiChatFab} onPress={() => navigation.navigate('ChatConversation', { name: 'AI Assistant', initials: 'AI', color: '#7c3aed' })}>
        <MaterialIcons name="auto-awesome" size={24} color="#fff" />
      </TouchableOpacity>
    </SafeAreaView>
  );
}

const createStyles = (Colors: ReturnType<typeof getColors>) => StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Colors.background,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: Spacing.md,
    paddingVertical: 12,
    backgroundColor: Colors.surface,
    borderBottomWidth: 1,
    borderBottomColor: Colors.border,
  },
  headerTitle: {
    fontSize: FontSizes.xl,
    fontWeight: FontWeights.bold,
    color: Colors.text,
  },
  composeButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: Colors.card,
    alignItems: 'center',
    justifyContent: 'center',
  },
  searchSection: {
    paddingHorizontal: Spacing.md,
    paddingVertical: 12,
    backgroundColor: '#ffffff',
    borderBottomWidth: 1,
    borderBottomColor: '#e2e8f0',
  },
  searchBar: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: Colors.light.background,
    borderRadius: BorderRadius.lg,
    paddingHorizontal: 12,
    paddingVertical: 10,
    gap: 8,
  },
  searchInput: {
    flex: 1,
    fontSize: FontSizes.md,
    color: '#111818',
  },
  scrollView: {
    flex: 1,
  },
  conversationItem: {
    flexDirection: 'row',
    paddingHorizontal: Spacing.md,
    paddingVertical: 12,
    gap: 12,
    backgroundColor: '#ffffff',
    borderBottomWidth: 1,
    borderBottomColor: '#f1f5f9',
  },
  avatar: {
    width: 48,
    height: 48,
    borderRadius: 24,
    alignItems: 'center',
    justifyContent: 'center',
    position: 'relative',
  },
  groupBadge: {
    position: 'absolute',
    top: -2,
    right: -2,
    width: 18,
    height: 18,
    borderRadius: 9,
    backgroundColor: 'rgba(0, 0, 0, 0.3)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarText: {
    fontSize: FontSizes.sm,
    fontWeight: FontWeights.bold,
    color: '#ffffff',
  },
  conversationInfo: {
    flex: 1,
  },
  conversationHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 4,
  },
  conversationName: {
    fontSize: FontSizes.md,
    fontWeight: FontWeights.semibold,
    color: '#111818',
  },
  conversationTime: {
    fontSize: 12,
    color: '#94a3b8',
  },
  messageRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  lastMessage: {
    flex: 1,
    fontSize: FontSizes.sm,
    color: '#64748b',
  },
  lastMessageUnread: {
    fontWeight: FontWeights.medium,
    color: '#111818',
  },
  unreadBadge: {
    minWidth: 20,
    height: 20,
    borderRadius: 10,
    backgroundColor: Colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 6,
    marginLeft: 8,
  },
  unreadText: {
    fontSize: 11,
    fontWeight: FontWeights.bold,
    color: '#ffffff',
  },
  aiChatFab: {
    position: 'absolute',
    bottom: 24,
    right: 24,
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: '#7c3aed',
    alignItems: 'center',
    justifyContent: 'center',
    ...Shadows.lg,
  },
});
