import type { CapacitorConfig } from '@capacitor/cli';

/** Capacitor wraps the mobile web build (out/mobile) in native Android and iOS apps. */
const config: CapacitorConfig = {
  appId: 'com.spritegen.mobile',
  appName: 'SpriteGen',
  webDir: 'out/mobile',
  backgroundColor: '#15161c',
  android: { path: 'mobile/android' },
  ios: { path: 'mobile/ios' },
  plugins: {
    // Native HTTP is used explicitly via createNativeFetch(); window.fetch is left unpatched.
    CapacitorHttp: { enabled: false },
  },
};

export default config;
