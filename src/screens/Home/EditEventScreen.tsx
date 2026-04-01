import React, { useState, useEffect, useMemo } from 'react';
import * as ImagePicker from 'expo-image-picker';
import {
    View, Text, TextInput, TouchableOpacity, ScrollView,
    StyleSheet, Platform, Alert, Image, Modal, ActivityIndicator,
} from 'react-native';
import DateTimePicker from '@react-native-community/datetimepicker';
import { useNavigation, useRoute, RouteProp } from '@react-navigation/native';
import { StackNavigationProp } from '@react-navigation/stack';
import { MaterialIcons } from '@expo/vector-icons';
import Toast from 'react-native-toast-message';
import { isAdminRole } from '../../utils/roles';
import { RootStackParamList } from '../../navigation/types';
import { useAuth } from '../../contexts/AuthContext';
import { supabase } from '../../api/supabase';
import * as FileSystem from 'expo-file-system/legacy';
import { DEPARTMENT_OPTIONS, getDepartmentAcademicLimits } from '../../constants/academic';

type Nav = StackNavigationProp<RootStackParamList, 'EditEvent'>;
type RouteT = RouteProp<RootStackParamList, 'EditEvent'>;

interface EventFormData {
    title: string;
    description: string;
    event_type: string;
    start_date: Date;
    end_date: Date;
    venue: string;
    is_online: boolean;
    meeting_link: string;
    max_participants: number;
    registration_deadline: Date;
    banner_image: string;
    participation_type: 'individual' | 'team';
    min_team_size: number;
    max_team_size: number;
    eligibility_type: 'college' | 'department' | 'year' | 'department_year';
    eligible_departments: string[];
    eligible_years: number[];
}

const EVENT_TYPES = [
    { id: 'workshop', label: 'Workshop', icon: '🛠️' },
    { id: 'seminar', label: 'Seminar', icon: '🎓' },
    { id: 'hackathon', label: 'Hackathon', icon: '💻' },
    { id: 'competition', label: 'Competition', icon: '🏆' },
    { id: 'fest', label: 'Fest', icon: '🎉' },
    { id: 'other', label: 'Other', icon: '📅' },
];

export default function EditEventScreen() {
    const navigation = useNavigation<Nav>();
    const { params } = useRoute<RouteT>();
    const { user, profile } = useAuth();

    const [loading, setLoading] = useState(true);
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [uploading, setUploading] = useState(false);
    const [formData, setFormData] = useState<EventFormData>({
        title: '', description: '', event_type: '',
        start_date: new Date(), end_date: new Date(Date.now() + 2 * 3600000),
        venue: '', is_online: false, meeting_link: '',
        max_participants: 50, registration_deadline: new Date(Date.now() + 7 * 86400000),
        banner_image: '', participation_type: 'individual',
        min_team_size: 2, max_team_size: 5,
        eligibility_type: 'college', eligible_departments: [], eligible_years: [],
    });
    const [showPicker, setShowPicker] = useState<{ field: keyof EventFormData | null; mode: 'date' | 'time'; show: boolean }>({ field: null, mode: 'date', show: false });

    const globalMaxEventYear = useMemo(
        () => Math.max(...DEPARTMENT_OPTIONS.map((dept) => getDepartmentAcademicLimits(dept).maxYears)),
        []
    );

    const eventYearOptions = useMemo(() => {
        const needsDepartmentScopedYears =
            formData.eligibility_type === 'department_year' &&
            formData.eligible_departments.length > 0;
        const maxYears = needsDepartmentScopedYears
            ? Math.max(
                ...formData.eligible_departments.map(
                    (dept) => getDepartmentAcademicLimits(dept).maxYears
                )
            )
            : globalMaxEventYear;

        return Array.from({ length: maxYears }, (_, i) => i + 1);
    }, [formData.eligibility_type, formData.eligible_departments, globalMaxEventYear]);

    useEffect(() => {
        setFormData((prev) => {
            const sanitizedYears = prev.eligible_years.filter((year) => eventYearOptions.includes(year));
            if (sanitizedYears.length === prev.eligible_years.length) return prev;
            return { ...prev, eligible_years: sanitizedYears };
        });
    }, [eventYearOptions]);

    // Load existing event
    useEffect(() => {
        const load = async () => {
            const { data, error } = await supabase
                .from('events')
                .select('*')
                .eq('id', params.eventId)
                .single();
            if (error || !data) {
                Toast.show({ type: 'error', text1: 'Failed to load event' });
                navigation.goBack();
                return;
            }
            const d = data as any;
            setFormData({
                title: d.title ?? '',
                description: d.description ?? '',
                event_type: d.event_type ?? '',
                start_date: new Date(d.start_date),
                end_date: new Date(d.end_date),
                venue: d.venue ?? '',
                is_online: d.is_online ?? false,
                meeting_link: d.meeting_link ?? '',
                max_participants: d.max_participants ?? 50,
                registration_deadline: new Date(d.registration_deadline),
                banner_image: d.banner_image ?? '',
                participation_type: d.participation_type ?? 'individual',
                min_team_size: d.min_team_size ?? 2,
                max_team_size: d.max_team_size ?? 5,
                eligibility_type: d.eligibility_type ?? 'college',
                eligible_departments: d.eligible_departments ?? [],
                eligible_years: d.eligible_years ?? [],
            });
            setLoading(false);
        };
        load();
    }, [params.eventId]);

    const canEdit = profile && (
        profile.role === 'faculty' || isAdminRole(profile.role) ||
        profile.is_club_coordinator || profile.is_volunteer
    );

    // Banner image upload
    const pickImage = async () => {
        const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
        if (!perm.granted) { Toast.show({ type: 'error', text1: 'Gallery permission required' }); return; }
        const result = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ['images'], allowsEditing: true, aspect: [4, 3], quality: 0.8 });
        if (!result.canceled && result.assets?.length) await uploadImage(result.assets[0].uri);
    };

    const uploadImage = async (uri: string) => {
        try {
            setUploading(true);
            const fileExt = (uri.split('.').pop()?.split('?')[0] ?? 'jpg').toLowerCase();
            const fileName = `event-poster-${Date.now()}.${fileExt}`;
            const contentType = fileExt === 'png' ? 'image/png' : fileExt === 'webp' ? 'image/webp' : 'image/jpeg';

            const base64 = await FileSystem.readAsStringAsync(uri, { encoding: FileSystem.EncodingType.Base64 });
            const byteCharacters = atob(base64);
            const uint8Array = new Uint8Array(byteCharacters.length);
            for (let i = 0; i < byteCharacters.length; i++) uint8Array[i] = byteCharacters.charCodeAt(i);

            const { error } = await supabase.storage.from('event-banners').upload(fileName, uint8Array, { contentType, upsert: true });
            if (error) throw error;

            const { data: { publicUrl } } = supabase.storage.from('event-banners').getPublicUrl(fileName);
            setFormData(prev => ({ ...prev, banner_image: publicUrl }));
            Toast.show({ type: 'success', text1: 'Poster updated!' });
        } catch (err: any) {
            Toast.show({ type: 'error', text1: 'Upload failed', text2: err.message });
        } finally {
            setUploading(false);
        }
    };

    const validate = (): boolean => {
        if (!formData.title.trim()) { Toast.show({ type: 'error', text1: 'Title is required' }); return false; }
        if (!formData.description.trim()) { Toast.show({ type: 'error', text1: 'Description is required' }); return false; }
        if (!formData.event_type) { Toast.show({ type: 'error', text1: 'Select event type' }); return false; }
        if (formData.start_date >= formData.end_date) { Toast.show({ type: 'error', text1: 'End date must be after start date' }); return false; }
        if (formData.registration_deadline >= formData.start_date) { Toast.show({ type: 'error', text1: 'Deadline must be before event start' }); return false; }
        if (formData.is_online && !formData.meeting_link.trim()) { Toast.show({ type: 'error', text1: 'Meeting link required for online events' }); return false; }
        if (!formData.is_online && !formData.venue.trim()) { Toast.show({ type: 'error', text1: 'Venue required for offline events' }); return false; }
        if (['department', 'department_year'].includes(formData.eligibility_type) && formData.eligible_departments.length === 0) {
            Toast.show({ type: 'error', text1: 'Select at least one eligible department' });
            return false;
        }
        if (['year', 'department_year'].includes(formData.eligibility_type) && formData.eligible_years.length === 0) {
            Toast.show({ type: 'error', text1: 'Select at least one eligible year' });
            return false;
        }
        return true;
    };

    const handleSave = async () => {
        if (!canEdit) return;
        if (!validate()) return;
        try {
            setIsSubmitting(true);
            // @ts-ignore
            const { error } = await supabase.from('events').update({
                title: formData.title.trim(),
                description: formData.description.trim(),
                event_type: formData.event_type,
                start_date: formData.start_date.toISOString(),
                end_date: formData.end_date.toISOString(),
                venue: formData.venue.trim(),
                is_online: formData.is_online,
                meeting_link: formData.meeting_link.trim() || null,
                max_participants: formData.max_participants,
                registration_deadline: formData.registration_deadline.toISOString(),
                banner_image: formData.banner_image || null,
                participation_type: formData.participation_type,
                min_team_size: formData.participation_type === 'team' ? formData.min_team_size : null,
                max_team_size: formData.participation_type === 'team' ? formData.max_team_size : null,
                eligibility_type: formData.eligibility_type,
                eligible_departments: ['department', 'department_year'].includes(formData.eligibility_type) ? formData.eligible_departments : [],
                eligible_years: ['year', 'department_year'].includes(formData.eligibility_type) ? formData.eligible_years : [],
            }).eq('id', params.eventId);

            if (error) throw error;
            Toast.show({ type: 'success', text1: 'Event updated!', text2: 'Changes have been saved.' });
            navigation.goBack();
        } catch (err: any) {
            Toast.show({ type: 'error', text1: 'Failed to update event', text2: err.message });
        } finally {
            setIsSubmitting(false);
        }
    };

    const handleDateChange = (event: any, selectedDate?: Date) => {
        if (Platform.OS === 'android') setShowPicker({ field: null, mode: 'date', show: false });
        if (selectedDate && showPicker.field) {
            setFormData(prev => ({ ...prev, [showPicker.field as string]: selectedDate }));
            if (Platform.OS === 'ios' && showPicker.mode === 'date') {
                setTimeout(() => setShowPicker({ field: showPicker.field, mode: 'time', show: true }), 300);
            }
        }
    };

    if (loading) {
        return (
            <View style={[styles.container, { justifyContent: 'center', alignItems: 'center' }]}>
                <ActivityIndicator size="large" color="#a855f7" />
                <Text style={{ marginTop: 12, color: '#6b7280' }}>Loading event...</Text>
            </View>
        );
    }

    return (
        <View style={styles.container}>
            {/* Header */}
            <View style={styles.header}>
                <TouchableOpacity onPress={() => navigation.goBack()}>
                    <MaterialIcons name="arrow-back" size={24} color="#111" />
                </TouchableOpacity>
                <Text style={styles.headerTitle}>Edit Event</Text>
                <TouchableOpacity onPress={handleSave} disabled={isSubmitting} style={[styles.saveBtn, isSubmitting && { opacity: 0.5 }]}>
                    <Text style={styles.saveBtnText}>{isSubmitting ? 'Saving...' : 'Save'}</Text>
                </TouchableOpacity>
            </View>

            <ScrollView style={styles.content} showsVerticalScrollIndicator={false}>

                {/* Basic Info */}
                <View style={styles.section}>
                    <Text style={styles.sectionTitle}>Basic Info</Text>
                    <Text style={styles.label}>Title *</Text>
                    <TextInput style={styles.textInput} value={formData.title} onChangeText={t => setFormData(p => ({ ...p, title: t }))} placeholder="Event title" placeholderTextColor="#9ca3af" />
                    <Text style={styles.label}>Description *</Text>
                    <TextInput style={[styles.textInput, styles.textArea]} value={formData.description} onChangeText={t => setFormData(p => ({ ...p, description: t }))} placeholder="Describe the event" placeholderTextColor="#9ca3af" multiline numberOfLines={4} />
                </View>

                {/* Event Type */}
                <View style={styles.section}>
                    <Text style={styles.sectionTitle}>Event Type</Text>
                    <View style={styles.typeContainer}>
                        {EVENT_TYPES.map(type => {
                            const sel = formData.event_type === type.id;
                            return (
                                <TouchableOpacity key={type.id} style={[styles.typeChip, sel && styles.typeChipSelected]} onPress={() => setFormData(p => ({ ...p, event_type: type.id }))}>
                                    <Text style={styles.typeIcon}>{type.icon}</Text>
                                    <Text style={[styles.typeText, sel && styles.typeTextSelected]}>{type.label}</Text>
                                </TouchableOpacity>
                            );
                        })}
                    </View>
                </View>

                {/* Participation */}
                <View style={styles.section}>
                    <Text style={styles.sectionTitle}>Participation</Text>
                    <View style={styles.toggleContainer}>
                        <TouchableOpacity style={[styles.toggleButton, formData.participation_type === 'individual' && styles.toggleButtonActive]} onPress={() => setFormData(p => ({ ...p, participation_type: 'individual' }))}>
                            <Text style={[styles.toggleText, formData.participation_type === 'individual' && styles.toggleTextActive]}>👤 Individual</Text>
                        </TouchableOpacity>
                        <TouchableOpacity style={[styles.toggleButton, formData.participation_type === 'team' && styles.toggleButtonActive]} onPress={() => setFormData(p => ({ ...p, participation_type: 'team' }))}>
                            <Text style={[styles.toggleText, formData.participation_type === 'team' && styles.toggleTextActive]}>👥 Team</Text>
                        </TouchableOpacity>
                    </View>
                    {formData.participation_type === 'team' && (
                        <View style={{ marginTop: 14, gap: 10 }}>
                            <Text style={styles.label}>Min Team Size</Text>
                            <View style={styles.counterRow}>
                                <TouchableOpacity style={styles.counterBtn} onPress={() => setFormData(p => ({ ...p, min_team_size: Math.max(2, p.min_team_size - 1) }))}>
                                    <MaterialIcons name="remove" size={18} color="#374151" />
                                </TouchableOpacity>
                                <Text style={styles.counterVal}>{formData.min_team_size}</Text>
                                <TouchableOpacity style={styles.counterBtn} onPress={() => setFormData(p => ({ ...p, min_team_size: Math.min(p.max_team_size, p.min_team_size + 1) }))}>
                                    <MaterialIcons name="add" size={18} color="#374151" />
                                </TouchableOpacity>
                            </View>
                            <Text style={styles.label}>Max Team Size</Text>
                            <View style={styles.counterRow}>
                                <TouchableOpacity style={styles.counterBtn} onPress={() => setFormData(p => ({ ...p, max_team_size: Math.max(p.min_team_size, p.max_team_size - 1) }))}>
                                    <MaterialIcons name="remove" size={18} color="#374151" />
                                </TouchableOpacity>
                                <Text style={styles.counterVal}>{formData.max_team_size}</Text>
                                <TouchableOpacity style={styles.counterBtn} onPress={() => setFormData(p => ({ ...p, max_team_size: p.max_team_size + 1 }))}>
                                    <MaterialIcons name="add" size={18} color="#374151" />
                                </TouchableOpacity>
                            </View>
                        </View>
                    )}
                </View>

                {/* Eligibility */}
                <View style={styles.section}>
                    <Text style={styles.sectionTitle}>Eligibility</Text>
                    <Text style={styles.label}>Who can participate?</Text>
                    <View style={styles.typeContainer}>
                        {[{ id: 'college', label: '🏫 College-wide' }, { id: 'department', label: '🏛️ Department' }, { id: 'year', label: '📅 Year' }, { id: 'department_year', label: '🎯 Dept + Year' }].map(opt => {
                            const sel = formData.eligibility_type === opt.id;
                            return (
                                <TouchableOpacity key={opt.id} style={[styles.typeChip, sel && styles.typeChipSelected]} onPress={() => setFormData(p => ({ ...p, eligibility_type: opt.id as EventFormData['eligibility_type'], eligible_departments: [], eligible_years: [] }))}>
                                    <Text style={[styles.typeText, sel && styles.typeTextSelected]}>{opt.label}</Text>
                                </TouchableOpacity>
                            );
                        })}
                    </View>
                    {['department', 'department_year'].includes(formData.eligibility_type) && (
                        <>
                            <Text style={[styles.label, { marginTop: 12 }]}>Select Departments</Text>
                            <View style={styles.typeContainer}>
                                {DEPARTMENT_OPTIONS.map(dept => {
                                    const sel = formData.eligible_departments.includes(dept);
                                    return (
                                        <TouchableOpacity key={dept} style={[styles.typeChip, sel && styles.typeChipSelected]} onPress={() => setFormData(p => ({ ...p, eligible_departments: sel ? p.eligible_departments.filter(d => d !== dept) : [...p.eligible_departments, dept] }))}>
                                            <Text style={[styles.typeText, sel && styles.typeTextSelected]}>{dept}</Text>
                                        </TouchableOpacity>
                                    );
                                })}
                            </View>
                        </>
                    )}
                    {['year', 'department_year'].includes(formData.eligibility_type) && (
                        <>
                            <Text style={[styles.label, { marginTop: 12 }]}>Select Years</Text>
                            <View style={styles.typeContainer}>
                                {eventYearOptions.map(yr => {
                                    const sel = formData.eligible_years.includes(yr);
                                    return (
                                        <TouchableOpacity key={yr} style={[styles.typeChip, sel && styles.typeChipSelected]} onPress={() => setFormData(p => ({ ...p, eligible_years: sel ? p.eligible_years.filter(y => y !== yr) : [...p.eligible_years, yr] }))}>
                                            <Text style={[styles.typeText, sel && styles.typeTextSelected]}>Year {yr}</Text>
                                        </TouchableOpacity>
                                    );
                                })}
                            </View>
                        </>
                    )}
                </View>

                {/* Schedule */}
                <View style={styles.section}>
                    <Text style={styles.sectionTitle}>Schedule</Text>
                    {[
                        { label: 'Start Date & Time *', field: 'start_date' as keyof EventFormData },
                        { label: 'End Date & Time *', field: 'end_date' as keyof EventFormData },
                        { label: 'Registration Deadline *', field: 'registration_deadline' as keyof EventFormData },
                    ].map(({ label, field }) => (
                        <View key={field as string}>
                            <Text style={styles.label}>{label}</Text>
                            <View style={styles.dateTimeRow}>
                                <TouchableOpacity style={[styles.dateButton, { flex: 1 }]} onPress={() => setShowPicker({ field, mode: 'date', show: true })}>
                                    <MaterialIcons name="event" size={18} color="#a855f7" />
                                    <Text style={styles.dateText}>{(formData[field] as Date).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}</Text>
                                </TouchableOpacity>
                                <TouchableOpacity style={[styles.dateButton, { flex: 1 }]} onPress={() => setShowPicker({ field, mode: 'time', show: true })}>
                                    <MaterialIcons name="access-time" size={18} color="#10b981" />
                                    <Text style={styles.dateText}>{(formData[field] as Date).toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' })}</Text>
                                </TouchableOpacity>
                            </View>
                        </View>
                    ))}
                </View>

                {/* Location */}
                <View style={styles.section}>
                    <Text style={styles.sectionTitle}>Location</Text>
                    <View style={styles.toggleContainer}>
                        <TouchableOpacity style={[styles.toggleButton, !formData.is_online && styles.toggleButtonActive]} onPress={() => setFormData(p => ({ ...p, is_online: false }))}>
                            <Text style={[styles.toggleText, !formData.is_online && styles.toggleTextActive]}>Offline</Text>
                        </TouchableOpacity>
                        <TouchableOpacity style={[styles.toggleButton, formData.is_online && styles.toggleButtonActive]} onPress={() => setFormData(p => ({ ...p, is_online: true }))}>
                            <Text style={[styles.toggleText, formData.is_online && styles.toggleTextActive]}>Online</Text>
                        </TouchableOpacity>
                    </View>
                    {formData.is_online ? (
                        <>
                            <Text style={styles.label}>Meeting Link *</Text>
                            <TextInput style={styles.textInput} value={formData.meeting_link} onChangeText={t => setFormData(p => ({ ...p, meeting_link: t }))} placeholder="https://" placeholderTextColor="#9ca3af" autoCapitalize="none" />
                        </>
                    ) : (
                        <>
                            <Text style={styles.label}>Venue *</Text>
                            <TextInput style={styles.textInput} value={formData.venue} onChangeText={t => setFormData(p => ({ ...p, venue: t }))} placeholder="Event location" placeholderTextColor="#9ca3af" />
                        </>
                    )}
                </View>

                {/* Capacity */}
                <View style={styles.section}>
                    <Text style={styles.sectionTitle}>Capacity</Text>
                    <Text style={styles.label}>Max Participants <Text style={{ color: '#9ca3af', fontWeight: '400' }}>(max 1000)</Text></Text>
                    <View style={styles.counterRow}>
                        <TouchableOpacity style={styles.counterBtn} onPress={() => setFormData(p => ({ ...p, max_participants: Math.max(1, p.max_participants - 1) }))} disabled={formData.max_participants <= 1}>
                            <MaterialIcons name="remove" size={18} color={formData.max_participants <= 1 ? '#d1d5db' : '#374151'} />
                        </TouchableOpacity>
                        <Text style={styles.counterVal}>{formData.max_participants}</Text>
                        <TouchableOpacity style={styles.counterBtn} onPress={() => setFormData(p => ({ ...p, max_participants: Math.min(1000, p.max_participants + 1) }))} disabled={formData.max_participants >= 1000}>
                            <MaterialIcons name="add" size={18} color={formData.max_participants >= 1000 ? '#d1d5db' : '#374151'} />
                        </TouchableOpacity>
                    </View>
                </View>

                {/* Poster */}
                <View style={styles.section}>
                    <Text style={styles.sectionTitle}>Poster / Banner</Text>
                    <TouchableOpacity style={styles.uploadBtn} onPress={pickImage} disabled={uploading}>
                        <MaterialIcons name="image" size={18} color="#fff" />
                        <Text style={styles.uploadBtnText}>{uploading ? 'Uploading...' : formData.banner_image ? 'Change Poster' : 'Upload Poster'}</Text>
                    </TouchableOpacity>
                    {formData.banner_image ? (
                        <View style={{ marginTop: 10 }}>
                            <Image source={{ uri: formData.banner_image }} style={{ width: '100%', height: 180, borderRadius: 12 }} resizeMode="cover" />
                            <TouchableOpacity style={styles.removeImgBtn} onPress={() => setFormData(p => ({ ...p, banner_image: '' }))}>
                                <MaterialIcons name="delete" size={16} color="#ef4444" />
                                <Text style={{ color: '#ef4444', fontSize: 13, marginLeft: 4 }}>Remove poster</Text>
                            </TouchableOpacity>
                        </View>
                    ) : null}
                </View>

                <View style={{ height: 40 }} />
            </ScrollView>

            {/* Date/Time Pickers */}
            {showPicker.show && showPicker.field && (
                Platform.OS === 'ios' ? (
                    <Modal visible transparent animationType="slide" onRequestClose={() => setShowPicker({ field: null, mode: 'date', show: false })}>
                        <View style={styles.modalOverlay}>
                            <View style={styles.iosPickerContainer}>
                                <View style={styles.iosPickerHeader}>
                                    <TouchableOpacity onPress={() => setShowPicker({ field: null, mode: 'date', show: false })}>
                                        <Text style={styles.iosPickerCancel}>Cancel</Text>
                                    </TouchableOpacity>
                                    <Text style={styles.iosPickerTitle}>{showPicker.mode === 'date' ? 'Select Date' : 'Select Time'}</Text>
                                    <TouchableOpacity onPress={() => setShowPicker({ field: null, mode: 'date', show: false })}>
                                        <Text style={[styles.iosPickerCancel, { color: '#a855f7', fontWeight: '700' }]}>Done</Text>
                                    </TouchableOpacity>
                                </View>
                                <DateTimePicker
                                    value={formData[showPicker.field] as Date}
                                    mode={showPicker.mode}
                                    display="spinner"
                                    onChange={handleDateChange}
                                    textColor="#000"
                                    style={{ height: 200 }}
                                />
                            </View>
                        </View>
                    </Modal>
                ) : (
                    <DateTimePicker
                        value={formData[showPicker.field] as Date}
                        mode={showPicker.mode}
                        display="default"
                        onChange={handleDateChange}
                    />
                )
            )}
        </View>
    );
}

const styles = StyleSheet.create({
    container: { flex: 1, backgroundColor: '#f9fafb' },
    header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 16, paddingVertical: 14, backgroundColor: '#fff', borderBottomWidth: 1, borderBottomColor: '#e5e7eb', paddingTop: Platform.OS === 'ios' ? 50 : 14 },
    headerTitle: { fontSize: 17, fontWeight: '700', color: '#111827' },
    saveBtn: { backgroundColor: '#a855f7', paddingVertical: 7, paddingHorizontal: 16, borderRadius: 8 },
    saveBtnText: { color: '#fff', fontWeight: '700', fontSize: 14 },
    content: { flex: 1, paddingHorizontal: 16 },
    section: { backgroundColor: '#fff', borderRadius: 14, padding: 16, marginTop: 14, shadowColor: '#000', shadowOpacity: 0.04, shadowRadius: 4, elevation: 2 },
    sectionTitle: { fontSize: 15, fontWeight: '700', color: '#111827', marginBottom: 12 },
    label: { fontSize: 13, fontWeight: '600', color: '#374151', marginBottom: 6, marginTop: 8 },
    textInput: { backgroundColor: '#f3f4f6', borderRadius: 10, paddingHorizontal: 12, paddingVertical: 10, fontSize: 14, color: '#111827', borderWidth: 1, borderColor: '#e5e7eb' },
    textArea: { height: 90, textAlignVertical: 'top' },
    typeContainer: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
    typeChip: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 12, paddingVertical: 7, borderRadius: 20, backgroundColor: '#f3f4f6', borderWidth: 1.5, borderColor: '#e5e7eb', gap: 4 },
    typeChipSelected: { backgroundColor: '#f3e8ff', borderColor: '#a855f7' },
    typeIcon: { fontSize: 14 },
    typeText: { fontSize: 13, color: '#374151', fontWeight: '500' },
    typeTextSelected: { color: '#7e22ce', fontWeight: '700' },
    toggleContainer: { flexDirection: 'row', gap: 10, marginBottom: 4 },
    toggleButton: { flex: 1, paddingVertical: 10, borderRadius: 10, alignItems: 'center', backgroundColor: '#f3f4f6', borderWidth: 1.5, borderColor: '#e5e7eb' },
    toggleButtonActive: { backgroundColor: '#f3e8ff', borderColor: '#a855f7' },
    toggleText: { fontSize: 14, color: '#6b7280', fontWeight: '600' },
    toggleTextActive: { color: '#7e22ce' },
    counterRow: { flexDirection: 'row', alignItems: 'center', gap: 16 },
    counterBtn: { backgroundColor: '#f3f4f6', borderRadius: 10, padding: 8, borderWidth: 1, borderColor: '#e5e7eb' },
    counterVal: { fontSize: 18, fontWeight: '700', color: '#111827', minWidth: 40, textAlign: 'center' },
    dateTimeRow: { flexDirection: 'row', gap: 8 },
    dateButton: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 12, paddingVertical: 10, backgroundColor: '#f3f4f6', borderRadius: 10, borderWidth: 1, borderColor: '#e5e7eb' },
    dateText: { fontSize: 13, color: '#374151', fontWeight: '500' },
    uploadBtn: { flexDirection: 'row', alignItems: 'center', gap: 8, backgroundColor: '#a855f7', paddingVertical: 10, paddingHorizontal: 16, borderRadius: 10, alignSelf: 'flex-start' },
    uploadBtnText: { color: '#fff', fontWeight: '700', fontSize: 14 },
    removeImgBtn: { flexDirection: 'row', alignItems: 'center', marginTop: 8 },
    modalOverlay: { flex: 1, justifyContent: 'flex-end', backgroundColor: 'rgba(0,0,0,0.4)' },
    iosPickerContainer: { backgroundColor: '#fff', borderTopLeftRadius: 20, borderTopRightRadius: 20, paddingBottom: 30 },
    iosPickerHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: 20, paddingVertical: 14, borderBottomWidth: 1, borderBottomColor: '#e5e7eb' },
    iosPickerTitle: { fontSize: 15, fontWeight: '700', color: '#111827' },
    iosPickerCancel: { fontSize: 15, color: '#6b7280' },
});
