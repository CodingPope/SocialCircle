#!/bin/bash
# Description: Quick test of analytics + location in simulator

set -e

echo "🧪 Testing Analytics + Location in Simulator"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""

# Check if simulator is running
BOOTED_DEVICE=$(xcrun simctl list devices | grep "Booted" | head -n 1)
if [ -z "$BOOTED_DEVICE" ]; then
  echo "❌ No simulator is currently booted"
  echo "   Start one with: npm run ios"
  exit 1
fi

echo "✅ Simulator detected: $BOOTED_DEVICE"
echo ""

# Check if app is installed
APP_INSTALLED=$(xcrun simctl listapps booted | grep "com.socialcirclellc.app" || true)
if [ -z "$APP_INSTALLED" ]; then
  echo "❌ App not installed on simulator"
  echo "   Install with: npm run ios"
  exit 1
fi

echo "✅ App installed: com.socialcirclellc.app"
echo ""

# Set a default location for testing
echo "📍 Setting simulator location to San Francisco..."
xcrun simctl location booted set 37.7749,-122.4194
echo "✅ Location set: 37.7749, -122.4194 (San Francisco)"
echo ""

# Launch with debug flag
echo "🚀 Launching app with Firebase Analytics debug mode..."
xcrun simctl launch booted com.socialcirclellc.app --args -FIRAnalyticsDebugEnabled
echo "✅ App launched with -FIRAnalyticsDebugEnabled"
echo ""

echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "✨ Next Steps:"
echo ""
echo "1. Watch Metro console for analytics logs:"
echo "   [analytics] collection ENABLED..."
echo "   [analytics] event app_open { user_location: 'San Francisco, CA' }"
echo ""
echo "2. In the app:"
echo "   • Accept location permission (if prompted)"
echo "   • Accept analytics prompt (if shown)"
echo "   • Navigate to Profile → Privacy & Info"
echo "   • Toggle 'Allow personalization' ON/OFF"
echo ""
echo "3. Open Firebase Console → Analytics → DebugView:"
echo "   • Device dropdown → Select your simulator"
echo "   • Watch events stream in real-time"
echo "   • Click events to see user_location parameter"
echo ""
echo "4. Verify blue dot on map:"
echo "   • Go to Map screen"
echo "   • You should see your location (blue dot)"
echo ""
echo "🎉 Test complete! Monitor Metro + Firebase DebugView."
