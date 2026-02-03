/**
 * EventInfoModal - Sidebar modal for viewing/editing event details
 * Extracted from EventChatScreen to improve readability and maintainability
 */
import React, { useState, useCallback } from 'react';
import {
  View,
  Text,
  Modal,
  ScrollView,
  TouchableOpacity,
  TextInput,
  Image,
  StyleSheet,
  Dimensions,
  ActivityIndicator,
  Platform,
} from 'react-native';
import Ionicons from 'react-native-vector-icons/Ionicons';
import smileDefault from '../../../../assets/smileDefault.png';

const { width: SCREEN_WIDTH } = Dimensions.get('window');

// Description: Attendee list item with avatar, name, rating, and optional actions
function AttendeeRow({
  attendee,
  isHost,
  isCurrentUser,
  canEdit,
  onRemove,
  theme,
  styles,
}) {
  const avatarSource = attendee?.photoURL
    ? { uri: attendee.photoURL }
    : smileDefault;

  return (
    <View style={styles.attendeeRow}>
      <Image source={avatarSource} style={styles.attendeeAvatar} />
      <View style={styles.attendeeInfo}>
        <Text style={styles.attendeeName} numberOfLines={1}>
          {attendee?.displayName || 'User'}
          {isHost && <Text style={styles.hostLabel}> (Host)</Text>}
          {isCurrentUser && <Text style={styles.youLabel}> (You)</Text>}
        </Text>
        {typeof attendee?.rating === 'number' && (
          <View style={styles.ratingContainer}>
            <Ionicons name='star' size={12} color='#FFD700' />
            <Text style={styles.ratingText}>{attendee.rating.toFixed(1)}</Text>
          </View>
        )}
      </View>
      {canEdit && !isHost && !isCurrentUser && (
        <TouchableOpacity
          style={styles.removeButton}
          onPress={() => onRemove(attendee.id)}
        >
          <Ionicons
            name='close-circle'
            size={20}
            color={theme.colors.error || '#ff3b30'}
          />
        </TouchableOpacity>
      )}
    </View>
  );
}

// Description: Requester row with accept/decline buttons
function RequesterRow({
  requester,
  onAccept,
  onDecline,
  accepting,
  declining,
  theme,
  styles,
}) {
  const avatarSource = requester?.photoURL
    ? { uri: requester.photoURL }
    : smileDefault;
  const isProcessing = accepting || declining;

  return (
    <View style={styles.requesterRow}>
      <Image source={avatarSource} style={styles.requesterAvatar} />
      <View style={styles.requesterInfo}>
        <Text style={styles.requesterName} numberOfLines={1}>
          {requester?.displayName || 'User'}
        </Text>
      </View>
      <View style={styles.requestActions}>
        <TouchableOpacity
          style={[styles.acceptButton, isProcessing && styles.buttonDisabled]}
          onPress={() => onAccept(requester.id)}
          disabled={isProcessing}
        >
          {accepting ? (
            <ActivityIndicator size='small' color='#fff' />
          ) : (
            <Ionicons name='checkmark' size={18} color='#fff' />
          )}
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.declineButton, isProcessing && styles.buttonDisabled]}
          onPress={() => onDecline(requester.id)}
          disabled={isProcessing}
        >
          {declining ? (
            <ActivityIndicator size='small' color='#fff' />
          ) : (
            <Ionicons name='close' size={18} color='#fff' />
          )}
        </TouchableOpacity>
      </View>
    </View>
  );
}

export default function EventInfoModal({
  visible,
  onClose,
  theme,
  event,
  attendees,
  requesters,
  hostUser,
  currentUserId,
  isHost,
  canEdit,
  // Location editing
  locationLabel,
  editedLocation,
  editedAddress,
  editedCoords,
  setEditedLocation,
  setEditedAddress,
  setEditedCoords,
  onLocationPick,
  // Description editing
  editedDescription,
  setEditedDescription,
  // Date/time editing
  editedDate,
  editedTime,
  editedEndTime,
  onOpenDatePicker,
  onOpenTimePicker,
  onOpenEndTimePicker,
  formatDisplayDate,
  formatDisplayTime,
  // Edit mode
  isEditMode,
  setEditMode,
  onSaveEdits,
  saving,
  // Request handlers
  onAcceptRequest,
  onDeclineRequest,
  acceptingId,
  decliningId,
  // Attendee actions
  onRemoveUser,
  removingUserId,
  // Event actions
  onLeaveEvent,
  onDeleteEvent,
  onReportEvent,
  leaving,
  deleting,
}) {
  const styles = createStyles(theme);

  const handleSave = useCallback(() => {
    onSaveEdits();
  }, [onSaveEdits]);

  const handleCancel = useCallback(() => {
    setEditMode(false);
  }, [setEditMode]);

  // Description: Section header with optional action button
  const SectionHeader = ({
    title,
    actionLabel,
    onAction,
    showAction = true,
  }) => (
    <View style={styles.sectionHeader}>
      <Text style={styles.sectionTitle}>{title}</Text>
      {showAction && onAction && (
        <TouchableOpacity onPress={onAction}>
          <Text style={styles.sectionAction}>{actionLabel}</Text>
        </TouchableOpacity>
      )}
    </View>
  );

  return (
    <Modal
      visible={visible}
      animationType='slide'
      transparent={true}
      onRequestClose={onClose}
    >
      <View style={styles.modalOverlay}>
        <View style={styles.modalContainer}>
          {/* Header */}
          <View style={styles.modalHeader}>
            <Text style={styles.modalTitle} numberOfLines={1}>
              {event?.title || 'Event Info'}
            </Text>
            <TouchableOpacity style={styles.closeButton} onPress={onClose}>
              <Ionicons name='close' size={24} color={theme.colors.text} />
            </TouchableOpacity>
          </View>

          <ScrollView
            style={styles.modalContent}
            contentContainerStyle={styles.modalContentContainer}
            showsVerticalScrollIndicator={false}
          >
            {/* Location Section */}
            <View style={styles.section}>
              <SectionHeader
                title='Location'
                actionLabel={isEditMode ? 'Pick' : 'Edit'}
                onAction={isEditMode ? onLocationPick : () => setEditMode(true)}
                showAction={canEdit}
              />
              {isEditMode ? (
                <View>
                  <TextInput
                    style={styles.editInput}
                    value={editedLocation}
                    onChangeText={setEditedLocation}
                    placeholder='Location name'
                    placeholderTextColor={theme.colors.textSecondary}
                  />
                  <TextInput
                    style={[styles.editInput, styles.addressInput]}
                    value={editedAddress}
                    onChangeText={setEditedAddress}
                    placeholder='Address'
                    placeholderTextColor={theme.colors.textSecondary}
                    multiline
                  />
                </View>
              ) : (
                <Text style={styles.infoText}>
                  {locationLabel ||
                    event?.locationName ||
                    event?.address ||
                    'No location set'}
                </Text>
              )}
            </View>

            {/* Date & Time Section */}
            <View style={styles.section}>
              <SectionHeader
                title='Date & Time'
                actionLabel='Edit'
                onAction={() => setEditMode(true)}
                showAction={canEdit && !isEditMode}
              />
              {isEditMode ? (
                <View style={styles.dateTimeEditContainer}>
                  <TouchableOpacity
                    style={styles.dateTimeButton}
                    onPress={onOpenDatePicker}
                  >
                    <Ionicons
                      name='calendar-outline'
                      size={18}
                      color={theme.colors.primary}
                    />
                    <Text style={styles.dateTimeButtonText}>
                      {formatDisplayDate(editedDate)}
                    </Text>
                  </TouchableOpacity>
                  <View style={styles.timeRow}>
                    <TouchableOpacity
                      style={[styles.dateTimeButton, styles.timeButton]}
                      onPress={onOpenTimePicker}
                    >
                      <Ionicons
                        name='time-outline'
                        size={18}
                        color={theme.colors.primary}
                      />
                      <Text style={styles.dateTimeButtonText}>
                        {formatDisplayTime(editedTime)}
                      </Text>
                    </TouchableOpacity>
                    <Text style={styles.timeSeparator}>to</Text>
                    <TouchableOpacity
                      style={[styles.dateTimeButton, styles.timeButton]}
                      onPress={onOpenEndTimePicker}
                    >
                      <Ionicons
                        name='time-outline'
                        size={18}
                        color={theme.colors.primary}
                      />
                      <Text style={styles.dateTimeButtonText}>
                        {formatDisplayTime(editedEndTime)}
                      </Text>
                    </TouchableOpacity>
                  </View>
                </View>
              ) : (
                <View>
                  <Text style={styles.infoText}>
                    {formatDisplayDate(event?.startTime || event?.date)}
                  </Text>
                  <Text style={styles.infoTextSecondary}>
                    {formatDisplayTime(event?.startTime || event?.time)} -{' '}
                    {formatDisplayTime(event?.endTime)}
                  </Text>
                </View>
              )}
            </View>

            {/* Description Section */}
            <View style={styles.section}>
              <SectionHeader
                title='Description'
                actionLabel='Edit'
                onAction={() => setEditMode(true)}
                showAction={canEdit && !isEditMode}
              />
              {isEditMode ? (
                <TextInput
                  style={[styles.editInput, styles.descriptionInput]}
                  value={editedDescription}
                  onChangeText={setEditedDescription}
                  placeholder='Event description...'
                  placeholderTextColor={theme.colors.textSecondary}
                  multiline
                  textAlignVertical='top'
                />
              ) : (
                <Text style={styles.infoText}>
                  {event?.description || 'No description'}
                </Text>
              )}
            </View>

            {/* Edit Actions */}
            {isEditMode && (
              <View style={styles.editActions}>
                <TouchableOpacity
                  style={[styles.actionButton, styles.cancelButton]}
                  onPress={handleCancel}
                  disabled={saving}
                >
                  <Text style={styles.cancelButtonText}>Cancel</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={[
                    styles.actionButton,
                    styles.saveButton,
                    saving && styles.buttonDisabled,
                  ]}
                  onPress={handleSave}
                  disabled={saving}
                >
                  {saving ? (
                    <ActivityIndicator size='small' color='#fff' />
                  ) : (
                    <Text style={styles.saveButtonText}>Save Changes</Text>
                  )}
                </TouchableOpacity>
              </View>
            )}

            {/* Attendees Section */}
            <View style={styles.section}>
              <SectionHeader
                title={`Attendees (${attendees?.length || 0})`}
                showAction={false}
              />
              {attendees && attendees.length > 0 ? (
                attendees.map((attendee) => (
                  <AttendeeRow
                    key={attendee.id}
                    attendee={attendee}
                    isHost={attendee.id === event?.ownerId}
                    isCurrentUser={attendee.id === currentUserId}
                    canEdit={isHost && !isEditMode}
                    onRemove={onRemoveUser}
                    theme={theme}
                    styles={styles}
                  />
                ))
              ) : (
                <Text style={styles.emptyText}>No attendees yet</Text>
              )}
            </View>

            {/* Requests Section (Host only) */}
            {isHost && requesters && requesters.length > 0 && (
              <View style={styles.section}>
                <SectionHeader
                  title={`Join Requests (${requesters.length})`}
                  showAction={false}
                />
                {requesters.map((requester) => (
                  <RequesterRow
                    key={requester.id}
                    requester={requester}
                    onAccept={onAcceptRequest}
                    onDecline={onDeclineRequest}
                    accepting={acceptingId === requester.id}
                    declining={decliningId === requester.id}
                    theme={theme}
                    styles={styles}
                  />
                ))}
              </View>
            )}

            {/* Event Actions */}
            <View style={styles.section}>
              <SectionHeader title='Actions' showAction={false} />

              {!isHost && (
                <TouchableOpacity
                  style={[
                    styles.actionButton,
                    styles.leaveButton,
                    leaving && styles.buttonDisabled,
                  ]}
                  onPress={onLeaveEvent}
                  disabled={leaving}
                >
                  {leaving ? (
                    <ActivityIndicator
                      size='small'
                      color={theme.colors.error || '#ff3b30'}
                    />
                  ) : (
                    <>
                      <Ionicons
                        name='exit-outline'
                        size={18}
                        color={theme.colors.error || '#ff3b30'}
                      />
                      <Text style={styles.leaveButtonText}>Leave Event</Text>
                    </>
                  )}
                </TouchableOpacity>
              )}

              {isHost && (
                <TouchableOpacity
                  style={[
                    styles.actionButton,
                    styles.deleteButton,
                    deleting && styles.buttonDisabled,
                  ]}
                  onPress={onDeleteEvent}
                  disabled={deleting}
                >
                  {deleting ? (
                    <ActivityIndicator size='small' color='#fff' />
                  ) : (
                    <>
                      <Ionicons name='trash-outline' size={18} color='#fff' />
                      <Text style={styles.deleteButtonText}>Delete Event</Text>
                    </>
                  )}
                </TouchableOpacity>
              )}

              <TouchableOpacity
                style={[styles.actionButton, styles.reportButton]}
                onPress={onReportEvent}
              >
                <Ionicons
                  name='flag-outline'
                  size={18}
                  color={theme.colors.textSecondary}
                />
                <Text style={styles.reportButtonText}>Report Event</Text>
              </TouchableOpacity>
            </View>
          </ScrollView>
        </View>
      </View>
    </Modal>
  );
}

const createStyles = (theme) =>
  StyleSheet.create({
    modalOverlay: {
      flex: 1,
      backgroundColor: 'rgba(0,0,0,0.5)',
      justifyContent: 'flex-end',
    },
    modalContainer: {
      backgroundColor: theme.colors.card,
      borderTopLeftRadius: 20,
      borderTopRightRadius: 20,
      maxHeight: '90%',
      paddingBottom: Platform.OS === 'ios' ? 34 : 20,
    },
    modalHeader: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      padding: 16,
      borderBottomWidth: StyleSheet.hairlineWidth,
      borderBottomColor: theme.colors.border,
    },
    modalTitle: {
      fontSize: 18,
      fontWeight: '600',
      color: theme.colors.text,
      flex: 1,
      marginRight: 12,
    },
    closeButton: {
      padding: 4,
    },
    modalContent: {
      flex: 1,
    },
    modalContentContainer: {
      padding: 16,
      paddingBottom: 32,
    },
    section: {
      marginBottom: 24,
    },
    sectionHeader: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      marginBottom: 12,
    },
    sectionTitle: {
      fontSize: 14,
      fontWeight: '600',
      color: theme.colors.textSecondary,
      textTransform: 'uppercase',
      letterSpacing: 0.5,
    },
    sectionAction: {
      fontSize: 14,
      color: theme.colors.primary,
      fontWeight: '500',
    },
    infoText: {
      fontSize: 16,
      color: theme.colors.text,
      lineHeight: 22,
    },
    infoTextSecondary: {
      fontSize: 14,
      color: theme.colors.textSecondary,
      marginTop: 4,
    },
    editInput: {
      backgroundColor:
        theme.colors.backgroundSecondary || theme.colors.background,
      borderRadius: 8,
      padding: 12,
      fontSize: 16,
      color: theme.colors.text,
      borderWidth: 1,
      borderColor: theme.colors.border,
    },
    addressInput: {
      marginTop: 8,
      minHeight: 60,
    },
    descriptionInput: {
      minHeight: 100,
    },
    dateTimeEditContainer: {
      gap: 12,
    },
    dateTimeButton: {
      flexDirection: 'row',
      alignItems: 'center',
      backgroundColor:
        theme.colors.backgroundSecondary || theme.colors.background,
      padding: 12,
      borderRadius: 8,
      borderWidth: 1,
      borderColor: theme.colors.border,
      gap: 8,
    },
    dateTimeButtonText: {
      fontSize: 16,
      color: theme.colors.text,
    },
    timeRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 8,
    },
    timeButton: {
      flex: 1,
    },
    timeSeparator: {
      fontSize: 14,
      color: theme.colors.textSecondary,
    },
    editActions: {
      flexDirection: 'row',
      gap: 12,
      marginBottom: 24,
    },
    actionButton: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      padding: 14,
      borderRadius: 10,
      gap: 8,
    },
    cancelButton: {
      flex: 1,
      backgroundColor:
        theme.colors.backgroundSecondary || theme.colors.background,
      borderWidth: 1,
      borderColor: theme.colors.border,
    },
    cancelButtonText: {
      fontSize: 16,
      color: theme.colors.text,
      fontWeight: '500',
    },
    saveButton: {
      flex: 1,
      backgroundColor: theme.colors.primary,
    },
    saveButtonText: {
      fontSize: 16,
      color: '#fff',
      fontWeight: '600',
    },
    buttonDisabled: {
      opacity: 0.6,
    },
    // Attendee styles
    attendeeRow: {
      flexDirection: 'row',
      alignItems: 'center',
      paddingVertical: 10,
      borderBottomWidth: StyleSheet.hairlineWidth,
      borderBottomColor: theme.colors.border,
    },
    attendeeAvatar: {
      width: 40,
      height: 40,
      borderRadius: 20,
      backgroundColor: theme.colors.backgroundSecondary,
    },
    attendeeInfo: {
      flex: 1,
      marginLeft: 12,
    },
    attendeeName: {
      fontSize: 15,
      color: theme.colors.text,
      fontWeight: '500',
    },
    hostLabel: {
      color: theme.colors.primary,
      fontWeight: '600',
    },
    youLabel: {
      color: theme.colors.textSecondary,
      fontWeight: '400',
    },
    ratingContainer: {
      flexDirection: 'row',
      alignItems: 'center',
      marginTop: 2,
      gap: 4,
    },
    ratingText: {
      fontSize: 12,
      color: theme.colors.textSecondary,
    },
    removeButton: {
      padding: 4,
    },
    // Requester styles
    requesterRow: {
      flexDirection: 'row',
      alignItems: 'center',
      paddingVertical: 10,
      borderBottomWidth: StyleSheet.hairlineWidth,
      borderBottomColor: theme.colors.border,
    },
    requesterAvatar: {
      width: 40,
      height: 40,
      borderRadius: 20,
      backgroundColor: theme.colors.backgroundSecondary,
    },
    requesterInfo: {
      flex: 1,
      marginLeft: 12,
    },
    requesterName: {
      fontSize: 15,
      color: theme.colors.text,
      fontWeight: '500',
    },
    requestActions: {
      flexDirection: 'row',
      gap: 8,
    },
    acceptButton: {
      width: 36,
      height: 36,
      borderRadius: 18,
      backgroundColor: '#34C759',
      alignItems: 'center',
      justifyContent: 'center',
    },
    declineButton: {
      width: 36,
      height: 36,
      borderRadius: 18,
      backgroundColor: theme.colors.error || '#ff3b30',
      alignItems: 'center',
      justifyContent: 'center',
    },
    emptyText: {
      fontSize: 14,
      color: theme.colors.textSecondary,
      fontStyle: 'italic',
    },
    // Action buttons
    leaveButton: {
      backgroundColor: 'transparent',
      borderWidth: 1,
      borderColor: theme.colors.error || '#ff3b30',
      marginBottom: 8,
    },
    leaveButtonText: {
      fontSize: 16,
      color: theme.colors.error || '#ff3b30',
      fontWeight: '500',
    },
    deleteButton: {
      backgroundColor: theme.colors.error || '#ff3b30',
      marginBottom: 8,
    },
    deleteButtonText: {
      fontSize: 16,
      color: '#fff',
      fontWeight: '600',
    },
    reportButton: {
      backgroundColor: 'transparent',
      borderWidth: 1,
      borderColor: theme.colors.border,
    },
    reportButtonText: {
      fontSize: 16,
      color: theme.colors.textSecondary,
      fontWeight: '500',
    },
  });
