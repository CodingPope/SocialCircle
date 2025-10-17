#!/bin/bash
# Description: Fix simulator location to use device's actual location (not hardcoded San Francisco)

set -e

echo "🔧 Fixing Simulator Location"
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

# Clear any custom location
echo "🗑️  Clearing custom location (San Francisco)..."
xcrun simctl location booted clear
echo "✅ Custom location cleared"
echo ""

# Set to use Apple Park (Cupertino, CA) - default simulator location
echo "📍 Setting simulator to default location (Apple Park, Cupertino)..."
xcrun simctl location booted set 37.3346,-122.0090
echo "✅ Location set to: 37.3346, -122.0090 (Cupertino, CA)"
echo ""

# Kill the app to clear cached location
echo "🔄 Restarting app to clear location cache..."
xcrun simctl terminate booted com.socialcirclellc.app 2>/dev/null || true
sleep 1
xcrun simctl launch booted com.socialcirclellc.app
echo "✅ App restarted"
echo ""

echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "✨ Location Fixed!"
echo ""
echo "What to check:"
echo "1. Metro console should show:"
echo "   [locationContext] GPS coords: { lat: 37.3346, lng: -122.0090 }"
echo "   [locationContext] geocoded location: { city: 'Cupertino', region: 'CA', ... }"
echo ""
echo "2. To set a different location:"
echo "   Simulator → Features → Location → Custom Location"
echo "   Or use: Simulator → Features → Location → Apple"
echo ""
echo "3. For your REAL location (on physical device):"
echo "   - Deploy to your iPhone via TestFlight or dev build"
echo "   - Location will automatically use device GPS"
echo ""
echo "🎯 The code uses Location.getCurrentPositionAsync() which"
echo "   gets the REAL device/simulator location - NOT hardcoded!"
