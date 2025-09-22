import React, { useState } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  TextInput,
} from 'react-native';
import Modal from 'react-native-modal';

const ReportModal = ({
  isVisible,
  onClose,
  onSubmit,
  user,
  isCreator,
  onRemove,
}) => {
  const [reportReason, setReportReason] = useState('');

  const handleReport = () => {
    if (reportReason.trim()) {
      onSubmit({ userId: user?.id, reason: reportReason });
      setReportReason('');
    }
  };

  return (
    <Modal
      isVisible={isVisible}
      onBackdropPress={onClose}
      onSwipeComplete={onClose}
      swipeDirection='down'
      style={styles.modal}
      backdropOpacity={0.4}
    >
      <View style={styles.container}>
        <Text style={styles.title}>Options</Text>
        <TextInput
          placeholder='Reason (optional)'
          value={reportReason}
          onChangeText={setReportReason}
          style={styles.input}
        />
        <TouchableOpacity style={styles.optionButton} onPress={handleReport}>
          <Text style={styles.optionText}>Report</Text>
        </TouchableOpacity>
        {isCreator && (
          <TouchableOpacity
            style={[styles.optionButton, styles.removeButton]}
            onPress={() => {
              onRemove(user?.id);
              onClose();
            }}
          >
            <Text style={styles.optionText}>Remove</Text>
          </TouchableOpacity>
        )}
        <TouchableOpacity style={styles.optionButton} onPress={onClose}>
          <Text style={styles.optionText}>Cancel</Text>
        </TouchableOpacity>
      </View>
    </Modal>
  );
};

const styles = StyleSheet.create({
  modal: { justifyContent: 'center', margin: 0 },
  container: {
    backgroundColor: '#fff',
    padding: 16,
    borderRadius: 12,
    shadowColor: '#000',
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 2,
  },
  title: { fontSize: 18, fontWeight: 'bold', marginBottom: 8 },
  optionButton: {
    paddingVertical: 12,
    paddingHorizontal: 16,
    borderRadius: 8,
    backgroundColor: '#F2F2F2',
    marginBottom: 10,
  },
  removeButton: { backgroundColor: '#FF3B30' },
  optionText: { fontSize: 16, fontWeight: 'bold', textAlign: 'center' },
  input: {
    borderWidth: 1,
    borderColor: '#ddd',
    borderRadius: 8,
    padding: 10,
    marginBottom: 10,
  },
});

export default ReportModal;
