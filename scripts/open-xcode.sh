#!/bin/bash
# Description: Open Social Circle iOS project in Xcode (opens workspace, not .xcodeproj)

set -e

echo "🚀 Opening Social Circle in Xcode..."
echo ""

WORKSPACE="ios/SocialCircle.xcworkspace"

if [ ! -d "$WORKSPACE" ]; then
  echo "❌ Workspace not found: $WORKSPACE"
  echo "   Run 'cd ios && pod install' first"
  exit 1
fi

echo "✅ Opening $WORKSPACE"
open "$WORKSPACE"

echo ""
echo "📝 Quick Tips:"
echo "   • Select simulator: Top bar → Device menu → iPhone 15 Pro"
echo "   • Build: ⌘B"
echo "   • Run: ⌘R"
echo "   • Archive: Product → Archive"
echo ""
echo "⚠️  Remember: Always open .xcworkspace, NOT .xcodeproj"
echo ""
echo "🎉 Xcode is launching..."
