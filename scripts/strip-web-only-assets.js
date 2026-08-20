#!/usr/bin/env node
/**
 * strip-web-only-assets.js
 *
 * Runs after `npm run build:mobile`.
 *
 * The marketing/legal pages in public/ are meant for the Netlify site only.
 * They contain PromptPay / PayNow account numbers and personal contact
 * details, and Google Play's Payments policy forbids shipping any alternative
 * payment route inside an app that sells digital goods — even on a page the UI
 * never links to. They are also dead weight in the APK.
 *
 * Nothing in src/ references these files, so removing them from build/ before
 * `npx cap copy android` is safe.
 */

const fs = require('fs');
const path = require('path');

// 🔴 ต้องเคารพ BUILD_PATH ด้วย ไม่งั้นถ้าใครสั่ง build ไปโฟลเดอร์อื่น
// สคริปต์นี้จะไปกวาดโฟลเดอร์ build/ เก่าแทน แล้ว privacy-policy.html
// (ที่มีเลขพร้อมเพย์อยู่ข้างใน) จะติดไปกับ APK โดยไม่มีใครรู้
const BUILD_DIR = process.env.BUILD_PATH
  ? path.resolve(process.env.BUILD_PATH)
  : path.join(__dirname, '..', 'build');

const WEB_ONLY_FILES = [
  'store-listing.html',
  'privacy-policy.html',
];

let removed = 0;

for (const file of WEB_ONLY_FILES) {
  const target = path.join(BUILD_DIR, file);
  if (fs.existsSync(target)) {
    fs.unlinkSync(target);
    console.log(`  removed  ${file}`);
    removed += 1;
  }
}

// Source maps leak the original source (including web-only payment data).
// GENERATE_SOURCEMAP=false should prevent them, but sweep anyway.
function sweepMaps(dir) {
  if (!fs.existsSync(dir)) return;
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) sweepMaps(full);
    else if (entry.name.endsWith('.map')) {
      fs.unlinkSync(full);
      console.log(`  removed  ${path.relative(BUILD_DIR, full)}`);
      removed += 1;
    }
  }
}

sweepMaps(BUILD_DIR);

console.log(removed
  ? `mobile build: stripped ${removed} web-only file(s)`
  : 'mobile build: nothing to strip');
