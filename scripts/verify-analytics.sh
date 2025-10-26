#!/bin/bash
# Description: Verify Firebase Analytics configuration and location tracking

set -e

echo "🔍 Firebase Analytics Configuration Verification"
echo "================================================"
echo ""

# Check if Info.plist has the required flags
echo "1. Checking Info.plist configuration..."
if grep -q "FIREBASE_ANALYTICS_COLLECTION_ENABLED" ios/SocialCircle/Info.plist; then
    echo "✅ FIREBASE_ANALYTICS_COLLECTION_ENABLED found in Info.plist"
    
    if grep -A1 "FIREBASE_ANALYTICS_COLLECTION_ENABLED" ios/SocialCircle/Info.plist | grep -q "<false/>"; then
        echo "✅ FIREBASE_ANALYTICS_COLLECTION_ENABLED is set to false (correct)"
    else
        echo "⚠️  FIREBASE_ANALYTICS_COLLECTION_ENABLED is not set to false"
    fi
else
    echo "❌ FIREBASE_ANALYTICS_COLLECTION_ENABLED not found in Info.plist"
    echo "   You need to rebuild the iOS app for changes to take effect"
fi
echo ""

# Check GoogleService-Info.plist
echo "2. Checking GoogleService-Info.plist..."
if grep -q "IS_ANALYTICS_ENABLED" ios/SocialCircle/GoogleService-Info.plist; then
    if grep -A1 "IS_ANALYTICS_ENABLED" ios/SocialCircle/GoogleService-Info.plist | grep -q "<true>"; then
        echo "✅ IS_ANALYTICS_ENABLED is true in GoogleService-Info.plist"
    else
        echo "❌ IS_ANALYTICS_ENABLED is not true - analytics won't work"
    fi
else
    echo "❌ GoogleService-Info.plist missing or invalid"
fi
echo ""

# Check if @react-native-firebase/analytics is installed
echo "3. Checking analytics package..."
if grep -q "@react-native-firebase/analytics" package.json; then
    VERSION=$(grep "@react-native-firebase/analytics" package.json | sed 's/.*: "//;s/".*//')
    echo "✅ @react-native-firebase/analytics installed (version $VERSION)"
else
    echo "❌ @react-native-firebase/analytics not found in package.json"
fi
echo ""

# Check if location services are configured
echo "4. Checking location configuration..."
if grep -q "NSLocationWhenInUseUsageDescription" ios/SocialCircle/Info.plist; then
    echo "✅ Location usage description configured"
else
    echo "❌ NSLocationWhenInUseUsageDescription missing"
fi
echo ""

# Check if analytics service has location support
echo "5. Checking analytics implementation..."
if grep -q "getFormattedCity" src/services/analytics.js; then
    echo "✅ Location context integration found"
    
    if grep -q "setDefaultEventParameters" src/services/analytics.js; then
        echo "✅ Default event parameters configured"
    else
        echo "⚠️  setDefaultEventParameters not found - may affect Realtime map"
    fi
    
    if grep -q "user_location" src/services/analytics.js; then
        echo "✅ user_location parameter implemented"
    else
        echo "❌ user_location parameter missing"
    fi
else
    echo "❌ Location context integration missing"
fi
echo ""

# Summary
echo "================================================"
echo "📋 Summary"
echo "================================================"

if grep -q "FIREBASE_ANALYTICS_COLLECTION_ENABLED" ios/SocialCircle/Info.plist && \
   grep -q "IS_ANALYTICS_ENABLED" ios/SocialCircle/GoogleService-Info.plist && \
   grep -q "@react-native-firebase/analytics" package.json && \
   grep -q "getFormattedCity" src/services/analytics.js; then
    echo "✅ All checks passed! Your analytics configuration looks good."
    echo ""
    echo "🚀 Next steps:"
    echo "   1. Rebuild the iOS app: npm run ios"
    echo "   2. Enable analytics opt-in in the app"
    echo "   3. Grant location permission when prompted"
    echo "   4. Navigate between tabs to trigger events"
    echo "   5. Check Firebase Console Realtime view after 1-2 minutes"
    echo ""
    echo "   Firebase Console:"
    echo "   https://console.firebase.google.com/project/social-scene1/analytics/realtime"
else
    echo "⚠️  Some configuration issues detected. Review the checks above."
    echo ""
    echo "   See ANALYTICS_VERIFICATION.md for detailed troubleshooting"
fi
