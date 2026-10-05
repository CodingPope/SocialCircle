#!/bin/bash
# Description: Test Firebase Auth API directly to isolate the issue

if [ -z "$FIREBASE_WEB_API_KEY" ]; then
  echo "❌ Set FIREBASE_WEB_API_KEY in your environment before running this script (do not hardcode it)." >&2
  exit 1
fi
API_KEY="$FIREBASE_WEB_API_KEY"
TEST_EMAIL="${TEST_EMAIL:-qwer@gmail.com}"
TEST_PASSWORD="${TEST_PASSWORD:-test123}"  # UPDATE THIS WITH ACTUAL PASSWORD, or export TEST_PASSWORD

echo "🧪 Testing Firebase Auth REST API..."
echo ""
echo "Project: social-scene1"
echo "Email: $TEST_EMAIL"
echo ""

# Test signInWithPassword
echo "📡 Attempting REST API login..."
RESPONSE=$(curl -s "https://identitytoolkit.googleapis.com/v1/accounts:signInWithPassword?key=$API_KEY" \
  -H "Content-Type: application/json" \
  -d "{\"email\":\"$TEST_EMAIL\",\"password\":\"$TEST_PASSWORD\",\"returnSecureToken\":true}")

# Check if successful
if echo "$RESPONSE" | grep -q "idToken"; then
  echo "✅ REST API login SUCCESSFUL!"
  echo ""
  echo "User ID: $(echo $RESPONSE | jq -r '.localId' 2>/dev/null)"
  echo "Email: $(echo $RESPONSE | jq -r '.email' 2>/dev/null)"
  echo ""
  echo "🎯 This means:"
  echo "  - Firebase Auth API is working ✅"
  echo "  - Email/Password is enabled ✅"
  echo "  - User credentials are correct ✅"
  echo "  - API key is valid ✅"
  echo ""
  echo "⚠️  The issue is in the iOS app's Firebase SDK configuration!"
else
  echo "❌ REST API login FAILED"
  echo ""
  echo "Error response:"
  echo "$RESPONSE" | jq '.' 2>/dev/null || echo "$RESPONSE"
  echo ""
  echo "Possible issues:"
  echo "  - Wrong password"
  echo "  - User doesn't exist"
  echo "  - API key mismatch"
  echo "  - Email/Password auth disabled"
fi
