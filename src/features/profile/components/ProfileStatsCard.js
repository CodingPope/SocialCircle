/**
 * ProfileStatsCard - Statistics card showing friends, events, and rating
 * Extracted from ProfileScreen for reusability
 */
import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import MaterialIcons from '@expo/vector-icons/MaterialIcons';

export default function ProfileStatsCard({
  followerCount = 0,
  eventCount = 0,
  rating = 0,
  ratingCount = 0,
  theme,
  onFriendsPress,
  onEventsPress,
}) {
  const styles = createStyles(theme);

  return (
    <View style={styles.statsRow}>
      <TouchableOpacity style={styles.statCard} onPress={onFriendsPress}>
        <Text style={styles.statValue}>{followerCount}</Text>
        <Text style={styles.statLabel}>Friends</Text>
      </TouchableOpacity>

      <TouchableOpacity style={styles.statCard} onPress={onEventsPress}>
        <Text style={styles.statValue}>{eventCount}</Text>
        <Text style={styles.statLabel}>Events</Text>
      </TouchableOpacity>

      <View style={styles.statCard}>
        <View style={styles.ratingRow}>
          <MaterialIcons name='star' size={20} color='#FFD700' />
          <Text style={styles.statValue}>
            {rating > 0 ? rating.toFixed(1) : '0'}
          </Text>
        </View>
        <Text style={styles.statLabel}>
          {ratingCount > 0
            ? `${ratingCount} rating${ratingCount !== 1 ? 's' : ''}`
            : 'No ratings'}
        </Text>
      </View>
    </View>
  );
}

const createStyles = (theme) =>
  StyleSheet.create({
    statsRow: {
      flexDirection: 'row',
      justifyContent: 'space-around',
      marginTop: -50,
      paddingHorizontal: 10,
    },
    statCard: {
      backgroundColor: theme.colors.card,
      paddingVertical: 12,
      paddingHorizontal: 20,
      borderRadius: 12,
      alignItems: 'center',
      elevation: 3,
      shadowColor: '#000',
      shadowOpacity: theme.isDark ? 0.35 : 0.1,
      shadowRadius: 4,
    },
    statValue: {
      fontSize: 18,
      fontWeight: 'bold',
      color: theme.colors.text,
    },
    statLabel: {
      fontSize: 13,
      color: theme.colors.textSecondary,
      marginTop: 2,
    },
    ratingRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 4,
    },
  });
