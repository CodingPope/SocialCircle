// Description: Minimal placeholder screens for business onboarding steps.
import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  ScrollView,
  Alert,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useNavigation } from '@react-navigation/native';
import { useBizOnboarding } from '../../stores/businessOnboardingStore';
import { db, storage } from '../../../../firebase/config';
import { useAuth } from '../../../auth/context/AuthContext';
import * as ImagePicker from 'expo-image-picker';

export function Step0ChooseType({ navigation: navProp }) {
  const navigation = useNavigation();
  const { start, loading, error } = useBizOnboarding();
  const [type, setType] = useState('single');
  return (
    <SafeAreaView style={{ flex: 1 }}>
      <View style={{ flex: 1, padding: 20 }}>
        <Text style={{ fontSize: 22, fontWeight: '700' }}>
          Create a Business Account
        </Text>
        <Text style={{ marginTop: 8 }}>Choose account type</Text>
        <View style={{ flexDirection: 'row', marginVertical: 16 }}>
          {['single', 'multi'].map((t) => (
            <TouchableOpacity
              key={t}
              onPress={() => setType(t)}
              style={{
                marginRight: 12,
                padding: 10,
                borderWidth: 1,
                borderColor: type === t ? '#2F80ED' : '#ccc',
                borderRadius: 8,
              }}
            >
              <Text style={{ color: type === t ? '#2F80ED' : '#333' }}>
                {t}
              </Text>
            </TouchableOpacity>
          ))}
        </View>
        <TouchableOpacity
          disabled={loading}
          onPress={async () => {
            await start(type);
            navigation.navigate('Step1');
          }}
          style={{ backgroundColor: '#2F80ED', padding: 12, borderRadius: 8 }}
        >
          <Text
            style={{ color: '#fff', fontWeight: '600', textAlign: 'center' }}
          >
            Start
          </Text>
        </TouchableOpacity>
        {error ? (
          <Text style={{ color: 'red', marginTop: 8 }}>{error}</Text>
        ) : null}
      </View>
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

  const [categories, setCategories] = useState([]); // [{id,name,interests:[{name}]}]
  const [catFilter, setCatFilter] = useState('');
  const [selectedCategoryId, setSelectedCategoryId] = useState(null);
  const [selectedInterests, setSelectedInterests] = useState([]);

  useEffect(() => {
    let mounted = true;
    (async () => {
      try {
        const snap = await db.collection('categories').get();
        const list = snap.docs.map((d) => ({ id: d.id, ...(d.data() || {}) }));
        if (mounted) setCategories(list);
      } catch {}
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

  return (
    <SafeAreaView style={{ flex: 1 }}>
      <ScrollView contentContainerStyle={{ padding: 20 }}>
        <Text style={{ fontSize: 18, fontWeight: '700' }}>Business basics</Text>
        {/* Core fields */}
        {[
          { p: 'Display name', v: displayName, s: setDisplayName },
          { p: 'Description (<=160)', v: description, s: setDescription },
          { p: 'Website', v: website, s: setWebsite },
          { p: 'Support Email', v: supportEmail, s: setSupportEmail },
          { p: 'Phone', v: phone, s: setPhone },
        ].map((f, idx) => (
          <TextInput
            key={idx}
            placeholder={f.p}
            value={f.v}
            onChangeText={f.s}
            style={{
              borderWidth: 1,
              borderColor: '#ddd',
              borderRadius: 8,
              padding: 10,
              marginTop: 12,
            }}
          />
        ))}

        {/* Categories from DB */}
        <Text style={{ marginTop: 20, fontWeight: '700' }}>Category</Text>
        <TextInput
          placeholder='Search categories'
          value={catFilter}
          onChangeText={setCatFilter}
          style={{
            borderWidth: 1,
            borderColor: '#ddd',
            borderRadius: 8,
            padding: 10,
            marginTop: 8,
          }}
        />
        <View style={{ marginTop: 8 }}>
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
                }}
                style={{
                  padding: 10,
                  borderWidth: 1,
                  borderColor: selectedCategoryId === c.id ? '#2F80ED' : '#eee',
                  borderRadius: 8,
                  marginTop: 6,
                }}
              >
                <Text
                  style={{
                    color: selectedCategoryId === c.id ? '#2F80ED' : '#333',
                    fontWeight: selectedCategoryId === c.id ? '700' : '500',
                  }}
                >
                  {c.name || c.id}
                </Text>
              </TouchableOpacity>
            ))}
        </View>

        {/* Interests for selected category */}
        {selectedCategoryId ? (
          <View style={{ marginTop: 16 }}>
            <Text style={{ fontWeight: '700' }}>Interests</Text>
            <View style={{ marginTop: 8 }}>
              {interestsForCategory.map((name) => (
                <TouchableOpacity
                  key={name}
                  onPress={() => toggleInterest(name)}
                  style={{
                    padding: 10,
                    borderWidth: 1,
                    borderColor: selectedInterests.includes(name)
                      ? '#2F80ED'
                      : '#eee',
                    borderRadius: 8,
                    marginTop: 6,
                  }}
                >
                  <Text
                    style={{
                      color: selectedInterests.includes(name)
                        ? '#2F80ED'
                        : '#333',
                    }}
                  >
                    {selectedInterests.includes(name) ? '✓ ' : ''}
                    {name}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>
          </View>
        ) : null}

        <TouchableOpacity
          disabled={loading}
          onPress={async () => {
            if (!displayName || !selectedCategoryId) return;
            await saveBasics({
              displayName,
              category: selectedCategory?.name || selectedCategoryId,
              description,
              website,
              supportEmail,
              phone,
            });
            // Save selected interests early; policies can be set later
            if (selectedInterests.length) {
              await saveAudience({ interests: selectedInterests });
            }
            navigation.navigate('Step2');
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
      </ScrollView>
    </SafeAreaView>
  );
}

export function Step2Brand() {
  const navigation = useNavigation();
  const { saveBrand, loading, error, draft } = useBizOnboarding();
  const { user } = useAuth();
  const [logoUrl, setLogoUrl] = useState(draft?.logoUrl || '');
  const [coverUrl, setCoverUrl] = useState(draft?.coverUrl || '');

  // Helper: pick from gallery and upload to Firebase Storage
  const pickAndUpload = async (kind) => {
    if (!user?.uid) {
      Alert.alert(
        'Sign in required',
        'You need an account to upload brand assets.'
      );
      return;
    }
    try {
      const res = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ImagePicker.MediaTypeOptions.Images,
        quality: 0.9,
      });
      if (res.canceled || !res.assets?.length) return;
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
      if (kind === 'logo') setLogoUrl(url);
      else setCoverUrl(url);
    } catch (uploadError) {
      console.warn('Business asset upload failed', uploadError);
      Alert.alert(
        'Upload failed',
        'Unable to upload that image. Please try again.'
      );
    }
  };

  return (
    <SafeAreaView style={{ flex: 1 }}>
      <View style={{ flex: 1, padding: 20 }}>
        <Text style={{ fontSize: 18, fontWeight: '700' }}>Brand assets</Text>
        <Text style={{ marginTop: 8 }}>
          Upload or paste URLs for your logo and cover.
        </Text>

        <View style={{ marginTop: 12 }}>
          <TouchableOpacity
            disabled={loading}
            onPress={() => pickAndUpload('logo')}
            style={{ backgroundColor: '#eee', padding: 10, borderRadius: 8 }}
          >
            <Text>Pick Logo Image</Text>
          </TouchableOpacity>
          <TextInput
            placeholder='Logo URL'
            value={logoUrl}
            onChangeText={setLogoUrl}
            style={{
              borderWidth: 1,
              borderColor: '#ddd',
              borderRadius: 8,
              padding: 10,
              marginTop: 8,
            }}
          />
        </View>

        <View style={{ marginTop: 12 }}>
          <TouchableOpacity
            disabled={loading}
            onPress={() => pickAndUpload('cover')}
            style={{ backgroundColor: '#eee', padding: 10, borderRadius: 8 }}
          >
            <Text>Pick Cover Image</Text>
          </TouchableOpacity>
          <TextInput
            placeholder='Cover URL'
            value={coverUrl}
            onChangeText={setCoverUrl}
            style={{
              borderWidth: 1,
              borderColor: '#ddd',
              borderRadius: 8,
              padding: 10,
              marginTop: 8,
            }}
          />
        </View>

        <TouchableOpacity
          disabled={loading}
          onPress={async () => {
            await saveBrand({ logoUrl, coverUrl });
            navigation.navigate('Step3');
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

export function Step3Location() {
  const navigation = useNavigation();
  const { addLocation, loading, error } = useBizOnboarding();
  const [label, setLabel] = useState('');
  const [address, setAddress] = useState('');
  const [city, setCity] = useState('');
  const [state, setState] = useState('');
  const [country, setCountry] = useState('US');
  const [latitude, setLatitude] = useState('');
  const [longitude, setLongitude] = useState('');
  return (
    <SafeAreaView style={{ flex: 1 }}>
      <ScrollView contentContainerStyle={{ padding: 20 }}>
        <Text style={{ fontSize: 18, fontWeight: '700' }}>Add a location</Text>
        {[
          { p: 'Label', v: label, s: setLabel },
          { p: 'Address', v: address, s: setAddress },
          { p: 'City', v: city, s: setCity },
          { p: 'State', v: state, s: setState },
          { p: 'Country', v: country, s: setCountry },
          { p: 'Latitude', v: latitude, s: setLatitude },
          { p: 'Longitude', v: longitude, s: setLongitude },
        ].map((f, idx) => (
          <TextInput
            key={idx}
            placeholder={f.p}
            value={String(f.v)}
            onChangeText={f.s}
            style={{
              borderWidth: 1,
              borderColor: '#ddd',
              borderRadius: 8,
              padding: 10,
              marginTop: 12,
            }}
          />
        ))}
        <TouchableOpacity
          disabled={loading}
          onPress={async () => {
            await addLocation({
              label,
              address,
              city,
              state,
              country,
              latitude: Number(latitude),
              longitude: Number(longitude),
            });
            navigation.navigate('Step4');
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
      </ScrollView>
    </SafeAreaView>
  );
}

export function Step4Audience() {
  const navigation = useNavigation();
  const { saveAudience, loading, error } = useBizOnboarding();
  const [ageRestriction, setAgeRestriction] = useState('none');
  const [genderRestriction, setGenderRestriction] = useState('none');
  const [interests, setInterests] = useState('');
  const [houseRules, setHouseRules] = useState('');
  return (
    <SafeAreaView style={{ flex: 1 }}>
      <View style={{ flex: 1, padding: 20 }}>
        <Text style={{ fontSize: 18, fontWeight: '700' }}>
          Audience & policies
        </Text>
        {[
          {
            p: 'Age Restriction (none|18+|21+)',
            v: ageRestriction,
            s: setAgeRestriction,
          },
          {
            p: 'Gender Restriction (none|women_only|men_only|other)',
            v: genderRestriction,
            s: setGenderRestriction,
          },
          { p: 'Interests (comma separated)', v: interests, s: setInterests },
          { p: 'House Rules', v: houseRules, s: setHouseRules },
        ].map((f, idx) => (
          <TextInput
            key={idx}
            placeholder={f.p}
            value={f.v}
            onChangeText={f.s}
            style={{
              borderWidth: 1,
              borderColor: '#ddd',
              borderRadius: 8,
              padding: 10,
              marginTop: 12,
            }}
          />
        ))}
        <TouchableOpacity
          disabled={loading}
          onPress={async () => {
            await saveAudience({
              ageRestriction,
              genderRestriction,
              interests: interests
                .split(',')
                .map((s) => s.trim())
                .filter(Boolean),
              houseRules,
            });
            navigation.navigate('Step5');
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

export function Step5Verify() {
  const navigation = useNavigation();
  const { startVerification, verifyCode, loading, error, draft } =
    useBizOnboarding();
  const [method, setMethod] = useState('domain_email');
  const [code, setCode] = useState('');
  return (
    <SafeAreaView style={{ flex: 1 }}>
      <View style={{ flex: 1, padding: 20 }}>
        <Text style={{ fontSize: 18, fontWeight: '700' }}>Verification</Text>
        <View style={{ flexDirection: 'row', marginVertical: 12 }}>
          {['domain_email', 'sms'].map((m) => (
            <TouchableOpacity
              key={m}
              onPress={() => setMethod(m)}
              style={{
                marginRight: 12,
                padding: 10,
                borderWidth: 1,
                borderColor: method === m ? '#2F80ED' : '#ccc',
                borderRadius: 8,
              }}
            >
              <Text style={{ color: method === m ? '#2F80ED' : '#333' }}>
                {m}
              </Text>
            </TouchableOpacity>
          ))}
        </View>
        <TouchableOpacity
          disabled={loading}
          onPress={() => startVerification(method)}
          style={{ backgroundColor: '#2F80ED', padding: 12, borderRadius: 8 }}
        >
          <Text
            style={{ color: '#fff', fontWeight: '600', textAlign: 'center' }}
          >
            Send code
          </Text>
        </TouchableOpacity>
        {draft?.devCode ? (
          <Text style={{ marginTop: 8 }}>Dev code: {draft.devCode}</Text>
        ) : null}
        <TextInput
          placeholder='Enter code'
          value={code}
          onChangeText={setCode}
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
            await verifyCode(code);
            // UPDATED: jump to Review since Team/Privacy are removed
            navigation.navigate('Step8');
          }}
          style={{
            backgroundColor: '#2F80ED',
            padding: 12,
            borderRadius: 8,
            marginTop: 12,
          }}
        >
          <Text
            style={{ color: '#fff', fontWeight: '600', textAlign: 'center' }}
          >
            Verify
          </Text>
        </TouchableOpacity>
        {error ? (
          <Text style={{ color: 'red', marginTop: 8 }}>{error}</Text>
        ) : null}
      </View>
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
