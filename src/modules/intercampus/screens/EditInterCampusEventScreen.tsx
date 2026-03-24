// @ts-nocheck
import React, { useCallback, useEffect, useState } from 'react';
import {
    ActivityIndicator,
    Alert,
    Image,
    KeyboardAvoidingView,
    Platform,
    SafeAreaView,
    ScrollView,
    StyleSheet,
    Text,
    TextInput,
    TouchableOpacity,
    View,
} from 'react-native';
import { MaterialIcons } from '@expo/vector-icons';
import { RouteProp, useNavigation, useRoute } from '@react-navigation/native';
import { StackNavigationProp } from '@react-navigation/stack';
import * as ImagePicker from 'expo-image-picker';
import * as FileSystem from 'expo-file-system/legacy';
import Toast from 'react-native-toast-message';
import { RootStackParamList } from '../../../navigation/types';
import { useAuth } from '../../../contexts/AuthContext';
import { isFacultyOrAdminRole } from '../../../utils/roles';
import { supabase } from '../../../api/supabase';
import { getInterCampusEventById, updateInterCampusEvent } from '../api/intercampus';
import { InterCampusEvent } from '../types/intercampus';
import InterCampusScreen from '../components/InterCampusScreen';

type Route = RouteProp<RootStackParamList, 'EditInterCampusEvent'>;
type Nav = StackNavigationProp<RootStackParamList>;

const toIso = (value: string) => {
    const raw = (value || '').trim();
    if (!raw) return null;
    const d = new Date(raw);
    return Number.isNaN(d.getTime()) ? null : d.toISOString();
};

const isValidHttpUrl = (value: string) => {
    const raw = value.trim();
    if (!raw) return false;
    try {
        const parsed = new URL(raw);
        return parsed.protocol === 'http:' || parsed.protocol === 'https:';
    } catch {
        return false;
    }
};

const Field = ({
    label,
    value,
    onChange,
    placeholder,
    multiline,
    keyboardType,
}: {
    label: string;
    value: string;
    onChange: (v: string) => void;
    placeholder?: string;
    multiline?: boolean;
    keyboardType?: any;
}) => (
    <View style={styles.fieldWrap}>
        <Text style={styles.fieldLabel}>{label}</Text>
        <TextInput
            style={[styles.input, multiline && styles.inputMulti]}
            value={value}
            onChangeText={onChange}
            placeholder={placeholder || ''}
            placeholderTextColor="#94a3b8"
            multiline={!!multiline}
            keyboardType={keyboardType || 'default'}
            autoCapitalize="sentences"
        />
    </View>
);

export default function EditInterCampusEventScreen() {
    const route = useRoute<Route>();
    const navigation = useNavigation<Nav>();
    const { user, profile } = useAuth();

    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);
    const [event, setEvent] = useState<InterCampusEvent | null>(null);

    // Form state
    const [title, setTitle] = useState('');
    const [description, setDescription] = useState('');
    const [collegeName, setCollegeName] = useState('');
    const [collegeLocation, setCollegeLocation] = useState('');
    const [collegeWebsite, setCollegeWebsite] = useState('');
    const [startDate, setStartDate] = useState('');
    const [endDate, setEndDate] = useState('');
    const [venue, setVenue] = useState('');
    const [participationType, setParticipationType] = useState<'individual' | 'team'>('individual');
    const [minTeam, setMinTeam] = useState('');
    const [maxTeam, setMaxTeam] = useState('');
    const [registrationLink, setRegistrationLink] = useState('');
    const [eventType, setEventType] = useState('');
    const [sourceUrl, setSourceUrl] = useState('');
    const [posterImage, setPosterImage] = useState('');
    const [imageInputMode, setImageInputMode] = useState<'link' | 'upload'>('link');
    const [uploadingImage, setUploadingImage] = useState(false);

    const isFaculty = isFacultyOrAdminRole(profile?.role);

    const load = useCallback(async () => {
        try {
            setLoading(true);
            const data = await getInterCampusEventById(route.params.eventId, user?.id, true);
            if (!data) throw new Error('Event not found');
            setEvent(data);
            setTitle(data.title || '');
            setDescription(data.description || '');
            setCollegeName(data.college_name || '');
            setCollegeLocation(data.college_location || '');
            setCollegeWebsite(data.college_website || '');
            // Format dates to YYYY-MM-DD for editing
            const fmtDate = (v?: string | null) => {
                if (!v) return '';
                const d = new Date(v);
                return Number.isNaN(d.getTime()) ? '' : d.toISOString().slice(0, 10);
            };
            setStartDate(fmtDate(data.event_start_date));
            setEndDate(fmtDate(data.event_end_date));
            setVenue(data.venue || '');
            setParticipationType(data.participation_type === 'team' ? 'team' : 'individual');
            setMinTeam(data.min_team_size != null ? String(data.min_team_size) : '');
            setMaxTeam(data.max_team_size != null ? String(data.max_team_size) : '');
            setRegistrationLink(data.registration_link || '');
            setEventType(data.event_type || '');
            setSourceUrl(data.source_url || '');
            setPosterImage(data.poster_image || data.banner_image || '');
            setImageInputMode((data.poster_image || data.banner_image || '').trim() ? 'upload' : 'link');
        } catch (error: any) {
            Toast.show({ type: 'error', text1: 'Failed to load event', text2: error?.message });
            navigation.goBack();
        } finally {
            setLoading(false);
        }
    }, [route.params.eventId, user?.id]);

    useEffect(() => { load(); }, [load]);

    const pickAndUploadImage = async () => {
        const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
        if (!permission.granted) {
            Toast.show({ type: 'error', text1: 'Gallery permission is required' });
            return;
        }

        const result = await ImagePicker.launchImageLibraryAsync({
            mediaTypes: ['images'],
            allowsEditing: true,
            quality: 0.85,
            aspect: [16, 9],
        });

        if (result.canceled || !result.assets?.[0]?.uri) return;

        try {
            setUploadingImage(true);
            const uri = result.assets[0].uri;
            const fileExt = (uri.split('.').pop()?.split('?')[0] ?? 'jpg').toLowerCase();
            const fileName = `intercampus-edit-${Date.now()}.${fileExt}`;
            const contentType = fileExt === 'png' ? 'image/png' : fileExt === 'webp' ? 'image/webp' : 'image/jpeg';

            const base64 = await FileSystem.readAsStringAsync(uri, { encoding: FileSystem.EncodingType.Base64 });
            const byteCharacters = atob(base64);
            const uint8Array = new Uint8Array(byteCharacters.length);
            for (let i = 0; i < byteCharacters.length; i += 1) {
                uint8Array[i] = byteCharacters.charCodeAt(i);
            }

            const { error } = await supabase.storage.from('event-banners').upload(fileName, uint8Array, {
                contentType,
                upsert: true,
            });

            if (error) throw error;

            const { data } = supabase.storage.from('event-banners').getPublicUrl(fileName);
            setPosterImage(data.publicUrl);
            Toast.show({ type: 'success', text1: `${event?.is_fest ? 'Fest' : 'Event'} image uploaded` });
        } catch (error: any) {
            Toast.show({ type: 'error', text1: 'Image upload failed', text2: error?.message || 'Try again' });
        } finally {
            setUploadingImage(false);
        }
    };

    const handleSave = async () => {
        if (!title.trim()) {
            Toast.show({ type: 'error', text1: 'Title is required' });
            return;
        }
        const startIso = toIso(startDate);
        if (!startIso) {
            Toast.show({ type: 'error', text1: 'Valid start date required (YYYY-MM-DD)' });
            return;
        }
        if (participationType === 'team') {
            const mn = Number(minTeam);
            const mx = Number(maxTeam);
            if (!minTeam || !maxTeam || !Number.isFinite(mn) || !Number.isFinite(mx) || mn > mx) {
                Toast.show({ type: 'error', text1: 'Valid team size range required' });
                return;
            }
        }

        if (imageInputMode === 'link' && posterImage.trim() && !isValidHttpUrl(posterImage)) {
            Toast.show({ type: 'error', text1: 'Image URL is invalid' });
            return;
        }

        try {
            setSaving(true);
            const payload: any = {
                title: title.trim(),
                description: description.trim() || null,
                college_name: collegeName.trim(),
                college_location: collegeLocation.trim() || null,
                college_website: collegeWebsite.trim() || null,
                event_start_date: startIso,
                event_end_date: toIso(endDate),
                venue: venue.trim() || null,
                participation_type: participationType,
                min_team_size: participationType === 'team' ? Number(minTeam) || null : null,
                max_team_size: participationType === 'team' ? Number(maxTeam) || null : null,
                registration_link: registrationLink.trim() || null,
                event_type: eventType.trim() || null,
                source_url: sourceUrl.trim() || null,
                poster_image: posterImage.trim() || null,
            };
            await updateInterCampusEvent(route.params.eventId, payload);
            Toast.show({ type: 'success', text1: `${event?.is_fest ? 'Fest' : 'Event'} updated ✓` });
            navigation.goBack();
        } catch (error: any) {
            Toast.show({ type: 'error', text1: 'Update failed', text2: error?.message });
        } finally {
            setSaving(false);
        }
    };

    if (loading) {
        return (
            <InterCampusScreen style={styles.center}>
                <ActivityIndicator color="#6366F1" size="large" />
            </InterCampusScreen>
        );
    }

    if (!isFaculty) {
        return (
            <InterCampusScreen style={styles.center}>
                <MaterialIcons name="lock" size={36} color="#94a3b8" />
                <Text style={styles.accessText}>Faculty or Admin access required</Text>
            </InterCampusScreen>
        );
    }

    const isFestRow = event?.is_fest;

    return (
        <InterCampusScreen style={styles.container}>
            <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={{ flex: 1 }}>
                {/* Header */}
                <View style={styles.header}>
                    <TouchableOpacity style={styles.backBtn} onPress={() => navigation.goBack()}>
                        <MaterialIcons name="arrow-back" size={22} color="#0f172a" />
                    </TouchableOpacity>
                    <Text style={styles.headerTitle}>{isFestRow ? 'Edit Fest' : 'Edit Event'}</Text>
                    <TouchableOpacity
                        style={[styles.saveBtn, saving && { opacity: 0.6 }]}
                        onPress={handleSave}
                        disabled={saving}
                    >
                        {saving
                            ? <ActivityIndicator size="small" color="#fff" />
                            : <Text style={styles.saveBtnText}>Save</Text>}
                    </TouchableOpacity>
                </View>

                <ScrollView contentContainerStyle={styles.body} keyboardShouldPersistTaps="handled">
                    {/* Meta banner */}
                    <View style={styles.metaBanner}>
                        <MaterialIcons name={isFestRow ? 'celebration' : 'event'} size={18} color="#6366F1" />
                        <Text style={styles.metaBannerText}>
                            {isFestRow ? 'Fest Row' : 'Event'} · {event?.verification_status}
                        </Text>
                    </View>

                    <View style={styles.section}>
                        <Text style={styles.sectionTitle}>Basic Info</Text>
                        <Field label="Title *" value={title} onChange={setTitle} />
                        <Field label="Description" value={description} onChange={setDescription} multiline />
                        <Field label="Event Type" value={eventType} onChange={setEventType} placeholder="Technical / Cultural / Sports…" />
                    </View>

                    <View style={styles.section}>
                        <Text style={styles.sectionTitle}>College</Text>
                        <Field label="College Name" value={collegeName} onChange={setCollegeName} />
                        <Field label="College Location" value={collegeLocation} onChange={setCollegeLocation} />
                        <Field label="College Website" value={collegeWebsite} onChange={setCollegeWebsite} placeholder="https://…" />
                    </View>

                    <View style={styles.section}>
                        <Text style={styles.sectionTitle}>Dates & Venue</Text>
                        <Field label="Start Date (YYYY-MM-DD) *" value={startDate} onChange={setStartDate} placeholder="2026-04-20" />
                        <Field label="End Date (YYYY-MM-DD)" value={endDate} onChange={setEndDate} placeholder="2026-04-21" />
                        <Field label="Venue" value={venue} onChange={setVenue} />
                    </View>

                    <View style={styles.section}>
                        <Text style={styles.sectionTitle}>Participation</Text>
                        <Text style={styles.fieldLabel}>Type</Text>
                        <View style={styles.segRow}>
                            {(['individual', 'team'] as const).map((t) => (
                                <TouchableOpacity
                                    key={t}
                                    style={[styles.segBtn, participationType === t && styles.segBtnActive]}
                                    onPress={() => setParticipationType(t)}
                                >
                                    <Text style={[styles.segText, participationType === t && styles.segTextActive]}>
                                        {t === 'team' ? 'Team' : 'Individual'}
                                    </Text>
                                </TouchableOpacity>
                            ))}
                        </View>
                        {participationType === 'team' && (
                            <View style={{ flexDirection: 'row', gap: 10 }}>
                                <View style={{ flex: 1 }}>
                                    <Field label="Min Team Size" value={minTeam} onChange={setMinTeam} keyboardType="numeric" />
                                </View>
                                <View style={{ flex: 1 }}>
                                    <Field label="Max Team Size" value={maxTeam} onChange={setMaxTeam} keyboardType="numeric" />
                                </View>
                            </View>
                        )}
                    </View>

                    <View style={styles.section}>
                        <Text style={styles.sectionTitle}>Links</Text>
                        <Field label="Registration Link" value={registrationLink} onChange={setRegistrationLink} placeholder="https://…" />
                        <Field label="Event Website" value={sourceUrl} onChange={setSourceUrl} placeholder="https://…" />
                        <Text style={styles.fieldLabel}>{isFestRow ? 'Fest Image' : 'Event Image'}</Text>
                        <View style={styles.segRow}>
                            <TouchableOpacity
                                style={[styles.segBtn, imageInputMode === 'link' && styles.segBtnActive]}
                                onPress={() => setImageInputMode('link')}
                            >
                                <Text style={[styles.segText, imageInputMode === 'link' && styles.segTextActive]}>Use Link</Text>
                            </TouchableOpacity>
                            <TouchableOpacity
                                style={[styles.segBtn, imageInputMode === 'upload' && styles.segBtnActive]}
                                onPress={() => setImageInputMode('upload')}
                            >
                                <Text style={[styles.segText, imageInputMode === 'upload' && styles.segTextActive]}>Upload Image</Text>
                            </TouchableOpacity>
                        </View>

                        {imageInputMode === 'link' ? (
                            <Field
                                label="Image URL"
                                value={posterImage}
                                onChange={setPosterImage}
                                placeholder="https://…"
                            />
                        ) : (
                            <TouchableOpacity
                                style={[styles.uploadBtn, uploadingImage && { opacity: 0.6 }]}
                                onPress={pickAndUploadImage}
                                disabled={uploadingImage}
                            >
                                <MaterialIcons name="upload" size={16} color="#6366F1" />
                                <Text style={styles.uploadText}>
                                    {uploadingImage ? 'Uploading...' : posterImage.trim() ? 'Change Image' : 'Upload Image'}
                                </Text>
                            </TouchableOpacity>
                        )}

                        {!!posterImage.trim() && (
                            <Image source={{ uri: posterImage.trim() }} style={styles.previewImage} />
                        )}
                    </View>

                    <TouchableOpacity
                        style={[styles.saveBigBtn, saving && { opacity: 0.6 }]}
                        onPress={handleSave}
                        disabled={saving}
                    >
                        {saving
                            ? <ActivityIndicator color="#fff" />
                            : <><MaterialIcons name="save" size={18} color="#fff" /><Text style={styles.saveBigBtnText}>Save Changes</Text></>}
                    </TouchableOpacity>

                    <View style={{ height: 32 }} />
                </ScrollView>
            </KeyboardAvoidingView>
        </InterCampusScreen>
    );
}

const styles = StyleSheet.create({
    container: { flex: 1, backgroundColor: '#f1f5f9' },
    center: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 8, backgroundColor: '#f1f5f9' },
    accessText: { fontSize: 14, color: '#64748b', fontWeight: '600' },

    header: {
        flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
        paddingHorizontal: 16, paddingVertical: 14,
        backgroundColor: '#fff', borderBottomWidth: 1, borderBottomColor: '#e2e8f0',
    },
    backBtn: { width: 36, height: 36, alignItems: 'center', justifyContent: 'center' },
    headerTitle: { fontSize: 16, fontWeight: '800', color: '#0f172a' },
    saveBtn: {
        backgroundColor: '#6366F1', borderRadius: 8,
        paddingHorizontal: 16, paddingVertical: 8,
    },
    saveBtnText: { color: '#fff', fontSize: 13, fontWeight: '800' },

    body: { padding: 16, gap: 16 },

    metaBanner: {
        flexDirection: 'row', alignItems: 'center', gap: 8,
        backgroundColor: '#f5f3ff', borderRadius: 10, padding: 10,
        borderWidth: 1, borderColor: '#ddd6fe',
    },
    metaBannerText: { fontSize: 12, color: '#6366F1', fontWeight: '700' },

    section: {
        backgroundColor: '#fff', borderRadius: 14,
        padding: 14, gap: 10,
        borderWidth: 1, borderColor: '#e2e8f0',
        shadowColor: '#000', shadowOffset: { width: 0, height: 1 },
        shadowOpacity: 0.04, shadowRadius: 3, elevation: 1,
    },
    sectionTitle: { fontSize: 13, fontWeight: '800', color: '#6366F1', marginBottom: 2 },

    fieldWrap: { gap: 4 },
    fieldLabel: { fontSize: 12, fontWeight: '700', color: '#475569' },
    input: {
        borderWidth: 1, borderColor: '#e2e8f0', borderRadius: 9,
        paddingHorizontal: 12, paddingVertical: 10,
        fontSize: 13, color: '#0f172a', backgroundColor: '#f8fafc',
    },
    inputMulti: { minHeight: 72, textAlignVertical: 'top' },

    segRow: { flexDirection: 'row', gap: 8 },
    segBtn: {
        flex: 1, alignItems: 'center', paddingVertical: 10, borderRadius: 9,
        backgroundColor: '#f1f5f9', borderWidth: 1, borderColor: '#e2e8f0',
    },
    segBtnActive: { backgroundColor: '#6366F1', borderColor: '#6366F1' },
    segText: { fontSize: 13, fontWeight: '700', color: '#64748b' },
    segTextActive: { color: '#fff' },

    saveBigBtn: {
        flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
        gap: 8, backgroundColor: '#6366F1', borderRadius: 14, paddingVertical: 15,
    },
    saveBigBtnText: { color: '#fff', fontSize: 15, fontWeight: '800' },

    uploadBtn: {
        marginTop: 6,
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 8,
        paddingVertical: 12,
        borderRadius: 10,
        borderWidth: 1,
        borderColor: '#99f6e4',
        backgroundColor: '#ecfeff',
    },
    uploadText: { color: '#6366F1', fontWeight: '700', fontSize: 13 },
    previewImage: {
        marginTop: 10,
        width: '100%',
        height: 160,
        borderRadius: 10,
        backgroundColor: '#e2e8f0',
    },
});
