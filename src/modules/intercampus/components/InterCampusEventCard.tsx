import React, { useState } from 'react';
import { Dimensions, Image as RNImage, Linking, Modal, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { Image } from 'expo-image';
import { MaterialIcons } from '@expo/vector-icons';
import { InterCampusEvent } from '../types/intercampus';

type Props = {
  event: InterCampusEvent;
  onPress?: () => void;
  showSubmitter?: boolean;
};

const formatDate = (value?: string | null) => {
  if (!value) return 'Date TBA';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return 'Date TBA';
  return date.toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' });
};

export default function InterCampusEventCard({ event, onPress, showSubmitter = false }: Props) {
  const [viewerVisible, setViewerVisible] = useState(false);

  const openUrl = async (url?: string | null) => {
    if (!url) return;
    const canOpen = await Linking.canOpenURL(url);
    if (canOpen) {
      Linking.openURL(url);
    }
  };

  const onRegister = async () => {
    await openUrl(event.registration_link);
  };

  const onOpenWebsite = async () => {
    await openUrl(event.source_url);
  };

  const onViewPoster = () => {
    setViewerVisible(true);
  };

  return (
    <TouchableOpacity style={styles.card} onPress={onPress} activeOpacity={onPress ? 0.86 : 1}>
      {event.poster_image || event.banner_image ? (
        <Image
          source={{ uri: event.poster_image || event.banner_image || '' }}
          style={styles.banner}
          contentFit="cover"
          transition={180}
          cachePolicy="memory-disk"
        />
      ) : (
        <View style={styles.bannerPlaceholder}>
          <MaterialIcons name="public" size={22} color="#0f766e" />
          <Text style={styles.bannerPlaceholderText}>InterCampus Event</Text>
        </View>
      )}

      <View style={styles.body}>
        <Text style={styles.title} numberOfLines={2}>
          {event.title}
        </Text>

        <View style={styles.infoRow}>
          <MaterialIcons name="school" size={15} color="#64748b" />
          <Text style={styles.infoText} numberOfLines={1}>
            {event.college_name}
          </Text>
        </View>

        <View style={styles.infoRow}>
          <MaterialIcons name="calendar-month" size={15} color="#64748b" />
          <Text style={styles.infoText}>{formatDate(event.event_start_date)}</Text>
        </View>

        <View style={styles.infoRow}>
          <MaterialIcons name="location-on" size={15} color="#64748b" />
          <Text style={styles.infoText}>
            {event.venue?.trim() || (event.is_online ? 'Online' : 'Venue TBA')}
          </Text>
        </View>

        {showSubmitter && !!event.submitted_by_name && (
          <View style={styles.infoRow}>
            <MaterialIcons name="person-outline" size={15} color="#64748b" />
            <Text style={styles.infoText} numberOfLines={1}>
              Submitted by: {event.submitted_by_name}
            </Text>
          </View>
        )}

        {!!event.verified_by_name && event.verification_status === 'verified' && (
          <View style={styles.infoRow}>
            <MaterialIcons name="verified-user" size={15} color="#047857" />
            <Text style={styles.infoText} numberOfLines={1}>
              Verified by: {event.verified_by_name}
            </Text>
          </View>
        )}

        <View style={styles.footerRow}>
          <View style={styles.typeBadge}>
            <MaterialIcons
              name={event.participation_type === 'team' ? 'groups' : 'person'}
              size={13}
              color="#1e293b"
            />
            <Text style={styles.typeBadgeText}>
              {event.participation_type === 'team' ? 'Team' : 'Individual'}
            </Text>
          </View>

          <View style={styles.actionRow}>
            <TouchableOpacity
              style={[styles.secondaryBtn, !(event.poster_image || event.banner_image) && styles.secondaryBtnDisabled]}
              onPress={onViewPoster}
              disabled={!(event.poster_image || event.banner_image)}
            >
              <MaterialIcons name="image" size={13} color="#0f766e" />
              <Text style={styles.secondaryBtnText}>Image</Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={[styles.secondaryBtn, !event.source_url && styles.secondaryBtnDisabled]}
              onPress={onOpenWebsite}
              disabled={!event.source_url}
            >
              <MaterialIcons name="language" size={13} color="#0f766e" />
              <Text style={styles.secondaryBtnText}>Website</Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={[styles.registerBtn, !event.registration_link && styles.registerBtnDisabled]}
              onPress={onRegister}
              disabled={!event.registration_link}
            >
              <MaterialIcons name="open-in-new" size={13} color="#ffffff" />
              <Text style={styles.registerBtnText}>Register</Text>
            </TouchableOpacity>
          </View>
        </View>
      </View>

      {/* Image Viewer Modal */}
      {(event.poster_image || event.banner_image) && (
        <Modal
          visible={viewerVisible}
          transparent
          animationType="fade"
          onRequestClose={() => setViewerVisible(false)}
        >
          <View style={styles.imageViewerOverlay}>
            <TouchableOpacity
              style={styles.imageViewerClose}
              onPress={() => setViewerVisible(false)}
            >
              <MaterialIcons name="close" size={28} color="#ffffff" />
            </TouchableOpacity>
            <RNImage
              source={{ uri: event.poster_image || event.banner_image || '' }}
              style={{
                width: Dimensions.get('window').width,
                height: Dimensions.get('window').height,
              }}
              resizeMode="contain"
            />
          </View>
        </Modal>
      )}
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  card: {
    borderRadius: 20,
    backgroundColor: '#ffffff',
    overflow: 'hidden',
    shadowColor: '#0f172a',
    shadowOpacity: 0.08,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 4 },
    elevation: 3,
  },
  banner: {
    width: '100%',
    aspectRatio: 16 / 9,
    backgroundColor: '#e2e8f0',
  },
  bannerPlaceholder: {
    width: '100%',
    aspectRatio: 16 / 9,
    backgroundColor: '#ecfdf5',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
  },
  bannerPlaceholderText: {
    fontSize: 12,
    fontWeight: '700',
    color: '#334155',
  },
  body: {
    padding: 14,
    gap: 6,
  },
  title: {
    fontSize: 16,
    fontWeight: '800',
    color: '#0f172a',
  },
  infoRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  infoText: {
    flex: 1,
    fontSize: 13,
    color: '#475569',
  },
  footerRow: {
    marginTop: 10,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 8,
  },
  actionRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  typeBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    borderRadius: 999,
    paddingHorizontal: 10,
    paddingVertical: 5,
    backgroundColor: '#dbeafe',
  },
  typeBadgeText: {
    fontSize: 11,
    fontWeight: '700',
    color: '#1e293b',
  },
  secondaryBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    borderRadius: 999,
    paddingHorizontal: 10,
    paddingVertical: 8,
    backgroundColor: '#e6fffa',
    borderWidth: 1,
    borderColor: '#99f6e4',
  },
  secondaryBtnDisabled: {
    opacity: 0.45,
  },
  secondaryBtnText: {
    color: '#0f766e',
    fontSize: 11,
    fontWeight: '700',
  },
  registerBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    borderRadius: 999,
    paddingHorizontal: 12,
    paddingVertical: 8,
    backgroundColor: '#0f766e',
  },
  registerBtnDisabled: {
    backgroundColor: '#94a3b8',
  },
  registerBtnText: {
    color: '#ffffff',
    fontSize: 12,
    fontWeight: '700',
  },
  imageViewerOverlay: {
    flex: 1,
    backgroundColor: '#000000',
    justifyContent: 'center',
  },
  imageViewerClose: {
    position: 'absolute',
    top: 48,
    right: 16,
    zIndex: 10,
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: 'rgba(0,0,0,0.5)',
    alignItems: 'center',
    justifyContent: 'center',
  },
});
