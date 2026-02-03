/**
 * EventChatScreen styles
 * Extracted to improve component readability
 */
import { StyleSheet, Dimensions, Platform } from 'react-native';

const { width: SCREEN_WIDTH } = Dimensions.get('window');

export const createStyles = (theme) =>
  StyleSheet.create({
    // Container styles
    container: {
      flex: 1,
      backgroundColor: theme.colors.background,
    },
    loadingContainer: {
      flex: 1,
      justifyContent: 'center',
      alignItems: 'center',
      backgroundColor: theme.colors.background,
    },
    errorContainer: {
      flex: 1,
      justifyContent: 'center',
      alignItems: 'center',
      padding: 20,
      backgroundColor: theme.colors.background,
    },
    errorText: {
      fontSize: 16,
      color: theme.colors.error || '#ff3b30',
      textAlign: 'center',
      marginBottom: 16,
    },
    retryButton: {
      backgroundColor: theme.colors.primary,
      paddingHorizontal: 20,
      paddingVertical: 10,
      borderRadius: 8,
    },
    retryButtonText: {
      color: '#fff',
      fontSize: 16,
      fontWeight: '600',
    },

    // Header styles
    header: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      paddingHorizontal: 12,
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
      marginRight: 8,
    },
    headerTitleContainer: {
      flex: 1,
    },
    headerTitle: {
      fontSize: 17,
      fontWeight: '600',
      color: theme.colors.text,
    },
    headerSubtitle: {
      fontSize: 12,
      color: theme.colors.textSecondary,
      marginTop: 1,
    },
    headerActions: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 4,
    },
    headerButton: {
      padding: 8,
    },

    // Join banner styles
    joinBanner: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      backgroundColor: `${theme.colors.primary}15`,
      paddingVertical: 12,
      paddingHorizontal: 16,
      borderBottomWidth: StyleSheet.hairlineWidth,
      borderBottomColor: theme.colors.border,
    },
    joinBannerText: {
      flex: 1,
      fontSize: 14,
      color: theme.colors.text,
      marginRight: 12,
    },
    joinButton: {
      backgroundColor: theme.colors.primary,
      paddingHorizontal: 16,
      paddingVertical: 8,
      borderRadius: 16,
    },
    joinButtonText: {
      color: '#fff',
      fontSize: 14,
      fontWeight: '600',
    },

    // Access denied styles
    accessDeniedContainer: {
      flex: 1,
      justifyContent: 'center',
      alignItems: 'center',
      padding: 24,
    },
    accessDeniedIcon: {
      marginBottom: 16,
    },
    accessDeniedTitle: {
      fontSize: 20,
      fontWeight: '600',
      color: theme.colors.text,
      marginBottom: 8,
      textAlign: 'center',
    },
    accessDeniedText: {
      fontSize: 15,
      color: theme.colors.textSecondary,
      textAlign: 'center',
      lineHeight: 22,
      marginBottom: 24,
    },
    requestButton: {
      backgroundColor: theme.colors.primary,
      paddingHorizontal: 24,
      paddingVertical: 12,
      borderRadius: 8,
    },
    requestButtonText: {
      color: '#fff',
      fontSize: 16,
      fontWeight: '600',
    },
    pendingBadge: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 8,
      backgroundColor: theme.colors.backgroundSecondary || theme.colors.card,
      paddingHorizontal: 16,
      paddingVertical: 10,
      borderRadius: 8,
    },
    pendingText: {
      fontSize: 15,
      color: theme.colors.textSecondary,
    },

    // Message list styles
    messageListContent: {
      paddingHorizontal: 12,
      paddingVertical: 8,
    },
    messageContainer: {
      marginVertical: 2,
      maxWidth: '80%',
    },
    ownMessage: {
      alignSelf: 'flex-end',
    },
    otherMessage: {
      alignSelf: 'flex-start',
    },
    messageBubble: {
      borderRadius: 16,
      paddingHorizontal: 14,
      paddingVertical: 10,
    },
    ownBubble: {
      backgroundColor: theme.colors.primary,
      borderBottomRightRadius: 4,
    },
    otherBubble: {
      backgroundColor: theme.colors.card,
      borderBottomLeftRadius: 4,
    },
    messageSender: {
      fontSize: 12,
      fontWeight: '600',
      color: theme.colors.primary,
      marginBottom: 2,
    },
    messageText: {
      fontSize: 15,
      lineHeight: 20,
    },
    ownMessageText: {
      color: '#fff',
    },
    otherMessageText: {
      color: theme.colors.text,
    },
    messageTime: {
      fontSize: 11,
      marginTop: 4,
      alignSelf: 'flex-end',
    },
    ownMessageTime: {
      color: 'rgba(255,255,255,0.7)',
    },
    otherMessageTime: {
      color: theme.colors.textSecondary,
    },
    emptyContainer: {
      flex: 1,
      justifyContent: 'center',
      alignItems: 'center',
      padding: 24,
      transform: [{ scaleY: -1 }],
    },
    emptyText: {
      fontSize: 16,
      color: theme.colors.textSecondary,
      textAlign: 'center',
    },

    // System message styles
    systemMessage: {
      alignSelf: 'center',
      backgroundColor:
        theme.colors.backgroundSecondary || `${theme.colors.text}10`,
      paddingHorizontal: 12,
      paddingVertical: 6,
      borderRadius: 12,
      marginVertical: 8,
    },
    systemMessageText: {
      fontSize: 13,
      color: theme.colors.textSecondary,
      fontStyle: 'italic',
    },

    // Date picker modal styles
    datePickerOverlay: {
      flex: 1,
      backgroundColor: 'rgba(0,0,0,0.5)',
      justifyContent: 'flex-end',
    },
    datePickerContainer: {
      backgroundColor: theme.colors.card,
      borderTopLeftRadius: 20,
      borderTopRightRadius: 20,
      paddingBottom: Platform.OS === 'ios' ? 34 : 20,
    },
    datePickerHeader: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      padding: 16,
      borderBottomWidth: StyleSheet.hairlineWidth,
      borderBottomColor: theme.colors.border,
    },
    datePickerTitle: {
      fontSize: 18,
      fontWeight: '600',
      color: theme.colors.text,
    },
    datePickerDone: {
      fontSize: 16,
      fontWeight: '600',
      color: theme.colors.primary,
    },
    datePicker: {
      height: 216,
    },

    // Keyboard avoiding styles
    keyboardAvoiding: {
      flex: 1,
    },
    chatContent: {
      flex: 1,
    },
  });

export default createStyles;
