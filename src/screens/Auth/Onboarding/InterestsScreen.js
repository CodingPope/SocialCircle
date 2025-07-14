import React, { useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ActivityIndicator,
  ScrollView,
} from 'react-native';
import { doc, updateDoc } from 'firebase/firestore';
import { db } from '../../../firebase/config';
import { useAuth } from '../../../context/AuthContext';

const CATEGORIES = {
  'Active 💪🏽': [
    'Hiking',
    'Surf boarding',
    'Volleyball',
    'Gym',
    'Yoga',
    'Snowboarding',
    'Running',
  ],
  'Creative 🎨': [
    'Photography',
    'Painting',
    'Woodworking',
    'Crafts',
    'Art exhibit',
    'Writing',
  ],
  'Social 🥂': [
    'Bar hopping',
    'Dinner',
    'Networking',
    'Game night',
    'Live music',
    'Car meets',
  ],
  'Gaming 🎮': ['Board games', 'Video games', 'Esports', 'Game night'],
};

export default function InterestsScreen({ navigation }) {
  const { user } = useAuth();
  const [selected, setSelected] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const toggle = (item) => {
    setSelected((prev) =>
      prev.includes(item) ? prev.filter((i) => i !== item) : [...prev, item]
    );
  };

  const onNext = async () => {
    setLoading(true);
    setError('');
    try {
      await updateDoc(doc(db, 'users', user.uid), { interests: selected });
      navigation.replace('Location');
    } catch (e) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <ScrollView style={styles.container}>
      <Text style={styles.title}>Select your interests</Text>
      {Object.entries(CATEGORIES).map(([category, interests]) => (
        <View key={category} style={styles.categorySection}>
          <Text style={styles.categoryTitle}>{category}</Text>
          <View style={styles.gridContainer}>
            {interests.map((interest) => (
              <TouchableOpacity
                key={interest}
                style={[
                  styles.interest,
                  selected.includes(interest) && styles.selectedInterest,
                ]}
                onPress={() => toggle(interest)}
              >
                <Text style={styles.interestText}>{interest}</Text>
              </TouchableOpacity>
            ))}
          </View>
        </View>
      ))}
      {loading ? (
        <ActivityIndicator />
      ) : (
        <TouchableOpacity style={styles.nextButton} onPress={onNext}>
          <Text style={styles.nextButtonText}>Next</Text>
        </TouchableOpacity>
      )}
      {error ? <Text style={styles.error}>{error}</Text> : null}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    paddingHorizontal: 20,
    paddingTop: 50, // Adjusted for dynamic island spacing
  },
  title: {
    fontSize: 24,
    textAlign: 'center',
    marginBottom: 20,
  },
  categorySection: {
    marginBottom: 20,
  },
  categoryTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    marginBottom: 10,
    textAlign: 'left',
  },
  gridContainer: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'flex-start',
  },
  interest: {
    backgroundColor: '#f0f0f0',
    borderRadius: 20,
    paddingVertical: 10,
    paddingHorizontal: 15,
    margin: 5,
    alignItems: 'center',
  },
  selectedInterest: {
    backgroundColor: '#007AFF',
  },
  interestText: {
    fontSize: 16,
    color: '#333',
  },
  nextButton: {
    backgroundColor: '#007AFF',
    borderRadius: 20,
    paddingVertical: 10,
    paddingHorizontal: 20,
    alignItems: 'center',
    marginTop: 20,
  },
  nextButtonText: {
    color: '#fff',
    fontSize: 18,
  },
  error: {
    color: 'red',
    textAlign: 'center',
    marginTop: 10,
  },
});
