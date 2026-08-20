import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'com.personalfinance.manager',
  appName: 'MoneyMa',
  webDir: 'build',
  android: {
    allowMixedContent: false,
    captureInput: true,
    // ไม่ตั้งค่านี้ตรง ๆ — Capacitor จะใช้ค่าเริ่มต้น = isDebug
    // debug build เปิด chrome://inspect ได้ / release build ยังปิดสนิทเหมือนเดิม
    // ถ้าใส่ false ไว้ debug build จะ inspect ไม่ได้ = เทสต์บนเครื่องจริงแทบไม่ได้เลย
  },
  plugins: {
    SplashScreen: {
      launchShowDuration: 1500,
      backgroundColor: '#1a1a2e',
      showSpinner: false,
    },
    PushNotifications: {
      presentationOptions: ['badge', 'sound', 'alert'],
    },
  },
};

export default config;
