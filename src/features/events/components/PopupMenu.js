import React, { useState } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, Modal } from 'react-native';
import { useNavigation } from '@react-navigation/native';

export default function PopupMenu({
  visible,
  onClose,
  isOwner,
  onReport,
  onDelete,
  eventId, // Pass the event ID as a prop
  targetType = 'post', // NEW: controls copy for report/delete
}) {
  const navigation = useNavigation();
  const [confirmationStep, setConfirmationStep] = useState(null);

  // Helpers: noun labels
  const noun = (targetType || 'post').toLowerCase();
  const nounTitle = noun.charAt(0).toUpperCase() + noun.slice(1);

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
