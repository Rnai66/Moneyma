import React, { useState, useRef, useCallback, useEffect } from 'react';
import {
  scanBillFile,
  detectStore,
  ITEM_CATEGORIES,
  billToSingleTransaction,
  billToCategoryTransactions,
  billToItemTransactions,
} from '../services/BillScanService';
import ScanQuotaBar from './ScanQuotaBar';
import './ScanBill.css';
import AIConsentService from '../services/AIConsentService';
import AIConsentModal from './AIConsentModal';

// ─── Capacitor Camera ───────────────────────────────────────────────────────
let CapCamera = null;
let CameraSource = null;
try {
  const cap = require('@capacitor/camera');
  CapCamera = cap.Camera;
  CameraSource = cap.CameraSource;
} catch { /* web fallback */ }

// ─── Save mode options ──────────────────────────────────────────────────────
const saveModes = (t) => [
  { id: 'single',   icon: '⊙', label: t?.billSaveSingle },
  { id: 'category', icon: '⊞', label: t?.billSaveCategory },
  { id: 'itemized', icon: '≡', label: t?.billSaveItemized },
];

// ─── Store type badge ────────────────────────────────────────────────────────
const STORE_TYPE_ICONS = {
  convenience:  '🏪',
  supermarket:  '🛒',
  hypermarket:  '🏬',
  wholesale:    '📦',
  restaurant:   '🍽️',
  pharmacy:     '💊',
  fuel:         '⛽',
  other:        '🏷️',
};

// ─── Main component ──────────────────────────────────────────────────────────
export default function ScanBill({ onTransactionCreate, onClose, t }) {
  const [status, setStatus] = useState('idle');
  // 'idle' | 'scanning' | 'result' | 'error'
  const [showAIConsent, setShowAIConsent] = useState(false);
  const [pendingAction, setPendingAction] = useState(null);

  useEffect(() => {
    const handleKeyDown = (e) => {
      if (e.key === 'Escape') onClose?.();
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [onClose]);

  const [bill, setBill] = useState(null);
  const [previewUrl, setPreviewUrl] = useState(null);
  const [error, setError] = useState(null);
  const [saveMode, setSaveMode] = useState('single');

  // Editable item overrides: { [index]: { category, total, name_clean } }
  const [itemOverrides, setItemOverrides] = useState({});
  // Which items are included in save
  const [excludedItems, setExcludedItems] = useState(new Set());

  const fileInputRef = useRef(null);
  const previewRef = useRef(null);

  const executeWithConsent = useCallback((action) => {
    if (AIConsentService.hasConsent()) {
      action();
    } else {
      setPendingAction(() => action);
      setShowAIConsent(true);
    }
  }, []);

  const handleConsentAccept = useCallback(() => {
    setShowAIConsent(false);
    if (pendingAction) {
      pendingAction();
      setPendingAction(null);
    }
  }, [pendingAction]);

  const handleConsentDecline = useCallback(() => {
    setShowAIConsent(false);
    setPendingAction(null);
  }, []);

  // ─── Scan file ─────────────────────────────────────────────────────────────
  const doScan = useCallback(async (file) => {
    // Clean previous
    if (previewRef.current) { URL.revokeObjectURL(previewRef.current); }
    const url = URL.createObjectURL(file);
    previewRef.current = url;
    setPreviewUrl(url);
    setStatus('scanning');
    setError(null);
    setBill(null);
    setItemOverrides({});
    setExcludedItems(new Set());

    try {
      const result = await scanBillFile(file);
      if (!result.is_receipt) {
        setError(t?.billNotFound);
        setStatus('error');
        return;
      }
      setBill(result);
      setStatus('result');
    } catch (err) {
      setError(err.message || t?.billGenericError);
      setStatus('error');
    }
  }, [t]);

  // ─── Camera ────────────────────────────────────────────────────────────────
  const handleCamera = useCallback(() => {
    executeWithConsent(async () => {
      if (CapCamera) {
        try {
          const photo = await CapCamera.getPhoto({
            quality: 92, allowEditing: false,
            resultType: 'base64', source: CameraSource.Camera,
          });
          // photo.base64String may be undefined if user cancelled
          if (!photo?.base64String) return;
          const bytes = atob(photo.base64String);
          const arr = new Uint8Array(bytes.length);
          for (let i = 0; i < bytes.length; i++) arr[i] = bytes.charCodeAt(i);
          doScan(new File([new Blob([arr], { type: 'image/jpeg' })], 'bill.jpg', { type: 'image/jpeg' }));
        } catch (e) {
          // 'User cancelled photos app' and similar cancel messages — silently ignore
          if (!e.message?.includes('cancelled') && !e.message?.includes('cancel')) {
            console.error('Camera error:', e);
          }
        }
      } else {
        const inp = document.createElement('input');
        inp.type = 'file'; inp.accept = 'image/*'; inp.capture = 'environment';
        inp.onchange = (e) => { const f = e.target.files?.[0]; if (f) doScan(f); };
        inp.click();
      }
    });
  }, [executeWithConsent, doScan]);

  const handleFileInput = useCallback((e) => {
    const f = e.target.files?.[0]; if (!f) return; e.target.value = '';
    executeWithConsent(() => doScan(f));
  }, [executeWithConsent, doScan]);

  // ─── Item editing ──────────────────────────────────────────────────────────
  const setItemOverride = useCallback((idx, field, value) => {
    setItemOverrides((prev) => ({
      ...prev,
      [idx]: { ...(prev[idx] ?? {}), [field]: value },
    }));
  }, []);

  const toggleExclude = useCallback((idx) => {
    setExcludedItems((prev) => {
      const next = new Set(prev);
      next.has(idx) ? next.delete(idx) : next.add(idx);
      return next;
    });
  }, []);

  // ─── Merge overrides into bill items ──────────────────────────────────────
  const getEffectiveBill = useCallback(() => {
    if (!bill) return null;
    const items = bill.items
      ?.map((item, i) => ({ ...item, ...(itemOverrides[i] ?? {}) }))
      .filter((_, i) => !excludedItems.has(i));
    // Recalculate total from included items
    const itemsTotal = items?.reduce((s, it) => s + (it.total ?? 0), 0) ?? 0;
    const taxRate = bill.tax_amount && bill.subtotal
      ? bill.tax_amount / bill.subtotal : 0;
    const recalcTotal = Math.round(itemsTotal * (1 + taxRate) * 100) / 100;
    return { ...bill, items, total: excludedItems.size > 0 ? recalcTotal : bill.total };
  }, [bill, itemOverrides, excludedItems]);

  // ─── Confirm save ──────────────────────────────────────────────────────────
  const handleConfirm = useCallback(() => {
    const effective = getEffectiveBill();
    if (!effective) return;
    let transactions;
    if (saveMode === 'single')    transactions = [billToSingleTransaction(effective)];
    else if (saveMode === 'category') transactions = billToCategoryTransactions(effective);
    else transactions = billToItemTransactions(effective);
    onTransactionCreate?.(transactions);
    if (previewRef.current) URL.revokeObjectURL(previewRef.current);
    onClose?.();
  }, [getEffectiveBill, saveMode, onTransactionCreate, onClose]);

  const handleReset = useCallback(() => {
    if (previewRef.current) URL.revokeObjectURL(previewRef.current);
    setStatus('idle'); setBill(null); setPreviewUrl(null);
    setError(null); setItemOverrides({}); setExcludedItems(new Set());
  }, []);

  // ─── Render ────────────────────────────────────────────────────────────────
  return (
    <div className="scan-bill">
      {/* Header */}
      <div className="scan-bill__header">
        <button className="scan-bill__close" onClick={onClose} aria-label="Close" style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center' }}>
          <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
        </button>
        <h2 className="scan-bill__title">{t?.scanBill}</h2>
        <div />
      </div>

      <div className="scan-bill__body">
        {/* ── IDLE ── */}
        {status === 'idle' && (
          <div className="scan-bill__pane scan-bill__pane--center">

            {/* บอกโควตาก่อนกดถ่าย ไม่ใช่หลังสแกนเสร็จแล้วเด้ง error */}
            <ScanQuotaBar t={t} />
            <div className="scan-bill__store-pills">
              {['7-Eleven','Prime','NTUC','Big C','Makro',"Lotus's",'Tops', t?.billStoreGeneric].map((s) => (
                <span key={s} className="scan-bill__store-pill">{s}</span>
              ))}
            </div>
            <div className="scan-bill__drop-zone"
              onClick={() => fileInputRef.current?.click()}
              onDrop={(e) => { e.preventDefault(); const f = e.dataTransfer.files?.[0]; if (f) doScan(f); }}
              onDragOver={(e) => e.preventDefault()}>
              <div className="scan-bill__drop-icon" style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center' }}>
                <svg viewBox="0 0 24 24" width="40" height="40" fill="none" stroke="currentColor" strokeWidth="1.8"><path d="M4 2v20l2-1 2 1 2-1 2 1 2-1 2 1 2-1 2 1V2l-2 1-2-1-2 1-2-1-2 1-2-1-2 1-2-1z"/><line x1="8" y1="6" x2="16" y2="6"/><line x1="8" y1="10" x2="16" y2="10"/><line x1="8" y1="14" x2="13" y2="14"/></svg>
              </div>
              <p className="scan-bill__drop-title">{t?.scanSlipUpload}</p>
              <p className="scan-bill__drop-hint">{t?.scanBillHint}</p>
              <input ref={fileInputRef} type="file" accept="image/*"
                className="scan-bill__file-input" onChange={handleFileInput} />
            </div>
            <button className="scan-bill__btn scan-bill__btn--primary" onClick={handleCamera} style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: '6px' }}>
              <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2"><path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z"/><circle cx="12" cy="13" r="4"/></svg>
              {t?.scanSlipCamera}
            </button>
          </div>
        )}

        {/* ── SCANNING ── */}
        {status === 'scanning' && (
          <div className="scan-bill__pane scan-bill__pane--center">
            {previewUrl && (
              <div className="scan-bill__scan-preview-wrap">
                <img src={previewUrl} alt={t?.billAlt} className="scan-bill__scan-preview" />
                <div className="scan-bill__scan-overlay">
                  <div className="scan-bill__scan-line" />
                </div>
              </div>
            )}
            <div className="scan-bill__spinner" />
            <p className="scan-bill__scanning-title">{t?.billScanning}</p>
            <p className="scan-bill__scanning-hint">{t?.billScanningHint}</p>
          </div>
        )}

        {/* ── ERROR ── */}
        {status === 'error' && (
          <div className="scan-bill__pane scan-bill__pane--center">
            <div style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center', marginBottom: '8px' }}>
              <svg viewBox="0 0 24 24" width="40" height="40" fill="none" stroke="var(--color-danger)" strokeWidth="1.8"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>
            </div>
            <p className="scan-bill__error-msg">{error}</p>
            <button className="scan-bill__btn scan-bill__btn--secondary" onClick={handleReset}>{t?.retry}</button>
          </div>
        )}

        {/* ── RESULT ── */}
        {status === 'result' && bill && (
          <BillResult
            t={t}
            bill={bill}
            previewUrl={previewUrl}
            saveMode={saveMode}
            onChangeSaveMode={setSaveMode}
            itemOverrides={itemOverrides}
            excludedItems={excludedItems}
            onSetItemOverride={setItemOverride}
            onToggleExclude={toggleExclude}
            onConfirm={handleConfirm}
            onReset={handleReset}
          />
        )}
      </div>

      <AIConsentModal
        isOpen={showAIConsent}
        onAccept={handleConsentAccept}
        onDecline={handleConsentDecline}
      />
    </div>
  );
}

// ─── BillResult ─────────────────────────────────────────────────────────────
function BillResult({ bill, previewUrl, saveMode, onChangeSaveMode,
  itemOverrides, excludedItems, onSetItemOverride, onToggleExclude,
  onConfirm, onReset, t }) {

  const store = detectStore(bill.store_name);
  const storeIcon = STORE_TYPE_ICONS[bill.store_type ?? store.type] ?? '🏷️';
  const currency = bill.currency ?? store.currency ?? 'THB';

  // Preview of what will be saved
  const previewTransactions = usePreviewTransactions(bill, saveMode, itemOverrides, excludedItems);
  // NOTE: use 'tx' as accumulator name to avoid shadowing the `t` (translation) prop
  const totalToSave = previewTransactions.reduce((s, tx) => s + (tx.amount ?? 0), 0);

  return (
    <div className="scan-bill__result">
      {/* Partial-result warning banner — shown when MAX_TOKENS recovery was used */}
      {bill._partial && (
        <div className="scan-bill__partial-banner">
          <span className="scan-bill__partial-icon">⚠️</span>
          <div className="scan-bill__partial-text">
            <strong>{(t?.billPartialTitle || '').replace('{n}', bill.items?.length ?? 0)}</strong>
            <span>{t?.billPartialDesc}</span>
          </div>
        </div>
      )}

      {/* Store header */}
      <div className="scan-bill__store-header">
        <div className="scan-bill__store-icon-wrap">
          <span className="scan-bill__store-icon">{storeIcon}</span>
        </div>
        <div className="scan-bill__store-info">
          <p className="scan-bill__store-name">{bill.store_name}</p>
          {bill.store_branch && <p className="scan-bill__store-branch">{bill.store_branch}</p>}
          <div className="scan-bill__store-meta">
            {bill.date && <span>{bill.date}</span>}
            {bill.time && <span>{bill.time}</span>}
            {bill.receipt_no && <span>#{bill.receipt_no}</span>}
          </div>
        </div>
        {previewUrl && (
          <img src={previewUrl} alt={t?.billAlt} className="scan-bill__thumb" />
        )}
      </div>

      {/* Items list */}
      <div className="scan-bill__section">
        <div className="scan-bill__section-header">
          <span className="scan-bill__section-title">{t?.billItemsTitle} ({bill.items?.length ?? 0})</span>
          <span className="scan-bill__section-hint">{t?.billItemsHint}</span>
        </div>
        <div className="scan-bill__items">
          {(bill.items ?? []).map((item, i) => {
            const ovr = itemOverrides[i] ?? {};
            const effItem = { ...item, ...ovr };
            const isExcluded = excludedItems.has(i);

            return (
              <div key={i}
                className={`scan-bill__item ${isExcluded ? 'scan-bill__item--excluded' : ''}`}>
                <div className="scan-bill__item-check" onClick={() => onToggleExclude(i)}>
                  {isExcluded ? '○' : '●'}
                </div>
                <div className="scan-bill__item-body">
                  <div className="scan-bill__item-name-row">
                    <span className="scan-bill__item-name">
                      {effItem.name_clean ?? effItem.name}
                      {effItem.qty > 1 && (
                        <span className="scan-bill__item-qty"> ×{effItem.qty}</span>
                      )}
                      {effItem.is_promo && (
                        <span className="scan-bill__promo-tag">PROMO</span>
                      )}
                    </span>
                    <div className="scan-bill__item-price-col">
                      {effItem.discount > 0 && (
                        <span className="scan-bill__item-discount">-{effItem.discount.toFixed(2)}</span>
                      )}
                      <span className="scan-bill__item-price">
                        {currency} {(effItem.total ?? 0).toFixed(2)}
                      </span>
                    </div>
                  </div>
                  {!isExcluded && (
                    <select
                      className="scan-bill__cat-select"
                      value={effItem.category}
                      onChange={(e) => onSetItemOverride(i, 'category', e.target.value)}>
                      {Object.entries(ITEM_CATEGORIES).map(([k, v]) => (
                        <option key={k} value={k}>{v.icon} {t?.[v.labelKey]}</option>
                      ))}
                    </select>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Totals */}
      <div className="scan-bill__totals">
        {bill.discounts_total > 0 && (
          <div className="scan-bill__total-row scan-bill__total-row--discount">
            <span>{t?.billDiscount}</span>
            <span>-{currency} {bill.discounts_total.toFixed(2)}</span>
          </div>
        )}
        {bill.tax_amount > 0 && (
          <div className="scan-bill__total-row">
            <span>{t?.billTax} {bill.tax_rate ?? ''}</span>
            <span>{currency} {bill.tax_amount.toFixed(2)}</span>
          </div>
        )}
        <div className="scan-bill__total-row scan-bill__total-row--grand">
          <span>{t?.billGrandTotal}</span>
          <span>{currency} {(bill.total ?? 0).toFixed(2)}</span>
        </div>
        {bill.payment_method && (
          <div className="scan-bill__total-row scan-bill__total-row--payment">
            <span>{t?.billPaidWith}</span>
            <span>
              {bill.payment_method.toUpperCase()}
              {bill.payment_last4 ? ` ···${bill.payment_last4}` : ''}
            </span>
          </div>
        )}
      </div>

      {/* Save mode selector */}
      <div className="scan-bill__section">
        <div className="scan-bill__section-header">
          <span className="scan-bill__section-title">{t?.billSaveAs}</span>
        </div>
        <div className="scan-bill__save-modes">
          {saveModes(t).map((m) => (
            <button key={m.id}
              className={`scan-bill__save-mode-btn ${saveMode === m.id ? 'scan-bill__save-mode-btn--active' : ''}`}
              onClick={() => onChangeSaveMode(m.id)}>
              <span className="scan-bill__save-mode-icon">{m.icon}</span>
              <span className="scan-bill__save-mode-label">{m.label}</span>
            </button>
          ))}
        </div>

        {/* Preview of transactions to be saved */}
        <div className="scan-bill__tx-preview">
          {previewTransactions.map((tx, i) => (
            <div key={i} className="scan-bill__tx-preview-row">
              <span className="scan-bill__tx-preview-cat">{tx.category}</span>
              <span className="scan-bill__tx-preview-note">{tx.note}</span>
              <span className="scan-bill__tx-preview-amt">
                {currency} {(tx.amount ?? 0).toFixed(2)}
              </span>
            </div>
          ))}
          {previewTransactions.length > 1 && (
            <div className="scan-bill__tx-preview-total">
              {(t?.billSummary || '').replace('{n}', previewTransactions.length).replace('{cur}', currency).replace('{total}', totalToSave.toFixed(2))}
            </div>
          )}
        </div>
      </div>

      {/* Action buttons */}
      <div className="scan-bill__actions">
        <button className="scan-bill__btn scan-bill__btn--secondary" onClick={onReset}>
          {t?.rescan}
        </button>
        <button className="scan-bill__btn scan-bill__btn--primary" onClick={onConfirm}
          disabled={
            (saveMode !== 'single' && previewTransactions.length === 0) ||
            (saveMode === 'single' && (bill.total == null || bill.total === undefined))
          }>
          {t?.saveItem} {saveMode === 'single' ? 1 : previewTransactions.length} {t?.items} ✓
        </button>
      </div>
    </div>
  );
}

// ─── Preview hook (memoized) ─────────────────────────────────────────────────
function usePreviewTransactions(bill, saveMode, itemOverrides, excludedItems) {
  const effective = {
    ...bill,
    items: bill.items
      ?.map((item, i) => ({ ...item, ...(itemOverrides[i] ?? {}) }))
      .filter((_, i) => !excludedItems.has(i)),
  };

  if (saveMode === 'single')   return [billToSingleTransaction(effective)];
  if (!effective.items?.length) return [];
  if (saveMode === 'category') return billToCategoryTransactions(effective);
  return billToItemTransactions(effective);
}
