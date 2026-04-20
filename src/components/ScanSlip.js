import React, { useState, useRef, useCallback } from 'react';
import { useSlipScan } from '../hooks/useSlipScan';
import './ScanSlip.css';

// ─── Capacitor Camera (graceful fallback on web) ───────────────────────────
import { Capacitor } from '@capacitor/core';
import { Camera, CameraSource } from '@capacitor/camera';

// ─── Category display map ──────────────────────────────────────────────────
const CATEGORY_ICONS = {
  Food: '🍔',
  Transport: '🚗',
  Shopping: '🛍️',
  Bills: '💡',
  Transfer: '👫',
  Other: '📦',
};

// ─── Main Component ────────────────────────────────────────────────────────
export default function ScanSlip({ onTransactionCreate, onClose, t }) {
  const [activeTab, setActiveTab] = useState('camera');
  // 'camera' | 'gallery' | 'autoscan'

  const {
    status,
    singleResult,
    batchProgress,
    batchResults,
    error,
    scanSingle,
    scanBatch,
    cancelBatch,
    reset,
  } = useSlipScan();

  // Form state (editable after scan)
  const [form, setForm] = useState(null);
  const [selectedBatchItems, setSelectedBatchItems] = useState(new Set());

  const galleryInputRef = useRef(null);
  const autoScanInputRef = useRef(null);

  // ─── When a single scan succeeds → pre-fill form ─────────────────────────
  const handleScanSuccess = useCallback((result) => {
    if (result?.transaction) {
      setForm({ ...result.transaction });
    }
  }, []);

  // ─── Camera capture ───────────────────────────────────────────────────────
  const handleCameraCapture = useCallback(async () => {
    if (Capacitor.isNativePlatform()) {
      // Capacitor (mobile)
      try {
        const photo = await Camera.getPhoto({
          quality: 90,
          allowEditing: false,
          resultType: 'base64',
          source: CameraSource.Camera,
        });
        // Convert Capacitor base64 photo to a File
        const byteChars = atob(photo.base64String);
        const byteArr = new Uint8Array(byteChars.length);
        for (let i = 0; i < byteChars.length; i++) byteArr[i] = byteChars.charCodeAt(i);
        const blob = new Blob([byteArr], { type: 'image/jpeg' });
        const file = new File([blob], 'camera.jpg', { type: 'image/jpeg' });
        const result = await scanSingle(file);
        handleScanSuccess(result);
      } catch (err) {
        if (err.message !== 'User cancelled photos app') {
          console.error('Camera error:', err);
        }
      }
    } else {
      // Web fallback — trigger file input with capture
      const input = document.createElement('input');
      input.type = 'file';
      input.accept = 'image/*';
      input.capture = 'environment';
      input.onchange = async (e) => {
        const file = e.target.files?.[0];
        if (file) {
          const result = await scanSingle(file);
          handleScanSuccess(result);
        }
      };
      input.click();
    }
  }, [scanSingle, handleScanSuccess]);

  // ─── Gallery single pick ──────────────────────────────────────────────────
  const handleGalleryPick = useCallback(
    async (e) => {
      const file = e.target.files?.[0];
      if (!file) return;
      e.target.value = '';
      const result = await scanSingle(file);
      handleScanSuccess(result);
    },
    [scanSingle, handleScanSuccess]
  );

  // ─── Auto-scan batch pick ─────────────────────────────────────────────────
  const handleAutoScanPick = useCallback(
    async (e) => {
      const files = Array.from(e.target.files || []);
      if (!files.length) return;
      e.target.value = '';
      await scanBatch(files);
    },
    [scanBatch]
  );

  // ─── Confirm single transaction ───────────────────────────────────────────
  const handleConfirmSingle = useCallback(() => {
    if (!form) return;
    onTransactionCreate?.([form]);
    reset();
    onClose?.();
  }, [form, onTransactionCreate, reset, onClose]);

  // ─── Confirm selected batch transactions ──────────────────────────────────
  const handleConfirmBatch = useCallback(() => {
    const toSave = batchResults
      .filter((_, i) => selectedBatchItems.has(i))
      .map((r) => r.transaction);
    if (!toSave.length) return;
    onTransactionCreate?.(toSave);
    reset();
    onClose?.();
  }, [batchResults, selectedBatchItems, onTransactionCreate, reset, onClose]);

  const toggleBatchItem = useCallback((idx) => {
    setSelectedBatchItems((prev) => {
      const next = new Set(prev);
      next.has(idx) ? next.delete(idx) : next.add(idx);
      return next;
    });
  }, []);

  const selectAllBatch = useCallback(() => {
    setSelectedBatchItems(new Set(batchResults.map((_, i) => i)));
  }, [batchResults]);

  // ─── Reset and change tab ─────────────────────────────────────────────────
  const switchTab = useCallback(
    (tab) => {
      reset();
      setForm(null);
      setSelectedBatchItems(new Set());
      setActiveTab(tab);
    },
    [reset]
  );

  // ─── Render ───────────────────────────────────────────────────────────────
  return (
    <div className="scan-slip">
      {/* Header */}
      <div className="scan-slip__header">
        <button className="scan-slip__close" onClick={onClose} aria-label="Close">
          ✕
        </button>
        <h2 className="scan-slip__title">{t?.scanSlipTitle || 'สแกนสลิป'}</h2>
        <div />
      </div>

      {/* Tabs */}
      <div className="scan-slip__tabs" role="tablist">
        {[
          { id: 'camera', icon: '📷', label: t?.scanSlipCamera || 'ถ่ายภาพ' },
          { id: 'gallery', icon: '🖼️', label: t?.scanSlipUpload || 'เลือกรูป' },
          { id: 'autoscan', icon: '🔍', label: 'Auto-scan' },
        ].map((tab) => (
          <button
            key={tab.id}
            role="tab"
            aria-selected={activeTab === tab.id}
            className={`scan-slip__tab ${activeTab === tab.id ? 'scan-slip__tab--active' : ''}`}
            onClick={() => switchTab(tab.id)}
          >
            <span className="scan-slip__tab-icon">{tab.icon}</span>
            <span className="scan-slip__tab-label">{tab.label}</span>
          </button>
        ))}
      </div>

      {/* Tab Content */}
      <div className="scan-slip__body">

        {/* ── CAMERA TAB ──────────────────────────────────────── */}
        {activeTab === 'camera' && (
          <div className="scan-slip__pane">
            {status === 'idle' && (
              <div className="scan-slip__drop-zone" onClick={handleCameraCapture}>
                <div className="scan-slip__drop-icon">📷</div>
                <p className="scan-slip__drop-title">{t?.scanSlipCamera || 'ถ่ายรูปสลิป'}</p>
                <p className="scan-slip__drop-hint">{t?.scanSlipDesc || 'แตะเพื่อเปิดกล้อง'}</p>
              </div>
            )}
            {status === 'scanning' && <ScanningIndicator t={t} />}
            {status === 'error' && (
              <ErrorState message={error} onRetry={() => { reset(); setForm(null); }} t={t} />
            )}
            {status === 'result' && singleResult && (
              <SingleResult
                result={singleResult}
                form={form}
                setForm={setForm}
                onConfirm={handleConfirmSingle}
                onRetry={() => { reset(); setForm(null); }}
                t={t}
              />
            )}
          </div>
        )}

        {/* ── GALLERY TAB ─────────────────────────────────────── */}
        {activeTab === 'gallery' && (
          <div className="scan-slip__pane">
            {status === 'idle' && (
              <div
                className="scan-slip__drop-zone"
                onClick={() => galleryInputRef.current?.click()}
                onDrop={(e) => {
                  e.preventDefault();
                  const file = e.dataTransfer.files?.[0];
                  if (file) scanSingle(file).then(handleScanSuccess);
                }}
                onDragOver={(e) => e.preventDefault()}
              >
                <div className="scan-slip__drop-icon">🖼️</div>
                <p className="scan-slip__drop-title">{t?.scanSlipUpload || 'เลือกรูปจาก Gallery'}</p>
                <p className="scan-slip__drop-hint">แตะเพื่อเลือก หรือลากไฟล์มาวาง</p>
                <input
                  ref={galleryInputRef}
                  type="file"
                  accept="image/*"
                  className="scan-slip__file-input"
                  onChange={handleGalleryPick}
                />
              </div>
            )}
            {status === 'scanning' && <ScanningIndicator t={t} />}
            {status === 'error' && (
              <ErrorState message={error} onRetry={() => { reset(); setForm(null); }} t={t} />
            )}
            {status === 'result' && singleResult && (
              <SingleResult
                result={singleResult}
                form={form}
                setForm={setForm}
                onConfirm={handleConfirmSingle}
                onRetry={() => { reset(); setForm(null); }}
                t={t}
              />
            )}
          </div>
        )}

        {/* ── AUTO-SCAN TAB ────────────────────────────────────── */}
        {activeTab === 'autoscan' && (
          <div className="scan-slip__pane">
            {status === 'idle' && (
              <div className="scan-slip__autoscan-start">
                <div className="scan-slip__drop-icon">🔍</div>
                <p className="scan-slip__drop-title">{t?.autoScanTitle || 'Auto-scan สลิปจาก Gallery'}</p>
                <p className="scan-slip__drop-hint">
                  {t?.autoScanDesc || 'เลือกรูปหลายใบ — AI จะสแกนและจัดหมวดหมู่ให้อัตโนมัติ'}
                </p>
                <button
                  className="scan-slip__btn scan-slip__btn--primary"
                  onClick={() => autoScanInputRef.current?.click()}
                >
                  {t?.chooseSlipImage || 'เลือกรูปสลิป'}
                </button>
                <input
                  ref={autoScanInputRef}
                  type="file"
                  accept="image/*"
                  multiple
                  className="scan-slip__file-input"
                  onChange={handleAutoScanPick}
                />
              </div>
            )}

            {status === 'batch_scanning' && batchProgress && (
              <BatchScanningProgress progress={batchProgress} onCancel={cancelBatch} t={t} />
            )}

            {status === 'error' && (
              <ErrorState message={error} onRetry={() => { reset(); setSelectedBatchItems(new Set()); }} t={t} />
            )}

            {status === 'batch_done' && (
              <BatchResults
                results={batchResults}
                selected={selectedBatchItems}
                onToggle={toggleBatchItem}
                onSelectAll={selectAllBatch}
                onConfirm={handleConfirmBatch}
                onRescan={() => { reset(); setSelectedBatchItems(new Set()); }}
                t={t}
              />
            )}
          </div>
        )}
      </div>
    </div>
  );
}

// ─── Sub-components ────────────────────────────────────────────────────────

function ScanningIndicator({t}) {
  return (
    <div className="scan-slip__scanning">
      <div className="scan-slip__spinner" aria-label="กำลังสแกน..." />
      <p className="scan-slip__scanning-title">{t?.scanSlipProcessing || 'AI กำลังอ่านสลิป...'}</p>
      <p className="scan-slip__scanning-hint">{t?.scanSlipHint || 'ใช้เวลาไม่กี่วินาที'}</p>
    </div>
  );
}

function ErrorState({ message, onRetry, t }) {
  return (
    <div className="scan-slip__error">
      <div className="scan-slip__error-icon">⚠️</div>
      <p className="scan-slip__error-message">{message}</p>
      <button className="scan-slip__btn scan-slip__btn--secondary" onClick={onRetry}>
        {t?.retry || 'ลองใหม่'}
      </button>
    </div>
  );
}

function SlipDetailRow({ icon, label, value }) {
  if (!value) return null;
  return (
    <div className="scan-slip__detail-row">
      <span className="scan-slip__detail-icon">{icon}</span>
      <div className="scan-slip__detail-body">
        <span className="scan-slip__detail-label">{label}</span>
        <span className="scan-slip__detail-value">{value}</span>
      </div>
    </div>
  );
}

function SingleResult({ result, form, setForm, onConfirm, onRetry, t }) {
  const { previewUrl, isDuplicate, transaction } = result;
  const tx = transaction || {};

  const handleChange = (field) => (e) =>
    setForm((prev) => ({ ...prev, [field]: e.target.value }));

  const statusColor = tx.status === 'สำเร็จ'
    ? 'var(--color-success)' : tx.status === 'ล้มเหลว'
    ? 'var(--color-danger)' : 'var(--color-text-secondary)';
  const statusIcon = tx.status === 'สำเร็จ' ? '✅' : tx.status === 'ล้มเหลว' ? '❌' : '⏳';

  return (
    <div className="scan-slip__result">
      {/* Preview */}
      <div className="scan-slip__preview-wrap">
        <img src={previewUrl} alt="สลิป" className="scan-slip__preview-img" />
        {isDuplicate && (
          <div className="scan-slip__duplicate-badge">{t?.scanSlipDuplicate || 'เคยสแกนแล้ว'}</div>
        )}
      </div>

      {/* ── Slip Details ─────────────────────────────── */}
      <div className="scan-slip__slip-detail-card">
        {/* Header: status + payment type */}
        {(tx.status || tx.payment_type) && (
          <div className="scan-slip__slip-header">
            {tx.status && (
              <span className="scan-slip__status-badge" style={{ color: statusColor }}>
                {statusIcon} {tx.payment_type || ''} {tx.status}
              </span>
            )}
            {tx.bank_name && (
              <span className="scan-slip__bank-tag">🏦 {tx.bank_name}</span>
            )}
          </div>
        )}

        {/* Date & Time */}
        <SlipDetailRow icon="📅" label="วันที่ / เวลา" value={[tx.date, tx.time].filter(Boolean).join(' · ')} />

        {/* From */}
        {(tx.sender_name || tx.sender_account) && (
          <div className="scan-slip__detail-row">
            <span className="scan-slip__detail-icon">👤</span>
            <div className="scan-slip__detail-body">
              <span className="scan-slip__detail-label">{t?.sender || 'จาก'}</span>
              <span className="scan-slip__detail-value">{tx.sender_name}</span>
              {tx.sender_account && (
                <span className="scan-slip__detail-sub">{tx.sender_account}</span>
              )}
            </div>
          </div>
        )}

        {/* To */}
        {(tx.receiver_name || tx.receiver_account) && (
          <div className="scan-slip__detail-row">
            <span className="scan-slip__detail-icon">🏢</span>
            <div className="scan-slip__detail-body">
              <span className="scan-slip__detail-label">{t?.receiver || 'ไปยัง'}{tx.receiver_bank ? ` · ${tx.receiver_bank}` : ''}</span>
              <span className="scan-slip__detail-value">{tx.receiver_name}</span>
              {tx.receiver_account && (
                <span className="scan-slip__detail-sub">{tx.receiver_account}</span>
              )}
            </div>
          </div>
        )}

        {/* Amount */}
        <div className="scan-slip__detail-row scan-slip__detail-row--amount">
          <span className="scan-slip__detail-icon">💰</span>
          <div className="scan-slip__detail-body">
            <span className="scan-slip__detail-label">{t?.amount || 'จำนวนเงิน'}</span>
            <span className="scan-slip__detail-amount">
              ฿{Number(tx.amount || 0).toLocaleString('th-TH', { minimumFractionDigits: 2 })}
            </span>
          </div>
        </div>

        {/* Sub items (itemized) */}
        {tx.sub_items?.length > 0 && (
          <div className="scan-slip__sub-items">
            {tx.sub_items.map((item, i) => (
              <div key={i} className="scan-slip__sub-item">
                <span>{item.label}</span>
                <span>฿{item.value}</span>
              </div>
            ))}
          </div>
        )}

        {/* Refs */}
        <SlipDetailRow icon="🔖" label={t?.refId || 'เลขอ้างอิง'} value={tx.ref_id} />
        <SlipDetailRow icon="🏷️" label={t?.ref2 || 'รหัสลูกค้า / Ref.2'} value={tx.ref_id2} />

        {/* Address */}
        <SlipDetailRow icon="📍" label={t?.address || 'ที่อยู่'} value={tx.address} />

        {/* Note from slip */}
        <SlipDetailRow icon="📝" label={t?.slipNote || 'หมายเหตุจากสลิป'} value={tx.note} />
      </div>

      {/* ── Editable Form ─────────────────────────────── */}
      <div className="scan-slip__result-card">
        <p className="scan-slip__result-label">{t?.editBeforeSave || 'แก้ไขก่อนบันทึก'}</p>

        <div className="scan-slip__form-row">
          <label className="scan-slip__label">{t?.thAmount || 'จำนวนเงิน'} (฿)</label>
          <input
            className="scan-slip__input"
            type="number"
            value={form?.amount ?? ''}
            onChange={handleChange('amount')}
            placeholder="0.00"
          />
        </div>

        <div className="scan-slip__form-row">
          <label className="scan-slip__label">{t?.thCategory || 'หมวดหมู่'}</label>
          <select
            className="scan-slip__input scan-slip__select"
            value={form?.category ?? 'Other'}
            onChange={handleChange('category')}
          >
            {Object.entries(CATEGORY_ICONS).map(([cat, icon]) => (
              <option key={cat} value={cat}>
                {icon} {cat}
              </option>
            ))}
          </select>
        </div>

        <div className="scan-slip__form-row">
          <label className="scan-slip__label">{t?.thDate || 'วันที่'}</label>
          <input
            className="scan-slip__input"
            type="date"
            value={form?.date ?? ''}
            onChange={handleChange('date')}
          />
        </div>

        <div className="scan-slip__form-row">
          <label className="scan-slip__label">{t?.note || 'หมายเหตุ'}</label>
          <input
            className="scan-slip__input"
            type="text"
            value={form?.note ?? ''}
            onChange={handleChange('note')}
            placeholder={t?.noteHint || 'รายละเอียดเพิ่มเติม'}
          />
        </div>

        <div className="scan-slip__result-actions">
          <button className="scan-slip__btn scan-slip__btn--secondary" onClick={onRetry}>
            {t?.rescan || 'สแกนใหม่'}
          </button>
          <button
            className="scan-slip__btn scan-slip__btn--primary"
            onClick={onConfirm}
            disabled={!form?.amount}
          >
            {t?.saveItem || 'บันทึกรายการ'} ✓
          </button>
        </div>
      </div>
    </div>
  );
}



function BatchScanningProgress({ progress, onCancel, t }) {
  const { current, total, skipped, errors } = progress;
  const pct = total ? Math.round((current / total) * 100) : 0;

  return (
    <div className="scan-slip__batch-progress">
      <div className="scan-slip__spinner" />
      <p className="scan-slip__scanning-title">
        {t?.batchScanning || 'กำลังสแกน'} {current} / {total} {t?.items || 'รูป'}
      </p>
      <div className="scan-slip__progress-bar">
        <div className="scan-slip__progress-fill" style={{ width: `${pct}%` }} />
      </div>
      <p className="scan-slip__scanning-hint">
        {t?.skipped || 'ข้าม'} {skipped} · {t?.errors || 'ผิดพลาด'} {errors}
      </p>
      <button className="scan-slip__btn scan-slip__btn--ghost" onClick={onCancel}>
        {t?.cancel || 'ยกเลิก'}
      </button>
    </div>
  );
}

function BatchResults({ results, selected, onToggle, onSelectAll, onConfirm, onRescan, t }) {
  if (!results.length) {
    return (
      <div className="scan-slip__error">
        <div className="scan-slip__error-icon">🔍</div>
        <p className="scan-slip__error-message">{t?.noSlipsFound || 'ไม่พบสลิปในรูปที่เลือก'}</p>
        <button className="scan-slip__btn scan-slip__btn--secondary" onClick={onRescan}>
          {t?.chooseNewImage || 'เลือกรูปใหม่'}
        </button>
      </div>
    );
  }

  return (
    <div className="scan-slip__batch-results">
      <div className="scan-slip__batch-header">
        <p className="scan-slip__batch-summary">
          {t?.found || 'พบ'} <strong>{results.length}</strong> {t?.slips || 'สลิป'}
        </p>
        <button className="scan-slip__btn scan-slip__btn--ghost scan-slip__btn--sm" onClick={onSelectAll}>
          {t?.selectAll || 'เลือกทั้งหมด'}
        </button>
      </div>

      <div className="scan-slip__batch-list">
        {results.map((r, i) => {
          const isSelected = selected.has(i);
          const { transaction } = r;
          return (
            <div
              key={i}
              className={`scan-slip__batch-item ${isSelected ? 'scan-slip__batch-item--selected' : ''}`}
              onClick={() => onToggle(i)}
              role="checkbox"
              aria-checked={isSelected}
              tabIndex={0}
              onKeyDown={(e) => e.key === ' ' && onToggle(i)}
            >
              <div className="scan-slip__batch-check">{isSelected ? '✓' : ''}</div>
              <div className="scan-slip__batch-info">
                <span className="scan-slip__batch-category">
                  {CATEGORY_ICONS[transaction.category] ?? '📦'} {transaction.category}
                </span>
                <span className="scan-slip__batch-amount">
                  ฿{Number(transaction.amount).toLocaleString()}
                </span>
                <span className="scan-slip__batch-date">{transaction.date}</span>
                {transaction.note && (
                  <span className="scan-slip__batch-note">{transaction.note}</span>
                )}
              </div>
            </div>
          );
        })}
      </div>

      <div className="scan-slip__result-actions scan-slip__result-actions--sticky">
        <button className="scan-slip__btn scan-slip__btn--secondary" onClick={onRescan}>
          {t?.chooseNewImage || 'เลือกรูปใหม่'}
        </button>
        <button
          className="scan-slip__btn scan-slip__btn--primary"
          onClick={onConfirm}
          disabled={selected.size === 0}
        >
          {t?.saveItem || 'บันทึก'} {selected.size > 0 ? `${selected.size} ${t?.items || 'รายการ'}` : ''} ✓
        </button>
      </div>
    </div>
  );
}
