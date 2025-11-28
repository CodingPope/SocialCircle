import React from 'react';
import { View, Text, Button, Alert } from 'react-native';
import { reportContent } from '../../../services/firebase/config';
import { trackReportContent } from '../../../lib/analytics';

export default function ProfileHeader({ currentUser, user, setMenuVisible }) {
  const handleReport = () => {
    setMenuVisible(false);
    if (!currentUser?.uid || !user?.id) {
      Alert.alert('Report', 'Unable to report this profile right now.');
      return;
    }
    reportContent(currentUser.uid, user.id, 'user', 'Inappropriate profile', {
      details: 'Report from ProfileHeader menu',
    })
      .then(() => {
        try {
          trackReportContent({
            content_type: 'user',
            content_id: user.id,
            reason_category: 'inappropriate_profile',
            surface: 'profile',
          });
        } catch {}
        Alert.alert('Report', 'Thanks for the report.');
      })
      .catch(() => Alert.alert('Report', 'Failed to submit report.'));
  };

  return (
    <View>
      {/* ...existing header content... */}
      <Button title='Report' onPress={handleReport} />
    </View>
  );
}
