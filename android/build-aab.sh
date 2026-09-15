#!/bin/bash
# ─────────────────────────────────────────────────────────────
#  MoneyMa — สร้างไฟล์ .aab สำหรับอัปขึ้น Google Play
#  วิธีใช้ (รันใน Terminal ของ macOS ไม่ใช่ใน Claude):
#      cd ~/projects/PFM/android && ./build-aab.sh
#
#  สคริปต์นี้จะ:
#    1. หา JDK 17+ ให้เอง (ปกติใช้ตัวที่มากับ Android Studio)
#    2. build ไฟล์ .aab พร้อมเซ็นด้วย keystore จาก keystore.properties
#    3. บอกที่อยู่ไฟล์ + ขนาด + เลขเวอร์ชัน
# ─────────────────────────────────────────────────────────────
set -e
cd "$(dirname "$0")"

echo "🔍 กำลังหา JDK 17 ขึ้นไป..."

CANDIDATES=(
  "$JAVA_HOME"
  "/Applications/Android Studio.app/Contents/jbr/Contents/Home"
  "/Applications/Android Studio Preview.app/Contents/jbr/Contents/Home"
  "$HOME/Applications/Android Studio.app/Contents/jbr/Contents/Home"
)
if [ -x /usr/libexec/java_home ]; then
  for v in 21 17; do
    P="$(/usr/libexec/java_home -v "$v" 2>/dev/null || true)"
    [ -n "$P" ] && CANDIDATES+=("$P")
  done
fi

FOUND=""
for C in "${CANDIDATES[@]}"; do
  [ -n "$C" ] && [ -x "$C/bin/java" ] || continue
  MAJOR="$("$C/bin/java" -version 2>&1 | head -1 | sed -E 's/.*"([0-9]+).*/\1/')"
  if [ "$MAJOR" -ge 17 ] 2>/dev/null; then
    FOUND="$C"
    break
  fi
done

if [ -z "$FOUND" ]; then
  echo "❌ ไม่พบ JDK 17 ขึ้นไป"
  echo "   ติดตั้ง Android Studio แล้วรันใหม่ หรือกำหนดเอง:"
  echo "   export JAVA_HOME=/path/to/jdk21 && ./build-aab.sh"
  exit 1
fi

export JAVA_HOME="$FOUND"
export PATH="$JAVA_HOME/bin:$PATH"
echo "✅ ใช้ JDK: $JAVA_HOME"
"$JAVA_HOME/bin/java" -version 2>&1 | head -1

echo "🩹 ตรวจ/แก้ปลั๊กอิน Android ที่ยังใช้ proguard-android.txt ..."
node ../scripts/patch-android-plugins.js || true
echo

VC=$(grep -oE 'versionCode +[0-9]+' app/build.gradle | grep -oE '[0-9]+')
VN=$(grep -oE 'versionName +"[^"]+"' app/build.gradle | sed -E 's/.*"(.*)"/\1/')
echo "📦 กำลัง build MoneyMa $VN (versionCode $VC) ..."
echo "   ใช้เวลาสักครู่ ครั้งแรกอาจนานถึง 10 นาที"
echo

./gradlew bundleRelease

AAB="app/build/outputs/bundle/release/app-release.aab"
if [ -f "$AAB" ]; then
  echo
  echo "🎉 เสร็จแล้ว"
  echo "   ไฟล์:    $(cd "$(dirname "$AAB")" && pwd)/$(basename "$AAB")"
  echo "   ขนาด:    $(du -h "$AAB" | cut -f1)"
  echo "   เวอร์ชัน: $VN (versionCode $VC)"
  echo "   แก้ไขล่าสุด: $(date -r "$AAB" '+%Y-%m-%d %H:%M')"
  echo
  echo "   ต่อไป: เปิด Play Console → Production → Create new release → ลากไฟล์นี้เข้าไป"
  command -v open >/dev/null && open "$(dirname "$AAB")" || true
else
  echo "❌ build จบแล้วแต่ไม่พบไฟล์ .aab"
  exit 1
fi
