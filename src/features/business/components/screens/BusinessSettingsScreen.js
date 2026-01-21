import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet, Alert } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useNavigation } from '@react-navigation/native';
import { useSessionRole } from '../../../profile/stores/sessionRoleStore';
import { useThemeStore } from '../../../../store/themeStore';
import { useAuth } from '../../../auth/context/AuthContext';
import auth from '@react-native-firebase/auth';
import { switchToPersonalAccount } from '../../../../services/firebase/config';

export default function BusinessSettingsScreen() {
  const navigation = useNavigation();
  const setRole = useSessionRole((s) => s.setRole);
  const setNextConsumerRoute = useSessionRole((s) => s.setNextConsumerRoute);
  const toggleTheme = useThemeStore((s) => s.toggleMode);
  const mode = useThemeStore((s) => s.mode);
  const { user } = useAuth();

  const confirmLogout = () =>
    Alert.alert('Log out', 'Sign out of this account?', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Log out',
        style: 'destructive',
        onPress: async () => {
          try {
            await auth().signOut();
          } catch (err) {
            console.warn('Logout failed', err);
          }
        },
      },
    ]);

  return (
    <SafeAreaView style={styles.container}>
      <Text style={styles.title}>Settings</Text>
      <Text style={styles.helper}>
        Manage your business session, theme, and privacy info.
      </Text>

      <TouchableOpacity
        style={styles.row}
        onPress={async () => {
          try {
            setRole('consumer');
            setNextConsumerRoute('Profile');
          } catch {}
          if (user?.uid) {
            try {
              await switchToPersonalAccount();
            } catch (err) {
              console.warn('[business] Failed to switch account type', err);
            }
          }
        }}
      >
        <Text style={styles.rowLabel}>Switch to personal</Text>
        <Text style={styles.rowValue}>@{user?.username || user?.email}</Text>
      </TouchableOpacity>

      <TouchableOpacity style={styles.row} onPress={toggleTheme}>
        <Text style={styles.rowLabel}>Theme</Text>
        <Text style={styles.rowValue}>
          {mode === 'dark' ? 'Dark' : 'Light'}
        </Text>
      </TouchableOpacity>

      <TouchableOpacity
        style={styles.row}
        onPress={() => navigation.navigate('PrivacyInfo')}
      >
        <Text style={styles.rowLabel}>Privacy</Text>
      </TouchableOpacity>

      <TouchableOpacity
        style={styles.row}
        onPress={() =>
          navigation.navigate('InfoArticle', { articleId: 'about' })
        }
      >
        <Text style={styles.rowLabel}>Info</Text>
      </TouchableOpacity>

      <TouchableOpacity style={styles.row} onPress={confirmLogout}>
        <Text style={[styles.rowLabel, { color: '#C53030' }]}>Log out</Text>
      </TouchableOpacity>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#F8F9FA', padding: 20 },
  title: { fontSize: 22, fontWeight: '700', color: '#1A1A1A' },
  helper: { fontSize: 14, color: '#666', marginTop: 6, marginBottom: 16 },
  row: {
    backgroundColor: '#FFF',
    borderRadius: 12,
    paddingVertical: 14,
    paddingHorizontal: 12,
    borderWidth: 1,
    borderColor: '#E0E0E0',
    marginTop: 10,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  rowLabel: { fontSize: 15, fontWeight: '600', color: '#1A1A1A' },
  rowValue: { fontSize: 13, color: '#666' },
});
