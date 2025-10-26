// Description: Redesigned business onboarding screens with improved UX and auth handling.
import React, { useState, useEffect, useCallback, useRef } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  ScrollView,
  Alert,
  ActivityIndicator,
  Image,
  Platform,
  KeyboardAvoidingView,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useNavigation } from '@react-navigation/native';
import { useBizOnboarding } from '../../stores/businessOnboardingStore';
import { db, storage, auth } from '../../../../firebase/config';
import { useAuth } from '../../../auth/context/AuthContext';
import * as ImagePicker from 'expo-image-picker';
import * as Location from 'expo-location';
import { Ionicons } from '@expo/vector-icons';

// Description: Progress bar component for onboarding
function ProgressBar({ currentStep, totalSteps }) {
  const progress = (currentStep / totalSteps) * 100;
  return (
    <View style={{ marginBottom: 20 }}>
      <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginBottom: 8 }}>
        <Text style={{ fontSize: 12, color: '#666' }}>
          Step {currentStep} of {totalSteps}
        </Text>
        <Text style={{ fontSize: 12, color: '#666', fontWeight: '600' }}>
          {Math.round(progress)}% Complete
        </Text>
      </View>
      <View style={{ height: 6, backgroundColor: '#E0E0E0', borderRadius: 3, overflow: 'hidden' }}>
        <View
          style={{
            height: '100%',
            width: `${progress}%`,
            backgroundColor: '#2F80ED',
            borderRadius: 3,
          }}
        />
      </View>
    </View>
  );
}

export function Step0ChooseType({ navigation: navProp }) {
  const navigation = useNavigation();
  const { start, loading, error } = useBizOnboarding();
  const { user } = useAuth();
  const [type, setType] = useState('single');

  // Description: Check auth before proceeding
  useEffect(() => {
    const checkAuth = async () => {
      try {
        const currentUser = auth().currentUser;
        if (!currentUser) {
          Alert.alert(
            'Authentication Required',
            'Please sign in to create a business account.',
            [{ text: 'OK', onPress: () => navigation.goBack() }]
          );
        } else {
          console.log('✅ Business onboarding: User authenticated', currentUser.uid);
        }
      } catch (err) {
        console.error('Auth check error:', err);
      }
    };
    checkAuth();
  }, [navigation]);

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: '#F8F9FA' }}>
      <ScrollView contentContainerStyle={{ padding: 20 }}>
        <ProgressBar currentStep={0} totalSteps={6} />
        
        <View style={{ alignItems: 'center', marginBottom: 24 }}>
          <Ionicons name="business" size={64} color="#2F80ED" />
        </View>

        <Text style={{ fontSize: 28, fontWeight: '700', color: '#1A1A1A', marginBottom: 8 }}>
          Welcome to Social Circle for Business
        </Text>
        <Text style={{ fontSize: 16, color: '#666', marginBottom: 32, lineHeight: 24 }}>
          Connect with your community through events and build lasting relationships.
        </Text>

        <Text style={{ fontSize: 18, fontWeight: '600', color: '#1A1A1A', marginBottom: 16 }}>
          Choose your business type
        </Text>

        <View style={{ marginBottom: 24 }}>
          <TouchableOpacity
            onPress={() => setType('single')}
            style={{
              flexDirection: 'row',
              alignItems: 'center',
              padding: 16,
              borderWidth: 2,
              borderColor: type === 'single' ? '#2F80ED' : '#E0E0E0',
              backgroundColor: type === 'single' ? '#EBF5FF' : '#FFF',
              borderRadius: 12,
              marginBottom: 12,
            }}
          >
            <View
              style={{
                width: 24,
                height: 24,
                borderRadius: 12,
                borderWidth: 2,
                borderColor: type === 'single' ? '#2F80ED' : '#CCC',
                marginRight: 12,
                alignItems: 'center',
                justifyContent: 'center',
              }}
            >
              {type === 'single' && (
                <View
                  style={{
                    width: 12,
                    height: 12,
                    borderRadius: 6,
                    backgroundColor: '#2F80ED',
                  }}
                />
              )}
            </View>
            <View style={{ flex: 1 }}>
              <Text style={{ fontSize: 16, fontWeight: '600', color: '#1A1A1A', marginBottom: 4 }}>
                Single Location
              </Text>
              <Text style={{ fontSize: 14, color: '#666' }}>
                Perfect for cafes, studios, or local venues
              </Text>
            </View>
          </TouchableOpacity>

          <TouchableOpacity
            onPress={() => setType('multi')}
            style={{
              flexDirection: 'row',
              alignItems: 'center',
              padding: 16,
              borderWidth: 2,
              borderColor: type === 'multi' ? '#2F80ED' : '#E0E0E0',
              backgroundColor: type === 'multi' ? '#EBF5FF' : '#FFF',
              borderRadius: 12,
            }}
          >
            <View
              style={{
                width: 24,
                height: 24,
                borderRadius: 12,
                borderWidth: 2,
                borderColor: type === 'multi' ? '#2F80ED' : '#CCC',
                marginRight: 12,
                alignItems: 'center',
                justifyContent: 'center',
              }}
            >
              {type === 'multi' && (
                <View
                  style={{
                    width: 12,
                    height: 12,
                    borderRadius: 6,
                    backgroundColor: '#2F80ED',
                  }}
                />
              )}
            </View>
            <View style={{ flex: 1 }}>
              <Text style={{ fontSize: 16, fontWeight: '600', color: '#1A1A1A', marginBottom: 4 }}>
                Multiple Locations
              </Text>
              <Text style={{ fontSize: 14, color: '#666' }}>
                For chains, franchises, or businesses with multiple venues
              </Text>
            </View>
          </TouchableOpacity>
        </View>

        {error && (
          <View
            style={{
              backgroundColor: '#FEE',
              padding: 12,
              borderRadius: 8,
              marginBottom: 16,
              borderLeftWidth: 4,
              borderLeftColor: '#E53E3E',
            }}
          >
            <Text style={{ color: '#C53030', fontSize: 14 }}>
              {error}
            </Text>
          </View>
        )}

        <TouchableOpacity
          disabled={loading}
          onPress={async () => {
            try {
              const currentUser = auth().currentUser;
              if (!currentUser) {
                Alert.alert('Error', 'Please sign in again to continue.');
                return;
              }
              await start(type);
              navigation.navigate('Step1');
            } catch (err) {
              console.error('Start error:', err);
              Alert.alert('Error', err.message || 'Failed to start onboarding');
            }
          }}
          style={{
            backgroundColor: loading ? '#CCC' : '#2F80ED',
            padding: 16,
            borderRadius: 12,
            alignItems: 'center',
            shadowColor: '#000',
            shadowOffset: { width: 0, height: 2 },
            shadowOpacity: 0.1,
            shadowRadius: 4,
            elevation: 3,
          }}
        >
          {loading ? (
            <ActivityIndicator color="#FFF" />
          ) : (
            <Text style={{ color: '#FFF', fontWeight: '600', fontSize: 16 }}>
              Get Started
            </Text>
          )}
        </TouchableOpacity>

        <Text style={{ fontSize: 12, color: '#999', textAlign: 'center', marginTop: 24, lineHeight: 18 }}>
          By continuing, you agree to host events in accordance with Social Circle's community guidelines.
        </Text>
      </ScrollView>
    </SafeAreaView>
  );
}

export function Step1Basics() {
  const navigation = useNavigation();
  const { saveBasics, saveAudience, loading, error } = useBizOnboarding();
  const [displayName, setDisplayName] = useState('');
  const [description, setDescription] = useState('');
  const [website, setWebsite] = useState('');
  const [supportEmail, setSupportEmail] = useState('');
  const [phone, setPhone] = useState('');

  const [categories, setCategories] = useState([]);
  const [catFilter, setCatFilter] = useState('');
  const [selectedCategoryId, setSelectedCategoryId] = useState(null);
  const [selectedInterests, setSelectedInterests] = useState([]);
  const [showCategoryPicker, setShowCategoryPicker] = useState(false);

  useEffect(() => {
    let mounted = true;
    (async () => {
      try {
        const snap = await db.collection('categories').get();
        const list = snap.docs.map((d) => ({ id: d.id, ...(d.data() || {}) }));
        if (mounted) setCategories(list);
      } catch (err) {
        console.error('Failed to load categories:', err);
      }
    })();
    return () => {
      mounted = false;
    };
  }, []);

  const toggleInterest = (name) => {
    setSelectedInterests((prev) =>
      prev.includes(name) ? prev.filter((n) => n !== name) : [...prev, name]
    );
  };

  const selectedCategory = categories.find((c) => c.id === selectedCategoryId);
  const interestsForCategory = Array.isArray(selectedCategory?.interests)
    ? selectedCategory.interests
        .map((i) => (typeof i === 'string' ? i : i?.name || ''))
        .filter(Boolean)
    : [];

  const charCount = description.length;
  const maxChars = 160;
  const canProceed = displayName.trim() && selectedCategoryId;

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: '#F8F9FA' }}>
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        style={{ flex: 1 }}
      >
        <ScrollView contentContainerStyle={{ padding: 20 }}>
          <ProgressBar currentStep={1} totalSteps={6} />

          <Text style={{ fontSize: 24, fontWeight: '700', color: '#1A1A1A', marginBottom: 8 }}>
            Tell us about your business
          </Text>
          <Text style={{ fontSize: 15, color: '#666', marginBottom: 24, lineHeight: 22 }}>
            This information will help people discover your events.
          </Text>

          {/* Business Name */}
          <View style={{ marginBottom: 16 }}>
            <Text style={{ fontSize: 14, fontWeight: '600', color: '#1A1A1A', marginBottom: 8 }}>
              Business Name *
            </Text>
            <TextInput
              placeholder='e.g., "The Coffee House" or "Yoga Studio SF"'
              value={displayName}
              onChangeText={setDisplayName}
              style={{
                borderWidth: 1,
                borderColor: displayName ? '#2F80ED' : '#E0E0E0',
                backgroundColor: '#FFF',
                borderRadius: 10,
                padding: 14,
                fontSize: 15,
              }}
              maxLength={80}
            />
          </View>

          {/* Category Selector */}
          <View style={{ marginBottom: 16 }}>
            <Text style={{ fontSize: 14, fontWeight: '600', color: '#1A1A1A', marginBottom: 8 }}>
              Category *
            </Text>
            <TouchableOpacity
              onPress={() => setShowCategoryPicker(!showCategoryPicker)}
              style={{
                borderWidth: 1,
                borderColor: selectedCategoryId ? '#2F80ED' : '#E0E0E0',
                backgroundColor: '#FFF',
                borderRadius: 10,
                padding: 14,
                flexDirection: 'row',
                justifyContent: 'space-between',
                alignItems: 'center',
              }}
            >
              <Text style={{ fontSize: 15, color: selectedCategory ? '#1A1A1A' : '#999' }}>
                {selectedCategory?.name || 'Select a category'}
              </Text>
              <Ionicons
                name={showCategoryPicker ? 'chevron-up' : 'chevron-down'}
                size={20}
                color="#666"
              />
            </TouchableOpacity>

            {showCategoryPicker && (
              <View
                style={{
                  maxHeight: 300,
                  borderWidth: 1,
                  borderColor: '#E0E0E0',
                  borderRadius: 10,
                  marginTop: 8,
                  backgroundColor: '#FFF',
                }}
              >
                <TextInput
                  placeholder='Search categories...'
                  value={catFilter}
                  onChangeText={setCatFilter}
                  style={{
                    borderBottomWidth: 1,
                    borderBottomColor: '#E0E0E0',
                    padding: 12,
                    fontSize: 15,
                  }}
                />
                <ScrollView style={{ maxHeight: 250 }}>
                  {(categories || [])
                    .filter((c) =>
                      String(c.name || '')
                        .toLowerCase()
                        .includes(catFilter.toLowerCase())
                    )
                    .slice(0, 30)
                    .map((c) => (
                      <TouchableOpacity
                        key={c.id}
                        onPress={() => {
                          setSelectedCategoryId(c.id);
                          setSelectedInterests([]);
                          setShowCategoryPicker(false);
                        }}
                        style={{
                          padding: 14,
                          borderBottomWidth: 1,
                          borderBottomColor: '#F0F0F0',
                          backgroundColor: selectedCategoryId === c.id ? '#EBF5FF' : '#FFF',
                        }}
                      >
                        <Text
                          style={{
                            color: selectedCategoryId === c.id ? '#2F80ED' : '#333',
                            fontWeight: selectedCategoryId === c.id ? '600' : '400',
                            fontSize: 15,
                          }}
                        >
                          {c.emoji ? `${c.emoji} ` : ''}{c.name || c.id}
                        </Text>
                      </TouchableOpacity>
                    ))}
                </ScrollView>
              </View>
            )}
          </View>

          {/* Interests */}
          {selectedCategoryId && interestsForCategory.length > 0 && (
            <View style={{ marginBottom: 16 }}>
              <Text style={{ fontSize: 14, fontWeight: '600', color: '#1A1A1A', marginBottom: 8 }}>
                Select Interests (Optional)
              </Text>
              <Text style={{ fontSize: 13, color: '#666', marginBottom: 12 }}>
                Choose what your business specializes in
              </Text>
              <View style={{ flexDirection: 'row', flexWrap: 'wrap' }}>
                {interestsForCategory.slice(0, 15).map((name) => (
                  <TouchableOpacity
                    key={name}
                    onPress={() => toggleInterest(name)}
                    style={{
                      paddingHorizontal: 12,
                      paddingVertical: 8,
                      borderWidth: 1,
                      borderColor: selectedInterests.includes(name) ? '#2F80ED' : '#E0E0E0',
                      backgroundColor: selectedInterests.includes(name) ? '#EBF5FF' : '#FFF',
                      borderRadius: 20,
                      marginRight: 8,
                      marginBottom: 8,
                    }}
                  >
                    <Text
                      style={{
                        color: selectedInterests.includes(name) ? '#2F80ED' : '#666',
                        fontSize: 14,
                      }}
                    >
                      {selectedInterests.includes(name) ? '✓ ' : ''}
                      {name}
                    </Text>
                  </TouchableOpacity>
                ))}
              </View>
            </View>
          )}

          {/* Description */}
          <View style={{ marginBottom: 16 }}>
            <Text style={{ fontSize: 14, fontWeight: '600', color: '#1A1A1A', marginBottom: 8 }}>
              Description
            </Text>
            <TextInput
              placeholder='Describe what makes your business special...'
              value={description}
              onChangeText={setDescription}
              multiline
              numberOfLines={4}
              maxLength={maxChars}
              style={{
                borderWidth: 1,
                borderColor: '#E0E0E0',
                backgroundColor: '#FFF',
                borderRadius: 10,
                padding: 14,
                fontSize: 15,
                height: 100,
                textAlignVertical: 'top',
              }}
            />
            <Text style={{ fontSize: 12, color: charCount > maxChars - 20 ? '#E53E3E' : '#999', marginTop: 4 }}>
              {charCount}/{maxChars} characters
            </Text>
          </View>

          {/* Optional Fields */}
          <View style={{ marginBottom: 16 }}>
            <Text style={{ fontSize: 14, fontWeight: '600', color: '#1A1A1A', marginBottom: 8 }}>
              Website
            </Text>
            <TextInput
              placeholder='https://yourwebsite.com'
              value={website}
              onChangeText={setWebsite}
              keyboardType='url'
              autoCapitalize='none'
              style={{
                borderWidth: 1,
                borderColor: '#E0E0E0',
                backgroundColor: '#FFF',
                borderRadius: 10,
                padding: 14,
                fontSize: 15,
              }}
            />
          </View>

          <View style={{ marginBottom: 16 }}>
            <Text style={{ fontSize: 14, fontWeight: '600', color: '#1A1A1A', marginBottom: 8 }}>
              Support Email
            </Text>
            <TextInput
              placeholder='support@yourbus iness.com'
              value={supportEmail}
              onChangeText={setSupportEmail}
              keyboardType='email-address'
              autoCapitalize='none'
              style={{
                borderWidth: 1,
                borderColor: '#E0E0E0',
                backgroundColor: '#FFF',
                borderRadius: 10,
                padding: 14,
                fontSize: 15,
              }}
            />
          </View>

          <View style={{ marginBottom: 24 }}>
            <Text style={{ fontSize: 14, fontWeight: '600', color: '#1A1A1A', marginBottom: 8 }}>
              Phone Number
            </Text>
            <TextInput
              placeholder='+1 (555) 123-4567'
              value={phone}
              onChangeText={setPhone}
              keyboardType='phone-pad'
              style={{
                borderWidth: 1,
                borderColor: '#E0E0E0',
                backgroundColor: '#FFF',
                borderRadius: 10,
                padding: 14,
                fontSize: 15,
              }}
            />
          </View>

          {error && (
            <View
              style={{
                backgroundColor: '#FEE',
                padding: 12,
                borderRadius: 8,
                marginBottom: 16,
                borderLeftWidth: 4,
                borderLeftColor: '#E53E3E',
              }}
            >
              <Text style={{ color: '#C53030', fontSize: 14 }}>{error}</Text>
            </View>
          )}

          <TouchableOpacity
            disabled={!canProceed || loading}
            onPress={async () => {
              if (!displayName || !selectedCategoryId) return;
              await saveBasics({
                displayName: displayName.trim(),
                category: selectedCategory?.name || selectedCategoryId,
                description: description.trim(),
                website: website.trim(),
                supportEmail: supportEmail.trim(),
                phone: phone.trim(),
              });
              if (selectedInterests.length) {
                await saveAudience({ interests: selectedInterests });
              }
              navigation.navigate('Step2');
            }}
            style={{
              backgroundColor: !canProceed || loading ? '#CCC' : '#2F80ED',
              padding: 16,
              borderRadius: 12,
              alignItems: 'center',
              shadowColor: '#000',
              shadowOffset: { width: 0, height: 2 },
              shadowOpacity: 0.1,
              shadowRadius: 4,
              elevation: 3,
            }}
          >
            {loading ? (
              <ActivityIndicator color="#FFF" />
            ) : (
              <Text style={{ color: '#FFF', fontWeight: '600', fontSize: 16 }}>
                Continue
              </Text>
            )}
          </TouchableOpacity>

          <TouchableOpacity
            onPress={() => navigation.goBack()}
            style={{ alignItems: 'center', marginTop: 16 }}
          >
            <Text style={{ color: '#666', fontSize: 15 }}>← Back</Text>
          </TouchableOpacity>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

export function Step2Brand() {
  const navigation = useNavigation();
  const { saveBrand, loading, error, draft } = useBizOnboarding();
  const { user } = useAuth();
  const [logoUrl, setLogoUrl] = useState(draft?.logoUrl || '');
  const [coverUrl, setCoverUrl] = useState(draft?.coverUrl || '');
  const [uploading, setUploading] = useState(false);
  const [uploadType, setUploadType] = useState(null);

  // Description: Pick from gallery and upload to Firebase Storage
  const pickAndUpload = async (kind) => {
    if (!user?.uid) {
      Alert.alert(
        'Sign in required',
        'You need an account to upload brand assets.'
      );
      return;
    }

    try {
      setUploading(true);
      setUploadType(kind);

      const res = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ImagePicker.MediaTypeOptions.Images,
        quality: 0.8,
        allowsEditing: true,
        aspect: kind === 'logo' ? [1, 1] : [16, 9],
      });

      if (res.canceled || !res.assets?.length) {
        setUploading(false);
        setUploadType(null);
        return;
      }

      const uri = res.assets[0].uri;
      const contentType = res.assets[0]?.mimeType || 'image/jpeg';
      const path = `businesses/${user.uid}/${Date.now()}_${kind}.jpg`;
      const reference = storage.ref(path);

      if (uri.startsWith('http')) {
        const response = await fetch(uri);
        const blob = await response.blob();
        await reference.put(blob, { contentType });
      } else {
        await reference.putFile(uri, { contentType });
      }

      const url = await reference.getDownloadURL();
      if (kind === 'logo') {
        setLogoUrl(url);
      } else {
        setCoverUrl(url);
      }
    } catch (uploadError) {
      console.warn('Business asset upload failed', uploadError);
      Alert.alert(
        'Upload failed',
        'Unable to upload that image. Please try again.'
      );
    } finally {
      setUploading(false);
      setUploadType(null);
    }
  };

  const canProceed = true; // Logo/cover are optional

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: '#F8F9FA' }}>
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        style={{ flex: 1 }}
      >
        <ScrollView contentContainerStyle={{ padding: 20 }}>
          <ProgressBar currentStep={2} totalSteps={6} />

          <Text style={{ fontSize: 24, fontWeight: '700', color: '#1A1A1A', marginBottom: 8 }}>
            Brand your profile
          </Text>
          <Text style={{ fontSize: 15, color: '#666', marginBottom: 24, lineHeight: 22 }}>
            Add your logo and cover image to make your profile stand out. You can skip this for now and add them later.
          </Text>

          {/* Logo Upload */}
          <View style={{ marginBottom: 24 }}>
            <Text style={{ fontSize: 14, fontWeight: '600', color: '#1A1A1A', marginBottom: 12 }}>
              Logo (Optional)
            </Text>
            <View style={{ alignItems: 'center' }}>
              {logoUrl ? (
                <View style={{ alignItems: 'center' }}>
                  <Image
                    source={{ uri: logoUrl }}
                    style={{
                      width: 120,
                      height: 120,
                      borderRadius: 60,
                      borderWidth: 3,
                      borderColor: '#2F80ED',
                      marginBottom: 12,
                    }}
                    resizeMode='cover'
                  />
                  <TouchableOpacity
                    onPress={() => setLogoUrl('')}
                    style={{
                      flexDirection: 'row',
                      alignItems: 'center',
                      padding: 8,
                    }}
                  >
                    <Ionicons name="trash-outline" size={16} color="#E53E3E" />
                    <Text style={{ color: '#E53E3E', marginLeft: 4, fontSize: 14 }}>
                      Remove Logo
                    </Text>
                  </TouchableOpacity>
                </View>
              ) : (
                <TouchableOpacity
                  onPress={() => pickAndUpload('logo')}
                  disabled={uploading}
                  style={{
                    width: 120,
                    height: 120,
                    borderRadius: 60,
                    borderWidth: 2,
                    borderColor: '#E0E0E0',
                    borderStyle: 'dashed',
                    backgroundColor: '#F8F9FA',
                    justifyContent: 'center',
                    alignItems: 'center',
                  }}
                >
                  {uploading && uploadType === 'logo' ? (
                    <ActivityIndicator color="#2F80ED" />
                  ) : (
                    <>
                      <Ionicons name="camera" size={32} color="#2F80ED" />
                      <Text style={{ color: '#2F80ED', fontSize: 12, marginTop: 8 }}>
                        Add Logo
                      </Text>
                    </>
                  )}
                </TouchableOpacity>
              )}
            </View>
            <Text style={{ fontSize: 12, color: '#999', textAlign: 'center', marginTop: 8 }}>
              Square image recommended (e.g., 500×500px)
            </Text>
          </View>

          {/* Cover Upload */}
          <View style={{ marginBottom: 24 }}>
            <Text style={{ fontSize: 14, fontWeight: '600', color: '#1A1A1A', marginBottom: 12 }}>
              Cover Image (Optional)
            </Text>
            {coverUrl ? (
              <View>
                <Image
                  source={{ uri: coverUrl }}
                  style={{
                    width: '100%',
                    height: 180,
                    borderRadius: 12,
                    borderWidth: 2,
                    borderColor: '#2F80ED',
                    marginBottom: 12,
                  }}
                  resizeMode='cover'
                />
                <TouchableOpacity
                  onPress={() => setCoverUrl('')}
                  style={{
                    flexDirection: 'row',
                    alignItems: 'center',
                    justifyContent: 'center',
                    padding: 8,
                  }}
                >
                  <Ionicons name="trash-outline" size={16} color="#E53E3E" />
                  <Text style={{ color: '#E53E3E', marginLeft: 4, fontSize: 14 }}>
                    Remove Cover
                  </Text>
                </TouchableOpacity>
              </View>
            ) : (
              <TouchableOpacity
                onPress={() => pickAndUpload('cover')}
                disabled={uploading}
                style={{
                  width: '100%',
                  height: 180,
                  borderRadius: 12,
                  borderWidth: 2,
                  borderColor: '#E0E0E0',
                  borderStyle: 'dashed',
                  backgroundColor: '#F8F9FA',
                  justifyContent: 'center',
                  alignItems: 'center',
                }}
              >
                {uploading && uploadType === 'cover' ? (
                  <ActivityIndicator color="#2F80ED" />
                ) : (
                  <>
                    <Ionicons name="image" size={40} color="#2F80ED" />
                    <Text style={{ color: '#2F80ED', fontSize: 14, marginTop: 8 }}>
                      Add Cover Image
                    </Text>
                  </>
                )}
              </TouchableOpacity>
            )}
            <Text style={{ fontSize: 12, color: '#999', textAlign: 'center', marginTop: 8 }}>
              Landscape image recommended (e.g., 1200×675px)
            </Text>
          </View>

          {error && (
            <View
              style={{
                backgroundColor: '#FEE',
                padding: 12,
                borderRadius: 8,
                marginBottom: 16,
                borderLeftWidth: 4,
                borderLeftColor: '#E53E3E',
              }}
            >
              <Text style={{ color: '#C53030', fontSize: 14 }}>{error}</Text>
            </View>
          )}

          <TouchableOpacity
            disabled={loading || uploading}
            onPress={async () => {
              await saveBrand({ logoUrl, coverUrl });
              navigation.navigate('Step3');
            }}
            style={{
              backgroundColor: loading || uploading ? '#CCC' : '#2F80ED',
              padding: 16,
              borderRadius: 12,
              alignItems: 'center',
              shadowColor: '#000',
              shadowOffset: { width: 0, height: 2 },
              shadowOpacity: 0.1,
              shadowRadius: 4,
              elevation: 3,
            }}
          >
            {loading ? (
              <ActivityIndicator color="#FFF" />
            ) : (
              <Text style={{ color: '#FFF', fontWeight: '600', fontSize: 16 }}>
                {logoUrl || coverUrl ? 'Continue' : 'Skip for Now'}
              </Text>
            )}
          </TouchableOpacity>

          <TouchableOpacity
            onPress={() => navigation.goBack()}
            style={{ alignItems: 'center', marginTop: 16 }}
          >
            <Text style={{ color: '#666', fontSize: 15 }}>← Back</Text>
          </TouchableOpacity>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

export function Step3Location() {
  const navigation = useNavigation();
  const { addLocation, loading, error } = useBizOnboarding();
  const [label, setLabel] = useState('');
  const [address, setAddress] = useState('');
  const [city, setCity] = useState('');
  const [state, setState] = useState('');
  const [country, setCountry] = useState('US');
  const [gettingLocation, setGettingLocation] = useState(false);
  const [coordinates, setCoordinates] = useState(null);

  // Description: Geocode address to get coordinates
  const geocodeAddress = async () => {
    if (!address || !city) {
      Alert.alert('Missing Information', 'Please enter an address and city');
      return;
    }

    setGettingLocation(true);
    try {
      const fullAddress = `${address}, ${city}, ${state} ${country}`;
      const results = await Location.geocodeAsync(fullAddress);
      
      if (results && results.length > 0) {
        const { latitude, longitude } = results[0];
        setCoordinates({ latitude, longitude });
        Alert.alert(
          'Location Found',
          `We found your location: ${latitude.toFixed(6)}, ${longitude.toFixed(6)}`,
          [{ text: 'OK' }]
        );
      } else {
        Alert.alert(
          'Location Not Found',
          'We couldn\'t find this address. Please check the details and try again.'
        );
      }
    } catch (err) {
      console.error('Geocoding error:', err);
      Alert.alert(
        'Geocoding Error',
        'Unable to find this address. Please verify the address is correct.'
      );
    } finally {
      setGettingLocation(false);
    }
  };

  // Description: Use device location (for single-location businesses)
  const useCurrentLocation = async () => {
    setGettingLocation(true);
    try {
      const { status } = await Location.requestForegroundPermissionsAsync();
      if (status !== 'granted') {
        Alert.alert('Permission Denied', 'We need location permission to use your current location.');
        setGettingLocation(false);
        return;
      }

      const location = await Location.getCurrentPositionAsync({});
      const { latitude, longitude } = location.coords;
      setCoordinates({ latitude, longitude });

      // Reverse geocode to get address
      const addresses = await Location.reverseGeocodeAsync({ latitude, longitude });
      if (addresses && addresses.length > 0) {
        const addr = addresses[0];
        setAddress(`${addr.streetNumber || ''} ${addr.street || ''}`.trim());
        setCity(addr.city || '');
        setState(addr.region || '');
        setCountry(addr.isoCountryCode?.toUpperCase() || 'US');
      }

      Alert.alert('Location Set', 'We\'ve set your current location as the business address.');
    } catch (err) {
      console.error('Current location error:', err);
      Alert.alert('Error', 'Unable to get your current location. Please enter address manually.');
    } finally {
      setGettingLocation(false);
    }
  };

  const canProceed = address && city && coordinates;

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: '#F8F9FA' }}>
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        style={{ flex: 1 }}
      >
        <ScrollView contentContainerStyle={{ padding: 20 }}>
          <ProgressBar currentStep={3} totalSteps={6} />

          <Text style={{ fontSize: 24, fontWeight: '700', color: '#1A1A1A', marginBottom: 8 }}>
            Where are you located?
          </Text>
          <Text style={{ fontSize: 15, color: '#666', marginBottom: 24, lineHeight: 22 }}>
            Help customers find you by adding your business location.
          </Text>

          <TouchableOpacity
            onPress={useCurrentLocation}
            disabled={gettingLocation}
            style={{
              flexDirection: 'row',
              alignItems: 'center',
              justifyContent: 'center',
              padding: 14,
              backgroundColor: '#EBF5FF',
              borderRadius: 10,
              borderWidth: 1,
              borderColor: '#2F80ED',
              marginBottom: 24,
            }}
          >
            {gettingLocation ? (
              <ActivityIndicator color="#2F80ED" />
            ) : (
              <>
                <Ionicons name="locate" size={20} color="#2F80ED" style={{ marginRight: 8 }} />
                <Text style={{ color: '#2F80ED', fontWeight: '600', fontSize: 15 }}>
                  Use My Current Location
                </Text>
              </>
            )}
          </TouchableOpacity>

          <View style={{ marginBottom: 16 }}>
            <Text style={{ fontSize: 14, fontWeight: '600', color: '#1A1A1A', marginBottom: 8 }}>
              Location Name (Optional)
            </Text>
            <TextInput
              placeholder='e.g., "Downtown Cafe" or "Main Branch"'
              value={label}
              onChangeText={setLabel}
              style={{
                borderWidth: 1,
                borderColor: '#E0E0E0',
                backgroundColor: '#FFF',
                borderRadius: 10,
                padding: 14,
                fontSize: 15,
              }}
            />
          </View>

          <View style={{ marginBottom: 16 }}>
            <Text style={{ fontSize: 14, fontWeight: '600', color: '#1A1A1A', marginBottom: 8 }}>
              Street Address *
            </Text>
            <TextInput
              placeholder='123 Main Street'
              value={address}
              onChangeText={setAddress}
              style={{
                borderWidth: 1,
                borderColor: address ? '#2F80ED' : '#E0E0E0',
                backgroundColor: '#FFF',
                borderRadius: 10,
                padding: 14,
                fontSize: 15,
              }}
            />
          </View>

          <View style={{ marginBottom: 16 }}>
            <Text style={{ fontSize: 14, fontWeight: '600', color: '#1A1A1A', marginBottom: 8 }}>
              City *
            </Text>
            <TextInput
              placeholder='San Francisco'
              value={city}
              onChangeText={setCity}
              style={{
                borderWidth: 1,
                borderColor: city ? '#2F80ED' : '#E0E0E0',
                backgroundColor: '#FFF',
                borderRadius: 10,
                padding: 14,
                fontSize: 15,
              }}
            />
          </View>

          <View style={{ flexDirection: 'row', marginBottom: 16 }}>
            <View style={{ flex: 1, marginRight: 8 }}>
              <Text style={{ fontSize: 14, fontWeight: '600', color: '#1A1A1A', marginBottom: 8 }}>
                State/Province
              </Text>
              <TextInput
                placeholder='CA'
                value={state}
                onChangeText={setState}
                style={{
                  borderWidth: 1,
                  borderColor: '#E0E0E0',
                  backgroundColor: '#FFF',
                  borderRadius: 10,
                  padding: 14,
                  fontSize: 15,
                }}
              />
            </View>
            <View style={{ flex: 1, marginLeft: 8 }}>
              <Text style={{ fontSize: 14, fontWeight: '600', color: '#1A1A1A', marginBottom: 8 }}>
                Country
              </Text>
              <TextInput
                placeholder='US'
                value={country}
                onChangeText={(text) => setCountry(text.toUpperCase())}
                style={{
                  borderWidth: 1,
                  borderColor: '#E0E0E0',
                  backgroundColor: '#FFF',
                  borderRadius: 10,
                  padding: 14,
                  fontSize: 15,
                }}
                maxLength={2}
              />
            </View>
          </View>

          {!coordinates && (
            <TouchableOpacity
              onPress={geocodeAddress}
              disabled={!address || !city || gettingLocation}
              style={{
                padding: 14,
                backgroundColor: !address || !city ? '#F0F0F0' : '#EBF5FF',
                borderRadius: 10,
                borderWidth: 1,
                borderColor: '#2F80ED',
                alignItems: 'center',
                marginBottom: 16,
              }}
            >
              {gettingLocation ? (
                <ActivityIndicator color="#2F80ED" />
              ) : (
                <Text style={{ color: !address || !city ? '#999' : '#2F80ED', fontWeight: '600' }}>
                  📍 Verify Address
                </Text>
              )}
            </TouchableOpacity>
          )}

          {coordinates && (
            <View
              style={{
                backgroundColor: '#E8F5E9',
                padding: 12,
                borderRadius: 10,
                marginBottom: 16,
                flexDirection: 'row',
                alignItems: 'center',
              }}
            >
              <Ionicons name="checkmark-circle" size={24} color="#27AE60" style={{ marginRight: 8 }} />
              <Text style={{ color: '#27AE60', fontSize: 14, flex: 1 }}>
                Location verified and ready to save!
              </Text>
            </View>
          )}

          {error && (
            <View
              style={{
                backgroundColor: '#FEE',
                padding: 12,
                borderRadius: 8,
                marginBottom: 16,
                borderLeftWidth: 4,
                borderLeftColor: '#E53E3E',
              }}
            >
              <Text style={{ color: '#C53030', fontSize: 14 }}>{error}</Text>
            </View>
          )}

          <TouchableOpacity
            disabled={!canProceed || loading}
            onPress={async () => {
              await addLocation({
                label: label || `${city} Location`,
                address,
                city,
                state,
                country,
                latitude: coordinates.latitude,
                longitude: coordinates.longitude,
              });
              navigation.navigate('Step4');
            }}
            style={{
              backgroundColor: !canProceed || loading ? '#CCC' : '#2F80ED',
              padding: 16,
              borderRadius: 12,
              alignItems: 'center',
              shadowColor: '#000',
              shadowOffset: { width: 0, height: 2 },
              shadowOpacity: 0.1,
              shadowRadius: 4,
              elevation: 3,
            }}
          >
            {loading ? (
              <ActivityIndicator color="#FFF" />
            ) : (
              <Text style={{ color: '#FFF', fontWeight: '600', fontSize: 16 }}>
                Continue
              </Text>
            )}
          </TouchableOpacity>

          <TouchableOpacity
            onPress={() => navigation.goBack()}
            style={{ alignItems: 'center', marginTop: 16 }}
          >
            <Text style={{ color: '#666', fontSize: 15 }}>← Back</Text>
          </TouchableOpacity>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

export function Step4Audience() {
  const navigation = useNavigation();
  const { saveAudience, loading, error } = useBizOnboarding();
  const [houseRules, setHouseRules] = useState('');

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: '#F8F9FA' }}>
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        style={{ flex: 1 }}
      >
        <ScrollView contentContainerStyle={{ padding: 20 }}>
          <ProgressBar currentStep={4} totalSteps={6} />

          <Text style={{ fontSize: 24, fontWeight: '700', color: '#1A1A1A', marginBottom: 8 }}>
            Set your house rules
          </Text>
          <Text style={{ fontSize: 15, color: '#666', marginBottom: 24, lineHeight: 22 }}>
            Let event attendees know what to expect at your venue (optional).
          </Text>

          <View style={{ marginBottom: 24 }}>
            <Text style={{ fontSize: 14, fontWeight: '600', color: '#1A1A1A', marginBottom: 8 }}>
              House Rules
            </Text>
            <TextInput
              placeholder='e.g., "No outside food or drinks. Please arrive on time. Be respectful to staff."'
              value={houseRules}
              onChangeText={setHouseRules}
              multiline
              numberOfLines={6}
              maxLength={500}
              style={{
                borderWidth: 1,
                borderColor: '#E0E0E0',
                backgroundColor: '#FFF',
                borderRadius: 10,
                padding: 14,
                fontSize: 15,
                height: 150,
                textAlignVertical: 'top',
              }}
            />
            <Text style={{ fontSize: 12, color: '#999', marginTop: 4 }}>
              {houseRules.length}/500 characters
            </Text>
          </View>

          {error && (
            <View
              style={{
                backgroundColor: '#FEE',
                padding: 12,
                borderRadius: 8,
                marginBottom: 16,
                borderLeftWidth: 4,
                borderLeftColor: '#E53E3E',
              }}
            >
              <Text style={{ color: '#C53030', fontSize: 14 }}>{error}</Text>
            </View>
          )}

          <TouchableOpacity
            disabled={loading}
            onPress={async () => {
              await saveAudience({
                houseRules: houseRules.trim() || null,
                ageRestriction: 'none',
                genderRestriction: 'none',
              });
              navigation.navigate('Step5');
            }}
            style={{
              backgroundColor: loading ? '#CCC' : '#2F80ED',
              padding: 16,
              borderRadius: 12,
              alignItems: 'center',
              shadowColor: '#000',
              shadowOffset: { width: 0, height: 2 },
              shadowOpacity: 0.1,
              shadowRadius: 4,
              elevation: 3,
            }}
          >
            {loading ? (
              <ActivityIndicator color="#FFF" />
            ) : (
              <Text style={{ color: '#FFF', fontWeight: '600', fontSize: 16 }}>
                {houseRules ? 'Continue' : 'Skip for Now'}
              </Text>
            )}
          </TouchableOpacity>

          <TouchableOpacity
            onPress={() => navigation.goBack()}
            style={{ alignItems: 'center', marginTop: 16 }}
          >
            <Text style={{ color: '#666', fontSize: 15 }}>← Back</Text>
          </TouchableOpacity>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

export function Step5Verify() {
  const navigation = useNavigation();
  const { startVerification, verifyCode, loading, error, draft } =
    useBizOnboarding();
  const [method, setMethod] = useState('domain_email');
  const [code, setCode] = useState('');
  const [codeSent, setCodeSent] = useState(false);
  const codeInputRef = useRef(null);

  const handleSendCode = async () => {
    await startVerification(method);
    setCodeSent(true);
    // Focus on code input after a moment
    setTimeout(() => {
      codeInputRef.current?.focus();
    }, 300);
  };

  const handleVerifyCode = async () => {
    if (code.length < 6) {
      Alert.alert('Invalid Code', 'Please enter the 6-digit verification code.');
      return;
    }
    try {
      await verifyCode(code);
      navigation.navigate('Step8');
    } catch (err) {
      // Error is already set in store
    }
  };

  // Auto-submit when code is 6 digits
  useEffect(() => {
    if (code.length === 6 && codeSent) {
      handleVerifyCode();
    }
  }, [code]);

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: '#F8F9FA' }}>
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        style={{ flex: 1 }}
      >
        <ScrollView contentContainerStyle={{ padding: 20 }}>
          <ProgressBar currentStep={5} totalSteps={6} />

          <View style={{ alignItems: 'center', marginBottom: 24 }}>
            <Ionicons name="shield-checkmark" size={64} color="#2F80ED" />
          </View>

          <Text style={{ fontSize: 24, fontWeight: '700', color: '#1A1A1A', marginBottom: 8 }}>
            Verify your business
          </Text>
          <Text style={{ fontSize: 15, color: '#666', marginBottom: 24, lineHeight: 22 }}>
            We'll send you a verification code to confirm your business details.
          </Text>

          {!codeSent ? (
            <>
              <Text style={{ fontSize: 14, fontWeight: '600', color: '#1A1A1A', marginBottom: 12 }}>
                Choose verification method
              </Text>
              <View style={{ marginBottom: 24 }}>
                <TouchableOpacity
                  onPress={() => setMethod('domain_email')}
                  style={{
                    flexDirection: 'row',
                    alignItems: 'center',
                    padding: 16,
                    borderWidth: 2,
                    borderColor: method === 'domain_email' ? '#2F80ED' : '#E0E0E0',
                    backgroundColor: method === 'domain_email' ? '#EBF5FF' : '#FFF',
                    borderRadius: 12,
                    marginBottom: 12,
                  }}
                >
                  <Ionicons
                    name="mail"
                    size={24}
                    color={method === 'domain_email' ? '#2F80ED' : '#666'}
                    style={{ marginRight: 12 }}
                  />
                  <View style={{ flex: 1 }}>
                    <Text style={{ fontSize: 16, fontWeight: '600', color: '#1A1A1A' }}>
                      Email Verification
                    </Text>
                    <Text style={{ fontSize: 13, color: '#666', marginTop: 2 }}>
                      Send code to your business email
                    </Text>
                  </View>
                  <View
                    style={{
                      width: 24,
                      height: 24,
                      borderRadius: 12,
                      borderWidth: 2,
                      borderColor: method === 'domain_email' ? '#2F80ED' : '#CCC',
                      alignItems: 'center',
                      justifyContent: 'center',
                    }}
                  >
                    {method === 'domain_email' && (
                      <View
                        style={{
                          width: 12,
                          height: 12,
                          borderRadius: 6,
                          backgroundColor: '#2F80ED',
                        }}
                      />
                    )}
                  </View>
                </TouchableOpacity>

                <TouchableOpacity
                  onPress={() => setMethod('sms')}
                  style={{
                    flexDirection: 'row',
                    alignItems: 'center',
                    padding: 16,
                    borderWidth: 2,
                    borderColor: method === 'sms' ? '#2F80ED' : '#E0E0E0',
                    backgroundColor: method === 'sms' ? '#EBF5FF' : '#FFF',
                    borderRadius: 12,
                  }}
                >
                  <Ionicons
                    name="phone-portrait"
                    size={24}
                    color={method === 'sms' ? '#2F80ED' : '#666'}
                    style={{ marginRight: 12 }}
                  />
                  <View style={{ flex: 1 }}>
                    <Text style={{ fontSize: 16, fontWeight: '600', color: '#1A1A1A' }}>
                      SMS Verification
                    </Text>
                    <Text style={{ fontSize: 13, color: '#666', marginTop: 2 }}>
                      Send code to your phone
                    </Text>
                  </View>
                  <View
                    style={{
                      width: 24,
                      height: 24,
                      borderRadius: 12,
                      borderWidth: 2,
                      borderColor: method === 'sms' ? '#2F80ED' : '#CCC',
                      alignItems: 'center',
                      justifyContent: 'center',
                    }}
                  >
                    {method === 'sms' && (
                      <View
                        style={{
                          width: 12,
                          height: 12,
                          borderRadius: 6,
                          backgroundColor: '#2F80ED',
                        }}
                      />
                    )}
                  </View>
                </TouchableOpacity>
              </View>

              <TouchableOpacity
                disabled={loading}
                onPress={handleSendCode}
                style={{
                  backgroundColor: loading ? '#CCC' : '#2F80ED',
                  padding: 16,
                  borderRadius: 12,
                  alignItems: 'center',
                  shadowColor: '#000',
                  shadowOffset: { width: 0, height: 2 },
                  shadowOpacity: 0.1,
                  shadowRadius: 4,
                  elevation: 3,
                }}
              >
                {loading ? (
                  <ActivityIndicator color="#FFF" />
                ) : (
                  <Text style={{ color: '#FFF', fontWeight: '600', fontSize: 16 }}>
                    Send Verification Code
                  </Text>
                )}
              </TouchableOpacity>
            </>
          ) : (
            <>
              <View
                style={{
                  backgroundColor: '#E8F5E9',
                  padding: 12,
                  borderRadius: 10,
                  marginBottom: 24,
                  flexDirection: 'row',
                  alignItems: 'center',
                }}
              >
                <Ionicons name="checkmark-circle" size={24} color="#27AE60" style={{ marginRight: 8 }} />
                <Text style={{ color: '#27AE60', fontSize: 14, flex: 1 }}>
                  Code sent to {method === 'sms' ? 'your phone' : 'your email'}!
                </Text>
              </View>

              {draft?.devCode && (
                <View
                  style={{
                    backgroundColor: '#FFF9E6',
                    padding: 12,
                    borderRadius: 10,
                    marginBottom: 16,
                    borderLeftWidth: 4,
                    borderLeftColor: '#F2994A',
                  }}
                >
                  <Text style={{ fontSize: 12, color: '#666', marginBottom: 4 }}>
                    🔧 DEV MODE - Your code:
                  </Text>
                  <Text style={{ fontSize: 24, fontWeight: '700', color: '#F2994A', letterSpacing: 4 }}>
                    {draft.devCode}
                  </Text>
                </View>
              )}

              <Text style={{ fontSize: 14, fontWeight: '600', color: '#1A1A1A', marginBottom: 8 }}>
                Enter Verification Code
              </Text>
              <TextInput
                ref={codeInputRef}
                placeholder='123456'
                value={code}
                onChangeText={(text) => setCode(text.replace(/[^0-9]/g, ''))}
                keyboardType='number-pad'
                maxLength={6}
                style={{
                  borderWidth: 2,
                  borderColor: code.length === 6 ? '#27AE60' : '#E0E0E0',
                  backgroundColor: '#FFF',
                  borderRadius: 10,
                  padding: 16,
                  fontSize: 24,
                  fontWeight: '600',
                  letterSpacing: 8,
                  textAlign: 'center',
                  marginBottom: 16,
                }}
              />

              <TouchableOpacity
                disabled={code.length !== 6 || loading}
                onPress={handleVerifyCode}
                style={{
                  backgroundColor: code.length !== 6 || loading ? '#CCC' : '#27AE60',
                  padding: 16,
                  borderRadius: 12,
                  alignItems: 'center',
                  shadowColor: '#000',
                  shadowOffset: { width: 0, height: 2 },
                  shadowOpacity: 0.1,
                  shadowRadius: 4,
                  elevation: 3,
                  marginBottom: 12,
                }}
              >
                {loading ? (
                  <ActivityIndicator color="#FFF" />
                ) : (
                  <Text style={{ color: '#FFF', fontWeight: '600', fontSize: 16 }}>
                    Verify Code
                  </Text>
                )}
              </TouchableOpacity>

              <TouchableOpacity
                onPress={() => {
                  setCodeSent(false);
                  setCode('');
                }}
                style={{ alignItems: 'center' }}
              >
                <Text style={{ color: '#2F80ED', fontSize: 14 }}>
                  ← Change verification method
                </Text>
              </TouchableOpacity>
            </>
          )}

          {error && (
            <View
              style={{
                backgroundColor: '#FEE',
                padding: 12,
                borderRadius: 8,
                marginTop: 16,
                borderLeftWidth: 4,
                borderLeftColor: '#E53E3E',
              }}
            >
              <Text style={{ color: '#C53030', fontSize: 14 }}>{error}</Text>
            </View>
          )}

          <TouchableOpacity
            onPress={() => navigation.goBack()}
            style={{ alignItems: 'center', marginTop: 24 }}
          >
            <Text style={{ color: '#666', fontSize: 15 }}>← Back</Text>
          </TouchableOpacity>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

export function Step6Team() {
  const navigation = useNavigation();
  const { addMember, loading, error } = useBizOnboarding();
  const [email, setEmail] = useState('');
  const [role, setRole] = useState('Manager');
  return (
    <SafeAreaView style={{ flex: 1 }}>
      <View style={{ flex: 1, padding: 20 }}>
        <Text style={{ fontSize: 18, fontWeight: '700' }}>Team members</Text>
        <TextInput
          placeholder='Member email'
          value={email}
          onChangeText={setEmail}
          style={{
            borderWidth: 1,
            borderColor: '#ddd',
            borderRadius: 8,
            padding: 10,
            marginTop: 12,
          }}
        />
        <TextInput
          placeholder='Role (Owner|Manager|Staff)'
          value={role}
          onChangeText={setRole}
          style={{
            borderWidth: 1,
            borderColor: '#ddd',
            borderRadius: 8,
            padding: 10,
            marginTop: 12,
          }}
        />
        <TouchableOpacity
          disabled={loading}
          onPress={async () => {
            await addMember({ email, role });
            navigation.navigate('Step7');
          }}
          style={{
            backgroundColor: '#2F80ED',
            padding: 12,
            borderRadius: 8,
            marginTop: 16,
          }}
        >
          <Text
            style={{ color: '#fff', fontWeight: '600', textAlign: 'center' }}
          >
            Add member
          </Text>
        </TouchableOpacity>
        {error ? (
          <Text style={{ color: 'red', marginTop: 8 }}>{error}</Text>
        ) : null}
      </View>
    </SafeAreaView>
  );
}

export function Step7Privacy() {
  const navigation = useNavigation();
  const { setPrivacy, loading, error, draft } = useBizOnboarding();
  const [share, setShare] = useState(draft?.privacy?.analyticsShare !== false);
  return (
    <SafeAreaView style={{ flex: 1 }}>
      <View style={{ flex: 1, padding: 20 }}>
        <Text style={{ fontSize: 18, fontWeight: '700' }}>Data sharing</Text>
        <Text style={{ marginTop: 8 }}>
          You’ll see aggregated analytics only; cohorts &lt;5 hidden.
        </Text>
        <TouchableOpacity
          onPress={() => setShare(!share)}
          style={{
            marginTop: 16,
            padding: 10,
            borderWidth: 1,
            borderColor: '#ccc',
            borderRadius: 8,
          }}
        >
          <Text>
            {share ? 'analyticsShare: true' : 'analyticsShare: false'}
          </Text>
        </TouchableOpacity>
        <TouchableOpacity
          disabled={loading}
          onPress={async () => {
            await setPrivacy(share);
            navigation.navigate('Step8');
          }}
          style={{
            backgroundColor: '#2F80ED',
            padding: 12,
            borderRadius: 8,
            marginTop: 16,
          }}
        >
          <Text
            style={{ color: '#fff', fontWeight: '600', textAlign: 'center' }}
          >
            Save & Continue
          </Text>
        </TouchableOpacity>
        {error ? (
          <Text style={{ color: 'red', marginTop: 8 }}>{error}</Text>
        ) : null}
      </View>
    </SafeAreaView>
  );
}

export function Step8Review({ navigation }) {
  const { submit, loading, error } = useBizOnboarding();
  const goToBizProfile = () => {
    const parent = navigation?.getParent?.();
    if (parent?.navigate) {
      parent.navigate('BusinessTabs', { screen: 'BizProfile' });
    } else if (navigation?.navigate) {
      navigation.navigate('BizProfile');
    }
  };
  return (
    <SafeAreaView style={{ flex: 1 }}>
      <View style={{ flex: 1, padding: 20 }}>
        <Text style={{ fontSize: 18, fontWeight: '700' }}>Review & submit</Text>
        <Text style={{ marginVertical: 8 }}>
          We’ll warn for missing logo/cover (not blocking)
        </Text>
        <TouchableOpacity
          disabled={loading}
          onPress={async () => {
            await submit(false);
            goToBizProfile();
          }}
          style={{
            backgroundColor: '#27AE60',
            padding: 12,
            borderRadius: 8,
            marginTop: 16,
          }}
        >
          <Text
            style={{ color: '#fff', fontWeight: '600', textAlign: 'center' }}
          >
            Set active
          </Text>
        </TouchableOpacity>
        <TouchableOpacity
          disabled={loading}
          onPress={async () => {
            await submit(true);
            goToBizProfile();
          }}
          style={{
            backgroundColor: '#F2994A',
            padding: 12,
            borderRadius: 8,
            marginTop: 12,
          }}
        >
          <Text
            style={{ color: '#fff', fontWeight: '600', textAlign: 'center' }}
          >
            Submit for review
          </Text>
        </TouchableOpacity>
        {error ? (
          <Text style={{ color: 'red', marginTop: 8 }}>{error}</Text>
        ) : null}
      </View>
    </SafeAreaView>
  );
}
