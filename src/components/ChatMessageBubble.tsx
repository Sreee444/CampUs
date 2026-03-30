// @ts-nocheck
import React, { useEffect, useState } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  Image,
  StyleSheet,
  Platform,
  useWindowDimensions,
} from 'react-native';
import { MaterialIcons } from '@expo/vector-icons';
import { UserAvatar } from './UserAvatar';
import { ChatTheme, withHexAlpha } from '../constants/chatThemes';
import { useTheme } from '../contexts/ThemeContext';
import { getColors, Shadows } from '../theme';

/* ────────────────────────────────────────────────────────────────────────────
 *  Props
 * ──────────────────────────────────────────────────────────────────────────── */

export type ChatMessageBubbleProps = {
  /* Required */
  messageId: string;
  content?: string;
  isMe: boolean;
  time: string;
  chatTheme: ChatTheme;

  /* Sender info (for groups) */
  showSender?: boolean;
  senderName?: string;
  senderAvatar?: string;
  senderRole?: string;

  /* Status ticks */
  seenStatus?: 'sent' | 'delivered' | 'read';
  showTicks?: boolean;

  /* Image message */
  isImage?: boolean;
  attachmentUrl?: string;
  imageCaption?: string;
  onImagePress?: (url: string) => void;

  /* Reactions */
  reactions?: Record<string, { count: number; hasCurrentUser: boolean }>;
  onReactionPress?: (emoji: string) => void;

  /* Interactions */
  onLongPress?: () => void;

  /* AI options (ChatConversation only) */
  aiOptions?: Array<{ id: string; label: string; action: string; itemType?: string; itemTitle?: string }>;
  onAiOptionPress?: (option: any) => void;
  isSending?: boolean;

  /* Poll (ChatConversation only) */
  pollContent?: React.ReactNode;
};

/* ────────────────────────────────────────────────────────────────────────────
 *  Component
 * ──────────────────────────────────────────────────────────────────────────── */

const ChatMessageBubble: React.FC<ChatMessageBubbleProps> = ({
  messageId,
  content,
  isMe,
  time,
  chatTheme,
  showSender = false,
  senderName,
  senderAvatar,
  senderRole,
  seenStatus = 'sent',
  showTicks = true,
  isImage = false,
  attachmentUrl,
  imageCaption,
  onImagePress,
  reactions,
  onReactionPress,
  onLongPress,
  aiOptions,
  onAiOptionPress,
  isSending = false,
  pollContent,
}) => {
  const { isDark } = useTheme();
  const Colors = getColors(isDark);

  const tickName = seenStatus === 'read' ? 'done-all' : seenStatus === 'delivered' ? 'done-all' : 'done';
  const tickColor = seenStatus === 'read' ? '#53BDEB' : chatTheme.timeColor;
  const reactionEntries = reactions ? Object.entries(reactions) : [];

  const isPollMessage = !!pollContent;
  // Solid colors — no transparency
  const bubbleColor = isPollMessage ? Colors.card : (isMe ? chatTheme.bubbleColor : Colors.card);
  const bubbleBorder = isPollMessage ? Colors.border : (isMe ? 'transparent' : Colors.border);
  const textColor = isMe ? chatTheme.textColor : Colors.text;
  const timeColor = isMe ? chatTheme.timeColor : Colors.textSecondary;
  const { width: screenWidth } = useWindowDimensions();
  const mediaBubbleWidth = Math.min(280, Math.max(220, Math.round(screenWidth * 0.72)));
  const [imageRatio, setImageRatio] = useState(1);

  useEffect(() => {
    setImageRatio(1);
  }, [attachmentUrl]);

  /* ── Tick element for inline rendering ── */
  const tickElement = isMe && showTicks ? (
    <Text style={{ lineHeight: 16 }}>
      {'  '}
      <MaterialIcons name={tickName} size={13} color={tickColor} />
    </Text>
  ) : null;

  /* ── Time + tick inline suffix ── */
  const timeSuffix = (
    <Text style={[styles.inlineTime, { color: timeColor }]}>
      {'   '}{time}
      {tickElement}
    </Text>
  );

  return (
    <View style={[styles.row, isMe ? styles.rowMe : styles.rowOther]}>
      {/* Avatar for received messages in groups */}
      {showSender && !isMe && (
        <View style={styles.avatarWrap}>
          <UserAvatar
            uri={senderAvatar}
            name={senderName || 'Member'}
            size={28}
            role={senderRole}
            showRing={false}
          />
        </View>
      )}

      <View style={styles.bubbleColumn}>
        <TouchableOpacity
          onLongPress={onLongPress}
          delayLongPress={400}
          activeOpacity={0.8}
        >
          <View
            style={[
              styles.bubble,
              isMe ? styles.bubbleMe : [styles.bubbleOther, { borderColor: bubbleBorder }],
              { backgroundColor: bubbleColor },
              isImage && styles.bubbleImage,
              pollContent && styles.pollBubble,
              (isImage || !!pollContent) && { width: mediaBubbleWidth },
              !isMe && Shadows.sm,
            ]}
          >
            {/* Sender name — only show for OTHER people's messages in groups */}
            {showSender && !isMe && senderName ? (
              <Text
                style={[styles.senderName, { color: chatTheme.bubbleColor }]}
                numberOfLines={1}
              >
                {senderName}
              </Text>
            ) : null}

            {/* ── Poll content (passed as ReactNode from parent) ── */}
            {pollContent ? (
              pollContent
            ) : isImage && attachmentUrl ? (
              /* ── Image message ── */
              <View style={styles.imageWrap}>
                <TouchableOpacity
                  activeOpacity={0.9}
                  onPress={() => onImagePress?.(attachmentUrl)}
                  onLongPress={onLongPress}
                  delayLongPress={400}
                >
                  <Image
                    source={{ uri: attachmentUrl }}
                    style={[
                      styles.image,
                      { aspectRatio: imageRatio },
                      showSender && styles.imageWithSenderBorder,
                    ]}
                    resizeMode="cover"
                    onLoad={(e) => {
                      const source = e?.nativeEvent?.source;
                      const width = source?.width || 0;
                      const height = source?.height || 0;
                      if (width > 0 && height > 0) {
                        setImageRatio(width / height);
                      }
                    }}
                  />
                </TouchableOpacity>
                {imageCaption ? (
                  <Text style={[styles.messageText, { color: textColor }]}> 
                    {imageCaption}
                    {timeSuffix}
                  </Text>
                ) : (
                  <Text style={[styles.imageTimeOverlay, { color: 'rgba(255,255,255,0.9)' }]}> 
                    {time}
                    {isMe && showTicks && (
                      <>{'  '}<MaterialIcons name={tickName} size={13} color={seenStatus === 'read' ? '#53BDEB' : 'rgba(255,255,255,0.7)'} /></>
                    )}
                  </Text>
                )}
              </View>
            ) : (
              /* ── Text message ── */
              <Text style={[styles.messageText, { color: textColor }]}> 
                {content}
                {timeSuffix}
              </Text>
            )}

            {/* AI option chips */}
            {aiOptions && aiOptions.length > 0 && !isMe && !pollContent && (
              <View style={styles.aiOptionsWrap}>
                {aiOptions.map((option) => (
                  <TouchableOpacity
                    key={option.id}
                    style={[styles.aiOptionChip, { borderColor: Colors.primary + '60' }]}
                    onPress={() => onAiOptionPress?.(option)}
                    disabled={isSending}
                  >
                    <Text style={[styles.aiOptionText, { color: Colors.primary }]}>{option.label}</Text>
                  </TouchableOpacity>
                ))}
              </View>
            )}
          </View>
        </TouchableOpacity>

        {/* Reactions row */}
        {reactionEntries.length > 0 && (
          <View style={[styles.reactionRow, isMe ? styles.reactionRowMe : styles.reactionRowOther]}>
            {reactionEntries.map(([emoji, info]) => (
              <TouchableOpacity
                key={`${messageId}-${emoji}`}
                style={[
                  styles.reactionPill,
                  { backgroundColor: Colors.card, borderColor: Colors.border },
                  info.hasCurrentUser && { backgroundColor: Colors.primarySoft, borderColor: Colors.primary },
                ]}
                onPress={() => onReactionPress?.(emoji)}
              >
                <Text style={styles.reactionEmoji}>{emoji}</Text>
                <Text style={[styles.reactionCount, { color: Colors.textSecondary }, info.hasCurrentUser && { color: Colors.primary }]}>
                  {info.count}
                </Text>
              </TouchableOpacity>
            ))}
          </View>
        )}
      </View>
    </View>
  );
};

/* ────────────────────────────────────────────────────────────────────────────
 *  Styles — App theme aware
 * ──────────────────────────────────────────────────────────────────────────── */

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    marginBottom: 3,
    paddingHorizontal: 8,
  },
  rowMe: {
    justifyContent: 'flex-end',
  },
  rowOther: {
    justifyContent: 'flex-start',
  },

  avatarWrap: {
    marginRight: 6,
    marginBottom: 2,
  },

  bubbleColumn: {
    maxWidth: '85%',
  },

  bubble: {
    borderRadius: 16,
    overflow: 'hidden',
    paddingHorizontal: 8,
    paddingVertical: 8,
  },
  pollBubble: {
    paddingHorizontal: 10,
    paddingVertical: 10,
  },
  bubbleMe: {
    borderTopRightRadius: 2,
  },
  bubbleOther: {
    borderTopLeftRadius: 2,
    borderWidth: 1,
  },
  bubbleImage: {
    paddingHorizontal: 0,
    paddingVertical: 0,
    overflow: 'hidden',
    borderRadius: 16,
  },

  senderName: {
    fontSize: 12,
    fontWeight: '600',
    marginBottom: 4,
  },
  senderNameMine: {
    textAlign: 'right',
  },

  messageText: {
    fontSize: 15,
    lineHeight: 20,
    letterSpacing: 0.1,
  },

  inlineTime: {
    fontSize: 11,
    opacity: 0.6,
    lineHeight: 16,
  },

  /* Image messages */
  imageWrap: {
    gap: 4,
  },
  image: {
    width: '100%',
    aspectRatio: 1,
    borderRadius: 16,
  },
  imageWithSenderBorder: {
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.35)',
  },
  imageTimeOverlay: {
    fontSize: 11,
    alignSelf: 'flex-end',
    marginTop: -22,
    marginRight: 6,
    marginBottom: 4,
    textShadowColor: 'rgba(0,0,0,0.7)',
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 3,
  },

  /* AI option chips */
  aiOptionsWrap: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
    marginTop: 8,
  },
  aiOptionChip: {
    borderRadius: 14,
    borderWidth: 1,
    paddingHorizontal: 12,
    paddingVertical: 5,
  },
  aiOptionText: {
    fontSize: 13,
    fontWeight: '500',
  },

  /* Reactions */
  reactionRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 4,
    marginTop: 2,
  },
  reactionRowMe: {
    justifyContent: 'flex-end',
  },
  reactionRowOther: {
    justifyContent: 'flex-start',
  },
  reactionPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 10,
    borderWidth: 1,
  },
  reactionEmoji: {
    fontSize: 12,
  },
  reactionCount: {
    fontSize: 11,
    fontWeight: '600',
  },
});

export default React.memo(ChatMessageBubble);
