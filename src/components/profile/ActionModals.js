// src/components/profile/ActionModals.js

import React from 'react';
import { View, Text, StyleSheet, TouchableOpacity, Modal } from 'react-native';

export default function ActionModals({ modals, setModals, onSignOut }) {
  const closeModal = (key) => setModals((m) => ({ ...m, [key]: false }));

  return (
    <>
      {/* Share Modal */}
      <Modal transparent visible={modals.share} animationType='fade'>
        <View style={styles.overlay}>
          <View style={styles.modal}>
            <Text style={styles.title}>Share Profile</Text>
            <TouchableOpacity
              style={styles.button}
              onPress={() => closeModal('share')}
            >
              <Text style={styles.buttonText}>Close</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>

      {/* Report Modal */}
      <Modal transparent visible={modals.report} animationType='fade'>
        <View style={styles.overlay}>
          <View style={styles.modal}>
            <Text style={styles.title}>Report Profile</Text>
            <TouchableOpacity
              style={styles.button}
              onPress={() => closeModal('report')}
            >
              <Text style={styles.buttonText}>Close</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>

      {/* Sign Out Confirmation */}
      <Modal transparent visible={modals.signOut} animationType='fade'>
        <View style={styles.overlay}>
          <View style={styles.modal}>
            <Text style={styles.title}>Sign Out?</Text>
            <TouchableOpacity style={styles.button} onPress={onSignOut}>
              <Text style={styles.buttonText}>Yes</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.button, { backgroundColor: '#ccc' }]}
              onPress={() => closeModal('signOut')}
            >
              <Text style={styles.buttonText}>Cancel</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>
    </>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  modal: {
    backgroundColor: '#fff',
    borderRadius: 10,
    padding: 20,
    width: '80%',
  },
  title: { fontSize: 18, fontWeight: '600', marginBottom: 10 },
  button: {
    marginTop: 10,
    padding: 10,
    backgroundColor: '#007AFF',
    borderRadius: 8,
    alignItems: 'center',
  },
  buttonText: { color: '#fff', fontWeight: '600' },
});
