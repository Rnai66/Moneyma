/**
 * deletedTransactions.js — ทะเบียนรายการที่ผู้ใช้ลบไปแล้ว (tombstone)
 *
 * 🔴 ทำไมต้องมี
 * โหมดเริ่มต้นของแอปคือ `local` (ดู `storageMode` ใน App.js) ซึ่งแปลว่า
 * localStorage คือแหล่งความจริง แล้ว sync สองทางขึ้นคลาวด์
 * เดิมเวลาลบรายการในโหมดนี้ โค้ดลบแค่ใน localStorage ไม่เคยลบบนคลาวด์เลย
 * รอบ sync ถัดไป `syncFromCloud()` ดึงแถวนั้นกลับลงมา แล้ว `mergeTransactions()`
 * เห็นว่า "คลาวด์มี local ไม่มี" ก็ใส่คืนให้ = **ผู้ใช้ลบแล้วรายการกลับมาเอง**
 *
 * การลบโดยไม่ทิ้งร่องรอยไว้เป็นไปไม่ได้ในระบบ sync สองทาง เพราะฝั่งหนึ่ง
 * แยกไม่ออกระหว่าง "ถูกลบ" กับ "ยังไม่เคยเห็น" ทะเบียนนี้คือร่องรอยนั้น
 *
 * เก็บแค่ id + เวลาที่ลบ ไม่เก็บเนื้อรายการ และตัดของเก่าทิ้งอัตโนมัติ
 */

const KEY = 'deletedTransactionIds';
/** เก็บ tombstone ไว้นานพอให้ทุกเครื่องได้ sync เห็น แล้วค่อยทิ้ง */
const RETENTION_DAYS = 180;
/** กันทะเบียนโตไม่มีที่สิ้นสุดจนกิน quota ของ localStorage */
const MAX_ENTRIES = 5000;

function readRaw() {
  try {
    const parsed = JSON.parse(localStorage.getItem(KEY) || '[]');
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function writeRaw(entries) {
  try {
    localStorage.setItem(KEY, JSON.stringify(entries));
  } catch (error) {
    console.warn('[tombstone] เขียนทะเบียนไม่สำเร็จ:', error);
  }
}

/** ตัดของหมดอายุและของเกินโควตาออก (ใหม่สุดอยู่ก่อน) */
export function pruneDeleted(now = Date.now()) {
  const cutoff = now - RETENTION_DAYS * 24 * 60 * 60 * 1000;
  const kept = readRaw()
    .filter((e) => e && typeof e.id === 'string')
    .filter((e) => {
      const at = Date.parse(e.at);
      return Number.isFinite(at) ? at >= cutoff : true;
    })
    .sort((a, b) => (Date.parse(b.at) || 0) - (Date.parse(a.at) || 0))
    .slice(0, MAX_ENTRIES);
  writeRaw(kept);
  return kept;
}

/** บันทึกว่า id เหล่านี้ถูกลบแล้ว */
export function markDeleted(ids, at = new Date().toISOString()) {
  const list = Array.isArray(ids) ? ids : [ids];
  const clean = list.filter((id) => typeof id === 'string' && id);
  if (!clean.length) return;

  const existing = readRaw();
  const seen = new Set(existing.map((e) => e.id));
  const added = clean.filter((id) => !seen.has(id)).map((id) => ({ id, at }));
  if (!added.length) return;

  writeRaw([...added, ...existing]);
  pruneDeleted();
}

/** ยกเลิก tombstone — ใช้เมื่อผู้ใช้สร้างรายการที่ใช้ id เดิมซ้ำ */
export function unmarkDeleted(ids) {
  const drop = new Set(Array.isArray(ids) ? ids : [ids]);
  writeRaw(readRaw().filter((e) => !drop.has(e.id)));
}

/** @returns {Set<string>} id ทั้งหมดที่ถูกลบและยังไม่หมดอายุ */
export function getDeletedIds() {
  return new Set(pruneDeleted().map((e) => e.id));
}

/** ล้างทะเบียนทั้งหมด — ใช้ตอนสลับบัญชี เพราะ id คนละชุดกัน */
export function clearDeleted() {
  writeRaw([]);
}
