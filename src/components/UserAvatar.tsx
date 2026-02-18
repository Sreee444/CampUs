import React from 'react';
import { View, Text, Image, StyleSheet } from 'react-native';

// Role ring colors
const ROLE_COLORS: Record<string, string> = {
    student: '#13ecec',
    faculty: '#9333ea',
    alumni: '#f59e0b',
    admin: '#ef4444',
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
    const ringColor = role ? (ROLE_COLORS[role.toLowerCase()] ?? '#13ecec') : '#13ecec';
    const bgColor = role ? (ROLE_BG[role.toLowerCase()] ?? '#e0f7fa') : '#e0f7fa';
    const ringWidth = showRing ? 3 : 0;
    const totalSize = size + ringWidth * 2 + (showRing ? 4 : 0);

    return (
        <View
            style={[
                styles.ring,
                {
                    width: totalSize,
                    height: totalSize,
                    borderRadius: totalSize / 2,
                    borderWidth: showRing ? ringWidth : 0,
                    borderColor: showRing ? ringColor : 'transparent',
                    padding: showRing ? 2 : 0,
                },
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
    initialsCircle: {
        alignItems: 'center',
        justifyContent: 'center',
    },
    initialsText: {
        fontWeight: '700',
        letterSpacing: 0.5,
    },
});
