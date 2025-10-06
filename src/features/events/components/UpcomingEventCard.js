import React, { useMemo } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  ImageBackground,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import Ionicons from '@expo/vector-icons/Ionicons';
import Avatar from '../../../components/ui/Avatar';
import AttendeeBubbleRow from './AttendeeBubbleRow';
import { shareEventDetails } from '../utils/shareUtils';
import { useTheme } from '../../../theme';

const FALLBACK_IMAGE = 'https://via.placeholder.com/400x300?text=Social+Circle';

export default function UpcomingEventCard({ event, onOpen, onPrimaryAction }) {
  const theme = useTheme();
  const styles = useMemo(() => createStyles(theme), [theme]);
  const eventDate = useMemo(() => {
    if (!event?.date) return null;
    if (typeof event.date?.toDate === 'function') return event.date.toDate();
    if (typeof event.date?.seconds === 'number')
      return new Date(event.date.seconds * 1000);
    if (event.date instanceof Date) return event.date;
    return null;
  }, [event?.date]);

  const formattedDate = useMemo(() => {
    if (!eventDate) return 'Date TBD';
    return eventDate.toLocaleString([], {
      weekday: 'short',
      month: 'short',
      day: 'numeric',
      hour: 'numeric',
      minute: 'numeric',
    });
  }, [eventDate]);

  const badge = useMemo(() => {
    if (event?.viewerStatus === 'hosting') return 'Hosting';
    if (event?.viewerStatus === 'attending') return 'Going';
    return 'Upcoming';
  }, [event?.viewerStatus]);

  const attendeesCount = Array.isArray(event?.attendees)
    ? event.attendees.length
    : typeof event?.attendeesCount === 'number'
    ? event.attendeesCount
    : 0;

  const actionLabel = useMemo(() => {
    if (event?.viewerStatus === 'hosting') return 'Manage';
    if (event?.viewerStatus === 'attending') return 'Open Chat';
    return 'View';
  }, [event?.viewerStatus]);

  const handleOpen = () => onOpen?.(event);
  const handleAction = () => onPrimaryAction?.(event);
  const handleShare = () =>
    shareEventDetails(event, {
      surface: 'upcoming_card',
      source: 'card_header',
    });

  return (
    <TouchableOpacity
      style={styles.card}
      onPress={handleOpen}
      activeOpacity={0.92}
    >
      <ImageBackground
        source={{ uri: event?.imageUrl || FALLBACK_IMAGE }}
        style={styles.media}
        imageStyle={styles.mediaImage}
      >
        <LinearGradient
          colors={['rgba(0,0,0,0.05)', 'rgba(0,0,0,0.55)']}
          style={styles.mediaOverlay}
        >
          <View style={styles.overlayHeader}>
            <View style={styles.badge}>
              <Text style={styles.badgeText}>{badge}</Text>
            </View>
            <TouchableOpacity
              style={styles.overlayShareButton}
              onPress={handleShare}
              hitSlop={{ top: 6, bottom: 6, left: 6, right: 6 }}
            >
              <Ionicons name='share-social-outline' size={20} color='#fff' />
            </TouchableOpacity>
          </View>

          {(eventDate || event?.interest) && (
            <View style={styles.overlayFooter}>
              {eventDate && (
                <View style={styles.datePill}>
                  <Text style={styles.dateMonth}>
                    {eventDate
                      .toLocaleString([], { month: 'short' })
                      .toUpperCase()}
                  </Text>
                  <Text style={styles.dateDay}>{eventDate.getDate()}</Text>
                </View>
              )}
              {event?.interest ? (
                <View
                  style={[
                    styles.categoryPillOverlay,
                    eventDate && styles.categoryPillWithDate,
                  ]}
                >
                  <Text style={styles.categoryPillText} numberOfLines={1}>
                    {event.interest}
                  </Text>
                </View>
              ) : null}
            </View>
          )}
        </LinearGradient>
      </ImageBackground>

      <View style={styles.content}>
        <Text style={styles.title} numberOfLines={1} ellipsizeMode='tail'>
          {event?.title || 'Untitled Event'}
        </Text>

        <View style={styles.hostRow}>
          <Avatar uri={event?.hostPhoto} size={36} />
          <View style={styles.hostDetails}>
            <Text style={styles.hostName} numberOfLines={1}>
              {event?.hostName || 'Unknown Host'}
            </Text>
            <View style={styles.metaRow}>
              <Text style={styles.dateText} numberOfLines={1}>
                {formattedDate}
              </Text>
            </View>
            {event?.address && (
              <Text
                style={styles.locationText}
                numberOfLines={2}
                ellipsizeMode='tail'
              >
                {event.address}
              </Text>
            )}
          </View>
        </View>

        <View style={styles.footer}>
          <View style={styles.attendeeBlock}>
            {attendeesCount > 0 ? (
              <>
                <AttendeeBubbleRow
                  attendees={event?.attendees || []}
                  snippets={event?.attendeeSnippets || null}
                  countOverride={
                    typeof event?.attendeesCount === 'number'
                      ? event.attendeesCount
                      : null
                  }
                />
                <Text style={styles.attendeesLabel} numberOfLines={1}>
                  {attendeesCount} going
                </Text>
              </>
            ) : (
              <Text style={styles.attendeesLabelMuted} numberOfLines={1}>
                Be the first to join
              </Text>
            )}
          </View>

          <TouchableOpacity
            style={styles.primaryButton}
            onPress={handleAction}
            activeOpacity={0.9}
          >
            <Text style={styles.primaryButtonText}>{actionLabel}</Text>
          </TouchableOpacity>
        </View>
      </View>
    </TouchableOpacity>
  );
}

// Description: Create theme-aware styles for UpcomingEventCard
const createStyles = (theme) =>
  StyleSheet.create({
    card: {
      width: 208,
      height: 320,
      borderRadius: 20,
      overflow: 'hidden',
      backgroundColor: theme.colors.card,
      elevation: 4,
      shadowColor: '#1f2937',
      shadowOpacity: theme.isDark ? 0.5 : 0.12,
      shadowRadius: 12,
      shadowOffset: { width: 0, height: 6 },
    },
    media: {
      height: 140,
      width: '100%',
    },
    mediaImage: {
      width: '100%',
      height: '100%',
    },
    mediaOverlay: {
      flex: 1,
      justifyContent: 'space-between',
      padding: 12,
    },
    overlayHeader: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'center',
    },
    overlayFooter: {
      flexDirection: 'row',
      alignItems: 'flex-end',
    },
    badge: {
      alignSelf: 'flex-start',
      backgroundColor: 'rgba(0,0,0,0.45)',
      paddingHorizontal: 10,
      paddingVertical: 4,
      borderRadius: 14,
    },
    overlayShareButton: {
      padding: 4,
      marginLeft: 8,
    },
    badgeText: {
      fontSize: 11,
      letterSpacing: 0.4,
      color: '#fff',
      fontWeight: '600',
      textTransform: 'uppercase',
    },
    datePill: {
      alignSelf: 'flex-start',
      backgroundColor: '#fff',
      paddingHorizontal: 10,
      paddingVertical: 6,
      borderRadius: 12,
    },
    categoryPillOverlay: {
      alignSelf: 'flex-start',
      backgroundColor: 'rgba(0,0,0,0.45)',
      paddingHorizontal: 10,
      paddingVertical: 6,
      borderRadius: 12,
      maxWidth: 120,
    },
    categoryPillWithDate: {
      marginLeft: 8,
      marginTop: 16,
    },
    categoryPillText: {
      fontSize: 11,
      fontWeight: '600',
      color: '#fff',
    },
    dateMonth: {
      fontSize: 11,
      fontWeight: '700',
      color: '#1f2937',
    },
    dateDay: {
      fontSize: 16,
      fontWeight: '700',
      color: '#1f2937',
    },
    content: {
      flex: 1,
      paddingHorizontal: 14,
      paddingVertical: 12,
      gap: 10,
    },
    title: {
      fontSize: 16,
      fontWeight: '700',
      color: theme.colors.text,
    },
    hostRow: {
      flexDirection: 'row',
      alignItems: 'center',
    },
    hostDetails: {
      marginLeft: 8,
      flex: 1,
    },
    hostName: {
      fontSize: 13,
      fontWeight: '600',
      color: theme.colors.text,
    },
    metaRow: {
      flexDirection: 'row',
      alignItems: 'center',
      marginTop: 2,
    },
    dateText: {
      fontSize: 12,
      color: theme.colors.textSecondary,
    },
    metaSeparator: {
      width: 4,
      height: 4,
      borderRadius: 2,
      backgroundColor: theme.isDark ? '#475569' : '#d1d5db',
      marginHorizontal: 6,
    },
    categoryText: {
      fontSize: 12,
      color: theme.colors.textSecondary,
      fontWeight: '600',
    },
    locationText: {
      fontSize: 12,
      color: theme.colors.primary,
      marginTop: 4,
    },
    footer: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
    },
    attendeeBlock: {
      flex: 1,
      marginRight: 12,
      justifyContent: 'center',
      alignItems: 'flex-start',
    },
    attendeesLabel: {
      fontSize: 12,
      fontWeight: '600',
      color: theme.colors.text,
    },
    attendeesLabelMuted: {
      fontSize: 12,
      fontWeight: '500',
      color: theme.colors.textSecondary,
    },
    primaryButton: {
      backgroundColor: theme.colors.primary,
      paddingHorizontal: 14,
      paddingVertical: 8,
      borderRadius: 999,
    },
    primaryButtonText: {
      color: theme.colors.chipTextActive,
      fontWeight: '600',
      fontSize: 12,
    },
  });
