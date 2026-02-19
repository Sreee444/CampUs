import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { MaterialIcons } from '@expo/vector-icons';
import { CountdownTimer } from '../components/CountdownTimer';

interface EventFeedItemProps {
  event: {
    id: string;
    title: string;
    start_date: string;
    end_date: string;
    event_type: string;
    venue?: string;
    is_online: boolean;
    is_registered?: boolean;
  };
  onPress: () => void;
  onRegister: () => void;
}

export function EventFeedItem({ event, onPress, onRegister }: EventFeedItemProps) {
  const now = new Date();
  const eventStart = new Date(event.start_date);
  const eventEnd = new Date(event.end_date);
  
  const isUpcoming = eventStart > now;
  const isLive = eventStart <= now && eventEnd >= now;
  const isEnded = eventEnd < now;

  const getStatusInfo = () => {
    if (isLive) {
      return { text: '🔴 Live Now', color: '#dc2626', bg: '#fee2e2', borderColor: '#ef4444' };
    } else if (isUpcoming) {
      return { text: '📅 Upcoming', color: '#10b981', bg: '#d1fae5', borderColor: '#10b981' };
    } else {
      return { text: '⏰ Ended', color: '#9ca3af', bg: '#f3f4f6', borderColor: '#d1d5db' };
    }
  };

  const status = getStatusInfo();

  return (
    <TouchableOpacity style={[styles.container, { borderLeftColor: status.borderColor, borderLeftWidth: 4 }]} onPress={onPress}>
      {/* Header */}
      <View style={styles.header}>
        <View style={styles.typeContainer}>
          <Text style={styles.typeText}>
            {event.event_type.toUpperCase()}
          </Text>
        </View>
        <View style={[styles.statusContainer, { backgroundColor: status.bg }]}>
          <Text style={[styles.statusText, { color: status.color }]}>
            {status.text}
          </Text>
        </View>
      </View>

      {/* Title */}
      <Text style={styles.title} numberOfLines={2}>
        {event.title}
      </Text>

      {/* Details */}
      <View style={styles.details}>
        <View style={styles.detailRow}>
          <MaterialIcons name="schedule" size={14} color="#6b7280" />
          <Text style={styles.detailText}>
            {eventStart.toLocaleDateString('en-US', {
              month: 'short',
              day: 'numeric',
              hour: '2-digit',
              minute: '2-digit',
            })}
          </Text>
        </View>
        <View style={styles.detailRow}>
          <MaterialIcons 
            name={event.is_online ? "laptop" : "location-on"} 
            size={14} 
            color="#6b7280" 
          />
          <Text style={styles.detailText}>
            {event.is_online ? "Online" : (event.venue || "TBA")}
          </Text>
        </View>
      </View>

      {/* Timer for upcoming events */}
      {isUpcoming && (
        <View style={styles.timerContainer}>
          <CountdownTimer
            targetDate={event.start_date}
            compact={true}
          />
        </View>
      )}

      {/* Live Indicator */}
      {isLive && (
        <View style={styles.liveContainer}>
          <View style={styles.liveDot} />
          <Text style={styles.liveText}>Event is happening now!</Text>
        </View>
      )}

      {/* Registration Button */}
      {isUpcoming && (
        <TouchableOpacity
          style={[
            styles.registerButton,
            event.is_registered && styles.registeredButton
          ]}
          onPress={onRegister}
        >
          <Text style={[
            styles.registerButtonText,
            event.is_registered && styles.registeredButtonText
          ]}>
            {event.is_registered ? '✓ Registered' : 'Register'}
          </Text>
        </TouchableOpacity>
      )}
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  container: {
    backgroundColor: '#fff',
    borderRadius: 12,
    padding: 16,
    marginBottom: 12,
    shadowColor: '#000',
    shadowOffset: {
      width: 0,
      height: 1,
    },
    shadowOpacity: 0.1,
    shadowRadius: 3,
    elevation: 2,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8,
  },
  typeContainer: {
    backgroundColor: '#f3f4f6',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 6,
  },
  typeText: {
    fontSize: 10,
    fontWeight: 'bold',
    color: '#374151',
  },
  statusContainer: {
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 6,
  },
  statusText: {
    fontSize: 12,
    fontWeight: 'bold',
  },
  title: {
    fontSize: 16,
    fontWeight: 'bold',
    color: '#1f2937',
    marginBottom: 8,
    lineHeight: 22,
  },
  details: {
    gap: 4,
    marginBottom: 12,
  },
  detailRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  detailText: {
    fontSize: 13,
    color: '#6b7280',
  },
  timerContainer: {
    alignItems: 'center',
    marginBottom: 12,
  },
  liveContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    backgroundColor: '#fee2e2',
    paddingVertical: 8,
    paddingHorizontal: 12,
    borderRadius: 8,
    marginBottom: 12,
  },
  liveDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: '#ef4444',
  },
  liveText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#dc2626',
  },
  registerButton: {
    backgroundColor: '#10b981',
    paddingVertical: 10,
    paddingHorizontal: 16,
    borderRadius: 8,
    alignItems: 'center',
  },
  registeredButton: {
    backgroundColor: '#f3f4f6',
    borderWidth: 0.5,
    borderColor: '#10b981',
  },
  registerButtonText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#fff',
  },
  registeredButtonText: {
    color: '#10b981',
  },
});