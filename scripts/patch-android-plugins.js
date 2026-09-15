#!/usr/bin/env node
/**
 * patch-android-plugins.js
 *
 * ปลั๊กอิน Capacitor บางตัวใน node_modules ยังเขียน
 *     getDefaultProguardFile('proguard-android.txt')
 * ซึ่ง Android Gradle Plugin 9 ขึ้นไป "ไม่รองรับแล้ว" เพราะไฟล์นั้นมี -dontoptimize
 * ทำให้ R8 ปรับแต่งไม่ได้ ผลคือ build release ล้มทันทีตั้งแต่ตอน evaluate project:
 *
 *   A problem occurred evaluating project ':capacitor-community-apple-sign-in'
 *   > getDefaultProguardFile('proguard-android.txt') is no longer supported
 *
 * 🔴 แก้ที่ node_modules ตรง ๆ จะหายทุกครั้งที่ npm install
 *    สคริปต์นี้จึงถูกเรียกจาก postinstall และจาก build-aab.sh เพื่อให้แก้ซ้ำได้เสมอ
 */

const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..', 'node_modules');
const BAD = "getDefaultProguardFile('proguard-android.txt')";
const GOOD = "getDefaultProguardFile('proguard-android-optimize.txt')";

/** ไล่หาไฟล์ android/build.gradle ของทุกปลั๊กอิน (ลึกไม่เกิน 3 ชั้นจาก node_modules) */
function findGradleFiles(dir, depth = 0) {
  if (depth > 3 || !fs.existsSync(dir)) return [];
  const out = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (!entry.isDirectory()) continue;
    if (entry.name === '.bin' || entry.name === 'node_modules') continue;
    const sub = path.join(dir, entry.name);
    const gradle = path.join(sub, 'android', 'build.gradle');
    if (fs.existsSync(gradle)) out.push(gradle);
    out.push(...findGradleFiles(sub, depth + 1));
  }
  return out;
}

let patched = 0;
for (const file of findGradleFiles(ROOT)) {
  const src = fs.readFileSync(file, 'utf8');
  if (!src.includes(BAD)) continue;
  fs.writeFileSync(file, src.split(BAD).join(GOOD), 'utf8');
  console.log(`  patched  ${path.relative(path.join(__dirname, '..'), file)}`);
  patched += 1;
}

console.log(
  patched > 0
    ? `android plugins: patched ${patched} file(s) (proguard-android.txt -> proguard-android-optimize.txt)`
    : 'android plugins: ไม่มีอะไรต้องแก้'
);
