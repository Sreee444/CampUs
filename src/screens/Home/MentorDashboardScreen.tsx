// @ts-nocheck
import React, { useCallback, useEffect, useState } from 'react';
import {
    View,
    Text,
    TouchableOpacity,
    StyleSheet,
    SafeAreaView,
    ScrollView,
    TextInput,
    ActivityIndicator,
} from 'react-native';
import { MaterialIcons } from '@expo/vector-icons';
import { useNavigation } from '@react-navigation/native';
import { getColors, Spacing, BorderRadius, FontSizes, FontWeights } from '../../theme';
import { useTheme } from '../../contexts/ThemeContext';
import { useAuth } from '../../contexts/AuthContext';
import { UserAvatar } from '../../components/UserAvatar';
import Toast from 'react-native-toast-message';
import {
    getMyMentorProfile,
    becomeMentor,
    getMentorIncomingRequests,
    updateMentorshipRequestStatus,
    updateMentorAvailability,
} from '../../api/mentors';
import { getMentorshipChatsForUser, ensureMentorshipChat } from '../../api/mentorshipChat';

const ROLE_OPTIONS = [
    { key: 'alumni', label: 'Alumni', icon: 'school' },
    { key: 'faculty', label: 'Faculty', icon: 'account-balance' },
    { key: 'senior', label: 'Senior Student', icon: 'person' },
];

const PURPOSE_LABELS: Record<string, string> = {
    career: 'Career',
    academic: 'Academic',
    skill: 'Skill',
    project: 'Project',
    startup: 'Startup',
};

export default function MentorDashboardScreen() {
    const navigation = useNavigation();
    const { isDark } = useTheme();
    const { user, profile } = useAuth();
    const Colors = getColors(isDark);
    const S = styles(Colors);

    const [mentorProfile, setMentorProfile] = useState<any>(null);
    const [requests, setRequests] = useState<any[]>([]);
    const [chats, setChats] = useState<any[]>([]);
    const [isLoading, setIsLoading] = useState(true);
    const [activeTab, setActiveTab] = useState<'pending' | 'active' | 'closed'>('pending');

    // Become mentor form
    const [showForm, setShowForm] = useState(false);
    const [selectedRole, setSelectedRole] = useState('alumni');
    const [expertiseTags, setExpertiseTags] = useState('');
    const [department, setDepartment] = useState('');
    const [company, setCompany] = useState('');
    const [maxMentees, setMaxMentees] = useState('5');
    const [isSaving, setIsSaving] = useState(false);

    // Accept/reject loading
    const [actionId, setActionId] = useState<string | null>(null);

    // Chat opening state
    const [openingChatRequestId, setOpeningChatRequestId] = useState<string | null>(null);

    // Redirect users who are NOT mentors and don't have a faculty/alumni role
    // This runs after data loads so senior student mentors are NOT bounced out
    useEffect(() => {
        if (isLoading) return; // wait until we know if they have a mentor profile
        if (!profile?.role) return;
        const isMentorRole = profile.role === 'faculty' || profile.role === 'alumni';
        if (!mentorProfile && !isMentorRole) {
            // Non-mentor student: send to MentorHub (as a mentee)
            navigation.replace('MentorHub' as never);
        }
    }, [isLoading, mentorProfile, profile?.role, navigation]);

    const loadData = useCallback(async () => {
        if (!user?.id) return;
        try {
            const [mentorProf, reqs, chatList] = await Promise.all([
                getMyMentorProfile(user.id),
                getMentorIncomingRequests(user.id),
                getMentorshipChatsForUser(user.id).catch(() => []),
            ]);
            setMentorProfile(mentorProf);
            setRequests(reqs);
            setChats(chatList);
        } catch (e: any) {
            Toast.show({ type: 'error', text1: 'Failed to load dashboard', text2: e?.message });
        } finally {
            setIsLoading(false);
        }
    }, [user?.id]);

    useEffect(() => { loadData(); }, [loadData]);

    const handleBecomeMentor = async () => {
        if (!user?.id) return;
        const tags = expertiseTags.split(',').map((t) => t.trim()).filter(Boolean);
        if (!tags.length) {
            Toast.show({ type: 'error', text1: 'Add at least one expertise tag' });
            return;
        }
        try {
            setIsSaving(true);
            await becomeMentor(user.id, {
                role: selectedRole,
                expertise_tags: tags,
                department: department.trim() || undefined,
                company: company.trim() || undefined,
                max_mentees: parseInt(maxMentees, 10) || 5,
            });
            Toast.show({ type: 'success', text1: 'Mentor profile created!' });
            setShowForm(false);
            await loadData();
        } catch (e: any) {
            Toast.show({ type: 'error', text1: 'Failed', text2: e?.message });
        } finally {
            setIsSaving(false);
        }
    };

    const handleAction = async (requestId: string, status: 'accepted' | 'rejected' | 'closed') => {
        try {
            setActionId(requestId + status);
            await updateMentorshipRequestStatus(requestId, status);
            Toast.show({
                type: status === 'accepted' ? 'success' : 'info',
                text1:
                    status === 'accepted'
                        ? 'Mentorship accepted!'
                        : status === 'closed'
                            ? 'Mentorship closed'
                            : 'Request declined',
                text2: status === 'accepted' ? 'A chat room has been created.' : undefined,
            });
            await loadData();
        } catch (e: any) {
            Toast.show({ type: 'error', text1: 'Failed', text2: e?.message });
        } finally {
            setActionId(null);
        }
    };

    const getChatForRequest = (reqId: string) => chats.find(c => c.mentorship_id === reqId);

    const openOrCreateChatAsMentor = async (req: any) => {
        if (openingChatRequestId === req.id) return;
        const conv = getChatForRequest(req.id);
        if (conv) {
            (navigation as any).navigate('MentorshipChat', { chatId: conv.id });
            return;
        }
        try {
            setOpeningChatRequestId(req.id);
            if (!user?.id || !req.mentee_id) throw new Error('Missing user IDs');
            const chatId = await ensureMentorshipChat(req.id, user.id, req.mentee_id);
            await loadData();
            (navigation as any).navigate('MentorshipChat', { chatId });
        } catch (e: any) {
            Toast.show({ type: 'error', text1: 'Could not open chat', text2: e?.message });
        } finally {
            setOpeningChatRequestId(null);
        }
    };

    const pendingRequests = requests.filter((r) => r.status === 'pending');
    const activeRequests = requests.filter((r) => r.status === 'accepted');
    const closedRequests = requests.filter((r) => r.status === 'rejected' || r.status === 'closed');

    if (isLoading) {
        return (
            <SafeAreaView style={S.container}>
                <View style={S.header}>
                    <TouchableOpacity onPress={() => navigation.goBack()}>
                        <MaterialIcons name="arrow-back" size={24} color={Colors.text} />
                    </TouchableOpacity>
                    <Text style={S.headerTitle}>Mentor Dashboard</Text>
                    <View style={{ width: 24 }} />
                </View>
                <View style={S.centerWrap}>
                    <ActivityIndicator size="large" color="#4F46E5" />
                </View>
            </SafeAreaView>
        );
    }

    return (
        <SafeAreaView style={S.container}>
            {/* Header */}
            <View style={S.header}>
                <TouchableOpacity onPress={() => navigation.goBack()}>
                    <MaterialIcons name="arrow-back" size={24} color={Colors.text} />
                </TouchableOpacity>
                <Text style={S.headerTitle}>Mentor Dashboard</Text>
                {mentorProfile && (
                    <TouchableOpacity
                        onPress={() => updateMentorAvailability(mentorProfile.id, !mentorProfile.available).then(loadData)}
                    >
                        <View style={[S.availToggle, { backgroundColor: mentorProfile.available ? '#10B98122' : '#EF444422' }]}>
                            <View style={[S.availDot, { backgroundColor: mentorProfile.available ? '#10B981' : '#EF4444' }]} />
                            <Text style={[S.availText, { color: mentorProfile.available ? '#10B981' : '#EF4444' }]}>
                                {mentorProfile.available ? 'Available' : 'Unavailable'}
                            </Text>
                        </View>
                    </TouchableOpacity>
                )}
            </View>

            <ScrollView style={S.scroll} contentContainerStyle={S.scrollContent} showsVerticalScrollIndicator={false}>
                {/* ── No mentor profile yet ── */}
                {!mentorProfile && !showForm && (
                    <View style={S.heroBanner}>
                        <MaterialIcons name="school" size={40} color="#4F46E5" />
                        <Text style={S.heroTitle}>Become a Mentor</Text>
                        <Text style={S.heroSub}>
                            Share your expertise and guide students on their journey.
                            Register as a mentor to start receiving mentorship requests.
                        </Text>
                        <TouchableOpacity style={S.heroCta} onPress={() => setShowForm(true)}>
                            <Text style={S.heroCtaText}>Register as Mentor</Text>
                        </TouchableOpacity>
                    </View>
                )}

                {/* ── Register Form ── */}
                {showForm && (
                    <View style={S.formCard}>
                        <Text style={S.formTitle}>Mentor Registration</Text>

                        <Text style={S.fieldLabel}>Your Role</Text>
                        <View style={S.roleRow}>
                            {ROLE_OPTIONS.map((r) => (
                                <TouchableOpacity
                                    key={r.key}
                                    style={[S.roleBtn, selectedRole === r.key && S.roleBtnActive]}
                                    onPress={() => setSelectedRole(r.key)}
                                >
                                    <MaterialIcons
                                        name={r.icon as any}
                                        size={16}
                                        color={selectedRole === r.key ? '#fff' : Colors.textSecondary}
                                    />
                                    <Text style={[S.roleBtnText, selectedRole === r.key && { color: '#fff' }]}>{r.label}</Text>
                                </TouchableOpacity>
                            ))}
                        </View>

                        <Text style={S.fieldLabel}>Expertise Tags (comma-separated)</Text>
                        <TextInput
                            style={S.input}
                            placeholder="e.g. React, Machine Learning, DSA"
                            placeholderTextColor={Colors.textSecondary}
                            value={expertiseTags}
                            onChangeText={setExpertiseTags}
                        />

                        <Text style={S.fieldLabel}>Department (optional)</Text>
                        <TextInput
                            style={S.input}
                            placeholder="e.g. Computer Science"
                            placeholderTextColor={Colors.textSecondary}
                            value={department}
                            onChangeText={setDepartment}
                        />

                        <Text style={S.fieldLabel}>Company / Institution (optional)</Text>
                        <TextInput
                            style={S.input}
                            placeholder="e.g. Google, IIT Bombay"
                            placeholderTextColor={Colors.textSecondary}
                            value={company}
                            onChangeText={setCompany}
                        />

                        <Text style={S.fieldLabel}>Max Mentees</Text>
                        <TextInput
                            style={S.input}
                            placeholder="5"
                            placeholderTextColor={Colors.textSecondary}
                            value={maxMentees}
                            onChangeText={setMaxMentees}
                            keyboardType="number-pad"
                        />

                        <View style={{ flexDirection: 'row', gap: 10, marginTop: 4 }}>
                            <TouchableOpacity style={S.cancelBtn} onPress={() => setShowForm(false)}>
                                <Text style={S.cancelBtnText}>Cancel</Text>
                            </TouchableOpacity>
                            <TouchableOpacity
                                style={[S.submitBtn, isSaving && { opacity: 0.6 }]}
                                onPress={handleBecomeMentor}
                                disabled={isSaving}
                            >
                                {isSaving
                                    ? <ActivityIndicator size="small" color="#fff" />
                                    : <Text style={S.submitBtnText}>Save Profile</Text>
                                }
                            </TouchableOpacity>
                        </View>
                    </View>
                )}

                {/* ── Mentor Profile Card ── */}
                {!!mentorProfile && (
                    <View style={S.profileCard}>
                        <View style={S.profileRow}>
                            <View style={[S.roleBadge, { backgroundColor: '#4F46E515' }]}>
                                <Text style={S.roleText}>{mentorProfile.role}</Text>
                            </View>
                            <View>
                                <Text style={S.profileStat}>{activeRequests.length}</Text>
                                <Text style={S.profileStatLabel}>Active</Text>
                            </View>
                            <View>
                                <Text style={S.profileStat}>{mentorProfile.max_mentees}</Text>
                                <Text style={S.profileStatLabel}>Max Slots</Text>
                            </View>
                        </View>
                        <View style={S.tagRow}>
                            {(mentorProfile.expertise_tags || []).map((t: string) => (
                                <View key={t} style={S.tag}>
                                    <Text style={S.tagText}>{t}</Text>
                                </View>
                            ))}
                        </View>
                    </View>
                )}

                {/* ── Chats banner (shown when mentor has active chats) ── */}
                {chats.length > 0 && (
                    <TouchableOpacity
                        style={S.chatBanner}
                        onPress={() => (navigation as any).navigate('MentorshipChatList')}
                        activeOpacity={0.8}
                    >
                        <View style={S.chatBannerLeft}>
                            <View style={S.chatBannerIcon}>
                                <MaterialIcons name="chat" size={18} color="#fff" />
                            </View>
                            <View>
                                <Text style={S.chatBannerTitle}>Mentorship Chats</Text>
                                <Text style={S.chatBannerSub}>{chats.length} active conversation{chats.length !== 1 ? 's' : ''} with mentees</Text>
                            </View>
                        </View>
                        <MaterialIcons name="chevron-right" size={20} color="#4F46E5" />
                    </TouchableOpacity>
                )}

                {/* ── Tabs (only shown when mentor) ── */}
                {!!mentorProfile && (
                    <>
                        <View style={S.tabRow}>
                            {([
                                { key: 'pending', label: 'Pending', count: pendingRequests.length },
                                { key: 'active', label: 'Active', count: activeRequests.length },
                                { key: 'closed', label: 'Closed', count: closedRequests.length },
                            ] as any[]).map((tab) => (
                                <TouchableOpacity
                                    key={tab.key}
                                    style={[S.tab, activeTab === tab.key && S.tabActive]}
                                    onPress={() => setActiveTab(tab.key)}
                                >
                                    <Text style={[S.tabText, activeTab === tab.key && S.tabTextActive]}>
                                        {tab.label} {tab.count ? `(${tab.count})` : ''}
                                    </Text>
                                </TouchableOpacity>
                            ))}
                        </View>

                        {/* Pending */}
                        {activeTab === 'pending' && (
                            pendingRequests.length === 0
                                ? <View style={S.empty}><MaterialIcons name="inbox" size={40} color={Colors.textSecondary} /><Text style={S.emptyText}>No pending requests</Text></View>
                                : pendingRequests.map((req) => (
                                    <View key={req.id} style={S.reqCard}>
                                        <View style={S.reqRow}>
                                            <UserAvatar uri={req.mentee?.avatar_url} name={req.mentee?.full_name || 'Student'} size={44} showRing={false} />
                                            <View style={{ flex: 1 }}>
                                                <Text style={S.reqName}>{req.mentee?.full_name || 'Student'}</Text>
                                                <Text style={S.reqSub}>{req.mentee?.department || req.mentee?.role || ''}</Text>
                                            </View>
                                            <View style={S.purposeBadge}>
                                                <Text style={S.purposeText}>{PURPOSE_LABELS[req.purpose] || req.purpose}</Text>
                                            </View>
                                        </View>
                                        <Text style={S.descText} numberOfLines={3}>{req.description}</Text>
                                        <View style={S.actionRow}>
                                            <TouchableOpacity
                                                style={S.rejectBtn}
                                                onPress={() => handleAction(req.id, 'rejected')}
                                                disabled={!!actionId}
                                            >
                                                {actionId === req.id + 'rejected'
                                                    ? <ActivityIndicator size="small" color={Colors.text} />
                                                    : <Text style={S.rejectBtnText}>Decline</Text>
                                                }
                                            </TouchableOpacity>
                                            <TouchableOpacity
                                                style={S.acceptBtn}
                                                onPress={() => handleAction(req.id, 'accepted')}
                                                disabled={!!actionId}
                                            >
                                                {actionId === req.id + 'accepted'
                                                    ? <ActivityIndicator size="small" color="#fff" />
                                                    : <Text style={S.acceptBtnText}>Accept</Text>
                                                }
                                            </TouchableOpacity>
                                        </View>
                                    </View>
                                ))
                        )}

                        {/* Active */}
                        {activeTab === 'active' && (
                            activeRequests.length === 0
                                ? <View style={S.empty}><MaterialIcons name="people" size={40} color={Colors.textSecondary} /><Text style={S.emptyText}>No active mentorships</Text></View>
                                : activeRequests.map((req) => {
                                    const conv = getChatForRequest(req.id);
                                    return (
                                        <View key={req.id} style={S.reqCard}>
                                            <View style={S.reqRow}>
                                                <UserAvatar uri={req.mentee?.avatar_url} name={req.mentee?.full_name || 'Student'} size={44} showRing={false} />
                                                <View style={{ flex: 1 }}>
                                                    <Text style={S.reqName}>{req.mentee?.full_name || 'Student'}</Text>
                                                    <Text style={S.reqSub}>{req.mentee?.department || ''}</Text>
                                                </View>
                                                <View style={[S.purposeBadge, { backgroundColor: '#10B98115' }]}>
                                                    <Text style={[S.purposeText, { color: '#10B981' }]}>{PURPOSE_LABELS[req.purpose] || req.purpose}</Text>
                                                </View>
                                            </View>
                                            <Text style={S.descText} numberOfLines={2}>{req.description}</Text>
                                            <View style={S.actionRow}>
                                                {req.purpose === 'project' && req.project_id && (
                                                    <TouchableOpacity
                                                        style={S.rejectBtn}
                                                        onPress={() => (navigation as any).navigate('ProjectDetails', { teamId: req.project_id })}
                                                    >
                                                        <Text style={S.rejectBtnText}>Open Project</Text>
                                                    </TouchableOpacity>
                                                )}
                                                {req.purpose !== 'project' && (
                                                    <TouchableOpacity
                                                        style={S.openChatBtn}
                                                        onPress={() => openOrCreateChatAsMentor(req)}
                                                        disabled={openingChatRequestId === req.id}
                                                    >
                                                        {openingChatRequestId === req.id
                                                            ? <ActivityIndicator size="small" color="#fff" />
                                                            : <><MaterialIcons name="chat" size={14} color="#fff" /><Text style={S.openChatBtnText}>Chat</Text></>
                                                        }
                                                    </TouchableOpacity>
                                                )}
                                                <TouchableOpacity
                                                    style={S.endMentorshipBtn}
                                                    onPress={() => handleAction(req.id, 'closed')}
                                                    disabled={!!actionId}
                                                >
                                                    {actionId === req.id + 'closed'
                                                        ? <ActivityIndicator size="small" color="#EF4444" />
                                                        : <Text style={S.endMentorshipBtnText}>End Mentorship</Text>
                                                    }
                                                </TouchableOpacity>
                                            </View>
                                        </View>
                                    );
                                })
                        )}

                        {/* Closed */}
                        {activeTab === 'closed' && (
                            closedRequests.length === 0
                                ? <View style={S.empty}><MaterialIcons name="check-circle" size={40} color={Colors.textSecondary} /><Text style={S.emptyText}>No closed mentorships</Text></View>
                                : closedRequests.map((req) => (
                                    <View key={req.id} style={[S.reqCard, { opacity: 0.65 }]}>
                                        <View style={S.reqRow}>
                                            <UserAvatar uri={req.mentee?.avatar_url} name={req.mentee?.full_name || 'Student'} size={40} showRing={false} />
                                            <View style={{ flex: 1 }}>
                                                <Text style={S.reqName}>{req.mentee?.full_name || 'Student'}</Text>
                                                <Text style={S.reqSub}>{PURPOSE_LABELS[req.purpose] || req.purpose}</Text>
                                            </View>
                                            <Text style={[S.reqSub, { textTransform: 'capitalize' }]}>{req.status}</Text>
                                        </View>
                                    </View>
                                ))
                        )}
                    </>
                )}

                <View style={{ height: 40 }} />
            </ScrollView>
        </SafeAreaView>
    );
}

const styles = (Colors: any) =>
    StyleSheet.create({
        container: { flex: 1, backgroundColor: Colors.background },
        header: {
            flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
            paddingHorizontal: Spacing.md, paddingVertical: 14,
            backgroundColor: Colors.surface, borderBottomWidth: 1, borderBottomColor: Colors.border,
        },
        headerTitle: { fontSize: FontSizes.lg, fontWeight: FontWeights.bold, color: Colors.text },
        centerWrap: { flex: 1, alignItems: 'center', justifyContent: 'center' },
        scroll: { flex: 1 },
        scrollContent: { padding: Spacing.md, gap: 14 },

        availToggle: {
            flexDirection: 'row', alignItems: 'center', gap: 5,
            paddingHorizontal: 10, paddingVertical: 5, borderRadius: 999,
        },
        availDot: { width: 7, height: 7, borderRadius: 4 },
        availText: { fontSize: 11, fontWeight: '700' },

        heroBanner: {
            alignItems: 'center', padding: 28, gap: 12,
            backgroundColor: '#4F46E508', borderRadius: BorderRadius.xl,
            borderWidth: 1, borderColor: '#4F46E520',
        },
        heroTitle: { fontSize: FontSizes.xl, fontWeight: FontWeights.bold, color: Colors.text },
        heroSub: { fontSize: FontSizes.sm, color: Colors.textSecondary, textAlign: 'center', lineHeight: 20 },
        heroCta: {
            backgroundColor: '#4F46E5', paddingHorizontal: 28, paddingVertical: 12,
            borderRadius: BorderRadius.md, marginTop: 4,
        },
        heroCtaText: { color: '#fff', fontWeight: FontWeights.bold, fontSize: FontSizes.sm },

        formCard: {
            backgroundColor: Colors.surface, borderRadius: BorderRadius.xl,
            padding: Spacing.md, gap: 12,
            borderWidth: 1, borderColor: Colors.border,
        },
        formTitle: { fontSize: FontSizes.md, fontWeight: FontWeights.bold, color: Colors.text },
        fieldLabel: { fontSize: FontSizes.sm, fontWeight: FontWeights.semibold, color: Colors.text },
        input: {
            borderWidth: 1, borderColor: Colors.border, borderRadius: BorderRadius.md,
            padding: 12, color: Colors.text, fontSize: FontSizes.sm,
        },
        roleRow: { flexDirection: 'row', gap: 8, flexWrap: 'wrap' },
        roleBtn: {
            flexDirection: 'row', alignItems: 'center', gap: 5,
            paddingHorizontal: 12, paddingVertical: 8,
            borderRadius: 999, borderWidth: 1, borderColor: Colors.border,
            backgroundColor: Colors.card,
        },
        roleBtnActive: { backgroundColor: '#4F46E5', borderColor: '#4F46E5' },
        roleBtnText: { fontSize: 12, fontWeight: '600', color: Colors.textSecondary },
        cancelBtn: {
            flex: 1, borderWidth: 1, borderColor: Colors.border, borderRadius: BorderRadius.md,
            paddingVertical: 12, alignItems: 'center', backgroundColor: Colors.card,
        },
        cancelBtnText: { color: Colors.text, fontWeight: FontWeights.semibold },
        submitBtn: {
            flex: 2, backgroundColor: '#4F46E5', borderRadius: BorderRadius.md,
            paddingVertical: 12, alignItems: 'center',
        },
        submitBtnText: { color: '#fff', fontWeight: FontWeights.bold },

        profileCard: {
            backgroundColor: Colors.surface, borderRadius: BorderRadius.xl,
            padding: Spacing.md, gap: 10,
            borderWidth: 1, borderColor: Colors.border,
        },
        profileRow: { flexDirection: 'row', alignItems: 'center', gap: 16 },
        roleBadge: { paddingHorizontal: 12, paddingVertical: 5, borderRadius: 999 },
        roleText: { fontSize: 11, fontWeight: '700', color: '#4F46E5', textTransform: 'uppercase' },
        profileStat: { fontSize: 20, fontWeight: '700', color: Colors.text, textAlign: 'center' },
        profileStatLabel: { fontSize: 10, color: Colors.textSecondary, textAlign: 'center' },
        tagRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
        tag: { backgroundColor: '#4F46E514', paddingHorizontal: 10, paddingVertical: 4, borderRadius: 999 },
        tagText: { fontSize: 11, color: '#4F46E5', fontWeight: '600' },

        tabRow: { flexDirection: 'row', gap: 8, marginTop: 4 },
        tab: {
            flex: 1, alignItems: 'center', paddingVertical: 10,
            borderRadius: BorderRadius.lg, backgroundColor: Colors.card,
            borderWidth: 1, borderColor: Colors.border,
        },
        tabActive: { backgroundColor: '#4F46E5', borderColor: '#4F46E5' },
        tabText: { fontSize: 11, fontWeight: FontWeights.semibold, color: Colors.textSecondary },
        tabTextActive: { color: '#fff' },

        empty: { alignItems: 'center', paddingVertical: 32, gap: 8 },
        emptyText: { color: Colors.textSecondary, fontSize: 14 },

        reqCard: {
            backgroundColor: Colors.surface, borderRadius: BorderRadius.xl,
            padding: Spacing.md, gap: 10,
            borderWidth: 1, borderColor: Colors.border,
        },
        reqRow: { flexDirection: 'row', alignItems: 'center', gap: 12 },
        reqName: { fontSize: FontSizes.md, fontWeight: FontWeights.bold, color: Colors.text },
        reqSub: { fontSize: FontSizes.sm, color: Colors.textSecondary },
        purposeBadge: { backgroundColor: '#4F46E515', paddingHorizontal: 10, paddingVertical: 4, borderRadius: 999 },
        purposeText: { fontSize: 11, color: '#4F46E5', fontWeight: '700' },
        descText: { fontSize: 13, color: Colors.textSecondary, lineHeight: 18 },
        actionRow: { flexDirection: 'row', gap: 10 },
        rejectBtn: {
            flex: 1, borderWidth: 1, borderColor: Colors.border, borderRadius: BorderRadius.md,
            paddingVertical: 10, alignItems: 'center', backgroundColor: Colors.card,
        },
        rejectBtnText: { color: Colors.text, fontWeight: FontWeights.semibold },
        acceptBtn: {
            flex: 2, backgroundColor: '#4F46E5', borderRadius: BorderRadius.md,
            paddingVertical: 10, alignItems: 'center',
        },
        acceptBtnText: { color: '#fff', fontWeight: FontWeights.bold },
        openChatBtn: {
            flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6,
            backgroundColor: '#4F46E5', borderRadius: BorderRadius.md, paddingVertical: 9,
            flex: 1,
        },
        openChatBtnText: { color: '#fff', fontWeight: FontWeights.bold, fontSize: 12 },
        endMentorshipBtn: {
            flex: 1, alignItems: 'center', justifyContent: 'center', paddingVertical: 9,
            borderWidth: 1.5, borderColor: '#EF4444', borderRadius: BorderRadius.md,
        },
        endMentorshipBtnText: { color: '#EF4444', fontWeight: FontWeights.semibold, fontSize: 12 },


        chatBanner: {
            flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
            backgroundColor: '#EEF2FF', borderRadius: BorderRadius.lg,
            padding: 14, borderWidth: 1, borderColor: '#C7D2FE',
        },
        chatBannerLeft: { flexDirection: 'row', alignItems: 'center', gap: 10 },
        chatBannerIcon: {
            width: 38, height: 38, borderRadius: 10, backgroundColor: '#4F46E5',
            alignItems: 'center', justifyContent: 'center',
        },
        chatBannerTitle: { fontSize: 13, fontWeight: '700', color: '#312E81' },
        chatBannerSub: { fontSize: 11, color: '#4F46E5', marginTop: 1 },
    });
