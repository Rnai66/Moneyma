import React, { useEffect, useState } from 'react';
import { getAiQuota } from '../services/AiUsageService';

/**
 * แถบบอกโควตาสแกนฟรีที่เหลือ — วางไว้ก่อนปุ่มถ่ายรูป
 *
 * 🔴 ทำไมต้องมี: เดิมผู้ใช้แผนฟรีจะรู้ว่าโควตาหมดก็ต่อเมื่อถ่ายรูปเสร็จ
 * รอสแกน แล้วโดนเด้ง error กลับมา — เสียเวลาฟรีและอ่านเหมือนแอปพัง
 * แถบนี้บอกล่วงหน้าตั้งแต่ยังไม่กดถ่าย
 *
 * ไม่แสดงอะไรเลยเมื่อ: ยังโหลดอยู่ · ไม่ได้ล็อกอิน · อ่านยอดไม่ได้ ·
 * หรือแผนนั้นสแกนได้ไม่จำกัด (Pro / Business / Lifetime)
 */
export function quotaView(q) {
  if (!q || !q.ok || !q.limits) return null;

  const dayMax   = q.limits.ai_scans_per_day;
  const monthMax = q.limits.ai_scans_per_month;
  const unlimited = dayMax === Infinity && monthMax === Infinity;
  if (unlimited) return null;

  const dayLeft   = Number.isFinite(dayMax)   ? Math.max(0, dayMax   - (q.dailyCount   || 0)) : Infinity;
  const monthLeft = Number.isFinite(monthMax) ? Math.max(0, monthMax - (q.monthlyCount || 0)) : Infinity;

  // เพดานที่ "บีบ" กว่าคือตัวที่ผู้ใช้จะชนก่อน — โชว์ตัวนั้น
  const useDaily = dayLeft <= monthLeft;
  const left = useDaily ? dayLeft : monthLeft;
  const max  = useDaily ? dayMax  : monthMax;

  const percent = max > 0 ? Math.min(100, ((max - left) / max) * 100) : 100;
  // เตือนที่ 20% ของเพดาน แต่อย่างน้อยต้องเตือนตอนเหลือ 2 ครั้ง
  // ไม่งั้นโควตาวันละ 5 จะเตือนตอนเหลือ 1 ซึ่งสายเกินกว่าจะทันคิด
  // ใช้ชื่อคลาสเดียวกับแถบโควตาธุรกรรมใน transactions.js (is-warning / is-danger)
  const tone = left === 0 ? 'is-danger' : left <= Math.max(2, Math.ceil(max * 0.2)) ? 'is-warning' : '';

  return { left, max, percent, tone, scope: useDaily ? 'day' : 'month' };
}

export default function ScanQuotaBar({ t, onUpgrade }) {
  const [view, setView] = useState(null);

  useEffect(() => {
    let alive = true;
    getAiQuota()
      .then(q => { if (alive) setView(quotaView(q)); })
      .catch(() => { /* โควตาอ่านไม่ได้ก็แค่ไม่โชว์แถบ ไม่ขวางการสแกน */ });
    return () => { alive = false; };
  }, []);

  if (!view) return null;

  const { left, max, percent, tone, scope } = view;
  const scopeLabel = scope === 'day' ? t?.quotaDaily : t?.quotaMonthly;

  const line = left === 0
    ? t?.scanQuotaOut
    : (t?.scanQuotaLeft || '')
        .replace('{n}', left)
        .replace('{max}', max)
        .replace('{scope}', scopeLabel || '');

  return (
    <section className="quota-banner quota-banner--scan">
      <div className="quota-banner-copy">
        <span className="quota-banner-icon" style={{ display: 'inline-flex', alignItems: 'center' }}>
          <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" strokeWidth="2"><path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z"/><circle cx="12" cy="13" r="4"/></svg>
        </span>
        <div>
          <strong>{t?.scanQuotaTitle}</strong>
          <p>{line}</p>
          <div className="progress" style={{ marginTop: 'var(--space-2)' }}>
            <div className={`progress-fill ${tone}`} style={{ width: `${percent}%` }} />
          </div>
        </div>
      </div>
      {onUpgrade && (
        <button className="btn btn-sm" onClick={onUpgrade}>{t?.upgradeToPro}</button>
      )}
    </section>
  );
}
