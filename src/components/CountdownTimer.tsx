import React, { useEffect, useState } from 'react';
import { View, Text, StyleSheet } from 'react-native';

interface CountdownTimerProps {
  targetDate: string;
  onExpire?: () => void;
  showDays?: boolean;
  compact?: boolean;
}

interface TimeLeft {
  days: number;
  hours: number;
  minutes: number;
  seconds: number;
  isExpired: boolean;
}

export function CountdownTimer({ 
  targetDate, 
  onExpire, 
  showDays = true, 
  compact = false 
}: CountdownTimerProps) {
  const [timeLeft, setTimeLeft] = useState<TimeLeft>({
    days: 0,
    hours: 0,
    minutes: 0,
    seconds: 0,
    isExpired: false,
  });

  useEffect(() => {
    const calculateTimeLeft = () => {
      const now = new Date().getTime();
      const target = new Date(targetDate).getTime();
      const difference = target - now;

      if (difference <= 0) {
        setTimeLeft({
          days: 0,
          hours: 0,
          minutes: 0,
          seconds: 0,
          isExpired: true,
        });
        onExpire?.();
        return;
      }

      const days = Math.floor(difference / (1000 * 60 * 60 * 24));
      const hours = Math.floor((difference % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60));
      const minutes = Math.floor((difference % (1000 * 60 * 60)) / (1000 * 60));
      const seconds = Math.floor((difference % (1000 * 60)) / 1000);

      setTimeLeft({
        days,
        hours,
        minutes,
        seconds,
        isExpired: false,
      });
    };

    calculateTimeLeft();
    const interval = setInterval(calculateTimeLeft, 1000);

    return () => clearInterval(interval);
  }, [targetDate, onExpire]);

  if (timeLeft.isExpired) {
    return (
      <View style={[styles.container, compact && styles.containerCompact]}>
        <Text style={[styles.expiredText, compact && styles.expiredTextCompact]}>
          🔴 Event Over
        </Text>
      </View>
    );
  }

  if (compact) {
    const hasDays = showDays && timeLeft.days > 0;
    return (
      <View style={styles.containerCompact}>
        {/* Time display row */}
        <Text style={styles.compactTimer}>
          {hasDays ? `${timeLeft.days}d ` : ''}
          {timeLeft.hours.toString().padStart(2, '0')}:
          {timeLeft.minutes.toString().padStart(2, '0')}:
          {timeLeft.seconds.toString().padStart(2, '0')}
        </Text>
        {/* Labels row aligned under the time segments */}
        <View style={styles.compactLabelsRow}>
          {hasDays && <Text style={styles.compactLabel}>DAY</Text>}
          <Text style={styles.compactLabel}>HRS</Text>
          <Text style={styles.compactLabel}>MIN</Text>
          <Text style={styles.compactLabel}>SEC</Text>
        </View>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      {showDays && timeLeft.days > 0 && (
        <View style={styles.timeUnit}>
          <Text style={styles.timeNumber}>{timeLeft.days}</Text>
          <Text style={styles.timeLabel}>Days</Text>
        </View>
      )}
      <View style={styles.timeUnit}>
        <Text style={styles.timeNumber}>{timeLeft.hours.toString().padStart(2, '0')}</Text>
        <Text style={styles.timeLabel}>Hours</Text>
      </View>
      <View style={styles.timeUnit}>
        <Text style={styles.timeNumber}>{timeLeft.minutes.toString().padStart(2, '0')}</Text>
        <Text style={styles.timeLabel}>Min</Text>
      </View>
      <View style={styles.timeUnit}>
        <Text style={styles.timeNumber}>{timeLeft.seconds.toString().padStart(2, '0')}</Text>
        <Text style={styles.timeLabel}>Sec</Text>
      </View>
    </View>
  );
}

export function EventStatus({ startDate, endDate }: { startDate: string; endDate: string }) {
  const now = new Date().getTime();
  const start = new Date(startDate).getTime();
  const end = new Date(endDate).getTime();

  if (now < start) {
    return (
      <View style={styles.statusContainer}>
        <Text style={styles.statusUpcoming}>📅 Upcoming</Text>
      </View>
    );
  } else if (now >= start && now <= end) {
    return (
      <View style={styles.statusContainer}>
        <Text style={styles.statusLive}>🔴 Live Now</Text>
      </View>
    );
  } else {
    return (
      <View style={styles.statusContainer}>
        <Text style={styles.statusEnded}>⏰ Ended</Text>
      </View>
    );
  }
}

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    paddingVertical: 12,
    paddingHorizontal: 16,
    backgroundColor: '#f9fafb',
    borderRadius: 12,
    borderWidth: 0.5,
    borderColor: '#e5e7eb',
    gap: 12,
  },
  containerCompact: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 6,
    paddingHorizontal: 8,
    width: '100%',
  },
  compactTimer: {
    fontSize: 26,
    fontWeight: '700',
    color: '#C47A2B',
    letterSpacing: 1.5,
    textAlign: 'center',
  },
  compactLabelsRow: {
    flexDirection: 'row',
    justifyContent: 'center',
    gap: 18,
    marginTop: 4,
  },
  compactLabel: {
    fontSize: 10,
    fontWeight: '600',
    color: '#9CA3AF',
    letterSpacing: 1,
  },
  timeUnit: {
    alignItems: 'center',
    minWidth: 50,
  },
  timeNumber: {
    fontSize: 20,
    fontWeight: 'bold',
    color: '#1f2937',
  },
  timeLabel: {
    fontSize: 12,
    fontWeight: '500',
    color: '#6b7280',
    marginTop: 2,
  },
  expiredText: {
    fontSize: 16,
    fontWeight: 'bold',
    color: '#dc2626',
  },
  expiredTextCompact: {
    fontSize: 12,
    fontWeight: 'bold',
    color: '#dc2626',
  },
  statusContainer: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  statusUpcoming: {
    fontSize: 12,
    fontWeight: 'bold',
    color: '#10b981',
    backgroundColor: '#d1fae5',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 6,
  },
  statusLive: {
    fontSize: 12,
    fontWeight: 'bold',
    color: '#dc2626',
    backgroundColor: '#fee2e2',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 6,
  },
  statusEnded: {
    fontSize: 12,
    fontWeight: 'bold',
    color: '#9ca3af',
    backgroundColor: '#f3f4f6',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 6,
  },
});