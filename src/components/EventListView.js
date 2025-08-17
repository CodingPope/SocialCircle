import React, { useState, useEffect, useMemo, useRef } from 'react';
import { View, Text, StyleSheet } from 'react-native';
import BottomSheet, {
  BottomSheetBackdrop,
  BottomSheetFlatList,
} from '@gorhom/bottom-sheet';
import EventPopUpCard from './EventPopUpCard';
import PostCard from './PostCard';
import { collection, getDocs, query, where } from 'firebase/firestore';
import { db } from '../firebase/config';
import { getUserById } from '../services/userService';

const EventListView = ({ events, onCloseListView }) => {
  const [selectedEvent, setSelectedEvent] = useState(null);
  const [enhancedEvents, setEnhancedEvents] = useState([]);
  const bottomSheetRef = useRef(null);
  const snapPoints = useMemo(() => ['93%'], []);

  // Description: Deduplicate incoming events by id to prevent double rendering
  const uniqueEvents = useMemo(() => {
    const map = new Map();
    (events || []).forEach((ev) => {
      if (ev && ev.id && !map.has(ev.id)) map.set(ev.id, ev);
    });
    return Array.from(map.values());
  }, [events]);

  const handleEventPress = (event) => setSelectedEvent(event);
  const closeModal = () => setSelectedEvent(null);

  // Description: Batch fetch host photos/ratings for all unique ownerIds (chunks of 10)
  const fetchHostPhotosAndRatings = async () => {
    try {
      const ownerIds = [
        ...new Set(uniqueEvents.map((e) => e?.ownerId).filter(Boolean)),
      ];
      const chunks = [];
      for (let i = 0; i < ownerIds.length; i += 10)
        chunks.push(ownerIds.slice(i, i + 10));

      const usersMap = new Map();
      for (const chunk of chunks) {
        const q = query(
          collection(db, 'users'),
          where('__name__', 'in', chunk)
        );
        const snap = await getDocs(q);
        for (const d of snap.docs) usersMap.set(d.id, d.data());
      }

      // Map events to enhanced objects; keep unique by id just in case
      const enhanced = uniqueEvents.map((event) => {
        const userData = event?.ownerId ? usersMap.get(event.ownerId) : null;
        const hostName =
          userData?.displayName ||
          userData?.username ||
          userData?.name ||
          `${userData?.firstName || ''} ${userData?.lastName || ''}`.trim() ||
          event.ownerName ||
          'Unknown Host';
        return {
          ...event,
          hostPhoto: userData?.profileImage || userData?.avatarURL || null,
          hostRating:
            typeof userData?.rating === 'number' ? userData.rating : 0,
          hostName,
        };
      });

      // Final de-duplication by id to prevent doubles in UI
      const finalMap = new Map();
      for (const ev of enhanced) if (ev?.id) finalMap.set(ev.id, ev);
      setEnhancedEvents(Array.from(finalMap.values()));
    } catch (err) {
      console.warn('[EventListView] Failed to fetch host data:', err);
      // Fallback: just pass through uniqueEvents without host metadata
      setEnhancedEvents(uniqueEvents);
    }
  };

  useEffect(() => {
    fetchHostPhotosAndRatings();
  }, [uniqueEvents]);

  const renderHeader = () => (
    <View style={styles.sheetHeader}>
      <View style={styles.dragBarContainer}>
        <View style={styles.dragBar} />
      </View>
      <Text style={styles.sheetTitle}>List view</Text>
    </View>
  );

  return (
    <BottomSheet
      ref={bottomSheetRef}
      index={1}
      snapPoints={snapPoints}
      enablePanDownToClose
      onClose={onCloseListView}
      backdropComponent={(props) => (
        <BottomSheetBackdrop
          {...props}
          disappearsOnIndex={-1}
          appearsOnIndex={0}
          pressBehavior='close'
        />
      )}
      backgroundStyle={styles.bottomSheetBg}
      handleComponent={renderHeader}
    >
      <BottomSheetFlatList
        data={enhancedEvents}
        keyExtractor={(item) => item.id}
        contentContainerStyle={styles.listContainer}
        renderItem={({ item }) => (
          <PostCard
            event={{
              ...item,
              address: item.address, // Pass address directly
              location: item.location, // Pass location for fallback
              formattedDate: item.formattedDate, // Ensure date is passed
              interest: item.interest, // Pass interest
              attendees: item.attendees, // Pass attendees
            }}
            onPress={() => handleEventPress(item)}
            onJoinPress={() => console.log('Join event logic')}
            onEllipsisPress={() => console.log('Ellipsis logic')}
          />
        )}
      />

      {selectedEvent && (
        <EventPopUpCard
          event={selectedEvent}
          onClose={closeModal}
          onJoin={() => {
            console.log('Join event logic here');
            closeModal();
          }}
        />
      )}
    </BottomSheet>
  );
};

const styles = StyleSheet.create({
  bottomSheetBg: {
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    backgroundColor: '#fff',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: -2 },
    shadowOpacity: 0.12,
    shadowRadius: 8,
    elevation: 8,
  },
  sheetHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingTop: 10,
    paddingBottom: 6,
    backgroundColor: '#fff',
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    justifyContent: 'center',
  },
  dragBarContainer: {
    position: 'absolute',
    top: 4,
    left: 0,
    right: 0,
    alignItems: 'center',
    zIndex: 20,
  },
  dragBar: {
    width: 40,
    height: 5,
    borderRadius: 2.5,
    backgroundColor: '#e0e0e0',
    marginBottom: 4,
  },
  sheetTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    marginLeft: 12,
    color: '#222',
    marginTop: 8,
  },
  listContainer: {
    padding: 10,
  },
});

export default EventListView;
