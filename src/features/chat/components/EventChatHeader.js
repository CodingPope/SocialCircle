/**
 * EventChatHeader - Header component for EventChatScreen
 * Contains back button, title, and action buttons (share, pin, info)
 */
import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import Ionicons from 'react-native-vector-icons/Ionicons';

export default function EventChatHeader({
  title,
  subtitle,
  theme,
  onBack,
  onShare,
  onPinPress,
  onInfoPress,
  isHost,
  hasPinned,
  canShare = true,
}) {
  const styles = createStyles(theme);

  return (
    <View style={styles.header}>
      <View style={styles.headerLeft}>
        <TouchableOpacity style={styles.backButton} onPress={onBack}>
          <Ionicons name='chevron-back' size={26} color={theme.colors.text} />
        </TouchableOpacity>
        <View style={styles.titleContainer}>
          <Text style={styles.title} numberOfLines={1}>
            {title || 'Chat'}
          </Text>
          {subtitle && (
            <Text style={styles.subtitle} numberOfLines={1}>
              {subtitle}
            </Text>
          )}
        </View>
      </View>

      <View style={styles.headerActions}>
        {canShare && (
          <TouchableOpacity style={styles.actionButton} onPress={onShare}>
            <Ionicons
              name='share-outline'
              size={22}
              color={theme.colors.text}
            />
          </TouchableOpacity>
        )}

        {isHost && (
          <TouchableOpacity style={styles.actionButton} onPress={onPinPress}>
            <Ionicons
              name={hasPinned ? 'megaphone' : 'megaphone-outline'}
              size={22}
              color={hasPinned ? theme.colors.primary : theme.colors.text}
            />
          </TouchableOpacity>
        )}

        <TouchableOpacity style={styles.actionButton} onPress={onInfoPress}>
          <Ionicons
            name='information-circle-outline'
            size={24}
            color={theme.colors.text}
          />
        </TouchableOpacity>
      </View>
    </View>
  );
}

const createStyles = (theme) =>
  StyleSheet.create({
    header: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      paddingHorizontal: 8,
      paddingVertical: 10,
      backgroundColor: theme.colors.card,
      borderBottomWidth: StyleSheet.hairlineWidth,
      borderBottomColor: theme.colors.border,
    },
    headerLeft: {
      flexDirection: 'row',
      alignItems: 'center',
      flex: 1,
    },
    backButton: {
      padding: 4,
      marginRight: 4,
    },
    titleContainer: {
      flex: 1,
    },
    title: {
      fontSize: 17,
      fontWeight: '600',
      color: theme.colors.text,
    },
    subtitle: {
      fontSize: 12,
      color: theme.colors.textSecondary,
      marginTop: 1,
    },
    headerActions: {
      flexDirection: 'row',
      alignItems: 'center',
    },
    actionButton: {
      padding: 8,
    },
  });
