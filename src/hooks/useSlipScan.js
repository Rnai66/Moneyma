import { useState, useRef, useCallback } from 'react';
import { tr } from '../i18n/lang';
import { scanSingleFile, batchScanFiles, normalizeSlipToTransaction } from '../services/AutoScanService';

/**
 * useSlipScan — manages the full scan lifecycle for ScanSlip.js
 *
 * States: idle → scanning → result | error
 *         idle → batch_scanning → batch_done | error
 */
export function useSlipScan() {
  const [status, setStatus] = useState('idle');
  // 'idle' | 'scanning' | 'result' | 'batch_scanning' | 'batch_done' | 'error'

  const [singleResult, setSingleResult] = useState(null);
  // { slip, transaction, isDuplicate, previewUrl }

  const [batchProgress, setBatchProgress] = useState(null);
  // { current, total, skipped, errors, lastResult }

  const [batchResults, setBatchResults] = useState([]);
  const [error, setError] = useState(null);

  const abortRef = useRef(null);
  const previewUrlRef = useRef(null);

  // ─── Clean up object URLs ──────────────────────────────────────────────────
  const cleanupPreview = useCallback(() => {
    if (previewUrlRef.current) {
      URL.revokeObjectURL(previewUrlRef.current);
      previewUrlRef.current = null;
    }
  }, []);

  // ─── Scan single image (camera or gallery pick) ────────────────────────────
  const scanSingle = useCallback(
    async (file) => {
      cleanupPreview();
      setStatus('scanning');
      setError(null);
      setSingleResult(null);

      const previewUrl = URL.createObjectURL(file);
      previewUrlRef.current = previewUrl;

      try {
        const { slip, isDuplicate } = await scanSingleFile(file);

        if (!slip.is_slip) {
          setError(tr().scanNoSlip);
          setStatus('error');
          return null;
        }

        const transaction = normalizeSlipToTransaction(slip);
        const result = { slip, transaction, isDuplicate, previewUrl };
        setSingleResult(result);
        setStatus('result');
        return result;
      } catch (err) {
        setError(err.message || tr().scanGenericError);
        setStatus('error');
        return null;
      }
    },
    [cleanupPreview]
  );

  // ─── Batch auto-scan ───────────────────────────────────────────────────────
  const scanBatch = useCallback(async (files) => {
    if (!files?.length) return;

    setStatus('batch_scanning');
    setError(null);
    setBatchResults([]);
    setBatchProgress({ current: 0, total: files.length, skipped: 0, errors: 0 });

    const controller = new AbortController();
    abortRef.current = controller;

    try {
      const { results } = await batchScanFiles(files, {
        signal: controller.signal,
        onProgress: (p) => setBatchProgress(p),
      });

      setBatchResults(results);
      setStatus('batch_done');
      return results;
    } catch (err) {
      if (err.name !== 'AbortError') {
        setError(err.message || tr().autoScanError);
        setStatus('error');
      }
      return [];
    }
  }, []);

  // ─── Cancel batch scan ─────────────────────────────────────────────────────
  const cancelBatch = useCallback(() => {
    abortRef.current?.abort();
    setStatus('idle');
    setBatchProgress(null);
  }, []);

  // ─── Reset everything ──────────────────────────────────────────────────────
  const reset = useCallback(() => {
    cleanupPreview();
    abortRef.current?.abort();
    setStatus('idle');
    setSingleResult(null);
    setBatchProgress(null);
    setBatchResults([]);
    setError(null);
  }, [cleanupPreview]);

  return {
    status,
    singleResult,
    batchProgress,
    batchResults,
    error,
    scanSingle,
    scanBatch,
    cancelBatch,
    reset,
  };
}
