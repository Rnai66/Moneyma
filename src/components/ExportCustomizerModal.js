import React, { useState } from 'react';
import {
  exportTransactionsToStatementPDF,
  exportTransactionsToExcelBrowser,
  exportTransactionsToCsvBrowser,
  exportTransactionsToTextBrowser
} from '../utils/dataTransfer';
import './ExportCustomizerModal.css';

export default function ExportCustomizerModal({ isOpen, onClose, transactions = [], t = {} }) {
  const [title, setTitle] = useState(t.defaultDocTitle || 'สเตทเมนต์ทางการเงิน (Business Statement)');
  const [companyName, setCompanyName] = useState(t.defaultCompanyName || 'บริษัท มะนี่มา จำกัด (MoneyMa Co., Ltd.)');
  const [taxId, setTaxId] = useState('0105565012345');
  const [address, setAddress] = useState(t.defaultAddress || '88/99 อาคารการเงิน ถนนสุขุมวิท กรุงเทพฯ 10110');
  const [phone, setPhone] = useState('02-123-4567');
  const [note, setNote] = useState(t.defaultFooterNote || 'รายงานนี้ออกโดยระบบบัญชีการเงิน MoneyMa เพื่อใช้เป็นหลักฐานทางธุรกิจ');
  
  const [format, setFormat] = useState('pdf'); // 'pdf' | 'excel' | 'csv' | 'text'
  const [selectedColumns, setSelectedColumns] = useState(['date', 'type', 'category', 'description', 'amount', 'balance']);
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [exporting, setExporting] = useState(false);

  // Update default fields when t object changes (TH / EN switch)
  React.useEffect(() => {
    if (t.defaultDocTitle) setTitle(t.defaultDocTitle);
    if (t.defaultCompanyName) setCompanyName(t.defaultCompanyName);
    if (t.defaultAddress) setAddress(t.defaultAddress);
    if (t.defaultFooterNote) setNote(t.defaultFooterNote);
  }, [t]);

  if (!isOpen) return null;

  const toggleColumn = (colKey) => {
    setSelectedColumns(prev =>
      prev.includes(colKey)
        ? prev.filter(c => c !== colKey)
        : [...prev, colKey]
    );
  };

  const handleRunExport = async () => {
    try {
      setExporting(true);
      const options = {
        title,
        companyName,
        taxId,
        address,
        phone,
        note,
        selectedColumns,
        startDate,
        endDate
      };

      let result;
      if (format === 'pdf') {
        result = await exportTransactionsToStatementPDF(transactions, options);
      } else if (format === 'excel') {
        result = await exportTransactionsToExcelBrowser(transactions);
      } else if (format === 'csv') {
        result = await exportTransactionsToCsvBrowser(transactions);
      } else {
        result = await exportTransactionsToTextBrowser(transactions);
      }

      if (result?.success) {
        if (format !== 'pdf') {
          alert(`✅ ${t.exportSuccess || 'Export successful'}: ${result.filename || ''}`);
        }
        onClose?.();
      } else if (result?.message) {
        alert(`⚠️ ${result.message}`);
      }
    } catch (err) {
      console.error('Export error:', err);
      alert(`❌ ${t.exportFailed || 'Export failed'}`);
    } finally {
      setExporting(false);
    }
  };

  return (
    <div className="ecm-backdrop" role="dialog" aria-modal="true">
      <div className="ecm-modal">
        <div className="ecm-header">
          <div>
            <span className="ecm-eyebrow">{t.statementModalEyebrow || 'Export & Report Builder'}</span>
            <h2 className="ecm-title">{t.statementModalTitle || 'ปรับแต่งแบบฟอร์มรายงาน & สเตทเมนต์'}</h2>
          </div>
          <button className="ecm-close" onClick={onClose} aria-label="Close">
            ✕
          </button>
        </div>

        <div className="ecm-body">
          {/* Left Panel: Settings */}
          <div className="ecm-settings-panel">
            <h3 className="ecm-section-title">{t.docDetails || '1. รูปแบบและข้อมูลส่วนหัวเอกสาร'}</h3>

            <div className="ecm-field">
              <label>{t.exportFormat || 'รูปแบบไฟล์ที่ต้องการส่งออก'}</label>
              <div className="ecm-format-grid">
                {[
                  { id: 'pdf', label: t.fmtPdf || '📄 สเตทเมนต์ทางการ (PDF/Print)', desc: t.fmtPdfDesc || 'มีโลโก้ ข้อมูลบริษัท ยอดคงเหลือสะสม' },
                  { id: 'excel', label: t.fmtExcel || '📊 ไฟล์ Excel (.xlsx)', desc: t.fmtExcelDesc || 'นำไปคำนวณต่อใน Excel / Spreadsheet' },
                  { id: 'csv', label: t.fmtCsv || '📁 ไฟล์ CSV (.csv)', desc: t.fmtCsvDesc || 'นำเข้าซอฟต์แวร์บัญชีอื่น' },
                  { id: 'text', label: t.fmtText || '📝 ข้อความ (.txt)', desc: t.fmtTextDesc || 'รายงานข้อความแบบย่อ' },
                ].map(item => (
                  <div
                    key={item.id}
                    className={`ecm-format-card ${format === item.id ? 'active' : ''}`}
                    onClick={() => setFormat(item.id)}
                  >
                    <strong>{item.label}</strong>
                    <small>{item.desc}</small>
                  </div>
                ))}
              </div>
            </div>

            <div className="ecm-field">
              <label>{t.docTitleLabel || 'หัวข้อเอกสารรายงาน'}</label>
              <input
                type="text"
                value={title}
                onChange={e => setTitle(e.target.value)}
                placeholder="Financial Statement / รายงานการเงิน"
              />
            </div>

            <div className="ecm-field-row">
              <div className="ecm-field">
                <label>{t.companyNameLabel || 'ชื่อบริษัท / องค์กร'}</label>
                <input
                  type="text"
                  value={companyName}
                  onChange={e => setCompanyName(e.target.value)}
                  placeholder="MoneyMa Business Co., Ltd."
                />
              </div>
              <div className="ecm-field">
                <label>{t.taxIdLabel || 'เลขประจำตัวผู้เสียภาษี (Tax ID)'}</label>
                <input
                  type="text"
                  value={taxId}
                  onChange={e => setTaxId(e.target.value)}
                  placeholder="0105565012345"
                />
              </div>
            </div>

            <div className="ecm-field-row">
              <div className="ecm-field">
                <label>{t.addressLabel || 'ที่อยู่'}</label>
                <input
                  type="text"
                  value={address}
                  onChange={e => setAddress(e.target.value)}
                  placeholder="88/99 Sukhumvit Road..."
                />
              </div>
              <div className="ecm-field">
                <label>{t.phoneLabel || 'เบอร์โทรศัพท์'}</label>
                <input
                  type="text"
                  value={phone}
                  onChange={e => setPhone(e.target.value)}
                  placeholder="02-123-4567"
                />
              </div>
            </div>

            <div className="ecm-field">
              <label>{t.footerNoteLabel || 'หมายเหตุท้ายเอกสาร'}</label>
              <input
                type="text"
                value={note}
                onChange={e => setNote(e.target.value)}
                placeholder="MoneyMa System Generated Document"
              />
            </div>

            <h3 className="ecm-section-title" style={{ marginTop: '20px' }}>{t.tableColumnsSection || '2. เลือกคอลัมน์ในตาราง'}</h3>
            <div className="ecm-columns-selector">
              {[
                { key: 'date', label: t.colDate || 'วันที่' },
                { key: 'type', label: t.colType || 'ประเภท' },
                { key: 'category', label: t.colCategory || 'หมวดหมู่' },
                { key: 'description', label: t.colDescription || 'รายการ / คำอธิบาย' },
                { key: 'amount', label: t.colAmount || 'จำนวนเงิน' },
                { key: 'balance', label: t.colBalance || 'ยอดสะสมสุทธิ' },
              ].map(col => (
                <label key={col.key} className="ecm-col-checkbox">
                  <input
                    type="checkbox"
                    checked={selectedColumns.includes(col.key)}
                    onChange={() => toggleColumn(col.key)}
                  />
                  <span>{col.label}</span>
                </label>
              ))}
            </div>

            <h3 className="ecm-section-title" style={{ marginTop: '20px' }}>{t.dateFilterSection || '3. กรองช่วงเวลา'}</h3>
            <div className="ecm-field-row">
              <div className="ecm-field">
                <label>{t.filterFrom || 'ตั้งแต่วันที่'}</label>
                <input type="date" value={startDate} onChange={e => setStartDate(e.target.value)} />
              </div>
              <div className="ecm-field">
                <label>{t.filterTo || 'ถึงวันที่'}</label>
                <input type="date" value={endDate} onChange={e => setEndDate(e.target.value)} />
              </div>
            </div>
          </div>

          {/* Right Panel: Live Preview */}
          <div className="ecm-preview-panel">
            <div className="ecm-preview-header">
              <span>{t.livePreviewTitle || '👀 ตัวอย่างสเตทเมนต์ (Live Preview)'}</span>
            </div>
            <div className="ecm-preview-box">
              <div className="ecm-prev-company">{companyName || 'Company Name'}</div>
              {taxId && <div className="ecm-prev-sub">Tax ID: {taxId}</div>}
              <div className="ecm-prev-title">{title}</div>
              <hr />

              <table className="ecm-prev-table">
                <thead>
                  <tr>
                    {selectedColumns.includes('date') && <th>{t.formDate || 'Date'}</th>}
                    {selectedColumns.includes('type') && <th>{t.formType || 'Type'}</th>}
                    {selectedColumns.includes('category') && <th>{t.formCategory || 'Category'}</th>}
                    {selectedColumns.includes('description') && <th>{t.formDescription || 'Desc'}</th>}
                    {selectedColumns.includes('amount') && <th className="text-right">{t.formAmount || 'Amount'}</th>}
                    {selectedColumns.includes('balance') && <th className="text-right">{t.colBalance || 'Balance'}</th>}
                  </tr>
                </thead>
                <tbody>
                  {transactions.slice(0, 5).map((tx, idx) => (
                    <tr key={idx}>
                      {selectedColumns.includes('date') && <td>{tx.date}</td>}
                      {selectedColumns.includes('type') && (
                        <td>
                          <span className={`ecm-badge ${tx.type}`}>
                            {tx.type === 'income' ? (t.income || 'Income') : (t.expense || 'Expense')}
                          </span>
                        </td>
                      )}
                      {selectedColumns.includes('category') && <td>{tx.category}</td>}
                      {selectedColumns.includes('description') && <td>{tx.description || '—'}</td>}
                      {selectedColumns.includes('amount') && (
                        <td className={`text-right ${tx.type}`}>
                          {tx.type === 'income' ? '+' : '-'}฿{(Number(tx.amount) || 0).toLocaleString()}
                        </td>
                      )}
                      {selectedColumns.includes('balance') && (
                        <td className="text-right" style={{ color: '#6366f1', fontWeight: 'bold' }}>
                          ฿{(Number(tx.amount) || 0).toLocaleString()}
                        </td>
                      )}
                    </tr>
                  ))}
                </tbody>
              </table>
              {transactions.length > 5 && (
                <div style={{ fontSize: '11px', color: '#94a3b8', textAlign: 'center', marginTop: '8px' }}>
                  +{transactions.length - 5} {t.expTransactions || 'more records'}
                </div>
              )}
            </div>
          </div>
        </div>

        <div className="ecm-footer">
          <button className="ecm-btn-secondary" onClick={onClose}>
            {t.cancel || 'Cancel'}
          </button>
          <button className="ecm-btn-primary" disabled={exporting} onClick={handleRunExport}>
            {exporting ? (t.loading || 'Loading...') : `🚀 ${(t.runExportBtn || 'Export ({fmt})').replace('{fmt}', format.toUpperCase())}`}
          </button>
        </div>
      </div>
    </div>
  );
}
