export default function SignInScreen() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);

  const handleSignIn = async () => {
    setLoading(true);
    try {
      await signInWithEmailAndPassword(auth, email, password);
      // ← NO navigation.replace here
    } catch (err) {
      Alert.alert('Login failed', err.message);
    } finally {
      setLoading(false);
    }
  };

  return loading ? (
    <ActivityIndicator style={{ marginTop: 16 }} />
  ) : (
    <Button title='Login' onPress={handleSignIn} />
  );
}
