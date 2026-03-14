import React, { useEffect, useState } from 'react';
import { View, Text, StyleSheet } from 'react-native';

interface CountdownTimerProps {
  targetDate: string;
  onExpire?: () => void;
  showDays?: boolean;
  compact?: boolean;
  compactVariant?: 'pill' | 'details';
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
  compact = false,
  compactVariant = 'pill'
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
    if (compactVariant === 'details') {
      return (
        <View style={styles.compactDetailsContainer}>
          <Text style={styles.compactDetailsValue}>
            {timeLeft.days}d {timeLeft.hours.toString().padStart(2, '0')}:{timeLeft.minutes
              .toString()
              .padStart(2, '0')}:{timeLeft.seconds.toString().padStart(2, '0')}
          </Text>
          <Text style={styles.compactDetailsLabels}>DAY   HRS   MIN   SEC</Text>
        </View>
      );
    }

    return (
      <View style={styles.containerCompact}>
        <Text style={styles.compactTimer}>
          {showDays && timeLeft.days > 0 ? `${timeLeft.days}d ` : ''}
          {timeLeft.hours.toString().padStart(2, '0')}:
          {timeLeft.minutes.toString().padStart(2, '0')}:
          {timeLeft.seconds.toString().padStart(2, '0')}
        </Text>
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
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 4,
    paddingHorizontal: 8,
    backgroundColor: '#d1fae5',
    borderRadius: 6,
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
  compactTimer: {
    fontSize: 12,
    fontWeight: 'bold',
    color: '#10b981',
  },
  compactDetailsContainer: {
    borderRadius: 10,
    backgroundColor: '#F8FAFC',
    borderWidth: 1,
    borderColor: '#E5E7EB',
    paddingHorizontal: 10,
    paddingVertical: 8,
    alignItems: 'flex-start',
  },
  compactDetailsValue: {
    fontSize: 24,
    fontWeight: '700',
    color: '#A16207',
    letterSpacing: 0.2,
  },
  compactDetailsLabels: {
    marginTop: 2,
    fontSize: 10,
    fontWeight: '600',
    color: '#9CA3AF',
    letterSpacing: 0.6,
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