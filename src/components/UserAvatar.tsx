import React from 'react';
import { View, Text, Image, StyleSheet } from 'react-native';

// Role ring colors - softer, more refined
const ROLE_COLORS: Record<string, string> = {
    student: '#14b8a6',
    faculty: '#8b5cf6',
    alumni: '#f59e0b',
    admin: '#dc2626',
};

const ROLE_BG: Record<string, string> = {
    student: '#e0f7fa',
    faculty: '#f3e5f5',
    alumni: '#fff8e1',
    admin: '#fee2e2',
};

interface UserAvatarProps {
    uri?: string | null;
    name?: string | null;
    size?: number;
    role?: string | null;
    showRing?: boolean;
}

export function UserAvatar({
    uri,
    name,
    size = 40,
    role,
    showRing = false,
}: UserAvatarProps) {
    const initials = getInitials(name);
    const ringColor = role ? (ROLE_COLORS[role.toLowerCase()] ?? '#14b8a6') : '#14b8a6';
    const bgColor = role ? (ROLE_BG[role.toLowerCase()] ?? '#e0f7fa') : '#e0f7fa';
    const ringWidth = showRing ? 2 : 0;
    const spacing = showRing ? 3 : 0;
    const totalSize = size + (ringWidth + spacing) * 2;

    return (
        <View
            style={[
                styles.ring,
                {
                    width: totalSize,
                    height: totalSize,
                    borderRadius: totalSize / 2,
                    borderWidth: ringWidth,
                    borderColor: showRing ? `${ringColor}E6` : 'transparent', // 90% opacity
                    padding: spacing,
                },
                showRing && styles.shadow,
            ]}
        >
            {uri ? (
                <Image
                    source={{ uri }}
                    style={{
                        width: size,
                        height: size,
                        borderRadius: size / 2,
                    }}
                    resizeMode="cover"
                />
            ) : (
                <View
                    style={[
                        styles.initialsCircle,
                        {
                            width: size,
                            height: size,
                            borderRadius: size / 2,
                            backgroundColor: bgColor,
                        },
                    ]}
                >
                    <Text
                        style={[
                            styles.initialsText,
                            {
                                fontSize: size * 0.38,
                                color: ringColor,
                            },
                        ]}
                    >
                        {initials}
                    </Text>
                </View>
            )}
        </View>
    );
}

function getInitials(name?: string | null): string {
    if (!name) return '?';
    const parts = name.trim().split(' ');
    const first = parts[0]?.[0] ?? '';
    const second = parts[1]?.[0] ?? '';
    return (first + second).toUpperCase() || '?';
}

const styles = StyleSheet.create({
    ring: {
        alignItems: 'center',
        justifyContent: 'center',
    },
    shadow: {
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 2 },
        shadowOpacity: 0.08,
        shadowRadius: 4,
        elevation: 3,
    },
    initialsCircle: {
        alignItems: 'center',
        justifyContent: 'center',
    },
    initialsText: {
        fontWeight: '700',
        letterSpacing: 0.5,
    },
});
