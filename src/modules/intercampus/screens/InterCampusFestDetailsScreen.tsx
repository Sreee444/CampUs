import React, { useMemo } from 'react';
import { SafeAreaView, ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { MaterialIcons } from '@expo/vector-icons';
import { RouteProp, useNavigation, useRoute } from '@react-navigation/native';
import { StackNavigationProp } from '@react-navigation/stack';
import { RootStackParamList } from '../../../navigation/types';
import { useAuth } from '../../../contexts/AuthContext';
import { useInterCampusEvents } from '../hooks/useInterCampusEvents';
import InterCampusEventCard from '../components/InterCampusEventCard';
import InterCampusState from '../components/InterCampusState';

type Route = RouteProp<RootStackParamList, 'InterCampusFestDetails'>;
type Nav = StackNavigationProp<RootStackParamList>;

export default function InterCampusFestDetailsScreen() {
  const route = useRoute<Route>();
  const navigation = useNavigation<Nav>();
  const { user } = useAuth();
  const { events, loading } = useInterCampusEvents(user?.id);

  const festEvents = useMemo(
    () =>
      events.filter(
        (event) =>
          event.fest_name?.trim() === route.params.festName &&
          event.college_name === route.params.collegeName,
      ),
    [events, route.params.collegeName, route.params.festName],
  );

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation.goBack()}>
          <MaterialIcons name="arrow-back" size={24} color="#0f172a" />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>{route.params.festName}</Text>
        <View style={{ width: 24 }} />
      </View>

      <ScrollView contentContainerStyle={styles.content}>
        <Text style={styles.subTitle}>{route.params.collegeName}</Text>
        {loading ? (
          <InterCampusState loading title="Loading fest events" />
        ) : festEvents.length === 0 ? (
          <InterCampusState title="No events found" subtitle="This fest card currently has no verified events." />
        ) : (
          festEvents.map((event) => (
            <InterCampusEventCard
              key={event.id}
              event={event}
              onPress={() => navigation.navigate('InterCampusEventDetails', { eventId: event.id })}
            />
          ))
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#f8fafc' },
  header: {
    paddingHorizontal: 16,
    paddingVertical: 12,
    backgroundColor: '#ffffff',
    borderBottomWidth: 1,
    borderBottomColor: '#e2e8f0',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  headerTitle: { fontSize: 16, fontWeight: '700', color: '#0f172a' },
  content: { padding: 16 },
  subTitle: { marginBottom: 10, fontSize: 13, color: '#64748b', fontWeight: '600' },
});
