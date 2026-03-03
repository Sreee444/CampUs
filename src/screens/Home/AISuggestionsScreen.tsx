// @ts-nocheck
import React, { useState, useCallback } from 'react';
import {
    View,
    Text,
    TouchableOpacity,
    StyleSheet,
    SafeAreaView,
    FlatList,
    ActivityIndicator,
    Platform,
} from 'react-native';
import { MaterialIcons } from '@expo/vector-icons';
import { useFocusEffect, useNavigation } from '@react-navigation/native';
import { StackNavigationProp } from '@react-navigation/stack';
import Toast from 'react-native-toast-message';
import { RootStackParamList } from '../../navigation/types';
import { useAuth } from '../../contexts/AuthContext';
import { supabase } from '../../api/supabase';
import { getColors, Spacing, BorderRadius, FontSizes } from '../../theme';
import { useTheme } from '../../contexts/ThemeContext';

type Nav = StackNavigationProp<RootStackParamList>;

interface AISuggestion {
    id: string;
    suggestion_type: 'collaborator' | 'mentor' | 'team' | 'event';
    status: 'pending' | 'viewed' | 'accepted' | 'rejected';
    reason: string;
    suggested_user_id?: string;
    suggested_team_id?: string;
    suggested_event_id?: string;
    metadata?: any;
    created_at: string;
    suggested_user?: {
        full_name: string;
        avatar_url?: string;
        department?: string;
        year?: string;
    };
    suggested_team?: {
        name: string;
    };
    suggested_event?: {
        title: string;
        start_date: string;
    };
}

const TYPE_CONFIG = {
    collaborator: { icon: 'person-add', color: '#6366f1', label: 'Collaborator Match' },
    mentor: { icon: 'school', color: '#10b981', label: 'Mentor Match' },
    team: { icon: 'group', color: '#f59e0b', label: 'Team Recommendation' },
    event: { icon: 'event', color: '#ec4899', label: 'Event Recommendation' },
} as const;

export default function AISuggestionsScreen() {
    const { isDark } = useTheme();
    const Colors = getColors(isDark);
    const navigation = useNavigation<Nav>();
    const { user } = useAuth();
    const styles = createStyles(Colors, isDark);

    const [suggestions, setSuggestions] = useState<AISuggestion[]>([]);
    const [isLoading, setIsLoading] = useState(true);

    const loadSuggestions = useCallback(async () => {
        if (!user?.id) return;
        try {
            setIsLoading(true);
            const { data, error } = await supabase
                .from('ai_suggestions')
                .select(`
                    id,
                    suggestion_type,
                    status,
                    reason,
                    suggested_user_id,
                    suggested_team_id,
                    suggested_event_id,
                    metadata,
                    created_at,
                    suggested_user:profiles!ai_suggestions_suggested_user_id_fkey(
                        full_name, avatar_url, department, year
                    ),
                    suggested_team:event_teams!ai_suggestions_suggested_team_id_fkey(name),
                    suggested_event:events!ai_suggestions_suggested_event_id_fkey(title, start_date)
                `)
                .eq('user_id', user.id)
                .in('status', ['pending', 'viewed'])
                .order('created_at', { ascending: false });

            if (error) throw error;
            setSuggestions((data as any[]) ?? []);
        } catch (err: any) {
            Toast.show({ type: 'error', text1: 'Failed to load suggestions' });
        } finally {
            setIsLoading(false);
        }
    }, [user?.id]);

    useFocusEffect(
        useCallback(() => {
            void loadSuggestions();
        }, [loadSuggestions])
    );

    const markViewed = async (id: string) => {
        await supabase.from('ai_suggestions').update({ status: 'viewed' }).eq('id', id);
    };

    const handleAccept = async (suggestion: AISuggestion) => {
        try {
            await supabase
                .from('ai_suggestions')
                .update({ status: 'accepted' })
                .eq('id', suggestion.id);

            if (suggestion.suggestion_type === 'collaborator' || suggestion.suggestion_type === 'mentor') {
                if (suggestion.suggested_user_id) {
                    navigation.navigate('PublicProfile', { userId: suggestion.suggested_user_id });
                }
            } else if (suggestion.suggestion_type === 'team') {
                if (suggestion.suggested_team_id) {
                    navigation.navigate('BrowseTeams', { eventId: suggestion.metadata?.event_id || '' });
                }
            } else if (suggestion.suggestion_type === 'event') {
                if (suggestion.suggested_event_id) {
                    navigation.navigate('EventDetails', { eventId: suggestion.suggested_event_id });
                }
            }

            loadSuggestions();
        } catch {
            Toast.show({ type: 'error', text1: 'Failed to accept suggestion' });
        }
    };

    const handleDismiss = async (id: string) => {
        await supabase.from('ai_suggestions').update({ status: 'rejected' }).eq('id', id);
        setSuggestions((prev) => prev.filter((s) => s.id !== id));
    };

    const renderSuggestion = ({ item }: { item: AISuggestion }) => {
        const config = TYPE_CONFIG[item.suggestion_type] || TYPE_CONFIG.event;

        let title = '';
        let subtitle = '';

        if (item.suggestion_type === 'collaborator' || item.suggestion_type === 'mentor') {
            title = (item.suggested_user as any)?.full_name || 'Unknown User';
            subtitle = [(item.suggested_user as any)?.department, (item.suggested_user as any)?.year]
                .filter(Boolean)
                .join(' · ');
        } else if (item.suggestion_type === 'team') {
            title = (item.suggested_team as any)?.name || 'Team';
            subtitle = 'Recommended team for you';
        } else if (item.suggestion_type === 'event') {
            title = (item.suggested_event as any)?.title || 'Event';
            subtitle = (item.suggested_event as any)?.start_date
                ? new Date((item.suggested_event as any).start_date).toLocaleDateString()
                : 'Upcoming event';
        }

        return (
            <TouchableOpacity
                style={[styles.card, { backgroundColor: Colors.surface, borderColor: Colors.border }]}
                onPress={async () => {
                    await markViewed(item.id);
                    if (item.suggestion_type === 'collaborator' || item.suggestion_type === 'mentor') {
                        if (item.suggested_user_id) navigation.navigate('PublicProfile', { userId: item.suggested_user_id });
                    } else if (item.suggestion_type === 'team') {
                        if (item.metadata?.event_id) navigation.navigate('BrowseTeams', { eventId: item.metadata.event_id });
                    } else if (item.suggestion_type === 'event') {
                        if (item.suggested_event_id) navigation.navigate('EventDetails', { eventId: item.suggested_event_id });
                    }
                    loadSuggestions();
                }}
                activeOpacity={0.85}
            >
                {/* Type badge */}
                <View style={styles.cardTop}>
                    <View style={[styles.badge, { backgroundColor: config.color + '20' }]}>
                        <MaterialIcons name={config.icon as any} size={14} color={config.color} />
                        <Text style={[styles.badgeText, { color: config.color }]}>{config.label}</Text>
                    </View>
                    {item.status === 'pending' && <View style={styles.unreadDot} />}
                </View>

                <Text style={[styles.cardTitle, { color: Colors.text }]}>{title}</Text>
                {subtitle ? <Text style={[styles.cardSubtitle, { color: Colors.textSecondary }]}>{subtitle}</Text> : null}
                {item.reason ? (
                    <Text style={[styles.cardReason, { color: Colors.textSecondary }]}>💡 {item.reason}</Text>
                ) : null}

                {/* Actions */}
                <View style={styles.cardActions}>
                    <TouchableOpacity
                        style={[styles.acceptBtn, { backgroundColor: config.color }]}
                        onPress={() => handleAccept(item)}
                    >
                        <MaterialIcons name="check" size={16} color="#fff" />
                        <Text style={styles.acceptBtnText}>View & Accept</Text>
                    </TouchableOpacity>
                    <TouchableOpacity
                        style={[styles.dismissBtn, { borderColor: Colors.border }]}
                        onPress={() => handleDismiss(item.id)}
                    >
                        <MaterialIcons name="close" size={16} color={Colors.textSecondary} />
                    </TouchableOpacity>
                </View>
            </TouchableOpacity>
        );
    };

    if (isLoading) {
        return (
            <SafeAreaView style={[styles.container, { backgroundColor: Colors.background }]}>
                <ActivityIndicator size="large" color="#6366f1" style={{ marginTop: 80 }} />
            </SafeAreaView>
        );
    }

    return (
        <SafeAreaView style={[styles.container, { backgroundColor: Colors.background }]}>
            <View style={[styles.header, { backgroundColor: Colors.surface, borderBottomColor: Colors.border }]}>
                <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backBtn}>
                    <MaterialIcons name="arrow-back" size={24} color={Colors.text} />
                </TouchableOpacity>
                <View style={{ flex: 1 }}>
                    <Text style={[styles.headerTitle, { color: Colors.text }]}>AI Suggestions</Text>
                    <Text style={[styles.headerSubtitle, { color: Colors.textSecondary }]}>
                        Personalized recommendations for you
                    </Text>
                </View>
            </View>

            {suggestions.length === 0 ? (
                <View style={styles.emptyState}>
                    <MaterialIcons name="auto-awesome" size={56} color={Colors.textSecondary} />
                    <Text style={[styles.emptyTitle, { color: Colors.text }]}>No suggestions yet</Text>
                    <Text style={[styles.emptySubtitle, { color: Colors.textSecondary }]}>
                        Check back soon — AI suggestions will appear as you engage with events and teams.
                    </Text>
                </View>
            ) : (
                <FlatList
                    data={suggestions}
                    renderItem={renderSuggestion}
                    keyExtractor={(item) => item.id}
                    contentContainerStyle={styles.list}
                    showsVerticalScrollIndicator={false}
                />
            )}
        </SafeAreaView>
    );
}

const createStyles = (Colors: any, isDark: boolean) =>
    StyleSheet.create({
        container: {
            flex: 1,
            ...(Platform.OS === 'web' && { height: '100vh', width: '100vw' } as any),
        },
        header: {
            flexDirection: 'row',
            alignItems: 'center',
            paddingHorizontal: Spacing.lg,
            paddingVertical: Spacing.lg,
            borderBottomWidth: 1,
            gap: Spacing.md,
        },
        backBtn: {
            padding: Spacing.sm,
            borderRadius: BorderRadius.full,
        },
        headerTitle: {
            fontSize: FontSizes.xl,
            fontWeight: '700',
        },
        headerSubtitle: {
            fontSize: FontSizes.sm,
            marginTop: 2,
        },
        list: {
            padding: Spacing.lg,
            gap: 12,
        },
        card: {
            borderRadius: BorderRadius.lg,
            borderWidth: 1,
            padding: Spacing.lg,
            marginBottom: 12,
        },
        cardTop: {
            flexDirection: 'row',
            alignItems: 'center',
            justifyContent: 'space-between',
            marginBottom: 8,
        },
        badge: {
            flexDirection: 'row',
            alignItems: 'center',
            gap: 4,
            paddingHorizontal: 8,
            paddingVertical: 4,
            borderRadius: BorderRadius.full,
        },
        badgeText: {
            fontSize: FontSizes.xs,
            fontWeight: '600',
        },
        unreadDot: {
            width: 8,
            height: 8,
            borderRadius: 4,
            backgroundColor: '#6366f1',
        },
        cardTitle: {
            fontSize: FontSizes.md,
            fontWeight: '700',
            marginBottom: 2,
        },
        cardSubtitle: {
            fontSize: FontSizes.sm,
            marginBottom: 6,
        },
        cardReason: {
            fontSize: FontSizes.sm,
            fontStyle: 'italic',
            marginBottom: 12,
            lineHeight: 18,
        },
        cardActions: {
            flexDirection: 'row',
            gap: 8,
            marginTop: 4,
        },
        acceptBtn: {
            flexDirection: 'row',
            alignItems: 'center',
            gap: 4,
            paddingHorizontal: 14,
            paddingVertical: 8,
            borderRadius: BorderRadius.lg,
            flex: 1,
            justifyContent: 'center',
        },
        acceptBtnText: {
            color: '#fff',
            fontSize: FontSizes.sm,
            fontWeight: '600',
        },
        dismissBtn: {
            padding: 8,
            borderRadius: BorderRadius.lg,
            borderWidth: 1,
            justifyContent: 'center',
            alignItems: 'center',
        },
        emptyState: {
            flex: 1,
            alignItems: 'center',
            justifyContent: 'center',
            paddingHorizontal: Spacing.xxl,
            gap: Spacing.md,
        },
        emptyTitle: {
            fontSize: FontSizes.lg,
            fontWeight: '700',
        },
        emptySubtitle: {
            fontSize: FontSizes.sm,
            textAlign: 'center',
            lineHeight: 20,
        },
    });
