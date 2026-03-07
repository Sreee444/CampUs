import React, { useState } from 'react';
import { Dimensions, Image as RNImage, Linking, Modal, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { Image } from 'expo-image';
import { MaterialIcons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { InterCampusEvent } from '../types/intercampus';

type Props = {
  fest: InterCampusEvent;
  onPress: () => void;
};

const formatDate = (value?: string | null) => {
  if (!value) return null;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  return date.toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' });
};

export default function InterCampusFestCard({ fest, onPress }: Props) {
  const [viewerVisible, setViewerVisible] = useState(false);
  const startStr = formatDate(fest.event_start_date);

  const openUrl = async (url?: string | null) => {
    if (!url) return;
    const canOpen = await Linking.canOpenURL(url);
    if (canOpen) {
      Linking.openURL(url);
    }
  };
  const endStr = formatDate(fest.event_end_date);
  const dateRange = startStr && endStr ? `${startStr} – ${endStr}` : startStr || 'Dates TBA';

  return (
    <TouchableOpacity style={styles.card} onPress={onPress} activeOpacity={0.88}>
      {/* Banner */}
      <View style={styles.bannerWrap}>
        {fest.banner_image || fest.poster_image ? (
          <Image
            source={{ uri: fest.banner_image || fest.poster_image || '' }}
            style={styles.banner}
            contentFit="cover"
            transition={200}
            cachePolicy="memory-disk"
          />
        ) : (
          <View style={styles.bannerPlaceholder}>
            <MaterialIcons name="celebration" size={36} color="#0f766e" />
          </View>
        )}
        {/* Gradient overlay for text readability */}
        <LinearGradient
          colors={['transparent', 'rgba(0,0,0,0.65)']}
          style={styles.bannerGradient}
        />
        <View style={styles.bannerOverlay}>
          <View style={styles.festBadge}>
            <MaterialIcons name="celebration" size={12} color="#ffffff" />
            <Text style={styles.festBadgeText}>FEST</Text>
          </View>
        </View>
      </View>

      {/* Body */}
      <View style={styles.body}>
        <Text style={styles.title} numberOfLines={2}>
          {fest.title}
        </Text>

        <View style={styles.infoRow}>
          <MaterialIcons name="school" size={15} color="#64748b" />
          <Text style={styles.infoText} numberOfLines={1}>
            {fest.college_name}
          </Text>
        </View>

        {!!fest.college_location && (
          <View style={styles.infoRow}>
            <MaterialIcons name="location-on" size={15} color="#64748b" />
            <Text style={styles.infoText} numberOfLines={1}>
              {fest.college_location}
            </Text>
          </View>
        )}

        <View style={styles.infoRow}>
          <MaterialIcons name="calendar-month" size={15} color="#64748b" />
          <Text style={styles.infoText}>{dateRange}</Text>
        </View>

        <View style={styles.footerRow}>
          <View style={styles.quickRow}>
            <TouchableOpacity
              style={[styles.quickBtn, !(fest.poster_image || fest.banner_image) && styles.quickBtnDisabled]}
              disabled={!(fest.poster_image || fest.banner_image)}
              onPress={(e) => {
                e.stopPropagation?.();
                setViewerVisible(true);
              }}
            >
              <MaterialIcons name="image" size={13} color="#0f766e" />
              <Text style={styles.quickText}>Image</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.quickBtn, !fest.source_url && styles.quickBtnDisabled]}
              disabled={!fest.source_url}
              onPress={(e) => {
                e.stopPropagation?.();
                openUrl(fest.source_url);
              }}
            >
              <MaterialIcons name="language" size={13} color="#0f766e" />
              <Text style={styles.quickText}>Website</Text>
            </TouchableOpacity>
          </View>
          <View style={styles.openBtn}>
            <Text style={styles.openBtnText}>View Fest</Text>
            <MaterialIcons name="arrow-forward" size={14} color="#0f766e" />
          </View>
        </View>
      </View>

      {/* Image Viewer Modal */}
      {(fest.poster_image || fest.banner_image) && (
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
              source={{ uri: fest.poster_image || fest.banner_image || '' }}
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
  bannerWrap: {
    position: 'relative',
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
  },
  bannerGradient: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    height: 60,
  },
  bannerOverlay: {
    position: 'absolute',
    top: 12,
    left: 12,
  },
  festBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    borderRadius: 999,
    backgroundColor: 'rgba(15, 118, 110, 0.9)',
    paddingHorizontal: 10,
    paddingVertical: 5,
  },
  festBadgeText: {
    fontSize: 10,
    fontWeight: '800',
    color: '#ffffff',
    letterSpacing: 0.5,
  },
  body: {
    padding: 14,
    gap: 6,
  },
  title: {
    fontSize: 18,
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
    marginTop: 8,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    gap: 8,
  },
  quickRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  quickBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: '#99f6e4',
    backgroundColor: '#e6fffa',
    paddingHorizontal: 10,
    paddingVertical: 7,
  },
  quickBtnDisabled: {
    opacity: 0.45,
  },
  quickText: {
    fontSize: 11,
    fontWeight: '700',
    color: '#0f766e',
  },
  openBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: '#0f766e',
    paddingHorizontal: 14,
    paddingVertical: 7,
  },
  openBtnText: {
    fontSize: 12,
    fontWeight: '700',
    color: '#0f766e',
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
