import React, { useState } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, Modal } from 'react-native';

export default function PopupMenu({
  visible,
  onClose,
  isOwner,
  onReport,
  onDelete,
  eventId, // Pass the event ID as a prop
  targetType = 'post', // NEW: controls copy for report/delete
  extraActions = [],
}) {
  const [confirmationStep, setConfirmationStep] = useState(null);

  // Helpers: noun labels
  const noun = (targetType || 'post').toLowerCase();
  const nounTitle = noun.charAt(0).toUpperCase() + noun.slice(1);

  const normalizedExtraActions = Array.isArray(extraActions)
    ? extraActions.filter(
        (action) => action && typeof action.label === 'string' && action.label
      )
    : [];

  const handleDelete = () => {
    setConfirmationStep('delete');
  };

  const handleReport = () => {
    setConfirmationStep('report');
  };

  const handleConfirm = async () => {
    if (confirmationStep === 'delete') {
      await onDelete?.(eventId);
    } else if (confirmationStep === 'report') {
      await onReport?.(eventId);
    }
    setConfirmationStep(null);
    onClose?.();
  };

  const handleCancelConfirmation = () => {
    setConfirmationStep(null);
  };

  const handleExtraActionPress = (action) => {
    if (!action || action.disabled) return;
    try {
      if (action?.closeMenuFirst !== false) {
        onClose?.();
      }
      if (typeof action?.onPress === 'function') {
        action.onPress();
      }
    } catch (err) {
      console.warn('PopupMenu extra action error:', err);
    }
  };

  return (
    <Modal
      visible={visible}
      animationType='fade'
      transparent
      onRequestClose={onClose}
    >
      <TouchableOpacity
        style={styles.modalOverlay}
        activeOpacity={1}
        onPressOut={onClose}
      >
        <View style={styles.popupMenu}>
          {confirmationStep ? (
            <>
              <Text style={styles.confirmationText}>
                {`Are you sure you want to ${
                  confirmationStep === 'delete'
                    ? `delete this ${noun}`
                    : `report this ${noun}`
                }?`}
              </Text>
              <View style={styles.confirmationButtons}>
                <TouchableOpacity
                  style={styles.popupItem}
                  onPress={handleConfirm}
                >
                  <Text style={styles.popupText}>Yes</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={styles.popupItem}
                  onPress={handleCancelConfirmation}
                >
                  <Text style={styles.popupText}>No</Text>
                </TouchableOpacity>
              </View>
            </>
          ) : (
            <>
              {isOwner ? (
                <>
                  <TouchableOpacity
                    style={styles.popupItem}
                    onPress={handleDelete}
                  >
                    <Text
                      style={styles.popupText}
                    >{`Delete ${nounTitle}`}</Text>
                  </TouchableOpacity>
                  {normalizedExtraActions.map((action) => (
                    <TouchableOpacity
                      key={action.key || action.label}
                      style={styles.popupItem}
                      onPress={() => handleExtraActionPress(action)}
                      disabled={action.disabled}
                    >
                      <Text
                        style={[
                          styles.popupText,
                          action.destructive && styles.destructiveText,
                          action.disabled && styles.disabledText,
                        ]}
                      >
                        {action.label}
                      </Text>
                    </TouchableOpacity>
                  ))}
                  <TouchableOpacity style={styles.popupItem} onPress={onClose}>
                    <Text style={styles.popupText}>Cancel</Text>
                  </TouchableOpacity>
                </>
              ) : (
                <>
                  <TouchableOpacity
                    style={styles.popupItem}
                    onPress={handleReport}
                  >
                    <Text
                      style={styles.popupText}
                    >{`Report ${nounTitle}`}</Text>
                  </TouchableOpacity>
                  {normalizedExtraActions.map((action) => (
                    <TouchableOpacity
                      key={action.key || action.label}
                      style={styles.popupItem}
                      onPress={() => handleExtraActionPress(action)}
                      disabled={action.disabled}
                    >
                      <Text
                        style={[
                          styles.popupText,
                          action.destructive && styles.destructiveText,
                          action.disabled && styles.disabledText,
                        ]}
                      >
                        {action.label}
                      </Text>
                    </TouchableOpacity>
                  ))}
                  <TouchableOpacity style={styles.popupItem} onPress={onClose}>
                    <Text style={styles.popupText}>Cancel</Text>
                  </TouchableOpacity>
                </>
              )}
            </>
          )}
        </View>
      </TouchableOpacity>
    </Modal>
  );
}

const styles = StyleSheet.create({
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  popupMenu: {
    backgroundColor: '#fff',
    padding: 20,
    borderRadius: 10,
    width: '80%',
  },
  popupItem: {
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#eee',
  },
  popupText: {
    fontSize: 16,
    color: '#007AFF',
    textAlign: 'center',
  },
  destructiveText: {
    color: '#EF4444',
  },
  disabledText: {
    color: '#9CA3AF',
  },
  confirmationText: {
    fontSize: 16,
    textAlign: 'center',
    marginBottom: 20,
    color: '#333',
  },
  confirmationButtons: {
    flexDirection: 'row',
    justifyContent: 'space-around',
  },
});
