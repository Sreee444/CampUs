import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { TeamStatus } from '../utils/teamUtils';

interface StatusBadgeProps {
    status: TeamStatus;
    size?: 'sm' | 'md';
}

const STATUS_CONFIG: Record<TeamStatus, { label: string; bg: string; text: string; dot: string }> = {
    forming: {
        label: 'Forming',
        bg: '#fef3c7',
        text: '#d97706',
        dot: '#f59e0b',
    },
    complete: {
        label: 'Complete',
        bg: '#d1fae5',
        text: '#059669',
        dot: '#10b981',
    },
    locked: {
        label: 'Locked',
        bg: '#f3f4f6',
        text: '#6b7280',
        dot: '#9ca3af',
    },
};

export default function StatusBadge({ status, size = 'md' }: StatusBadgeProps) {
    const config = STATUS_CONFIG[status];
    const isSmall = size === 'sm';

    return (
        <View
            style={[
                styles.badge,
                { backgroundColor: config.bg },
                isSmall && styles.badgeSm,
            ]}
        >
            <View style={[styles.dot, { backgroundColor: config.dot }, isSmall && styles.dotSm]} />
            <Text
                style={[
                    styles.label,
                    { color: config.text },
                    isSmall && styles.labelSm,
                ]}
            >
                {config.label}
            </Text>
        </View>
    );
}

const styles = StyleSheet.create({
    badge: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 5,
        paddingHorizontal: 10,
        paddingVertical: 5,
        borderRadius: 20,
    },
    badgeSm: {
        paddingHorizontal: 7,
        paddingVertical: 3,
    },
    dot: {
        width: 7,
        height: 7,
        borderRadius: 4,
    },
    dotSm: {
        width: 5,
        height: 5,
    },
    label: {
        fontSize: 12,
        fontWeight: '600',
    },
    labelSm: {
        fontSize: 10,
    },
});
