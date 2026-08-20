import React, { useState, useRef, useCallback, useEffect } from 'react';
import { useSlipScan } from '../hooks/useSlipScan';
import './ScanSlip.css';

// ─── Capacitor Camera (graceful fallback on web) ───────────────────────────
import { Capacitor } from '@capacitor/core';
import { Camera, CameraSource } from '@capacitor/camera';
import ScanQuotaBar from './ScanQuotaBar';

// ─── Category display map ──────────────────────────────────────────────────
const CATEGORY_ICONS = {
  Food: 'Food',
  Transport: 'Transport',
  Shopping: 'Shopping',
  Bills: 'Bills',
  Transfer: 'Transfer',
  Other: 'Other',
};

// ─── Main Component ────────────────────────────────────────────────────────
export default function ScanSlip({ onTransactionCreate, onClose, t }) {
  const [activeTab, setActiveTab] = useState('camera');
  // 'camera' | 'gallery' | 'autoscan'

  useEffect(() => {
    const handleKeyDown = (e) => {
      if (e.key === 'Escape') onClose?.();
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [onClose]);

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

  const cameraSvg = <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" strokeWidth="2"><path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z"/><circle cx="12" cy="13" r="4"/></svg>;
  const imageSvg = <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" strokeWidth="2"><rect x="3" y="3" width="18" height="18" rx="2" ry="2"/><circle cx="8.5" cy="8.5" r="1.5"/><polyline points="21 15 16 10 5 21"/></svg>;
  const searchSvg = <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>;

  // ─── Render ───────────────────────────────────────────────────────────────
  return (
    <div className="scan-slip">
      {/* Header */}
      <div className="scan-slip__header">
        <button className="scan-slip__close" onClick={onClose} aria-label="Close" style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center' }}>
          <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
        </button>
        <h2 className="scan-slip__title">{t?.scanSlipTitle}</h2>
        <div />
      </div>

      {/* Tabs */}
      <div className="scan-slip__tabs" role="tablist">
        {[
          { id: 'camera', icon: cameraSvg, label: t?.scanSlipCamera },
          { id: 'gallery', icon: imageSvg, label: t?.scanSlipUpload },
          { id: 'autoscan', icon: searchSvg, label: 'Auto-scan' },
        ].map((tab) => (
          <button
            key={tab.id}
            role="tab"
            aria-selected={activeTab === tab.id}
            className={`scan-slip__tab ${activeTab === tab.id ? 'scan-slip__tab--active' : ''}`}
            onClick={() => switchTab(tab.id)}
          >
            <span className="scan-slip__tab-icon" style={{ display: 'inline-flex', alignItems: 'center' }}>{tab.icon}</span>
            <span className="scan-slip__tab-label">{tab.label}</span>
          </button>
        ))}
      </div>

      {/* Tab Content */}
      <div className="scan-slip__body">

        {/* บอกโควตาก่อนกดถ่าย ไม่ใช่หลังสแกนเสร็จแล้วเด้ง error */}
        {status === 'idle' && <ScanQuotaBar t={t} />}

        {/* ── CAMERA TAB ──────────────────────────────────────── */}
        {activeTab === 'camera' && (
          <div className="scan-slip__pane">
            {status === 'idle' && (
              <div className="scan-slip__drop-zone" onClick={handleCameraCapture}>
                <div className="scan-slip__drop-icon" style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center' }}>
                  <svg viewBox="0 0 24 24" width="40" height="40" fill="none" stroke="currentColor" strokeWidth="1.8"><path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z"/><circle cx="12" cy="13" r="4"/></svg>
                </div>
                <p className="scan-slip__drop-title">{t?.scanSlipCamera}</p>
                <p className="scan-slip__drop-hint">{t?.scanSlipDesc}</p>
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
                <p className="scan-slip__drop-title">{t?.scanSlipUpload}</p>
                <p className="scan-slip__drop-hint">{t?.tapOrDrag}</p>
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
                <div className="scan-slip__drop-icon" style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center' }}>
                  <svg viewBox="0 0 24 24" width="40" height="40" fill="none" stroke="currentColor" strokeWidth="1.8"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>
                </div>
                <p className="scan-slip__drop-title">{t?.autoScanTitle}</p>
                <p className="scan-slip__drop-hint">
                  {t?.autoScanDesc}
                </p>
                <button
                  className="scan-slip__btn scan-slip__btn--primary"
                  onClick={() => autoScanInputRef.current?.click()}
                >
                  {t?.chooseSlipImage}
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
      <div className="scan-slip__spinner" aria-label={t?.scanSlipProcessing} />
      <p className="scan-slip__scanning-title">{t?.scanSlipProcessing}</p>
      <p className="scan-slip__scanning-hint">{t?.scanSlipHint}</p>
    </div>
  );
}

function ErrorState({ message, onRetry, t }) {
  return (
    <div className="scan-slip__error">
      <div className="scan-slip__error-icon" style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center' }}>
        <svg viewBox="0 0 24 24" width="40" height="40" fill="none" stroke="var(--color-danger)" strokeWidth="1.8"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>
      </div>
      <p className="scan-slip__error-message">{message}</p>
      <button className="scan-slip__btn scan-slip__btn--secondary" onClick={onRetry}>
        {t?.retry}
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

  return (
    <div className="scan-slip__result">
      {/* Preview */}
      <div className="scan-slip__preview-wrap">
        <img src={previewUrl} alt={t?.slipAlt} className="scan-slip__preview-img" />
        {isDuplicate && (
          <div className="scan-slip__duplicate-badge">{t?.scanSlipDuplicate}</div>
        )}
      </div>

      {/* ── Slip Details ─────────────────────────────── */}
      <div className="scan-slip__slip-detail-card">
        {/* Header: status + payment type */}
        {(tx.status || tx.payment_type) && (
          <div className="scan-slip__slip-header">
            {tx.status && (
              <span className="scan-slip__status-badge" style={{ color: statusColor }}>
                {tx.payment_type || ''} {tx.status}
              </span>
            )}
            {tx.bank_name && (
              <span className="scan-slip__bank-tag">{tx.bank_name}</span>
            )}
          </div>
        )}

        {/* Date & Time */}
        <SlipDetailRow icon="" label={t?.dateTime} value={[tx.date, tx.time].filter(Boolean).join(' · ')} />

        {/* From */}
        {(tx.sender_name || tx.sender_account) && (
          <div className="scan-slip__detail-row">
            <div className="scan-slip__detail-body">
              <span className="scan-slip__detail-label">{t?.sender}</span>
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
            <div className="scan-slip__detail-body">
              <span className="scan-slip__detail-label">{t?.receiver}{tx.receiver_bank ? ` · ${tx.receiver_bank}` : ''}</span>
              <span className="scan-slip__detail-value">{tx.receiver_name}</span>
              {tx.receiver_account && (
                <span className="scan-slip__detail-sub">{tx.receiver_account}</span>
              )}
            </div>
          </div>
        )}

        {/* Amount */}
        <div className="scan-slip__detail-row scan-slip__detail-row--amount">
          <div className="scan-slip__detail-body">
            <span className="scan-slip__detail-label">{t?.amount}</span>
            <span className="scan-slip__detail-amount">
              ฿{Number(tx.amount || 0).toLocaleString(t?.localeTag || 'th-TH', { minimumFractionDigits: 2 })}
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
        <SlipDetailRow icon="" label={t?.refId} value={tx.ref_id} />
        <SlipDetailRow icon="" label={t?.ref2} value={tx.ref_id2} />

        {/* Address */}
        <SlipDetailRow icon="" label={t?.address} value={tx.address} />

        {/* Note from slip */}
        <SlipDetailRow icon="" label={t?.slipNote} value={tx.note} />
      </div>

      {/* ── Editable Form ─────────────────────────────── */}
      <div className="scan-slip__result-card">
        <p className="scan-slip__result-label">{t?.editBeforeSave}</p>

        <div className="scan-slip__form-row">
          <label className="scan-slip__label">{t?.thAmount} (฿)</label>
          <input
            className="scan-slip__input"
            type="number"
            value={form?.amount ?? ''}
            onChange={handleChange('amount')}
            placeholder="0.00"
          />
        </div>

        <div className="scan-slip__form-row">
          <label className="scan-slip__label">{t?.thCategory}</label>
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
          <label className="scan-slip__label">{t?.thDate}</label>
          <input
            className="scan-slip__input"
            type="date"
            value={form?.date ?? ''}
            onChange={handleChange('date')}
          />
        </div>

        <div className="scan-slip__form-row">
          <label className="scan-slip__label">{t?.note}</label>
          <input
            className="scan-slip__input"
            type="text"
            value={form?.note ?? ''}
            onChange={handleChange('note')}
            placeholder={t?.noteHint}
          />
        </div>

        <div className="scan-slip__result-actions">
          <button className="scan-slip__btn scan-slip__btn--secondary" onClick={onRetry}>
            {t?.rescan}
          </button>
          <button
            className="scan-slip__btn scan-slip__btn--primary"
            onClick={onConfirm}
            disabled={!form?.amount}
          >
            {t?.saveItem} ✓
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
        {t?.batchScanning} {current} / {total} {t?.items}
      </p>
      <div className="scan-slip__progress-bar">
        <div className="scan-slip__progress-fill" style={{ width: `${pct}%` }} />
      </div>
      <p className="scan-slip__scanning-hint">
        {t?.skipped} {skipped} · {t?.errors} {errors}
      </p>
      <button className="scan-slip__btn scan-slip__btn--ghost" onClick={onCancel}>
        {t?.cancel}
      </button>
    </div>
  );
}

function BatchResults({ results, selected, onToggle, onSelectAll, onConfirm, onRescan, t }) {
  if (!results.length) {
    return (
      <div className="scan-slip__error">
        <div className="scan-slip__error-icon">🔍</div>
        <p className="scan-slip__error-message">{t?.noSlipsFound}</p>
        <button className="scan-slip__btn scan-slip__btn--secondary" onClick={onRescan}>
          {t?.chooseNewImage}
        </button>
      </div>
    );
  }

  return (
    <div className="scan-slip__batch-results">
      <div className="scan-slip__batch-header">
        <p className="scan-slip__batch-summary">
          {t?.found} <strong>{results.length}</strong> {t?.slips}
        </p>
        <button className="scan-slip__btn scan-slip__btn--ghost scan-slip__btn--sm" onClick={onSelectAll}>
          {t?.selectAll}
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
                  ฿{Number(transaction.amount).toLocaleString(t?.localeTag || 'th-TH')}
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
          {t?.chooseNewImage}
        </button>
        <button
          className="scan-slip__btn scan-slip__btn--primary"
          onClick={onConfirm}
          disabled={selected.size === 0}
        >
          {t?.saveItem} {selected.size > 0 ? `${selected.size} ${t?.items}` : ''} ✓
        </button>
      </div>
    </div>
  );
}
