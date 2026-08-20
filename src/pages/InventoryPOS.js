import React, { useState, useEffect, useRef } from 'react';
import { Capacitor } from '@capacitor/core';
import { Camera, CameraSource } from '@capacitor/camera';
import { canAccess } from '../SubscriptionContext/SubscriptionService';
import { exportInventoryPOSReport } from '../utils/dataTransfer';
import { scanProductImageWithAI } from '../services/GeminiService';
import { generateDocumentJpgDataUrl, shareOrDownloadJpg } from '../utils/documentJpgExporter';
import './InventoryPOS.css';

const INVENTORY_STORAGE_KEY = 'moneyma_inventory_products';

export default function InventoryPOS({ userPlan = 'free', onAddTransaction, openPaywall, t = {} }) {
  const hasAccess = canAccess(userPlan, 'stock_management');
  const hasMultiWh = canAccess(userPlan, 'multi_warehouse');

  const cameraInputRef = useRef(null);
  const fileInputRef = useRef(null);
  const [isScanningAi, setIsScanningAi] = useState(false);

  const [activeTab, setActiveTab] = useState('inventory'); // 'inventory' | 'pos' | 'po' | 'report'
  const [products, setProducts] = useState(() => {
    try {
      const saved = localStorage.getItem(INVENTORY_STORAGE_KEY);
      if (saved) return JSON.parse(saved);
    } catch (e) {}
    return [
      { id: '1', sku: 'P-001', name: 'กาแฟอาราบิก้า พรีเมี่ยม (250g)', category: 'เครื่องดื่ม', cost: 120, price: 250, warehouse1: 25, warehouse2: 15, warehouse3: 5, stock: 45, minStock: 10 },
      { id: '2', sku: 'P-002', name: 'แก้วกาแฟสแตนเลส เก็บความเย็น', category: 'อุปกรณ์', cost: 180, price: 390, warehouse1: 10, warehouse2: 5, warehouse3: 3, stock: 18, minStock: 5 },
      { id: '3', sku: 'P-003', name: 'ชาไทยพรีเมี่ยม สูตรเข้มข้น (500g)', category: 'เครื่องดื่ม', cost: 95, price: 190, warehouse1: 5, warehouse2: 3, warehouse3: 0, stock: 8, minStock: 10 },
      { id: '4', sku: 'P-004', name: 'เมล็ดกาแฟโรบัสต้า (500g)', category: 'เครื่องดื่ม', cost: 80, price: 160, warehouse1: 2, warehouse2: 1, warehouse3: 0, stock: 3, minStock: 5 },
    ];
  });

  // Printer State & Auto-Print Settings
  const [autoPrintReceipt, setAutoPrintReceipt] = useState(() => {
    const saved = localStorage.getItem('moneyma_auto_print_receipt');
    return saved ? JSON.parse(saved) : true;
  });

  // Periodic Report Filter State
  const [reportPeriodType, setReportPeriodType] = useState('monthly'); // 'daily' | 'monthly' | 'quarterly' | 'yearly'
  const [reportDate, setReportDate] = useState(new Date().toISOString().split('T')[0]);
  const [reportMonth, setReportMonth] = useState(new Date().toISOString().split('T')[0].substring(0, 7));
  const [reportQuarter, setReportQuarter] = useState('Q1');
  const [reportYear, setReportYear] = useState(new Date().getFullYear());

  useEffect(() => {
    localStorage.setItem('moneyma_auto_print_receipt', JSON.stringify(autoPrintReceipt));
  }, [autoPrintReceipt]);

  // Modal State for Product CRUD & Multi-Warehouse
  const [showProductModal, setShowProductModal] = useState(false);
  const [editingProduct, setEditingProduct] = useState(null);
  const [prodSku, setProdSku] = useState('');
  const [prodName, setProdName] = useState('');
  const [prodCat, setProdCat] = useState('ทั่วไป');
  const [prodCost, setProdCost] = useState('');
  const [prodPrice, setProdPrice] = useState('');
  const [prodWh1, setProdWh1] = useState('10'); // คลัง 1 (คลังหลัก)
  const [prodWh2, setProdWh2] = useState('0');  // คลัง 2 (คลังหน้าร้าน)
  const [prodWh3, setProdWh3] = useState('0');  // คลัง 3 (คลังสำรอง)
  const [prodMinStock, setProdMinStock] = useState('5');
  const [prodImageUrl, setProdImageUrl] = useState('');

  // Automatic Image Resizer & Compressor (Max 600x600, JPEG Quality 0.82)
  const compressAndSetProductImage = (file) => {
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (event) => {
      const img = new Image();
      img.onload = () => {
        const canvas = document.createElement('canvas');
        let width = img.width;
        let height = img.height;
        const maxDim = 600;

        if (width > maxDim || height > maxDim) {
          if (width > height) {
            height = Math.round((height * maxDim) / width);
            width = maxDim;
          } else {
            width = Math.round((width * maxDim) / height);
            height = maxDim;
          }
        }

        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext('2d');
        ctx.drawImage(img, 0, 0, width, height);

        const compressedDataUrl = canvas.toDataURL('image/jpeg', 0.82);
        setProdImageUrl(compressedDataUrl);
      };
      img.src = event.target.result;
    };
    reader.readAsDataURL(file);
  };

  const handleProductImageFileChange = (e) => {
    const file = e.target.files?.[0];
    if (file) compressAndSetProductImage(file);
  };

  // POS State
  const [cart, setCart] = useState([]);
  const [posSearch, setPosSearch] = useState('');
  const [customerName, setCustomerName] = useState('ลูกค้าทั่วไป');
  const [customerTaxId, setCustomerTaxId] = useState('');
  const [vatPercent, setVatPercent] = useState(7);
  const [discount, setDiscount] = useState(0);

  // PromptPay & Sales Order State
  const [showQrModal, setShowQrModal] = useState(false);
  const [promptPayId, setPromptPayId] = useState(() => {
    return localStorage.getItem('moneyma_promptpay_id') || '0812345678';
  });

  useEffect(() => {
    localStorage.setItem('moneyma_promptpay_id', promptPayId);
  }, [promptPayId]);

  // Purchase Order (Stock In) State
  const [poItems, setPoItems] = useState([]);
  const [supplierName, setSupplierName] = useState('ซัพพลายเออร์หลัก');
  const [supplierTaxId, setSupplierTaxId] = useState('');

  // Document JPG Export Modal State
  const [showJpgModal, setShowJpgModal] = useState(false);
  const [jpgDataUrl, setJpgDataUrl] = useState('');
  const [jpgFileName, setJpgFileName] = useState('document.jpg');

  useEffect(() => {
    try {
      localStorage.setItem(INVENTORY_STORAGE_KEY, JSON.stringify(products));
    } catch (e) {}
  }, [products]);

  // Calculations
  const totalStockCount = products.reduce((acc, p) => acc + (Number(p.stock) || 0), 0);
  const totalCostValue = products.reduce((acc, p) => acc + ((Number(p.stock) || 0) * (Number(p.cost) || 0)), 0);
  const totalRetailValue = products.reduce((acc, p) => acc + ((Number(p.stock) || 0) * (Number(p.price) || 0)), 0);
  const lowStockProducts = products.filter(p => Number(p.stock) <= Number(p.minStock));

  // Daily Sales & PO Counters for Today
  const todayStr = new Date().toISOString().split('T')[0];

  const todaySalesCount = React.useMemo(() => {
    try {
      const history = JSON.parse(localStorage.getItem('moneyma_sales_history') || '[]');
      return history.filter(item => item.date === todayStr).length;
    } catch (e) {
      return 0;
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cart, activeTab, todayStr]);

  const todayPoCount = React.useMemo(() => {
    try {
      const history = JSON.parse(localStorage.getItem('moneyma_po_history') || '[]');
      return history.filter(item => item.date === todayStr).length;
    } catch (e) {
      return 0;
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [poItems, activeTab, todayStr]);

  // Target warehouse for Purchase Orders
  const [poTargetWarehouse, setPoTargetWarehouse] = useState('warehouse1'); // 'warehouse1' | 'warehouse2' | 'warehouse3'

  // AI Image Scan Helper
  const processAiScanFile = async (file) => {
    if (!file) return;
    setIsScanningAi(true);

    compressAndSetProductImage(file);

    try {
      const scanned = await scanProductImageWithAI(file);
      setEditingProduct(null);
      setProdSku(scanned.sku || `AI-${Date.now().toString().slice(-4)}`);
      setProdName(scanned.name || 'สินค้าสแกนจากกล้อง/รูปภาพ');
      setProdCat(scanned.category || 'ทั่วไป');
      setProdCost(scanned.cost || 0);
      setProdPrice(scanned.price || 0);
      setProdWh1(scanned.stock || 10);
      setProdWh2(0);
      setProdWh3(0);
      setShowProductModal(true);
    } catch (err) {
      alert('❌ สแกนล้มเหลว กรุณาลองใหม่อีกครั้ง');
    } finally {
      setIsScanningAi(false);
    }
  };

  // 📷 AI Camera Scan (Native device camera or direct camera capture)
  const handleAiScanCamera = async () => {
    if (Capacitor.isNativePlatform()) {
      try {
        const photo = await Camera.getPhoto({
          quality: 90,
          allowEditing: false,
          resultType: 'base64',
          source: CameraSource.Camera,
        });

        if (!photo?.base64String) return;

        const byteChars = atob(photo.base64String);
        const byteArr = new Uint8Array(byteChars.length);
        for (let i = 0; i < byteChars.length; i++) {
          byteArr[i] = byteChars.charCodeAt(i);
        }
        const blob = new Blob([byteArr], { type: 'image/jpeg' });
        const file = new File([blob], 'camera_product.jpg', { type: 'image/jpeg' });

        await processAiScanFile(file);
      } catch (err) {
        if (!err.message?.includes('cancelled') && !err.message?.includes('cancel')) {
          console.error('Camera error:', err);
          alert('❌ ไม่สามารถเปิดกล้องได้ กรุณาลองใหม่อีกครั้ง');
        }
      }
    } else {
      if (cameraInputRef.current) {
        cameraInputRef.current.click();
      } else {
        const input = document.createElement('input');
        input.type = 'file';
        input.accept = 'image/*';
        input.capture = 'environment';
        input.onchange = async (e) => {
          const file = e.target.files?.[0];
          if (file) await processAiScanFile(file);
        };
        input.click();
      }
    }
  };

  // 📁 AI File Scan (Keep original file input picker)
  const handleAiScanFileChange = async (e) => {
    const file = e.target.files?.[0];
    if (file) {
      await processAiScanFile(file);
    }
    e.target.value = '';
  };

  // Open Add/Edit Product Modal
  const openAddProduct = () => {
    setEditingProduct(null);
    setProdSku(`P-00${products.length + 1}`);
    setProdName('');
    setProdCat('ทั่วไป');
    setProdCost('');
    setProdPrice('');
    setProdWh1('10');
    setProdWh2('0');
    setProdWh3('0');
    setProdMinStock('5');
    setProdImageUrl('');
    setShowProductModal(true);
  };

  const openEditProduct = (prod) => {
    setEditingProduct(prod);
    setProdSku(prod.sku);
    setProdName(prod.name);
    setProdCat(prod.category);
    setProdCost(prod.cost);
    setProdPrice(prod.price);
    setProdWh1(prod.warehouse1 !== undefined ? prod.warehouse1 : prod.stock);
    setProdWh2(prod.warehouse2 || 0);
    setProdWh3(prod.warehouse3 || 0);
    setProdMinStock(prod.minStock);
    setProdImageUrl(prod.imageUrl || prod.image || '');
    setShowProductModal(true);
  };

  const handleSaveProduct = (e) => {
    e.preventDefault();
    if (!prodName.trim() || !prodPrice) return;

    const w1 = Number(prodWh1) || 0;
    const w2 = Number(prodWh2) || 0;
    const w3 = Number(prodWh3) || 0;
    const totalStk = w1 + w2 + w3;

    if (editingProduct) {
      setProducts(prev => prev.map(p => p.id === editingProduct.id ? {
        ...p,
        sku: prodSku,
        name: prodName,
        category: prodCat,
        cost: Number(prodCost) || 0,
        price: Number(prodPrice) || 0,
        warehouse1: w1,
        warehouse2: w2,
        warehouse3: w3,
        stock: totalStk,
        minStock: Number(prodMinStock) || 0,
        imageUrl: prodImageUrl,
      } : p));
    } else {
      const newProd = {
        id: Date.now().toString(),
        sku: prodSku || `P-${Date.now().toString().slice(-4)}`,
        name: prodName,
        category: prodCat,
        cost: Number(prodCost) || 0,
        price: Number(prodPrice) || 0,
        warehouse1: w1,
        warehouse2: w2,
        warehouse3: w3,
        stock: totalStk,
        minStock: Number(prodMinStock) || 5,
        imageUrl: prodImageUrl,
      };
      setProducts(prev => [newProd, ...prev]);
    }
    setShowProductModal(false);
  };

  const handleDeleteProduct = (id) => {
    if (window.confirm('ยืนยันลบสินค้านี้ออกจากคลังหรือไม่?')) {
      setProducts(prev => prev.filter(p => p.id !== id));
    }
  };

  // Cart operations (POS)
  const addToCart = (product) => {
    if (product.stock <= 0) {
      alert('⚠️ สินค้าหมดสต็อก!');
      return;
    }
    setCart(prev => {
      const existing = prev.find(item => item.id === product.id);
      if (existing) {
        if (existing.qty >= product.stock) {
          alert('⚠️ สต็อกสินค้าไม่เพียงพอ!');
          return prev;
        }
        return prev.map(item => item.id === product.id ? { ...item, qty: item.qty + 1 } : item);
      } else {
        return [...prev, { ...product, qty: 1 }];
      }
    });
  };

  const updateCartQty = (id, newQty) => {
    if (newQty <= 0) {
      setCart(prev => prev.filter(item => item.id !== id));
      return;
    }
    const targetProd = products.find(p => p.id === id);
    if (targetProd && newQty > targetProd.stock) {
      alert('⚠️ จำนวนสินค้าในคลังมีไม่ถึง!');
      return;
    }
    setCart(prev => prev.map(item => item.id === id ? { ...item, qty: newQty } : item));
  };

  const subtotalCart = cart.reduce((acc, item) => acc + (item.price * item.qty), 0);
  const discountedCart = Math.max(0, subtotalCart - discount);
  const vatAmount = (discountedCart * vatPercent) / 100;
  const totalCartAmount = discountedCart + vatAmount;

  // Complete POS Sale
  const handleCompleteSale = () => {
    if (cart.length === 0) return;

    // 1. Deduct stock from products
    setProducts(prev => prev.map(prod => {
      const cartItem = cart.find(c => c.id === prod.id);
      if (cartItem) {
        return { ...prod, stock: Math.max(0, prod.stock - cartItem.qty) };
      }
      return prod;
    }));

    // 2. Add Income transaction to financial system
    const description = `ขายสินค้า (POS): ${cart.map(c => `${c.name} x${c.qty}`).join(', ')}`;
    if (typeof onAddTransaction === 'function') {
      onAddTransaction({
        type: 'income',
        amount: totalCartAmount,
        category: 'ขายสินค้า/บริการ',
        description,
        date: new Date().toISOString().split('T')[0],
      });
    }

    // Save sales record history for daily counter
    try {
      const saleRecord = {
        id: `POS-${Date.now()}`,
        date: new Date().toISOString().split('T')[0],
        customerName,
        customerTaxId,
        items: cart,
        totalAmount: totalCartAmount,
      };
      const existingSalesHistory = JSON.parse(localStorage.getItem('moneyma_sales_history') || '[]');
      localStorage.setItem('moneyma_sales_history', JSON.stringify([saleRecord, ...existingSalesHistory]));
    } catch (e) {}

    // 3. Print Tax Invoice / Receipt if autoPrintReceipt enabled
    if (autoPrintReceipt) {
      const printWindow = window.open('', '_blank');
      if (printWindow) {
        printWindow.document.write(`
          <!DOCTYPE html>
          <html>
          <head>
            <title>ใบเสร็จรับเงิน / ใบกำกับภาษีอย่างย่อ</title>
            <style>
              body { font-family: monospace; padding: 20px; width: 300px; margin: 0 auto; line-height: 1.4; }
              h2, h3 { text-align: center; margin: 5px 0; }
              .line { border-bottom: 1px dashed #000; margin: 10px 0; }
              .row { display: flex; justify-content: space-between; }
            </style>
          </head>
          <body>
            <h2>MoneyMa Store</h2>
            <h3>ใบเสร็จรับเงิน / ใบกำกับภาษีอย่างย่อ</h3>
            <div class="line"></div>
            <div>ลูกค้า: ${customerName}</div>
            ${customerTaxId ? `<div>Tax ID: ${customerTaxId}</div>` : ''}
            <div>วันที่: ${new Date().toLocaleString('th-TH')}</div>
            <div class="line"></div>
            ${cart.map(item => `
              <div class="row">
                <span>${item.name} x${item.qty}</span>
                <span>฿${(item.price * item.qty).toLocaleString()}</span>
              </div>
            `).join('')}
            <div class="line"></div>
            <div class="row"><span>ยอดรวมสินค้า:</span><span>฿${subtotalCart.toLocaleString()}</span></div>
            ${discount > 0 ? `<div class="row"><span>ส่วนลด:</span><span>-฿${discount.toLocaleString()}</span></div>` : ''}
            <div class="row"><span>VAT ${vatPercent}%:</span><span>฿${vatAmount.toLocaleString()}</span></div>
            <div class="row" style="font-weight:bold; font-size: 16px;"><span>สุทธิ:</span><span>฿${totalCartAmount.toLocaleString()}</span></div>
            <div class="line"></div>
            <p style="text-align:center;">ขอบคุณที่ใชับริการ!</p>
          </body>
          </html>
        `);
        printWindow.document.close();
        printWindow.focus();
        setTimeout(() => printWindow.print(), 300);
      }
    }

    alert('🎉 บันทึกการขาย ตัดสต็อก และสร้างรายการรายรับสำเร็จ!');
    setCart([]);
  };

  // QR PromptPay Payment Confirmation
  const handleConfirmQrPayment = () => {
    setShowQrModal(false);
    handleCompleteSale();
  };

  // Generate Sales Order / Quotaion / Draft Invoice
  const handleGenerateSalesOrder = () => {
    if (cart.length === 0) {
      alert('⚠️ กรุณาเลือกสินค้าลงตะกร้าก่อนออกใบสั่งซื้อ!');
      return;
    }
    const orderNo = `SO-${Date.now().toString().slice(-6)}`;
    const qrUrl = `https://promptpay.io/${promptPayId.replace(/[^0-9]/g, '')}/${totalCartAmount.toFixed(2)}.png`;

    const printWindow = window.open('', '_blank');
    if (printWindow) {
      printWindow.document.write(`
        <!DOCTYPE html>
        <html lang="th">
        <head>
          <meta charset="UTF-8">
          <title>ใบสั่งซื้อ / ใบสั่งขาย (Sales Order) #${orderNo}</title>
          <style>
            @import url('https://fonts.googleapis.com/css2?family=Sarabun:wght@400;600;700&display=swap');
            body { font-family: 'Sarabun', sans-serif; padding: 30px; margin: 0; color: #0f172a; line-height: 1.5; }
            .header { display: flex; justify-content: space-between; border-bottom: 2px solid #6366f1; padding-bottom: 15px; margin-bottom: 20px; }
            .header h1 { margin: 0; color: #4338ca; font-size: 22px; }
            .info-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 20px; margin-bottom: 20px; font-size: 13px; }
            table { width: 100%; border-collapse: collapse; margin-bottom: 20px; font-size: 13px; }
            th { background: #4338ca; color: #fff; text-align: left; padding: 8px 12px; }
            td { border-bottom: 1px solid #e2e8f0; padding: 8px 12px; }
            .text-right { text-align: right; }
            .summary { text-align: right; font-size: 14px; margin-bottom: 30px; }
            .qr-section { text-align: center; background: #f8fafc; border: 1px dashed #cbd5e1; border-radius: 12px; padding: 16px; width: 220px; margin: 0 auto; }
            .qr-section img { width: 140px; height: 140px; }
          </style>
        </head>
        <body>
          <div class="header">
            <div>
              <h1>MoneyMa Store — ใบสั่งซื้อ / ใบสั่งขาย (Sales Order)</h1>
              <p style="margin:4px 0 0 0; font-size:12px; color:#64748b;">เอกสารใบสั่งซื้อสำหรับการสั่งซื้อและชำระเงิน</p>
            </div>
            <div style="text-align:right;">
              <h2 style="margin:0; font-size:16px;">เลขที่: ${orderNo}</h2>
              <p style="margin:4px 0 0 0; font-size:12px; color:#64748b;">วันที่: ${new Date().toLocaleDateString('th-TH')}</p>
            </div>
          </div>

          <div class="info-grid">
            <div>
              <strong>ข้อมูลผู้ซื้อ (Customer):</strong>
              <div>ชื่อ: ${customerName}</div>
              ${customerTaxId ? `<div>Tax ID: ${customerTaxId}</div>` : ''}
            </div>
            <div style="text-align:right;">
              <strong>วิธีการชำระเงิน (Payment Method):</strong>
              <div>PromptPay QR / โอนเงินผ่านธนาคาร</div>
              <div>พร้อมเพย์: ${promptPayId}</div>
            </div>
          </div>

          <table>
            <thead>
              <tr>
                <th>SKU</th>
                <th>รายการสินค้า</th>
                <th class="text-right">จำนวน</th>
                <th class="text-right">ราคา/หน่วย</th>
                <th class="text-right">รวมเงิน</th>
              </tr>
            </thead>
            <tbody>
              ${cart.map(item => `
                <tr>
                  <td><code>${item.sku}</code></td>
                  <td><b>${item.name}</b></td>
                  <td class="text-right">${item.qty}</td>
                  <td class="text-right">฿${item.price.toLocaleString()}</td>
                  <td class="text-right">฿${(item.price * item.qty).toLocaleString()}</td>
                </tr>
              `).join('')}
            </tbody>
          </table>

          <div class="summary">
            <div>ยอดรวมสินค้า: ฿${subtotalCart.toLocaleString()}</div>
            ${discount > 0 ? `<div>ส่วนลด: -฿${discount.toLocaleString()}</div>` : ''}
            <div>VAT ${vatPercent}%: ฿${vatAmount.toLocaleString()}</div>
            <h3 style="margin:8px 0; color:#4338ca;">ยอดชำระสุทธิ: ฿${totalCartAmount.toLocaleString()}</h3>
          </div>

          <div class="qr-section">
            <h4 style="margin:0 0 8px 0; font-size:13px; color:#4338ca;">📲 สแกน QR Code ชำระเงิน</h4>
            <img src="${qrUrl}" alt="PromptPay QR" />
            <p style="margin:6px 0 0 0; font-size:11px; color:#64748b;">พร้อมเพย์: ${promptPayId}</p>
          </div>
        </body>
        </html>
      `);
      printWindow.document.close();
      printWindow.focus();
      setTimeout(() => printWindow.print(), 300);
    }
  };

  const handleExportSalesOrderJpg = async () => {
    if (cart.length === 0) {
      alert('⚠️ กรุณาเลือกสินค้าลงตะกร้าก่อนออกเอกสารรูปภาพ!');
      return;
    }
    const orderNo = `SO-${Date.now().toString().slice(-6)}`;
    const dataUrl = await generateDocumentJpgDataUrl({
      type: 'so',
      orderNo,
      date: new Date().toLocaleDateString('th-TH'),
      customerName,
      taxId: customerTaxId,
      items: cart,
      subtotal: subtotalCart,
      discount,
      vatPercent,
      vatAmount,
      totalAmount: totalCartAmount,
      promptPayId,
    });
    setJpgDataUrl(dataUrl);
    setJpgFileName(`SalesOrder_${orderNo}.jpg`);
    setShowJpgModal(true);
  };

  const handleExportPoJpg = async () => {
    if (poItems.length === 0) {
      alert('⚠️ กรุณาเลือกสินค้าในใบสั่งซื้อก่อนออกเอกสารรูปภาพ!');
      return;
    }
    const orderNo = `PO-${Date.now().toString().slice(-6)}`;
    const whLabel = poTargetWarehouse === 'warehouse2' ? 'คลัง 2 (หน้าร้าน)' : poTargetWarehouse === 'warehouse3' ? 'คลัง 3 (สำรอง)' : 'คลัง 1 (คลังหลัก)';
    const dataUrl = await generateDocumentJpgDataUrl({
      type: 'po',
      orderNo,
      date: new Date().toLocaleDateString('th-TH'),
      supplierName,
      taxId: supplierTaxId,
      warehouseLabel: whLabel,
      items: poItems,
      subtotal: subtotalPo,
      totalAmount: subtotalPo,
    });
    setJpgDataUrl(dataUrl);
    setJpgFileName(`PurchaseOrder_${orderNo}.jpg`);
    setShowJpgModal(true);
  };

  const handleTestPrinter = () => {
    const printWindow = window.open('', '_blank');
    if (printWindow) {
      printWindow.document.write(`
        <!DOCTYPE html>
        <html>
        <head>
          <title>ทดสอบเครื่องพิมพ์ (Test Print)</title>
          <style>body { font-family: monospace; padding: 20px; width: 280px; text-align: center; }</style>
        </head>
        <body>
          <h2>MoneyMa POS</h2>
          <hr />
          <p>✅ เครื่องพิมพ์พร้อมใช้งาน!</p>
          <p>Printer Status: ONLINE</p>
          <p>${new Date().toLocaleString('th-TH')}</p>
        </body>
        </html>
      `);
      printWindow.document.close();
      printWindow.focus();
      setTimeout(() => printWindow.print(), 300);
    }
  };

  // Purchase Order Operations (Stock In)
  const addToPo = (product) => {
    setPoItems(prev => {
      const existing = prev.find(item => item.id === product.id);
      if (existing) {
        return prev.map(item => item.id === product.id ? { ...item, qty: item.qty + 1 } : item);
      } else {
        return [...prev, { ...product, qty: 1, purchaseCost: product.cost || 0 }];
      }
    });
  };

  const updatePoQty = (id, newQty) => {
    if (newQty <= 0) {
      setPoItems(prev => prev.filter(item => item.id !== id));
      return;
    }
    setPoItems(prev => prev.map(item => item.id === id ? { ...item, qty: newQty } : item));
  };

  const updatePoCost = (id, newCost) => {
    setPoItems(prev => prev.map(item => item.id === id ? { ...item, purchaseCost: Number(newCost) || 0 } : item));
  };

  const subtotalPo = poItems.reduce((acc, item) => acc + (item.purchaseCost * item.qty), 0);

  const handleCompletePO = () => {
    if (poItems.length === 0) return;

    const whLabel = poTargetWarehouse === 'warehouse2' ? 'คลัง 2 (หน้าร้าน)' : poTargetWarehouse === 'warehouse3' ? 'คลัง 3 (สำรอง)' : 'คลัง 1 (คลังหลัก)';

    setProducts(prev => {
      let updated = prev.map(prod => {
        const poItem = poItems.find(p => p.id === prod.id || p.sku === prod.sku);
        if (poItem) {
          const addedQty = Number(poItem.qty) || 0;
          const w1 = Number(prod.warehouse1 !== undefined ? prod.warehouse1 : prod.stock) || 0;
          const w2 = Number(prod.warehouse2) || 0;
          const w3 = Number(prod.warehouse3) || 0;

          let newW1 = w1;
          let newW2 = w2;
          let newW3 = w3;

          if (poTargetWarehouse === 'warehouse2') newW2 += addedQty;
          else if (poTargetWarehouse === 'warehouse3') newW3 += addedQty;
          else newW1 += addedQty;

          const newTotalStock = newW1 + newW2 + newW3;

          return {
            ...prod,
            warehouse1: newW1,
            warehouse2: newW2,
            warehouse3: newW3,
            stock: newTotalStock,
            cost: poItem.purchaseCost || prod.cost,
          };
        }
        return prod;
      });

      // Also append any new PO items that were not previously in products list
      poItems.forEach(poItem => {
        const exists = updated.some(p => p.id === poItem.id || p.sku === poItem.sku);
        if (!exists) {
          const addedQty = Number(poItem.qty) || 0;
          const w1 = poTargetWarehouse === 'warehouse1' ? addedQty : 0;
          const w2 = poTargetWarehouse === 'warehouse2' ? addedQty : 0;
          const w3 = poTargetWarehouse === 'warehouse3' ? addedQty : 0;
          updated = [
            {
              id: poItem.id || `P-${Date.now()}`,
              sku: poItem.sku || `PO-${Date.now().toString().slice(-4)}`,
              name: poItem.name || 'สินค้าสั่งซื้อ PO',
              category: poItem.category || 'ทั่วไป',
              cost: Number(poItem.purchaseCost) || Number(poItem.cost) || 0,
              price: Number(poItem.price) || 0,
              warehouse1: w1,
              warehouse2: w2,
              warehouse3: w3,
              stock: addedQty,
              minStock: 5,
            },
            ...updated,
          ];
        }
      });

      return updated;
    });

    // Save PO document record to history
    try {
      const poRecord = {
        id: `PO-${Date.now()}`,
        date: new Date().toISOString().split('T')[0],
        targetWarehouse: whLabel,
        supplierName,
        supplierTaxId,
        items: poItems,
        totalAmount: subtotalPo,
      };
      const existingPoHistory = JSON.parse(localStorage.getItem('moneyma_po_history') || '[]');
      localStorage.setItem('moneyma_po_history', JSON.stringify([poRecord, ...existingPoHistory]));
    } catch (e) {}

    const description = `ซื้อสินค้าเข้าสต็อก [${whLabel}] (PO): ${poItems.map(p => `${p.name} x${p.qty}`).join(', ')}`;
    if (typeof onAddTransaction === 'function') {
      onAddTransaction({
        type: 'expense',
        amount: subtotalPo,
        category: 'ต้นทุนสินค้า/วัตถุดิบ',
        description,
        date: new Date().toISOString().split('T')[0],
      });
    }

    alert(`🎉 บันทึกใบสั่งซื้อ PO เข้า [${whLabel}] เพิ่มเข้าคลัง และสร้างบันทึกรายจ่ายสำเร็จ!`);
    setPoItems([]);
  };

  const handleExportPeriodicReport = () => {
    let periodLabel = '';
    if (reportPeriodType === 'daily') periodLabel = `ประจำวันที่ ${reportDate}`;
    else if (reportPeriodType === 'monthly') periodLabel = `ประจำเดือน ${reportMonth}`;
    else if (reportPeriodType === 'quarterly') periodLabel = `ประจำไตรมาส ${reportQuarter} ปี ${reportYear}`;
    else periodLabel = `ประจำปี ${reportYear}`;

    exportInventoryPOSReport({
      title: 'รายงานการซื้อ-ขาย และมูลค่าสต็อกสินค้า',
      companyName: 'MoneyMa POS & Business Ledger',
      periodLabel,
      products,
      totalSales: totalRetailValue,
      totalPurchases: totalCostValue,
      totalStockCostVal: totalCostValue,
      totalStockRetailVal: totalRetailValue,
    });
  };

  return (
    <div className="pos-page page--wide">
      {/* 7-Day Business Free Trial Active Banner */}
      <div style={{ background: 'linear-gradient(135deg, #059669 0%, #047857 100%)', color: '#fff', borderRadius: '14px', padding: '12px 18px', marginBottom: '16px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '10px', boxShadow: '0 4px 12px rgba(5,150,105,0.25)' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
          <span style={{ fontSize: '22px' }}>🎁</span>
          <div>
            <strong style={{ fontSize: '14px', display: 'block' }}>{t.businessTrialTitle}</strong>
            <span style={{ fontSize: '12px', opacity: 0.95 }}>{t.businessTrialDesc}</span>
          </div>
        </div>
        <button onClick={() => openPaywall?.('stock_management')} style={{ background: '#fff', color: '#047857', border: 'none', padding: '7px 16px', borderRadius: '10px', fontSize: '12px', fontWeight: 800, cursor: 'pointer' }}>
          {t.businessTrialDetailsBtn}
        </button>
      </div>

      {/* Feature Gate Banner */}
      {!hasAccess && (
        <div className="pos-gate-banner">
          <div className="pos-gate-content">
            <h3>{t.gatePosTitle}</h3>
            <p>{t.gatePosDesc}</p>
          </div>
          <button className="pos-gate-btn" onClick={() => openPaywall?.('stock_management')}>
            ⚡ {t.fgUpgradeArrow || 'อัปเกรดใช้งาน'}
          </button>
        </div>
      )}

      {/* Page Header & Printer Controls */}
      <header className="pos-header">
        <div>
          <span className="eyebrow">{t.posEyebrow || 'Business POS & Inventory'}</span>
          <h1 className="pos-title">{t.inventoryTitle || 'คลังสินค้า และระบบซื้อขาย'}</h1>
        </div>

        <div className="pos-tabs">
          <button className={`pos-tab ${activeTab === 'inventory' ? 'active' : ''}`} onClick={() => setActiveTab('inventory')}>
            {t.tabInventory || '📦 คลังสินค้า'} ({products.length})
          </button>
          <button className={`pos-tab ${activeTab === 'pos' ? 'active' : ''}`} onClick={() => setActiveTab('pos')}>
            {t.tabPos || '🛒 ขายออก / POS'} ({todaySalesCount} วันนี้{cart.length > 0 ? ` | 🛒${cart.length}` : ''})
          </button>
          <button className={`pos-tab ${activeTab === 'po' ? 'active' : ''}`} onClick={() => setActiveTab('po')}>
            {t.tabPo || '🚚 ซื้อเข้า / PO'} ({todayPoCount} วันนี้{poItems.length > 0 ? ` | 🚚${poItems.length}` : ''})
          </button>
          <button className={`pos-tab ${activeTab === 'report' ? 'active' : ''}`} onClick={() => setActiveTab('report')}>
            {t.tabPeriodicReport || '📊 รายงานประจำงวด'}
          </button>
        </div>
      </header>

      {/* PRINTER CONNECTION CONTROL BAR */}
      <div className="pos-printer-bar">
        <div className="pos-printer-info">
          <span className="pos-printer-dot" />
          <strong>{t.thermalPrinter}</strong>
          <span style={{ fontSize: '12px', color: '#10b981', fontWeight: 'bold' }}>{t.printerReady}</span>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
          <label className="pos-print-toggle">
            <input
              type="checkbox"
              checked={autoPrintReceipt}
              onChange={e => setAutoPrintReceipt(e.target.checked)}
            />
            <span>{t.autoPrintReceiptLabel}</span>
          </label>
          <button className="pos-btn-test-print" onClick={handleTestPrinter}>
            {t.testPrintBtn}
          </button>
        </div>
      </div>

      {/* TAB 1: INVENTORY MANAGEMENT */}
      {activeTab === 'inventory' && (
        <div className="pos-inventory-container">
          {/* Summary Stat Cards */}
          <div className="pos-stats-grid">
            <div className="pos-stat-card">
              <span className="pos-stat-label">{t.statTotalProducts || 'สินค้าทั้งหมด'}</span>
              <strong className="pos-stat-val">{(t.statItemsCount || '{n} รายการ').replace('{n}', products.length)}</strong>
              <small>{(t.statInStock || '{n} ชิ้นในสต็อก').replace('{n}', totalStockCount)}</small>
            </div>
            <div className="pos-stat-card">
              <span className="pos-stat-label">{t.statCostVal || 'มูลค่าทุนรวม (Cost)'}</span>
              <strong className="pos-stat-val">฿{totalCostValue.toLocaleString()}</strong>
              <small>{t.statAllCost || 'ต้นทุนสินค้าทั้งหมด'}</small>
            </div>
            <div className="pos-stat-card">
              <span className="pos-stat-label">{t.statRetailVal || 'มูลค่าขายรวม (Retail)'}</span>
              <strong className="pos-stat-val" style={{ color: '#10b981' }}>฿{totalRetailValue.toLocaleString()}</strong>
              <small>{(t.statEstProfit || 'กำไรคาดการณ์ ฿{val}').replace('{val}', (totalRetailValue - totalCostValue).toLocaleString())}</small>
            </div>
            <div className="pos-stat-card" style={{ borderColor: lowStockProducts.length > 0 ? '#ef4444' : undefined }}>
              <span className="pos-stat-label">{t.statLowStockAlert || 'เตือนสินค้าใกล้หมด'}</span>
              <strong className="pos-stat-val" style={{ color: lowStockProducts.length > 0 ? '#ef4444' : '#64748b' }}>
                {(t.statItemsCount || '{n} รายการ').replace('{n}', lowStockProducts.length)}
              </strong>
              <small>{t.statBelowMin || 'ต่ำกว่าระดับขั้นต่ำ'}</small>
            </div>
          </div>

          {/* Hidden File Inputs for AI Camera & Local Upload */}
          <input type="file" ref={cameraInputRef} accept="image/*" capture="environment" style={{ display: 'none' }} onChange={handleAiScanFileChange} />
          <input type="file" ref={fileInputRef} accept="image/*" style={{ display: 'none' }} onChange={handleAiScanFileChange} />

          {/* Action Bar */}
          <div className="pos-action-bar" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '12px' }}>
            <h3 style={{ margin: 0, fontSize: '18px', fontWeight: 800 }}>{t.itemsInStockHeader || 'รายการสินค้าในสต็อก'}</h3>

            <div style={{ display: 'flex', gap: '10px', alignItems: 'center', flexWrap: 'wrap' }}>
              <button
                className="pos-btn-ai-scan"
                disabled={isScanningAi}
                onClick={handleAiScanCamera}
                style={{ padding: '8px 16px', borderRadius: '12px', border: 'none', background: 'linear-gradient(135deg, #2563eb 0%, #1d4ed8 100%)', color: '#fff', fontSize: '13px', fontWeight: 700, cursor: 'pointer', boxShadow: '0 2px 8px rgba(37,99,235,0.25)' }}
              >
                📷 {isScanningAi ? (t.aiScanningState || 'กำลังสแกน...') : (t.btnAiCameraScan || 'AI สแกนกล้อง')}
              </button>

              <button
                className="pos-btn-ai-scan"
                disabled={isScanningAi}
                onClick={() => fileInputRef.current?.click()}
                style={{ padding: '8px 16px', borderRadius: '12px', border: 'none', background: 'linear-gradient(135deg, #6366f1 0%, #4f46e5 100%)', color: '#fff', fontSize: '13px', fontWeight: 700, cursor: 'pointer', boxShadow: '0 2px 8px rgba(99,102,241,0.25)' }}
              >
                📁 {isScanningAi ? (t.aiScanningState || 'กำลังสแกน...') : (t.btnAiFileScan || 'AI สแกนไฟล์')}
              </button>

              <button className="pos-btn-add" onClick={openAddProduct}>
                {t.addNewProduct || '+ เพิ่มสินค้าใหม่'}
              </button>
            </div>
          </div>

          {/* Product Table with Multi-Warehouse (คลัง 1, คลัง 2, คลัง 3) */}
          <div className="pos-table-wrap">
            <table className="pos-table">
              <thead>
                <tr>
                  <th style={{ width: '90px', minWidth: '90px' }}>{t.thSku || 'รหัส SKU'}</th>
                  <th style={{ minWidth: '200px' }}>{t.thProdName || 'ชื่อสินค้า'}</th>
                  <th style={{ width: '110px', minWidth: '110px' }}>{t.thCategory || 'หมวดหมู่'}</th>
                  <th className="text-right" style={{ width: '100px', minWidth: '100px' }}>{t.thCostPrice || 'ราคาทุน (฿)'}</th>
                  <th className="text-right" style={{ width: '100px', minWidth: '100px' }}>{t.thSellPrice || 'ราคาขาย (฿)'}</th>
                  <th className="text-right" style={{ width: '90px', minWidth: '90px', color: '#0284c7' }}>คลัง 1 (หลัก)</th>
                  <th className="text-right" style={{ width: '90px', minWidth: '90px', color: '#0d9488' }}>คลัง 2 (หน้าร้าน)</th>
                  <th className="text-right" style={{ width: '90px', minWidth: '90px', color: '#7c3aed' }}>คลัง 3 (สำรอง)</th>
                  <th className="text-right" style={{ width: '90px', minWidth: '90px' }}>สต็อกรวม</th>
                  <th className="text-center" style={{ width: '95px', minWidth: '95px' }}>{t.thStatus || 'สถานะ'}</th>
                  <th className="text-center" style={{ width: '90px', minWidth: '90px' }}>{t.thManage || 'จัดการ'}</th>
                </tr>
              </thead>
              <tbody>
                {products.map(prod => {
                  const isLow = prod.stock <= prod.minStock;
                  const w1 = prod.warehouse1 !== undefined ? prod.warehouse1 : prod.stock;
                  const w2 = prod.warehouse2 || 0;
                  const w3 = prod.warehouse3 || 0;
                  return (
                    <tr key={prod.id}>
                      <td><code>{prod.sku}</code></td>
                      <td>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                          {prod.imageUrl ? (
                            <img src={prod.imageUrl} alt={prod.name} style={{ width: '36px', height: '36px', borderRadius: '8px', objectFit: 'cover', border: '1px solid #cbd5e1', flexShrink: 0 }} />
                          ) : (
                            <div style={{ width: '36px', height: '36px', borderRadius: '8px', background: '#f1f5f9', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '18px', flexShrink: 0 }}>📦</div>
                          )}
                          <strong style={{ fontSize: '13px', lineHeight: '1.4' }}>{prod.name}</strong>
                        </div>
                      </td>
                      <td><span className="pos-cat-badge">{prod.category}</span></td>
                      <td className="text-right">฿{Number(prod.cost).toLocaleString()}</td>
                      <td className="text-right" style={{ fontWeight: 'bold' }}>฿{Number(prod.price).toLocaleString()}</td>
                      <td className="text-right" style={{ fontWeight: 600, color: '#0284c7' }}>{w1}</td>
                      <td className="text-right" style={{ fontWeight: 600, color: '#0d9488' }}>{w2}</td>
                      <td className="text-right" style={{ fontWeight: 600, color: '#7c3aed' }}>{w3}</td>
                      <td className="text-right">
                        <span style={{ fontWeight: 'bold', color: isLow ? '#ef4444' : '#10b981' }}>
                          {prod.stock}
                        </span>
                      </td>
                      <td className="text-center">
                        {prod.stock <= 0 ? (
                          <span className="pos-status-badge out">{t.statusOut || 'สินค้าหมด'}</span>
                        ) : isLow ? (
                          <span className="pos-status-badge low">{t.statusLow || 'สต็อกต่ำ'}</span>
                        ) : (
                          <span className="pos-status-badge normal">{t.statusNormal || 'ปกติ'}</span>
                        )}
                      </td>
                      <td className="text-center">
                        <div style={{ display: 'inline-flex', gap: '6px', justifyContent: 'center', alignItems: 'center' }}>
                          <button className="pos-icon-btn" onClick={() => openEditProduct(prod)} title={t.edit || 'แก้ไข'}>✏️</button>
                          <button className="pos-icon-btn danger" onClick={() => handleDeleteProduct(prod.id)} title={t.delete || 'ลบ'}>🗑️</button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* TAB 2: POS SALES REGISTER */}
      {activeTab === 'pos' && (
        <div className="pos-register-layout">
          {/* Left: Product Selection */}
          <div className="pos-catalog-panel">
            <input
              type="text"
              className="pos-search-input"
              placeholder={t.posSearchPlaceholder || "🔍 ค้นหาสินค้าด้วยชื่อ หรือ SKU..."}
              value={posSearch}
              onChange={e => setPosSearch(e.target.value)}
            />

            <div className="pos-catalog-grid">
              {products
                .filter(p => p.name.toLowerCase().includes(posSearch.toLowerCase()) || p.sku.toLowerCase().includes(posSearch.toLowerCase()))
                .map(prod => (
                  <div key={prod.id} className={`pos-prod-card ${prod.stock <= 0 ? 'disabled' : ''}`} onClick={() => addToCart(prod)}>
                    <div className="pos-prod-img-box">
                      {prod.imageUrl ? (
                        <img src={prod.imageUrl} alt={prod.name} />
                      ) : (
                        <span style={{ fontSize: '28px' }}>📦</span>
                      )}
                    </div>
                    <div className="pos-prod-details">
                      <div>
                        <div className="pos-prod-sku">{prod.sku}</div>
                        <div className="pos-prod-name" title={prod.name}>{prod.name}</div>
                      </div>
                      <div>
                        <div className="pos-prod-price">฿{prod.price.toLocaleString()}</div>
                        <div className={`pos-prod-stock ${prod.stock <= prod.minStock ? 'low' : ''}`}>
                          {t.thStockRemain || 'สต็อกคงเหลือ'}: {prod.stock}
                        </div>
                      </div>
                    </div>
                  </div>
                ))}
            </div>
          </div>

          {/* Right: Cart & Checkout */}
          <div className="pos-cart-panel">
            <h3>{t.cartTitle || '🛒 ตระกร้าสินค้า (Cart)'}</h3>

            <div className="pos-customer-form">
              <input
                type="text"
                placeholder={t.customerNameLabel || "ชื่อลูกค้า / บริษัท"}
                value={customerName}
                onChange={e => setCustomerName(e.target.value)}
              />
              <input
                type="text"
                placeholder={t.taxIdLabel || "เลขผู้เสียภาษี Tax ID"}
                value={customerTaxId}
                onChange={e => setCustomerTaxId(e.target.value)}
              />
            </div>

            <div className="pos-cart-list">
              {cart.length === 0 ? (
                <div className="pos-cart-empty">{t.posCartEmpty || 'ยังไม่มีสินค้าในตะกร้า คลิกเลือกสินค้าฝั่งซ้าย'}</div>
              ) : (
                cart.map(item => (
                  <div key={item.id} className="pos-cart-item">
                    <div className="pos-cart-info">
                      <strong>{item.name}</strong>
                      <small>฿{item.price} x {item.qty}</small>
                    </div>
                    <div className="pos-cart-qty-ctrl">
                      <button onClick={() => updateCartQty(item.id, item.qty - 1)}>-</button>
                      <span>{item.qty}</span>
                      <button onClick={() => updateCartQty(item.id, item.qty + 1)}>+</button>
                    </div>
                    <div className="pos-cart-item-total">
                      ฿{(item.price * item.qty).toLocaleString()}
                    </div>
                  </div>
                ))
              )}
            </div>

            {/* Total Summary */}
            <div className="pos-cart-summary">
              <div className="pos-sum-row">
                <span>{t.posSubtotal || 'ยอดรวมสินค้า:'}</span>
                <span>฿{subtotalCart.toLocaleString()}</span>
              </div>
              <div className="pos-sum-row">
                <span>{t.posDiscount || 'ส่วนลด (฿):'}</span>
                <input
                  type="number"
                  style={{ width: '80px', textAlign: 'right' }}
                  value={discount}
                  onChange={e => setDiscount(Number(e.target.value) || 0)}
                />
              </div>
              <div className="pos-sum-row">
                <span>{t.posVat || 'ภาษี VAT (%):'}</span>
                <select value={vatPercent} onChange={e => setVatPercent(Number(e.target.value))}>
                  <option value={0}>{t.posVatExempt || '0% (ยกเว้น VAT)'}</option>
                  <option value={7}>{t.posVatIncluded || '7% (Vat ในระบบ)'}</option>
                </select>
              </div>
              <div className="pos-sum-row total">
                <span>{t.posGrandTotal || 'ยอดชำระสุทธิ:'}</span>
                <span className="pos-grand-total">฿{totalCartAmount.toLocaleString()}</span>
              </div>

              <div style={{ display: 'flex', flexDirection: 'column', gap: '10px', marginTop: '16px' }}>
                <button
                  className="pos-checkout-btn"
                  style={{ background: 'linear-gradient(135deg, #10b981 0%, #059669 100%)' }}
                  disabled={cart.length === 0}
                  onClick={() => setShowQrModal(true)}
                >
                  📲 ชำระด้วย PromptPay QR Code (สแกนรับเงิน)
                </button>

                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px' }}>
                  <button
                    className="pos-btn-so"
                    disabled={cart.length === 0}
                    onClick={handleGenerateSalesOrder}
                    style={{
                      padding: '10px 12px',
                      borderRadius: '12px',
                      border: '1px solid #cbd5e1',
                      background: '#f8fafc',
                      color: '#475569',
                      fontWeight: 700,
                      fontSize: '12px',
                      cursor: 'pointer'
                    }}
                  >
                    📝 ใบสั่งขาย (Web)
                  </button>

                  <button
                    disabled={cart.length === 0}
                    onClick={handleExportSalesOrderJpg}
                    style={{
                      padding: '10px 12px',
                      borderRadius: '12px',
                      border: '1px solid #818cf8',
                      background: '#eff6ff',
                      color: '#4338ca',
                      fontWeight: 700,
                      fontSize: '12px',
                      cursor: 'pointer'
                    }}
                  >
                    🖼️ รูปภาพ SO (.jpg)
                  </button>
                </div>

                <button
                  className="pos-checkout-btn"
                  style={{ padding: '12px', fontSize: '13px', marginTop: '8px' }}
                  disabled={cart.length === 0}
                  onClick={handleCompleteSale}
                >
                  🧾 ชำระเงินสด/ออกใบเสร็จ
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* TAB 3: PURCHASE ORDER / STOCK IN */}
      {activeTab === 'po' && (
        <div className="pos-register-layout">
          {/* Left: Select Products to Buy */}
          <div className="pos-catalog-panel">
            <h3>{t.posSelectItemsToBuy || 'เลือกสินค้าที่ต้องการสั่งซื้อเข้าสต็อก'}</h3>
            <div className="pos-catalog-grid">
              {products.map(prod => (
                <div key={prod.id} className="pos-prod-card" onClick={() => addToPo(prod)}>
                  <div className="pos-prod-img-box">
                    {prod.imageUrl ? (
                      <img src={prod.imageUrl} alt={prod.name} />
                    ) : (
                      <span style={{ fontSize: '28px' }}>📦</span>
                    )}
                  </div>
                  <div className="pos-prod-details">
                    <div>
                      <div className="pos-prod-sku">{prod.sku}</div>
                      <div className="pos-prod-name" title={prod.name}>{prod.name}</div>
                    </div>
                    <div>
                      <div className="pos-prod-price">{t.thCostPrice || 'ราคาทุน'}: ฿{prod.cost.toLocaleString()}</div>
                      <div className="pos-prod-stock">{t.thStockRemain || 'สต็อกปัจจุบัน'}: {prod.stock}</div>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Right: PO Summary & Stock In */}
          <div className="pos-cart-panel">
            <h3>{t.poCartTitle || '🚚 รายการสั่งซื้อเข้าสต็อก (PO)'}</h3>

            <div className="pos-customer-form">
              <input
                type="text"
                placeholder={t.poSupplierPlaceholder || "ชื่อผู้จัดจำหน่าย / ซัพพลายเออร์"}
                value={supplierName}
                onChange={e => setSupplierName(e.target.value)}
              />
              <input
                type="text"
                placeholder={t.poSupplierTaxIdPlaceholder || "เลขผู้เสียภาษี ซัพพลายเออร์"}
                value={supplierTaxId}
                onChange={e => setSupplierTaxId(e.target.value)}
              />
              <div style={{ marginTop: '8px' }}>
                <label style={{ fontSize: '11px', fontWeight: 700, color: '#475569', display: 'block', marginBottom: '4px' }}>
                  🏢 รับสินค้าเข้าคลัง (Target Warehouse):
                </label>
                <select
                  value={poTargetWarehouse}
                  onChange={e => setPoTargetWarehouse(e.target.value)}
                  style={{ width: '100%', padding: '10px', borderRadius: '10px', border: '1px solid #cbd5e1', fontSize: '13px', fontWeight: 600 }}
                >
                  <option value="warehouse1">คลัง 1 (คลังหลัก)</option>
                  <option value="warehouse2">คลัง 2 (คลังหน้าร้าน)</option>
                  <option value="warehouse3">คลัง 3 (คลังสำรอง)</option>
                </select>
              </div>
            </div>

            <div className="pos-cart-list">
              {poItems.length === 0 ? (
                <div className="pos-cart-empty">{t.poEmpty || 'ยังไม่มีสินค้าในใบสั่งซื้อ คลิกเลือกสินค้าฝั่งซ้าย'}</div>
              ) : (
                poItems.map(item => (
                  <div key={item.id} className="pos-cart-item">
                    <div className="pos-cart-info">
                      <strong>{item.name}</strong>
                      <div style={{ display: 'flex', gap: '4px', alignItems: 'center', marginTop: '4px' }}>
                        <span>{t.poUnitCost || 'ทุนซื้อ: ฿'}</span>
                        <input
                          type="number"
                          style={{ width: '60px' }}
                          value={item.purchaseCost}
                          onChange={e => updatePoCost(item.id, e.target.value)}
                        />
                      </div>
                    </div>
                    <div className="pos-cart-qty-ctrl">
                      <button onClick={() => updatePoQty(item.id, item.qty - 1)}>-</button>
                      <span>{item.qty}</span>
                      <button onClick={() => updatePoQty(item.id, item.qty + 1)}>+</button>
                    </div>
                    <div className="pos-cart-item-total">
                      ฿{(item.purchaseCost * item.qty).toLocaleString()}
                    </div>
                  </div>
                ))
              )}
            </div>

            <div className="pos-cart-summary">
              <div className="pos-sum-row total">
                <span>{t.poTotalExpense || 'ยอดสั่งซื้อรวม (Expense):'}</span>
                <span className="pos-grand-total" style={{ color: '#ef4444' }}>฿{subtotalPo.toLocaleString()}</span>
              </div>

              <div style={{ display: 'flex', gap: '8px', marginTop: '10px' }}>
                <button
                  className="pos-checkout-btn"
                  style={{ background: 'linear-gradient(135deg, #6366f1 0%, #4338ca 100%)', flex: 1 }}
                  disabled={poItems.length === 0}
                  onClick={handleCompletePO}
                >
                  {t.completePoBtn || '📥 รับสินค้าเข้าสต็อก & บันทึกรายจ่าย'}
                </button>

                <button
                  onClick={handleExportPoJpg}
                  disabled={poItems.length === 0}
                  style={{
                    padding: '10px 14px',
                    borderRadius: '14px',
                    border: '1px solid #10b981',
                    background: '#ecfdf5',
                    color: '#047857',
                    fontWeight: 700,
                    fontSize: '13px',
                    cursor: 'pointer'
                  }}
                >
                  🖼️ รูปภาพ PO (.jpg)
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* TAB 4: PERIODIC REPORT (DAILY / MONTHLY / QUARTERLY / YEARLY) */}
      {activeTab === 'report' && (
        <div className="pos-report-container">
          <div className="pos-report-filter-panel">
            <h3 style={{ margin: '0 0 16px 0', fontSize: '18px', fontWeight: 800 }}>
              📊 รายงานการซื้อ-ขาย และสต็อกสินค้าประจำงวด
            </h3>

            <div className="cluster" style={{ gap: '16px', marginBottom: '20px', flexWrap: 'wrap' }}>
              <div className="segmented">
                {[
                  { id: 'daily', label: 'ประจำวัน (Daily)' },
                  { id: 'monthly', label: 'ประจำเดือน (Monthly)' },
                  { id: 'quarterly', label: 'ประจำไตรมาส (Quarterly)' },
                  { id: 'yearly', label: 'ประจำปี (Yearly)' },
                ].map(p => (
                  <button
                    key={p.id}
                    className={reportPeriodType === p.id ? 'is-active' : ''}
                    onClick={() => setReportPeriodType(p.id)}
                  >
                    {p.label}
                  </button>
                ))}
              </div>

              {reportPeriodType === 'daily' && (
                <input
                  type="date"
                  value={reportDate}
                  onChange={e => setReportDate(e.target.value)}
                  style={{ padding: '8px 14px', borderRadius: '10px', border: '1px solid #cbd5e1' }}
                />
              )}

              {reportPeriodType === 'monthly' && (
                <input
                  type="month"
                  value={reportMonth}
                  onChange={e => setReportMonth(e.target.value)}
                  style={{ padding: '8px 14px', borderRadius: '10px', border: '1px solid #cbd5e1' }}
                />
              )}

              {reportPeriodType === 'quarterly' && (
                <div style={{ display: 'flex', gap: '8px' }}>
                  <select value={reportQuarter} onChange={e => setReportQuarter(e.target.value)} style={{ padding: '8px 12px', borderRadius: '10px', border: '1px solid #cbd5e1' }}>
                    <option value="Q1">Q1 (ม.ค.–มี.ค.)</option>
                    <option value="Q2">Q2 (เม.ย.–มิ.ย.)</option>
                    <option value="Q3">Q3 (ก.ค.–ก.ย.)</option>
                    <option value="Q4">Q4 (ต.ค.–ธ.ค.)</option>
                  </select>
                  <input
                    type="number"
                    value={reportYear}
                    onChange={e => setReportYear(Number(e.target.value))}
                    style={{ width: '90px', padding: '8px 12px', borderRadius: '10px', border: '1px solid #cbd5e1' }}
                  />
                </div>
              )}

              {reportPeriodType === 'yearly' && (
                <input
                  type="number"
                  value={reportYear}
                  onChange={e => setReportYear(Number(e.target.value))}
                  style={{ width: '100px', padding: '8px 12px', borderRadius: '10px', border: '1px solid #cbd5e1' }}
                />
              )}
            </div>

            {/* Summary Preview Grid */}
            <div className="pos-stats-grid">
              <div className="pos-stat-card" style={{ borderLeft: '4px solid #10b981' }}>
                <span className="pos-stat-label">ยอดขายรวม (Total Sales)</span>
                <strong className="pos-stat-val" style={{ color: '#10b981' }}>
                  +฿{totalRetailValue.toLocaleString()}
                </strong>
                <small>รายรับจากการขายสินค้า</small>
              </div>

              <div className="pos-stat-card" style={{ borderLeft: '4px solid #ef4444' }}>
                <span className="pos-stat-label">ยอดสั่งซื้อเข้ารวม (Purchases)</span>
                <strong className="pos-stat-val" style={{ color: '#ef4444' }}>
                  -฿{totalCostValue.toLocaleString()}
                </strong>
                <small>รายจ่ายต้นทุนสินค้า</small>
              </div>

              <div className="pos-stat-card" style={{ borderLeft: '4px solid #3b82f6' }}>
                <span className="pos-stat-label">กำไรขั้นต้น (Gross Profit)</span>
                <strong className="pos-stat-val" style={{ color: '#3b82f6' }}>
                  ฿{(totalRetailValue - totalCostValue).toLocaleString()}
                </strong>
                <small>กำไรจากการดำเนินงาน</small>
              </div>

              <div className="pos-stat-card" style={{ borderLeft: '4px solid #6366f1' }}>
                <span className="pos-stat-label">มูลค่าสินค้าในคลังปัจจุบัน</span>
                <strong className="pos-stat-val" style={{ color: '#6366f1' }}>
                  ฿{totalCostValue.toLocaleString()}
                </strong>
                <small>{products.length} รายการ ({totalStockCount} ชิ้น)</small>
              </div>
            </div>

            {/* Detailed Periodic Stock & Sales Table */}
            <div className="pos-table-wrap" style={{ marginTop: '20px', borderRadius: '14px', border: '1px solid var(--color-border, #e2e8f0)' }}>
              <table className="pos-table">
                <thead>
                  <tr>
                    <th>SKU</th>
                    <th>ชื่อสินค้า</th>
                    <th>หมวดหมู่</th>
                    <th className="text-right">ราคาทุน</th>
                    <th className="text-right">ราคาขาย</th>
                    <th className="text-right" style={{ color: '#0284c7' }}>คลัง 1</th>
                    <th className="text-right" style={{ color: '#0d9488' }}>คลัง 2</th>
                    <th className="text-right" style={{ color: '#7c3aed' }}>คลัง 3</th>
                    <th className="text-right">คงเหลือรวม</th>
                    <th className="text-right">มูลค่าทุนรวม</th>
                  </tr>
                </thead>
                <tbody>
                  {products.map(p => {
                    const w1 = p.warehouse1 !== undefined ? p.warehouse1 : p.stock;
                    const w2 = p.warehouse2 || 0;
                    const w3 = p.warehouse3 || 0;
                    const totalStk = w1 + w2 + w3;
                    const totalCostVal = totalStk * p.cost;
                    return (
                      <tr key={p.id}>
                        <td><code>{p.sku}</code></td>
                        <td><strong>{p.name}</strong></td>
                        <td><span className="pos-cat-badge">{p.category}</span></td>
                        <td className="text-right">฿{Number(p.cost).toLocaleString()}</td>
                        <td className="text-right">฿{Number(p.price).toLocaleString()}</td>
                        <td className="text-right" style={{ color: '#0284c7', fontWeight: 600 }}>{w1}</td>
                        <td className="text-right" style={{ color: '#0d9488', fontWeight: 600 }}>{w2}</td>
                        <td className="text-right" style={{ color: '#7c3aed', fontWeight: 600 }}>{w3}</td>
                        <td className="text-right" style={{ fontWeight: 800 }}>{totalStk}</td>
                        <td className="text-right" style={{ fontWeight: 700, color: '#6366f1' }}>฿{totalCostVal.toLocaleString()}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

            <div style={{ marginTop: '24px', display: 'flex', justifyContent: 'flex-end', gap: '12px' }}>
              <button
                className="pos-btn-primary"
                style={{
                  padding: '12px 28px',
                  borderRadius: '12px',
                  background: 'linear-gradient(135deg, #10b981 0%, #059669 100%)',
                  color: '#fff',
                  border: 'none',
                  fontWeight: 800,
                  fontSize: '14px',
                  cursor: 'pointer',
                  boxShadow: '0 4px 14px rgba(16, 185, 129, 0.3)'
                }}
                onClick={handleExportPeriodicReport}
              >
                🖨️ พิมพ์ & Export รายงานซื้อ-ขาย-สต็อก ({reportPeriodType.toUpperCase()})
              </button>
            </div>
          </div>
        </div>
      )}

      {/* PRODUCT MODAL */}
      {showProductModal && (
        <div className="pos-modal-backdrop">
          <div className="pos-modal">
            <h3>{editingProduct ? (t.editProductTitle || 'แก้ไขสินค้า') : (t.addProductTitle || 'เพิ่มสินค้าใหม่ในคลัง')}</h3>

            <form onSubmit={handleSaveProduct}>
              {/* AI Image Scan Button Bar inside Modal */}
              <div style={{ background: '#eff6ff', border: '1px dashed #60a5fa', borderRadius: '12px', padding: '12px', marginBottom: '16px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '8px' }}>
                <div>
                  <strong style={{ fontSize: '13px', color: '#1e40af', display: 'block' }}>{t.aiVisionModalHeader || '🤖 AI สแกนสินค้า/บิล/ป้ายราคา (Vision AI)'}</strong>
                  <span style={{ fontSize: '11px', color: '#3b82f6' }}>{t.aiVisionModalSub || 'ถ่ายภาพจากกล้องหรือเลือกไฟล์รูปภาพเพื่อเติมข้อมูลอัตโนมัติ'}</span>
                </div>
                <div style={{ display: 'flex', gap: '8px' }}>
                  <button
                    type="button"
                    disabled={isScanningAi}
                    onClick={handleAiScanCamera}
                    style={{ padding: '8px 14px', borderRadius: '10px', border: 'none', background: '#2563eb', color: '#fff', fontSize: '12px', fontWeight: 700, cursor: 'pointer' }}
                  >
                    📷 {isScanningAi ? (t.aiScanningState || 'กำลังสแกน...') : (t.btnAiCameraScan || 'AI สแกนกล้อง')}
                  </button>
                  <button
                    type="button"
                    disabled={isScanningAi}
                    onClick={() => fileInputRef.current?.click()}
                    style={{ padding: '8px 14px', borderRadius: '10px', border: 'none', background: '#4f46e5', color: '#fff', fontSize: '12px', fontWeight: 700, cursor: 'pointer' }}
                  >
                    📁 {isScanningAi ? (t.aiScanningState || 'กำลังสแกน...') : (t.btnAiFileScan || 'AI สแกนไฟล์')}
                  </button>
                </div>
              </div>

              {/* Product Image Configuration Section */}
              <div style={{ background: '#f8fafc', padding: '12px', borderRadius: '12px', border: '1px solid #e2e8f0', marginBottom: '14px' }}>
                <label style={{ fontSize: '12px', fontWeight: 700, color: '#475569', display: 'block', marginBottom: '6px' }}>
                  🖼️ การตั้งค่ารูปภาพสินค้า (Product Image Settings):
                </label>
                <div style={{ display: 'flex', gap: '12px', alignItems: 'center', flexWrap: 'wrap' }}>
                  {prodImageUrl ? (
                    <img src={prodImageUrl} alt="Product Preview" style={{ width: '60px', height: '60px', borderRadius: '10px', objectFit: 'cover', border: '2px solid #6366f1' }} />
                  ) : (
                    <div style={{ width: '60px', height: '60px', borderRadius: '10px', background: '#e2e8f0', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '26px' }}>📷</div>
                  )}
                  <div style={{ flex: 1, minWidth: '180px' }}>
                    <label className="pos-btn-secondary" style={{ padding: '6px 12px', fontSize: '11px', fontWeight: 700, borderRadius: '8px', cursor: 'pointer', display: 'inline-block', marginBottom: '6px', background: '#4338ca', color: '#fff' }}>
                      📸 เลือกไฟล์รูปภาพ / ถ่ายรูป
                      <input type="file" accept="image/*" style={{ display: 'none' }} onChange={handleProductImageFileChange} />
                    </label>
                    <input
                      type="text"
                      placeholder="หรือระบุลิงก์รูปภาพ URL (https://...)"
                      value={prodImageUrl}
                      onChange={e => setProdImageUrl(e.target.value)}
                      style={{ width: '100%', fontSize: '11px', padding: '6px 8px', borderRadius: '8px', border: '1px solid #cbd5e1', boxSizing: 'border-box' }}
                    />
                  </div>
                </div>
              </div>

              <div className="pos-field-row">
                <div className="pos-field">
                  <label>{t.thSku || 'รหัส SKU / Barcode'}</label>
                  <input type="text" value={prodSku} onChange={e => setProdSku(e.target.value)} required />
                </div>
                <div className="pos-field">
                  <label>{t.thCategory || 'หมวดหมู่สินค้า'}</label>
                  <input type="text" value={prodCat} onChange={e => setProdCat(e.target.value)} />
                </div>
              </div>

              <div className="pos-field">
                <label>{t.thProdName || 'ชื่อสินค้า'}</label>
                <input type="text" value={prodName} onChange={e => setProdName(e.target.value)} required />
              </div>

              <div className="pos-field-row">
                <div className="pos-field">
                  <label>{t.thCostPrice || 'ราคาทุน (฿)'}</label>
                  <input type="number" step="0.01" value={prodCost} onChange={e => setProdCost(e.target.value)} required />
                </div>
                <div className="pos-field">
                  <label>{t.thSellPrice || 'ราคาขาย (฿)'}</label>
                  <input type="number" step="0.01" value={prodPrice} onChange={e => setProdPrice(e.target.value)} required />
                </div>
              </div>

              {/* Multi-Warehouse Allocation */}
              <div style={{ background: '#f8fafc', padding: '12px', borderRadius: '12px', border: '1px solid #e2e8f0', margin: '12px 0' }}>
                <label style={{ fontSize: '12px', fontWeight: 700, color: '#475569', display: 'block', marginBottom: '8px' }}>
                  🏬 จัดสรรจำนวนสต็อกรายคลัง (Multi-Warehouse):
                </label>
                <div className="pos-field-row">
                  <div className="pos-field">
                    <label style={{ color: '#0284c7', fontWeight: 700 }}>คลัง 1 (คลังหลัก)</label>
                    <input type="number" value={prodWh1} onChange={e => setProdWh1(e.target.value)} required />
                  </div>
                  <div className="pos-field">
                    <label style={{ color: '#0d9488', fontWeight: 700 }}>
                      คลัง 2 (หน้าร้าน) {!hasMultiWh && <span style={{ fontSize: '10px', color: '#e11d48', marginLeft: '4px' }}>🔒 Business</span>}
                    </label>
                    <input
                      type="number"
                      value={prodWh2}
                      onChange={e => setProdWh2(e.target.value)}
                      disabled={!hasMultiWh}
                      style={!hasMultiWh ? { background: '#f1f5f9', opacity: 0.7, cursor: 'not-allowed' } : {}}
                    />
                  </div>
                  <div className="pos-field">
                    <label style={{ color: '#7c3aed', fontWeight: 700 }}>
                      คลัง 3 (สำรอง) {!hasMultiWh && <span style={{ fontSize: '10px', color: '#e11d48', marginLeft: '4px' }}>🔒 Business</span>}
                    </label>
                    <input
                      type="number"
                      value={prodWh3}
                      onChange={e => setProdWh3(e.target.value)}
                      disabled={!hasMultiWh}
                      style={!hasMultiWh ? { background: '#f1f5f9', opacity: 0.7, cursor: 'not-allowed' } : {}}
                    />
                  </div>
                </div>
              </div>

              <div className="pos-field-row">
                <div className="pos-field">
                  <label style={{ fontWeight: 700 }}>สต็อกรวมทั้งหมด (Total Stock)</label>
                  <input
                    type="number"
                    value={(Number(prodWh1) || 0) + (Number(prodWh2) || 0) + (Number(prodWh3) || 0)}
                    disabled
                    style={{ background: '#e2e8f0', fontWeight: 'bold', color: '#0f172a' }}
                  />
                </div>
                <div className="pos-field">
                  <label>{t.prodModalMinStock || 'จุดเตือนสต็อกต่ำ (Min Alert)'}</label>
                  <input type="number" value={prodMinStock} onChange={e => setProdMinStock(e.target.value)} required />
                </div>
              </div>

              <div className="pos-modal-actions">
                <button type="button" className="pos-btn-cancel" onClick={() => setShowProductModal(false)}>{t.cancel || 'ยกเลิก'}</button>
                <button type="submit" className="pos-btn-submit">{t.save || 'บันทึกสินค้า'}</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* PROMPTPAY QR PAYMENT MODAL */}
      {showQrModal && (
        <div className="pos-modal-backdrop">
          <div className="pos-modal" style={{ textAlign: 'center', maxWidth: '420px' }}>
            <h3 style={{ margin: '0 0 4px 0', color: '#047857' }}>📲 ชำระเงินด้วย PromptPay QR</h3>
            <p style={{ margin: '0 0 16px 0', fontSize: '13px', color: '#64748b' }}>
              สแกน QR Code ผ่านแอปธนาคารเพื่อรับเงินเข้าบัญชี
            </p>

            <div style={{ background: '#f0fdf4', padding: '16px', borderRadius: '16px', border: '1px dashed #a7f3d0', marginBottom: '16px' }}>
              <div style={{ fontSize: '12px', color: '#047857', marginBottom: '4px', fontWeight: 600 }}>ยอดที่ต้องชำระ (Total Amount)</div>
              <div style={{ fontSize: '28px', fontWeight: 800, color: '#059669' }}>
                ฿{totalCartAmount.toLocaleString('th-TH', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
              </div>

              {/* Dynamic PromptPay QR Code Image */}
              <div style={{ margin: '16px 0' }}>
                <img
                  src={`https://promptpay.io/${promptPayId.replace(/[^0-9]/g, '')}/${totalCartAmount.toFixed(2)}.png`}
                  alt="PromptPay Dynamic QR Code"
                  style={{ width: '180px', height: '180px', borderRadius: '12px', boxShadow: '0 4px 12px rgba(0,0,0,0.1)' }}
                  onError={(e) => {
                    e.target.src = `https://api.qrserver.com/v1/create-qr-code/?size=180x180&data=PROMPTPAY:${promptPayId}:${totalCartAmount.toFixed(2)}`;
                  }}
                />
              </div>

              <div className="pos-field" style={{ textAlign: 'left', marginTop: '12px' }}>
                <label style={{ fontSize: '11px', color: '#475569' }}>เบอร์พร้อมเพย์ / เลขผู้เสียภาษี (PromptPay ID):</label>
                <input
                  type="text"
                  value={promptPayId}
                  onChange={e => setPromptPayId(e.target.value)}
                  style={{ textAlign: 'center', fontWeight: 'bold' }}
                />
              </div>
            </div>

            <div style={{ display: 'flex', gap: '10px' }}>
              <button
                type="button"
                className="pos-btn-cancel"
                style={{ flex: 1 }}
                onClick={() => setShowQrModal(false)}
              >
                ยกเลิก
              </button>
              <button
                type="button"
                className="pos-btn-submit"
                style={{ flex: 2, background: 'linear-gradient(135deg, #10b981 0%, #059669 100%)', boxShadow: '0 4px 12px rgba(16,185,129,0.3)' }}
                onClick={handleConfirmQrPayment}
              >
                ✅ ยืนยันโอนเงินสำเร็จ & ออกใบเสร็จ
              </button>
            </div>
          </div>
        </div>
      )}

      {/* DOCUMENT JPG PREVIEW & SHARE MODAL */}
      {showJpgModal && (
        <div className="pos-modal-backdrop" style={{ zIndex: 10005 }}>
          <div className="pos-modal" style={{ maxWidth: '600px', padding: '20px', textAlign: 'center' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '14px' }}>
              <h3 style={{ margin: 0, fontSize: '18px', fontWeight: 800 }}>🖼️ เอกสารรูปภาพ (.jpg) บนมือถือ</h3>
              <button className="ecm-close" onClick={() => setShowJpgModal(false)} style={{ background: '#f1f5f9', border: 'none', borderRadius: '50%', width: '32px', height: '32px', cursor: 'pointer' }}>✕</button>
            </div>

            <div style={{ background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: '14px', padding: '10px', maxHeight: '58vh', overflowY: 'auto', marginBottom: '16px' }}>
              <img
                src={jpgDataUrl}
                alt="Document JPG Preview"
                style={{ width: '100%', height: 'auto', borderRadius: '8px', boxShadow: '0 4px 14px rgba(0,0,0,0.1)' }}
              />
            </div>

            <div style={{ display: 'flex', gap: '10px', justifyContent: 'center', flexWrap: 'wrap' }}>
              <button
                onClick={() => shareOrDownloadJpg(jpgDataUrl, jpgFileName)}
                style={{
                  padding: '10px 18px',
                  borderRadius: '12px',
                  border: 'none',
                  background: 'linear-gradient(135deg, #10b981 0%, #059669 100%)',
                  color: '#fff',
                  fontSize: '13px',
                  fontWeight: 700,
                  cursor: 'pointer',
                  boxShadow: '0 4px 12px rgba(16,185,129,0.3)'
                }}
              >
                📲 แชร์รูปภาพออก / บันทึกภาพ (.jpg)
              </button>

              <a
                href={jpgDataUrl}
                download={jpgFileName}
                style={{
                  padding: '10px 18px',
                  borderRadius: '12px',
                  border: '1px solid #cbd5e1',
                  background: '#f1f5f9',
                  color: '#0f172a',
                  fontSize: '13px',
                  fontWeight: 700,
                  textDecoration: 'none',
                  display: 'inline-block'
                }}
              >
                📥 ดาวน์โหลดรูปภาพ (.jpg)
              </a>

              <button
                onClick={() => setShowJpgModal(false)}
                style={{
                  padding: '10px 16px',
                  borderRadius: '12px',
                  border: 'none',
                  background: '#e2e8f0',
                  color: '#475569',
                  fontSize: '13px',
                  fontWeight: 700,
                  cursor: 'pointer'
                }}
              >
                ปิด
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
