# TestFlight Checklist for Social Circle

## ✅ Pre-Build Requirements

- [ ] Apple Developer Account active ($99/year)
- [ ] App created in App Store Connect
- [ ] Bundle ID matches: com.socialcirclellc.app
- [ ] All environment variables set in EAS secrets:
  - FIREBASE_API_KEY
  - FIREBASE_AUTH_DOMAIN
  - FIREBASE_PROJECT_ID
  - FIREBASE_STORAGE_BUCKET
  - FIREBASE_MESSAGING_SENDER_ID
  - FIREBASE_APP_ID
  - GOOGLE_MAPS_API_KEY
  - GOOGLE_IOS_CLIENT_ID

## 🔧 Build Configuration

- Release mode (not debug)
- iOS deployment target: 15.1+
- Valid signing certificates
- Distribution provisioning profile

## 📱 TestFlight Process

1. Build with EAS or Xcode Archive
2. Upload to App Store Connect
3. Submit for TestFlight review (1-2 days)
4. Add external testers (optional)
5. Send invites to beta testers

## 🚨 Common Issues

- Missing environment variables
- Certificate/provisioning profile issues
- App Store Connect app not created
- Build number conflicts (increment for each upload)

## 🎯 Next Steps After Upload

1. Monitor build processing in App Store Connect
2. Fill out beta app information
3. Add test information for reviewers
4. Submit for beta app review
