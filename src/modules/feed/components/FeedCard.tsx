import React from 'react';
import { Image, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { MaterialIcons } from '@expo/vector-icons';
import { FeedPost, FeedPostType } from '../types/feed';
import { getFileNameFromUrl, getFileType } from '../utils/attachments';

type Props = {
  post: FeedPost;
  onPress: () => void;
  onLikePress: (postId: string) => void;
  onCommentPress: (postId: string) => void;
  compactAttachments?: boolean;
  onAttachmentPress?: (postId: string, imageIndex: number) => void;
  canDelete?: boolean;
  onDeletePress?: (postId: string) => void;
};

const TYPE_COLORS: Record<FeedPostType, { bg: string; text: string }> = {
  announcement: { bg: '#fef3c7', text: '#d97706' },
  event: { bg: '#dbeafe', text: '#1d4ed8' },
  exam: { bg: '#fee2e2', text: '#dc2626' },
  general: { bg: '#e0e7ff', text: '#4f46e5' },
};

export default function FeedCard({
  post,
  onPress,
  onLikePress,
  onCommentPress,
  compactAttachments = false,
  onAttachmentPress,
  canDelete = false,
  onDeletePress,
}: Props) {
  const typeColors = TYPE_COLORS[post.type] || TYPE_COLORS.general;
  const previewText = post.content.length > 120 ? post.content.substring(0, 120) + '...' : post.content;
  const authorName = post.author?.full_name ?? post.author?.name ?? 'Anonymous';
  const allAttachments = post.images || [];
  const imageUrls = allAttachments.filter((url) => getFileType(url) === 'image');
  const fileUrls = allAttachments.filter((url) => getFileType(url) !== 'image');

  const openAttachment = (index: number) => {
    if (onAttachmentPress) {
      onAttachmentPress(post.id, index);
      return;
    }
    onPress();
  };

  const openFileAttachment = () => {
    onPress();
  };

  const getFileIcon = (url: string): keyof typeof MaterialIcons.glyphMap => {
    const type = getFileType(url);
    if (type === 'pdf') return 'picture-as-pdf';
    if (type === 'doc') return 'description';
    if (type === 'ppt') return 'slideshow';
    return 'attach-file';
  };

  return (
    <TouchableOpacity style={styles.card} onPress={onPress} activeOpacity={0.85}>
      <View style={styles.header}>
        <View style={styles.avatarWrap}>
          {post.author?.avatar_url ? (
            <Image source={{ uri: post.author.avatar_url }} style={styles.avatar} />
          ) : (
            <View style={styles.avatarPlaceholder}>
              <MaterialIcons name="person" size={16} color="#ffffff" />
            </View>
          )}
        </View>

        <View style={styles.authorInfo}>
          <View style={styles.authorRow}>
            <Text style={styles.authorName} numberOfLines={1}>
              {authorName}
            </Text>
            {post.author?.role && (post.author.role === 'faculty' || post.author.role === 'admin') && (
              <View style={styles.roleBadge}>
                <MaterialIcons name={post.author.role === 'admin' ? 'shield' : 'school'} size={12} color="#ffffff" />
              </View>
            )}
          </View>

          {!!post.author?.department && (
            <Text style={styles.authorDepartment} numberOfLines={1}>
              {post.author.department}
            </Text>
          )}

          <Text style={styles.timestamp}>{formatTime(post.created_at)}</Text>
        </View>

        <View style={styles.headerActions}>
          {post.is_pinned && (
            <View style={styles.pinnedBadge}>
              <MaterialIcons name="push-pin" size={14} color="#ef4444" />
            </View>
          )}
          {canDelete && !!onDeletePress && (
            <TouchableOpacity
              style={styles.menuBtn}
              onPress={() => onDeletePress(post.id)}
              activeOpacity={0.7}
            >
              <MaterialIcons name="more-vert" size={18} color="#64748b" />
            </TouchableOpacity>
          )}
        </View>
      </View>

      <View style={styles.badgesRow}>
        {post.department && post.visibility === 'department' && (
          <View style={styles.departmentBadge}>
            <Text style={styles.departmentBadgeText}>{post.department}</Text>
          </View>
        )}
        <View style={[styles.typeBadge, { backgroundColor: typeColors.bg }]}>
          <Text style={[styles.typeBadgeText, { color: typeColors.text }]}>
            {post.type.charAt(0).toUpperCase() + post.type.slice(1)}
          </Text>
        </View>
      </View>

      <Text style={styles.content} numberOfLines={2}>
        {previewText}
      </Text>

      {!!imageUrls.length && (
        <>
          {compactAttachments ? (
            <TouchableOpacity style={styles.compactWrap} onPress={() => openAttachment(0)} activeOpacity={0.85}>
              <Image source={{ uri: imageUrls[0], cache: 'force-cache' as any }} style={styles.compactImage} />
              {allAttachments.length > 1 && (
                <View style={styles.moreOverlay}>
                  <Text style={styles.moreOverlayText}>+{allAttachments.length - 1}</Text>
                </View>
              )}
            </TouchableOpacity>
          ) : (
            <View style={[styles.attachmentsGrid, imageUrls.length === 1 && styles.attachmentsSingle]}>
              {imageUrls.slice(0, 6).map((img, index) => (
                <TouchableOpacity
                  key={`${img}-${index}`}
                  style={[
                    styles.imageItemWrap,
                    imageUrls.length === 1 && styles.imageItemSingle,
                    imageUrls.length === 2 && styles.imageItemHalf,
                    imageUrls.length >= 3 && styles.imageItemGrid,
                  ]}
                  onPress={() => openAttachment(index)}
                  activeOpacity={0.9}
                >
                  <Image
                    source={{ uri: img, cache: 'force-cache' as any }}
                    style={[
                      styles.feedImage,
                      imageUrls.length === 1 && styles.feedImageSingle,
                      imageUrls.length === 2 && styles.feedImageHalf,
                      imageUrls.length >= 3 && styles.feedImageGrid,
                    ]}
                    resizeMode="cover"
                  />
                </TouchableOpacity>
              ))}
            </View>
          )}
        </>
      )}

      {!compactAttachments && !!fileUrls.length && (
        <View style={styles.fileListWrap}>
          {fileUrls.map((url, idx) => (
            <TouchableOpacity key={`${url}-${idx}`} onPress={openFileAttachment} style={styles.fileCard} activeOpacity={0.8}>
              <MaterialIcons name={getFileIcon(url)} size={20} color="#334155" style={styles.fileIcon} />
              <Text style={styles.fileName} numberOfLines={1}>
                {getFileNameFromUrl(url)}
              </Text>
            </TouchableOpacity>
          ))}
        </View>
      )}

      {compactAttachments && !imageUrls.length && !!allAttachments.length && (
        <TouchableOpacity style={[styles.fileCard, styles.compactFileCard]} onPress={openFileAttachment} activeOpacity={0.8}>
          <MaterialIcons name={getFileIcon(allAttachments[0])} size={20} color="#334155" style={styles.fileIcon} />
          <Text style={styles.fileName} numberOfLines={1}>
            {getFileNameFromUrl(allAttachments[0])}
          </Text>
          {allAttachments.length > 1 && (
            <View style={styles.moreOverlay}>
              <Text style={styles.moreOverlayText}>+{allAttachments.length - 1}</Text>
            </View>
          )}
        </TouchableOpacity>
      )}

      <View style={styles.divider} />

      <View style={styles.footer}>
        <View style={styles.statsRow}>
          <View style={styles.stat}>
            <MaterialIcons name="favorite" size={14} color="#ef4444" />
            <Text style={styles.statText}>{post.likes_count || 0}</Text>
          </View>
          <View style={styles.stat}>
            <MaterialIcons name="chat" size={14} color="#0f172a" />
            <Text style={styles.statText}>{post.comments_count || 0}</Text>
          </View>
        </View>

        <View style={styles.actionRow}>
          <TouchableOpacity style={styles.actionBtn} onPress={() => onLikePress(post.id)} activeOpacity={0.7}>
            <MaterialIcons
              name={post.is_liked ? 'favorite' : 'favorite-border'}
              size={16}
              color={post.is_liked ? '#ef4444' : '#64748b'}
            />
            <Text style={[styles.actionText, post.is_liked && styles.actionTextActive]}>{post.is_liked ? 'Liked' : 'Like'}</Text>
          </TouchableOpacity>

          <TouchableOpacity style={styles.actionBtn} onPress={() => onCommentPress(post.id)} activeOpacity={0.7}>
            <MaterialIcons name="chat" size={16} color="#64748b" />
            <Text style={styles.actionText}>Comment</Text>
          </TouchableOpacity>

          <TouchableOpacity style={styles.actionBtn} onPress={onPress} activeOpacity={0.7}>
            <MaterialIcons name="arrow-forward" size={16} color="#0f766e" />
            <Text style={[styles.actionText, { color: '#0f766e', fontWeight: '700' }]}>View</Text>
          </TouchableOpacity>
        </View>
      </View>
    </TouchableOpacity>
  );
}

function formatTime(dateString: string): string {
  const date = new Date(dateString);
  const now = new Date();
  const diff = now.getTime() - date.getTime();

  if (diff < 60000) return 'Now';
  if (diff < 3600000) return `${Math.floor(diff / 60000)}m ago`;
  if (diff < 86400000) return `${Math.floor(diff / 3600000)}h ago`;
  if (diff < 604800000) return `${Math.floor(diff / 86400000)}d ago`;

  return date.toLocaleDateString();
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: 'rgba(255,255,255,0.85)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.25)',
    borderRadius: 20,
    marginBottom: 16,
    overflow: 'hidden',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 16,
    gap: 10,
  },
  avatarWrap: {
    position: 'relative',
  },
  avatar: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: '#e2e8f0',
  },
  avatarPlaceholder: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: '#cbd5e1',
    alignItems: 'center',
    justifyContent: 'center',
  },
  authorInfo: {
    flex: 1,
  },
  authorRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  authorName: {
    fontSize: 13,
    fontWeight: '700',
    color: '#0f172a',
  },
  roleBadge: {
    backgroundColor: '#0f766e',
    borderRadius: 4,
    padding: 2,
  },
  timestamp: {
    fontSize: 11,
    color: '#64748b',
    marginTop: 2,
  },
  authorDepartment: {
    fontSize: 11,
    color: '#475569',
    marginTop: 2,
    fontWeight: '600',
  },
  pinnedBadge: {
    backgroundColor: '#fee2e2',
    borderRadius: 6,
    padding: 4,
  },
  headerActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  menuBtn: {
    width: 26,
    height: 26,
    borderRadius: 13,
    backgroundColor: '#f8fafc',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: '#e2e8f0',
  },
  badgesRow: {
    flexDirection: 'row',
    paddingHorizontal: 16,
    paddingBottom: 8,
    gap: 6,
  },
  departmentBadge: {
    backgroundColor: '#f0fdfa',
    borderRadius: 6,
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderWidth: 1,
    borderColor: '#0f766e',
  },
  departmentBadgeText: {
    fontSize: 10,
    fontWeight: '700',
    color: '#0f766e',
  },
  typeBadge: {
    borderRadius: 6,
    paddingHorizontal: 8,
    paddingVertical: 4,
  },
  typeBadgeText: {
    fontSize: 10,
    fontWeight: '700',
  },
  content: {
    paddingHorizontal: 16,
    paddingBottom: 8,
    fontSize: 13,
    color: '#0f172a',
    lineHeight: 18,
  },
  divider: {
    height: 1,
    backgroundColor: 'rgba(148,163,184,0.28)',
    marginHorizontal: 16,
  },
  compactWrap: {
    marginHorizontal: 16,
    marginBottom: 8,
    borderRadius: 12,
    overflow: 'hidden',
    height: 120,
  },
  compactImage: {
    width: '100%',
    height: '100%',
    borderRadius: 12,
  },
  moreOverlay: {
    position: 'absolute',
    right: 8,
    bottom: 8,
    backgroundColor: 'rgba(0,0,0,0.6)',
    borderRadius: 999,
    paddingHorizontal: 8,
    paddingVertical: 4,
  },
  moreOverlayText: {
    color: '#ffffff',
    fontSize: 11,
    fontWeight: '800',
  },
  attachmentsGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    marginHorizontal: 16,
    marginBottom: 8,
    gap: 6,
  },
  attachmentsSingle: {
    flexWrap: 'nowrap',
  },
  imageItemWrap: {
    borderRadius: 12,
    overflow: 'hidden',
  },
  imageItemSingle: {
    width: '100%',
  },
  imageItemHalf: {
    width: '49%',
  },
  imageItemGrid: {
    width: '49%',
  },
  feedImage: {
    borderRadius: 12,
    width: '100%',
    height: 180,
    resizeMode: 'cover',
  },
  feedImageSingle: {
    width: '100%',
    height: 180,
  },
  feedImageHalf: {
    width: '100%',
    height: 120,
  },
  feedImageGrid: {
    width: '100%',
    height: 120,
  },
  fileListWrap: {
    marginHorizontal: 16,
    marginBottom: 8,
    gap: 8,
  },
  fileCard: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 12,
    backgroundColor: 'transparent',
    borderRadius: 10,
  },
  compactFileCard: {
    marginHorizontal: 16,
    marginBottom: 8,
  },
  fileIcon: {
    marginRight: 10,
  },
  fileName: {
    flex: 1,
    fontSize: 14,
    color: '#0f172a',
    fontWeight: '600',
  },
  footer: {
    paddingHorizontal: 16,
    paddingVertical: 12,
    gap: 8,
  },
  statsRow: {
    flexDirection: 'row',
    gap: 12,
  },
  stat: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  statText: {
    fontSize: 11,
    color: '#64748b',
    fontWeight: '600',
  },
  actionRow: {
    flexDirection: 'row',
    justifyContent: 'space-around',
  },
  actionBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingVertical: 8,
    borderRadius: 10,
    backgroundColor: 'transparent',
  },
  actionText: {
    fontSize: 12,
    color: '#64748b',
    fontWeight: '600',
  },
  actionTextActive: {
    color: '#ef4444',
    fontWeight: '700',
  },
});
