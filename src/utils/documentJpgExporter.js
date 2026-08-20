import { Share } from '@capacitor/share';
import { Capacitor } from '@capacitor/core';

/**
 * Renders a Purchase Order (PO) or Sales Order (SO) receipt onto an HTML5 Canvas
 * and returns the JPG data URL.
 * 
 * @param {Object} docData - Document details
 * @returns {Promise<string>} JPG Data URL string
 */
export function generateDocumentJpgDataUrl(docData) {
  return new Promise((resolve) => {
    const {
      type = 'so', // 'so' | 'po'
      orderNo = `DOC-${Date.now().toString().slice(-6)}`,
      date = new Date().toLocaleDateString('th-TH'),
      customerName = 'ลูกค้าทั่วไป',
      supplierName = 'ซัพพลายเออร์หลัก',
      taxId = '',
      warehouseLabel = 'คลัง 1 (คลังหลัก)',
      items = [],
      subtotal = 0,
      discount = 0,
      vatPercent = 7,
      vatAmount = 0,
      totalAmount = 0,
      promptPayId = '',
    } = docData;

    const isPo = type === 'po';
    const docTitle = isPo ? 'ใบสั่งซื้อสินค้าเข้าสต็อก (Purchase Order)' : 'ใบสั่งขาย / ใบกำกับภาษีอย่างย่อ (Sales Order)';
    const partyLabel = isPo ? `ซัพพลายเออร์: ${supplierName}` : `ผู้ซื้อ: ${customerName}`;
    const primaryColor = isPo ? '#059669' : '#4338ca';
    const secondaryColor = isPo ? '#10b981' : '#6366f1';

    // Canvas dimensions
    const width = 800;
    const baseHeaderHeight = 220;
    const itemRowHeight = 44;
    const itemsTableHeight = Math.max(120, items.length * itemRowHeight + 50);
    const summaryHeight = 160;
    const qrHeight = (!isPo && promptPayId) ? 220 : 60;
    const totalHeight = baseHeaderHeight + itemsTableHeight + summaryHeight + qrHeight;

    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = totalHeight;
    const ctx = canvas.getContext('2d');

    // Fill background
    ctx.fillStyle = '#f8fafc';
    ctx.fillRect(0, 0, width, totalHeight);

    // Inner Card container
    const margin = 20;
    const cardW = width - margin * 2;
    const cardH = totalHeight - margin * 2;

function drawRoundRect(ctx, x, y, w, h, r) {
  if (typeof ctx.roundRect === 'function') {
    try {
      ctx.roundRect(x, y, w, h, r);
      return;
    } catch (e) {}
  }
  ctx.rect(x, y, w, h);
}

    ctx.fillStyle = '#ffffff';
    ctx.shadowColor = 'rgba(15, 23, 42, 0.08)';
    ctx.shadowBlur = 16;
    ctx.shadowOffsetY = 4;
    ctx.beginPath();
    drawRoundRect(ctx, margin, margin, cardW, cardH, 20);
    ctx.fill();
    ctx.shadowColor = 'transparent'; // reset shadow

    // Header Gradient Bar
    const headerH = 100;
    const grad = ctx.createLinearGradient(margin, margin, margin + cardW, margin + headerH);
    grad.addColorStop(0, primaryColor);
    grad.addColorStop(1, secondaryColor);

    ctx.fillStyle = grad;
    ctx.beginPath();
    drawRoundRect(ctx, margin, margin, cardW, headerH, 20);
    ctx.fill();

    // Header Text
    ctx.fillStyle = '#ffffff';
    ctx.font = 'bold 22px "Sarabun", "Inter", sans-serif';
    ctx.fillText(isPo ? '🚚 MoneyMa Store — ใบสั่งซื้อ PO' : '🛒 MoneyMa Store — ใบสั่งขาย SO', margin + 24, margin + 42);

    ctx.font = '13px "Sarabun", "Inter", sans-serif';
    ctx.fillStyle = 'rgba(255, 255, 255, 0.9)';
    ctx.fillText(docTitle, margin + 24, margin + 68);

    // Order No & Date on Right Header
    ctx.textAlign = 'right';
    ctx.font = 'bold 15px "Sarabun", "Inter", sans-serif';
    ctx.fillStyle = '#ffffff';
    ctx.fillText(`เลขที่: ${orderNo}`, margin + cardW - 24, margin + 42);

    ctx.font = '12px "Sarabun", "Inter", sans-serif';
    ctx.fillStyle = 'rgba(255, 255, 255, 0.9)';
    ctx.fillText(`วันที่: ${date}`, margin + cardW - 24, margin + 68);
    ctx.textAlign = 'left'; // reset text align

    // Info Details Block
    let currentY = margin + headerH + 28;

    ctx.fillStyle = '#0f172a';
    ctx.font = 'bold 14px "Sarabun", "Inter", sans-serif';
    ctx.fillText(partyLabel, margin + 24, currentY);

    if (taxId) {
      currentY += 22;
      ctx.font = '13px "Sarabun", "Inter", sans-serif';
      ctx.fillStyle = '#64748b';
      ctx.fillText(`Tax ID / เลขประจำตัวผู้เสียภาษี: ${taxId}`, margin + 24, currentY);
    }

    if (isPo) {
      currentY += 22;
      ctx.font = '13px "Sarabun", "Inter", sans-serif';
      ctx.fillStyle = '#059669';
      ctx.fillText(`คลังสินค้าเป้าหมาย: ${warehouseLabel}`, margin + 24, currentY);
    }

    currentY += 30;

    // Items Table Header Row
    const colX = {
      sku: margin + 30,
      name: margin + 140,
      qty: margin + 450,
      price: margin + 560,
      total: margin + cardW - 30,
    };

    ctx.fillStyle = '#f1f5f9';
    ctx.fillRect(margin + 16, currentY, cardW - 32, 36);

    ctx.fillStyle = '#475569';
    ctx.font = 'bold 12px "Sarabun", "Inter", sans-serif';
    ctx.fillText('SKU', colX.sku, currentY + 22);
    ctx.fillText('รายการสินค้า', colX.name, currentY + 22);
    ctx.textAlign = 'right';
    ctx.fillText('จำนวน', colX.qty, currentY + 22);
    ctx.fillText('ราคา/หน่วย', colX.price, currentY + 22);
    ctx.fillText('รวมเงิน (฿)', colX.total, currentY + 22);
    ctx.textAlign = 'left';

    currentY += 44;

    // Items Table Body
    items.forEach((item, idx) => {
      if (idx % 2 === 1) {
        ctx.fillStyle = '#f8fafc';
        ctx.fillRect(margin + 16, currentY - 14, cardW - 32, itemRowHeight);
      }

      const unitPrice = Number(isPo ? item.purchaseCost || item.cost : item.price) || 0;
      const rowTotal = unitPrice * (Number(item.qty) || 1);

      ctx.fillStyle = '#64748b';
      ctx.font = '12px monospace';
      ctx.fillText(item.sku || `P-${idx + 1}`, colX.sku, currentY + 10);

      ctx.fillStyle = '#0f172a';
      ctx.font = '600 13px "Sarabun", "Inter", sans-serif';
      const maxNameLen = 28;
      const displayName = (item.name || '').length > maxNameLen ? (item.name || '').substring(0, maxNameLen) + '...' : (item.name || '');
      ctx.fillText(displayName, colX.name, currentY + 10);

      ctx.textAlign = 'right';
      ctx.font = '13px "Sarabun", "Inter", sans-serif';
      ctx.fillText(String(item.qty || 1), colX.qty, currentY + 10);
      ctx.fillText(`฿${unitPrice.toLocaleString()}`, colX.price, currentY + 10);
      ctx.font = 'bold 13px "Sarabun", "Inter", sans-serif';
      ctx.fillText(`฿${rowTotal.toLocaleString()}`, colX.total, currentY + 10);
      ctx.textAlign = 'left';

      currentY += itemRowHeight;
    });

    // Divider Line
    currentY += 10;
    ctx.strokeStyle = '#e2e8f0';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(margin + 20, currentY);
    ctx.lineTo(margin + cardW - 20, currentY);
    ctx.stroke();

    // Summary Block
    currentY += 28;
    const sumRightX = margin + cardW - 30;

    ctx.textAlign = 'right';
    ctx.font = '13px "Sarabun", "Inter", sans-serif';
    ctx.fillStyle = '#64748b';
    ctx.fillText(`ยอดรวมสินค้า:  ฿${subtotal.toLocaleString()}`, sumRightX, currentY);

    if (discount > 0) {
      currentY += 22;
      ctx.fillStyle = '#ef4444';
      ctx.fillText(`ส่วนลด:  -฿${discount.toLocaleString()}`, sumRightX, currentY);
    }

    if (vatAmount > 0) {
      currentY += 22;
      ctx.fillStyle = '#64748b';
      ctx.fillText(`VAT ${vatPercent}%:  ฿${vatAmount.toLocaleString()}`, sumRightX, currentY);
    }

    currentY += 32;
    ctx.font = 'bold 20px "Sarabun", "Inter", sans-serif';
    ctx.fillStyle = primaryColor;
    ctx.fillText(`ยอดสุทธิ: ฿${totalAmount.toLocaleString()}`, sumRightX, currentY);
    ctx.textAlign = 'left';

    // QR Section (PromptPay for Sales Order)
    if (!isPo && promptPayId) {
      currentY += 36;
      const qrImg = new Image();
      qrImg.crossOrigin = 'anonymous';
      const cleanPhone = promptPayId.replace(/[^0-9]/g, '');
      qrImg.src = `https://promptpay.io/${cleanPhone}/${totalAmount.toFixed(2)}.png`;

      qrImg.onload = () => {
        const qrSize = 120;
        const qrX = (width - qrSize) / 2;

        ctx.fillStyle = '#f1f5f9';
        ctx.beginPath();
        drawRoundRect(ctx, qrX - 16, currentY, qrSize + 32, qrSize + 48, 12);
        ctx.fill();

        ctx.drawImage(qrImg, qrX, currentY + 10, qrSize, qrSize);

        ctx.textAlign = 'center';
        ctx.font = 'bold 11px "Sarabun", sans-serif';
        ctx.fillStyle = primaryColor;
        ctx.fillText(`📲 สแกนชำระพร้อมเพย์: ${promptPayId}`, width / 2, currentY + qrSize + 30);
        ctx.textAlign = 'left';

        // Footer
        ctx.textAlign = 'center';
        ctx.font = '11px "Sarabun", sans-serif';
        ctx.fillStyle = '#94a3b8';
        ctx.fillText('ออกเอกสารโดยระบบ MoneyMa Business Stock & POS (monyema.app)', width / 2, totalHeight - margin - 14);

        resolve(canvas.toDataURL('image/jpeg', 0.95));
      };

      qrImg.onerror = () => {
        ctx.textAlign = 'center';
        ctx.font = '11px "Sarabun", sans-serif';
        ctx.fillStyle = '#94a3b8';
        ctx.fillText('ออกเอกสารโดยระบบ MoneyMa Business Stock & POS (monyema.app)', width / 2, totalHeight - margin - 14);

        resolve(canvas.toDataURL('image/jpeg', 0.95));
      };
    } else {
      ctx.textAlign = 'center';
      ctx.font = '11px "Sarabun", sans-serif';
      ctx.fillStyle = '#94a3b8';
      ctx.fillText('ออกเอกสารโดยระบบ MoneyMa Business Stock & POS (monyema.app)', width / 2, totalHeight - margin - 14);

      resolve(canvas.toDataURL('image/jpeg', 0.95));
    }
  });
}

/**
 * Share or download JPG image file
 * @param {string} dataUrl - JPG base64 data url
 * @param {string} fileName - Target filename
 */
export async function shareOrDownloadJpg(dataUrl, fileName = 'document.jpg') {
  try {
    if (Capacitor.isNativePlatform()) {
      await Share.share({
        title: 'MoneyMa Business Document',
        text: 'ใบสั่งซื้อ/ใบสั่งขาย ออกจากระบบ MoneyMa',
        url: dataUrl,
        dialogTitle: 'แชร์รูปภาพเอกสาร (.jpg)',
      });
      return;
    }

    if (navigator.share && navigator.canShare) {
      try {
        const res = await fetch(dataUrl);
        const blob = await res.blob();
        const file = new File([blob], fileName, { type: 'image/jpeg' });
        if (navigator.canShare({ files: [file] })) {
          await navigator.share({
            files: [file],
            title: 'MoneyMa Business Document',
            text: 'ใบสั่งซื้อ/ใบสั่งขาย',
          });
          return;
        }
      } catch (e) {}
    }

    // Browser download
    const a = document.createElement('a');
    a.href = dataUrl;
    a.download = fileName;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
  } catch (err) {
    console.error('Share or download JPG error:', err);
    const a = document.createElement('a');
    a.href = dataUrl;
    a.download = fileName;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
  }
}
