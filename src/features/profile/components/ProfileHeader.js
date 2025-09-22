// src/components/profile/ProfileHeader.js

import React, { useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, Alert } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import Avatar from '../../../components/ui/Avatar';
import RatingStars from './RatingStars';
import PopupMenu from '../../events/components/PopupMenu';
import { reportContent } from '../../../firebase/config';
import { useUserStore } from '../stores/userStore';

export default function ProfileHeader({
  user,
  profileImage,
  setProfileImage,
  onUploadImage,
  setModals,
  navigation,
}) {
  const [menuVisible, setMenuVisible] = useState(false);
  const currentUser = useUserStore((s) => s.user);

  const createdAt =
    user?.createdAt && !isNaN(new Date(user.createdAt))
      ? new Date(user.createdAt).toLocaleString('default', {
          month: 'short',
          year: 'numeric',
        })
      : 'N/A';

  const handleImagePress = async () => {
    try {
      await onUploadImage(user.uid, setProfileImage);
    } catch (e) {
      Alert.alert('Upload failed', e.message);
    }
  };

  const handleEllipsisPress = () => {
    setMenuVisible(true);
  };

  const handleDelete = () => {
    setMenuVisible(false);
    Alert.alert('Delete functionality coming soon.');
  };

  const handleReport = () => {
    setMenuVisible(false);
    if (!currentUser?.uid || !user?.id) {
      Alert.alert('Report', 'Unable to report this profile right now.');
      return;
    }
    reportContent(currentUser.uid, user.id, 'user', 'Inappropriate profile', {
      details: 'Report from ProfileHeader menu',
    })
      .then(() => Alert.alert('Report', 'Thanks for the report.'))
      .catch(() => Alert.alert('Report', 'Failed to submit report.'));
  };

  return (
    <LinearGradient colors={['#ff9a9e', '#fad0c4']} style={styles.gradient}>
      {/* ✅ PopupMenu for Options */}
      <PopupMenu
        visible={menuVisible}
        onClose={() => setMenuVisible(false)}
        isOwner={true} // Assuming the profile owner is the user
        onDelete={handleDelete}
        onReport={handleReport}
        targetType='user'
      />

      <View style={styles.topIcons}>
        <TouchableOpacity onPress={() => navigation.navigate('Notifications')}>
          <Ionicons name='notifications-outline' size={24} color='#fff' />
        </TouchableOpacity>
        <TouchableOpacity onPress={() => navigation.navigate('Settings')}>
          <Ionicons name='settings-outline' size={24} color='#fff' />
        </TouchableOpacity>
        <TouchableOpacity
          onPress={() => setModals((m) => ({ ...m, share: true }))}
        >
          <Ionicons name='share-social-outline' size={24} color='#fff' />
        </TouchableOpacity>
        <TouchableOpacity
          onPress={() => setModals((m) => ({ ...m, report: true }))}
        >
          <Ionicons name='flag-outline' size={24} color='#fff' />
        </TouchableOpacity>
        <TouchableOpacity
          onPress={() => setModals((m) => ({ ...m, signOut: true }))}
        >
          <Ionicons name='log-out-outline' size={24} color='#fff' />
        </TouchableOpacity>
        <TouchableOpacity onPress={handleEllipsisPress}>
          <Ionicons name='ellipsis-horizontal' size={24} color='#fff' />
        </TouchableOpacity>
      </View>

      <TouchableOpacity onPress={handleImagePress}>
        <Avatar uri={profileImage} size={90} />
      </TouchableOpacity>
      <Text style={styles.name}>{user?.displayName || 'User'}</Text>
      <RatingStars rating={user?.rating || 0} />
      <Text style={styles.joinDate}>User since {createdAt}</Text>
    </LinearGradient>
  );
}

const styles = StyleSheet.create({
  gradient: {
    paddingVertical: 30,
    alignItems: 'center',
    borderBottomLeftRadius: 20,
    borderBottomRightRadius: 20,
    marginBottom: 10,
  },
  topIcons: {
    position: 'absolute',
    top: 10,
    right: 15,
    flexDirection: 'row',
    gap: 15,
  },
  name: { fontSize: 20, fontWeight: '700', color: '#fff', marginTop: 8 },
  joinDate: { fontSize: 12, color: '#f0f0f0', marginTop: 2 },
});
