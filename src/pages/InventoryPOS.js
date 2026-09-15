import React, { useState, useEffect, useRef, useCallback } from 'react';
import { createPortal } from 'react-dom';
import { Capacitor } from '@capacitor/core';
import { Camera, CameraSource } from '@capacitor/camera';
import { canAccess } from '../SubscriptionContext/SubscriptionService';
import { exportInventoryPOSReport, buildInventoryPOSReportHtml } from '../utils/dataTransfer';
import { scanProductImageWithAI } from '../services/GeminiService';
import { generateDocumentJpgDataUrl, shareOrDownloadJpg } from '../utils/documentJpgExporter';
import { deductStockFromWarehouses } from '../utils/stockMath';
import AIConsentService from '../services/AIConsentService';
import AIConsentModal from '../components/AIConsentModal';
import { qrSvgDataUrl } from '../utils/qrGen';
import { issueShareToken, buildReceiptUrl, recordReceipt, syncPendingReceipts } from '../services/ReceiptLoopService';
import { peekDocNo, commitDocNo } from '../utils/docNumber';
import * as BtPrinter from '../services/BluetoothPrinter';
import { renderSlipToCanvas, renderTestSlipToCanvas } from '../utils/thermalRender';
import { buildReceiptJob } from '../utils/escpos';
import './InventoryPOS.css';

const INVENTORY_STORAGE_KEY = 'moneyma_inventory_products';
const PRINTER_SETTINGS_KEY = 'moneyma_printer_settings';

export const DEFAULT_PRINTER_SETTINGS = {
  paperWidth: '80',        // '58' | '80' (มม.)
  shopName: 'MoneyMa Store',
  shopAddress: '',
  shopTaxId: '',
  headerNote: '',
  footerNote: 'ขอบคุณที่ใช้บริการ',
};

/**
 * 🔴 WebView ของ Android ไม่ได้ implement window.print() -> กดแล้วเงียบ
 *    บน Android จึงไม่โชว์ปุ่มพิมพ์ แต่ให้ "บันทึกเป็นรูปภาพ / แชร์" แทน
 *    ซึ่งผู้ใช้เอาไปเข้าแอปเครื่องพิมพ์หรือส่งต่อทาง LINE ได้เอง
 *    (iOS/WKWebView รองรับ window.print() และเด้ง AirPrint ให้ จึงคงไว้เหมือนเดิม)
 */
/**
 * 🔴 .pos-modal-backdrop เป็น position:fixed ก็จริง แต่ถ้ามีบรรพบุรุษตัวไหน
 *    ตั้ง transform / filter / backdrop-filter ไว้ ตัวนั้นจะกลายเป็น containing block
 *    ทำให้ overlay คลุมแค่พื้นที่เนื้อหา ไม่คลุมแถบเมนูด้านซ้าย -> โมดัลทับกับเมนู
 *    แก้ด้วยการ render ผ่าน portal ออกไปที่ document.body ตรง ๆ
 */
function ModalPortal({ children }) {
  if (typeof document === 'undefined') return children;
  return createPortal(children, document.body);
}

const IS_ANDROID = Capacitor.getPlatform() === 'android';
const CAN_SYSTEM_PRINT = !IS_ANDROID;

const DOC_HISTORY_LIMIT = 200;

/** อ่านทะเบียนเอกสารจากเครื่อง */
export function readDocHistory(key) {
  try {
    const raw = JSON.parse(localStorage.getItem(key) || '[]');
    return Array.isArray(raw) ? raw : [];
  } catch (e) {
    return [];
  }
}

/** บันทึกเอกสารลงทะเบียน (ใหม่สุดอยู่บน, เก็บไม่เกิน DOC_HISTORY_LIMIT ใบ) */
export function saveDocHistory(key, record) {
  try {
    const list = readDocHistory(key);
    localStorage.setItem(key, JSON.stringify([record, ...list].slice(0, DOC_HISTORY_LIMIT)));
  } catch (e) {}
}

export default function InventoryPOS({ userPlan = 'free', onAddTransaction, openPaywall, t = {} }) {
  const hasAccess = canAccess(userPlan, 'stock_management');
  const hasMultiWh = canAccess(userPlan, 'multi_warehouse');

  const cameraInputRef = useRef(null);
  const fileInputRef = useRef(null);
  const [isScanningAi, setIsScanningAi] = useState(false);
  const [showAIConsent, setShowAIConsent] = useState(false);
  const [pendingAction, setPendingAction] = useState(null);

  const [historyTick, setHistoryTick] = useState(0);
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

  // ── ตั้งค่าเครื่องพิมพ์ (ความกว้างกระดาษ / หัว-ท้ายใบเสร็จ) ──
  const [printerSettings, setPrinterSettings] = useState(() => {
    try {
      const saved = JSON.parse(localStorage.getItem(PRINTER_SETTINGS_KEY) || 'null');
      return saved ? { ...DEFAULT_PRINTER_SETTINGS, ...saved } : DEFAULT_PRINTER_SETTINGS;
    } catch (e) {
      return DEFAULT_PRINTER_SETTINGS;
    }
  });
  const [showPrinterSettings, setShowPrinterSettings] = useState(false);

  useEffect(() => {
    try {
      localStorage.setItem(PRINTER_SETTINGS_KEY, JSON.stringify(printerSettings));
    } catch (e) {}
  }, [printerSettings]);

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

  const todaySalesCount = React.useMemo(
    () => readDocHistory('moneyma_sales_history').filter(item => item.date === todayStr).length,
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [cart, activeTab, todayStr, historyTick]
  );

  const todayPoCount = React.useMemo(
    () => readDocHistory('moneyma_po_history').filter(item => item.date === todayStr).length,
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [poItems, activeTab, todayStr, historyTick]
  );

  // Target warehouse for Purchase Orders
  const [poTargetWarehouse, setPoTargetWarehouse] = useState('warehouse1'); // 'warehouse1' | 'warehouse2' | 'warehouse3'

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
  const handleAiScanCamera = () => {
    executeWithConsent(async () => {
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
    });
  };

  // 📁 AI File Scan (Keep original file input picker)
  const handleAiScanFileChange = (e) => {
    const file = e.target.files?.[0];
    if (file) {
      executeWithConsent(() => processAiScanFile(file));
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

  // ────────────────────────────────────────────────────────────────
  //  ระบบเอกสาร & การพิมพ์
  //  🔴 ห้ามใช้ window.open() + document.write() เพื่อพิมพ์อีก
  //     WKWebView ของ Capacitor ไม่คืนหน้าต่างที่เขียนทับได้ -> เงียบ ไม่มีอะไรขึ้น
  //     ใช้วิธีวาดเอกสารลง #moneyma-print-area ในหน้าเดิม แล้วเรียก window.print()
  //     ซึ่ง iOS จะเด้งแผง AirPrint ให้เอง
  // ────────────────────────────────────────────────────────────────
  // ใบเสร็จที่ออกตอนเน็ตร้านหลุด ค้างอยู่ในเครื่อง — ส่งขึ้นตอนเปิดหน้า POS
  // dep เป็น shopName ด้วย: ตั้งชื่อร้านเสร็จแล้วชื่อขึ้น Supabase เลย
  // ไม่ต้องรอออกใบเสร็จใบถัดไป (flushQueue คืนค่าทันทีถ้าคิวว่าง)
  useEffect(() => { syncPendingReceipts({ name: printerSettings.shopName }); },
    [printerSettings.shopName]);

  const [printDoc, setPrintDoc] = useState(null);
  const saveDocAsImageRef = useRef(null);
  const [reportHtml, setReportHtml] = useState('');
  const reportFrameRef = useRef(null);

  // ── เครื่องพิมพ์สลิปบลูทูธ (BLE) ──
  const [btName, setBtName] = useState(() => BtPrinter.lastDeviceName());
  const [btConnected, setBtConnected] = useState(false);
  const [btBusy, setBtBusy] = useState('');
  const btPrintRef = useRef(null);
  const btSupport = BtPrinter.support();

  const handleBtConnect = async () => {
    setBtBusy('กำลังค้นหาเครื่องพิมพ์…');
    try {
      const dev = await BtPrinter.connect();
      setBtName(dev.name || 'เครื่องพิมพ์');
      setBtConnected(true);
    } catch (e) {
      setBtConnected(false);
      // ผู้ใช้กดยกเลิกหน้าต่างเลือกอุปกรณ์ ไม่ใช่ข้อผิดพลาด ไม่ต้องเด้งเตือน
      if (e?.name !== 'NotFoundError') {
        alert('ต่อเครื่องพิมพ์ไม่สำเร็จ\n\n' + (e?.message || e));
      }
    } finally {
      setBtBusy('');
    }
  };

  const handleBtDisconnect = () => {
    BtPrinter.disconnect();
    setBtConnected(false);
  };

  // 🔴 วาดใบเสร็จใหม่ตามจำนวนจุดจริงของหัวพิมพ์ ไม่ได้แคปหน้าจอ HTML
  //    เพราะกระดาษความร้อนมีแค่ดำกับขาว ถ้าย่อ/ขยายภาพ ตัวอักษรจะเบลอ
  //    และ QR จะสแกนไม่ติด
  const printViaBluetooth = async (docArg) => {
    const d = docArg || printDoc;
    if (!d) return;
    setBtBusy('กำลังเตรียมใบเสร็จ…');
    try {
      const canvas = d.kind === 'test'
        ? await renderTestSlipToCanvas(printerSettings)
        : await renderSlipToCanvas(d, printerSettings);
      const bytes = buildReceiptJob(canvas, { cut: true });
      await BtPrinter.write(bytes, {
        onProgress: (sent, total) => setBtBusy(`กำลังส่ง ${Math.round((sent / total) * 100)}%`),
      });
      setBtBusy('');
    } catch (e) {
      setBtBusy('');
      setBtConnected(BtPrinter.isConnected());
      alert('พิมพ์ไม่สำเร็จ\n\n' + (e?.message || e));
    }
  };
  btPrintRef.current = printViaBluetooth;

  const doPrint = useCallback(() => {
    // ต่อเครื่องพิมพ์บลูทูธไว้ = ส่งไปเครื่องนั้นเสมอ ไม่ต้องผ่านระบบพิมพ์ของเครื่อง
    if (BtPrinter.isConnected() && btPrintRef.current) {
      btPrintRef.current();
      return;
    }
    if (!CAN_SYSTEM_PRINT) {
      // Android: ไม่มีระบบพิมพ์ใน WebView -> ส่งต่อไปทางบันทึกรูปภาพ
      saveDocAsImageRef.current?.();
      return;
    }
    // รอให้ React วาดเอกสารลง DOM ให้เสร็จก่อนสั่งพิมพ์
    setTimeout(() => {
      try {
        window.print();
      } catch (e) {
        alert('❌ เปิดหน้าต่างพิมพ์ไม่สำเร็จ: ' + (e?.message || e));
      }
    }, 250);
  }, []);

  // token ต้องเกิดตอน "สร้างเอกสาร" ไม่ใช่ตอน "พิมพ์"
  // ถ้าสร้างตอนพิมพ์ ใบที่เห็นในพรีวิวกับใบที่พิมพ์ออกมาจะคนละรหัส
  // แล้ว scan ที่เข้ามาจะจับคู่กับใบเสร็จไม่ได้เลย
  const buildSaleDoc = (kind, token = kind === 'receipt' ? issueShareToken() : null) => ({
    kind,
    // peek เท่านั้น ยังไม่กินเลข — กินตอน commit เพื่อไม่ให้เลขขาดตอนถ้ากดยกเลิก
    docNo: peekDocNo(kind === 'so' ? 'SO' : 'RC'),
    dateText: new Date().toLocaleString('th-TH'),
    dateIso: new Date().toISOString().split('T')[0],
    customerName,
    customerTaxId,
    items: cart.map(it => ({ id: it.id, sku: it.sku, name: it.name, qty: it.qty, price: it.price })),
    subtotal: subtotalCart,
    discount,
    vatPercent,
    vatAmount,
    total: totalCartAmount,
    promptPayId,
    shareToken: token,
    shareUrl: token ? buildReceiptUrl(token) : '',
    committed: false,
  });

  // เปิดพรีวิวใบเสร็จก่อน — ยังไม่ตัดสต็อก ยังไม่บันทึกเงิน
  const openReceiptPreview = () => {
    if (cart.length === 0) return;
    setPrintDoc(buildSaleDoc('receipt'));
  };

  // ยืนยันแล้วค่อยตัดสต็อก + บันทึกรายรับ + เก็บเข้าทะเบียนเอกสาร
  const commitSale = (alsoPrint) => {
    const doc = printDoc;
    if (!doc || doc.committed) {
      if (alsoPrint) doPrint();
      return;
    }

    setProducts(prev => prev.map(prod => {
      const line = doc.items.find(c => c.id === prod.id);
      if (!line) return prod;
      return deductStockFromWarehouses(prod, Number(line.qty) || 0);
    }));

    const description = `ขายสินค้า (POS): ${doc.items.map(c => `${c.name} x${c.qty}`).join(', ')}`;
    if (typeof onAddTransaction === 'function') {
      onAddTransaction({
        type: 'income',
        amount: doc.total,
        category: 'ขายสินค้า/บริการ',
        description,
        date: doc.dateIso,
      });
    }

    saveDocHistory('moneyma_sales_history', {
      id: doc.docNo,
      docType: 'receipt',
      date: doc.dateIso,
      dateText: doc.dateText,
      customerName: doc.customerName,
      customerTaxId: doc.customerTaxId,
      items: doc.items,
      subtotal: doc.subtotal,
      discount: doc.discount,
      vatPercent: doc.vatPercent,
      vatAmount: doc.vatAmount,
      totalAmount: doc.total,
      shareToken: doc.shareToken,
      shareUrl: doc.shareUrl,
    });

    commitDocNo(doc.docNo);

    // ขาบันทึกของ growth loop — fire-and-forget โดยเจตนา
    // ห้าม await ตรงนี้ ถ้า Supabase ช้า การขายต้องไม่ค้างตาม
    if (doc.shareToken) {
      recordReceipt({
        token: doc.shareToken,
        docNo: doc.docNo,
        total: doc.total,
        itemCount: (doc.items || []).length,
        shopName: printerSettings.shopName,
      });
    }

    setCart([]);
    setDiscount(0);
    setHistoryTick(t => t + 1);
    setPrintDoc(prev => (prev ? { ...prev, committed: true } : prev));

    if (alsoPrint) doPrint();
  };

  // QR PromptPay Payment Confirmation
  const handleConfirmQrPayment = () => {
    setShowQrModal(false);
    openReceiptPreview();
  };

  // ใบสั่งขาย (SO) — เอกสารเสนอราคา/สั่งขาย ยังไม่ตัดสต็อก
  const handleGenerateSalesOrder = () => {
    if (cart.length === 0) {
      alert('⚠️ กรุณาเลือกสินค้าลงตะกร้าก่อนออกใบสั่งขาย!');
      return;
    }
    const doc = buildSaleDoc('so');
    commitDocNo(doc.docNo);
    saveDocHistory('moneyma_so_history', {
      id: doc.docNo,
      docType: 'so',
      date: doc.dateIso,
      dateText: doc.dateText,
      customerName: doc.customerName,
      customerTaxId: doc.customerTaxId,
      items: doc.items,
      subtotal: doc.subtotal,
      discount: doc.discount,
      vatPercent: doc.vatPercent,
      vatAmount: doc.vatAmount,
      totalAmount: doc.total,
    });
    setHistoryTick(t => t + 1);
    setPrintDoc(doc);
  };

  const whLabelOf = (wh) =>
    wh === 'warehouse2' ? 'คลัง 2 (หน้าร้าน)' : wh === 'warehouse3' ? 'คลัง 3 (สำรอง)' : 'คลัง 1 (คลังหลัก)';

  // 🔴 ใบสั่งซื้อร่างหนึ่งใบต้องได้เลขเดียว ไม่ว่าจะพิมพ์ เซฟรูป หรือกดรับเข้าสต็อก
  //    เดิมสามทางนี้เรียกสูตรสร้างเลขแยกกัน PO ใบเดียวจึงได้สามเลขไม่ตรงกัน
  //    ใช้ ref ไม่ใช่ state เพราะต้องได้ค่าทันทีในจังหวะที่กดปุ่ม
  const poDocNoRef = useRef(null);
  const ensurePoDocNo = () => {
    if (!poDocNoRef.current) poDocNoRef.current = peekDocNo('PO');
    return poDocNoRef.current;
  };

  const handlePrintPo = () => {
    if (poItems.length === 0) {
      alert('⚠️ กรุณาเลือกสินค้าในใบสั่งซื้อก่อนออกเอกสาร!');
      return;
    }
    const whLabel = whLabelOf(poTargetWarehouse);
    setPrintDoc({
      kind: 'po',
      docNo: ensurePoDocNo(),
      dateText: new Date().toLocaleString('th-TH'),
      supplierName,
      supplierTaxId,
      warehouseLabel: whLabel,
      items: poItems.map(it => ({ id: it.id, sku: it.sku, name: it.name, qty: it.qty, purchaseCost: it.purchaseCost })),
      subtotal: subtotalPo,
      total: subtotalPo,
      committed: true,
    });
  };

  const handleTestPrint = () => {
    setPrintDoc({ kind: 'test', docNo: 'TEST', dateText: new Date().toLocaleString('th-TH'), items: [], committed: true });
  };

  // เปิดเอกสารเก่าจากทะเบียนขึ้นมาดู/พิมพ์ซ้ำ
  const openHistoryDoc = (rec, kind) => {
    setPrintDoc({
      kind,
      docNo: rec.id,
      dateText: rec.dateText || rec.date,
      dateIso: rec.date,
      customerName: rec.customerName,
      customerTaxId: rec.customerTaxId,
      supplierName: rec.supplierName,
      supplierTaxId: rec.supplierTaxId,
      warehouseLabel: rec.targetWarehouse,
      items: rec.items || [],
      subtotal: rec.subtotal !== undefined ? rec.subtotal : rec.totalAmount,
      discount: rec.discount || 0,
      vatPercent: rec.vatPercent || 0,
      vatAmount: rec.vatAmount || 0,
      total: rec.totalAmount,
      promptPayId,
      // พิมพ์ซ้ำต้องได้รหัสเดิม ไม่งั้นใบเดียวจะนับเป็นสองใบในสถิติ
      shareToken: rec.shareToken || '',
      shareUrl: rec.shareUrl || (rec.shareToken ? buildReceiptUrl(rec.shareToken) : ''),
      committed: true,
      fromHistory: true,
    });
  };

  // เปลี่ยนเอกสารที่กำลังพรีวิวให้เป็นรูปภาพ แล้วเปิดแผงบันทึก/แชร์
  const handleSaveDocAsImage = async () => {
    const d = printDoc;
    if (!d || d.kind === 'test') return;

    const ps = printerSettings;
    const dataUrl = await generateDocumentJpgDataUrl({
      type: d.kind === 'po' ? 'po' : d.kind === 'receipt' ? 'receipt' : 'so',
      orderNo: d.docNo,
      date: d.dateText,
      customerName: d.customerName,
      supplierName: d.supplierName,
      taxId: d.kind === 'po' ? d.supplierTaxId : d.customerTaxId,
      warehouseLabel: d.warehouseLabel,
      items: d.items,
      subtotal: d.subtotal,
      discount: d.discount,
      vatPercent: d.vatPercent,
      vatAmount: d.vatAmount,
      totalAmount: d.total,
      promptPayId: d.kind === 'so' ? d.promptPayId : '',
      shareUrl: d.shareUrl,
      shareToken: d.shareToken,
      shopName: ps.shopName,
      shopAddress: ps.shopAddress,
      shopTaxId: ps.shopTaxId,
      footerNote: ps.footerNote,
    });

    const prefix = d.kind === 'po' ? 'PurchaseOrder' : d.kind === 'receipt' ? 'Receipt' : 'SalesOrder';
    setJpgDataUrl(dataUrl);
    setJpgFileName(`${prefix}_${d.docNo}.jpg`);
    setPrintDoc(null);       // ปิดพรีวิวก่อน ไม่งั้นแผงรูปจะอยู่ใต้มัน
    setShowJpgModal(true);
  };

  saveDocAsImageRef.current = handleSaveDocAsImage;

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

  const [isSharingJpg, setIsSharingJpg] = useState(false);

  const handleShareJpg = async () => {
    if (!jpgDataUrl) return;
    setIsSharingJpg(true);
    try {
      const res = await shareOrDownloadJpg(jpgDataUrl, jpgFileName);
      if (res && res.ok === false && !res.cancelled) {
        alert('❌ บันทึก/แชร์รูปภาพไม่สำเร็จ\n' + (res.error || 'ไม่ทราบสาเหตุ'));
      }
    } finally {
      setIsSharingJpg(false);
    }
  };

  const handleExportPoJpg = async () => {
    if (poItems.length === 0) {
      alert('⚠️ กรุณาเลือกสินค้าในใบสั่งซื้อก่อนออกเอกสารรูปภาพ!');
      return;
    }
    const orderNo = ensurePoDocNo();
    const whLabel = whLabelOf(poTargetWarehouse);
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

  // เปิดพรีวิวก่อน — ยังไม่เพิ่มสต็อก ยังไม่บันทึกรายจ่าย
  const openPoPreview = () => {
    if (poItems.length === 0) return;
    setPrintDoc({
      kind: 'po',
      docNo: ensurePoDocNo(),
      dateText: new Date().toLocaleString('th-TH'),
      supplierName,
      supplierTaxId,
      warehouseLabel: whLabelOf(poTargetWarehouse),
      items: poItems.map(it => ({ id: it.id, sku: it.sku, name: it.name, qty: it.qty, purchaseCost: it.purchaseCost })),
      subtotal: subtotalPo,
      total: subtotalPo,
      committed: false,
    });
  };

  // ยืนยันแล้วค่อยเพิ่มสต็อก + บันทึกรายจ่าย + ลงทะเบียนเอกสาร
  const commitPO = () => {
    if (poItems.length === 0) return;

    const docNo = (printDoc && printDoc.docNo) || ensurePoDocNo();
    const whLabel = whLabelOf(poTargetWarehouse);

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

    // บันทึกใบ PO ลงทะเบียนเอกสาร
    saveDocHistory('moneyma_po_history', {
      id: docNo,
      docType: 'po',
      date: new Date().toISOString().split('T')[0],
      dateText: new Date().toLocaleString('th-TH'),
      targetWarehouse: whLabel,
      supplierName,
      supplierTaxId,
      items: poItems.map(it => ({ id: it.id, sku: it.sku, name: it.name, qty: it.qty, purchaseCost: it.purchaseCost })),
      totalAmount: subtotalPo,
    });
    setHistoryTick(t => t + 1);

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

    // กินเลขตอนนี้เท่านั้น — ใบร่างที่เปิดดูแล้วยกเลิกจะไม่ทำให้เลขขาดตอน
    commitDocNo(docNo);
    poDocNoRef.current = null;

    setPoItems([]);
    setPrintDoc(prev => (prev && prev.kind === 'po' ? { ...prev, committed: true, poReceived: true } : prev));
  };

  const buildReportPayload = () => {
    let periodLabel = '';
    if (reportPeriodType === 'daily') periodLabel = `ประจำวันที่ ${reportDate}`;
    else if (reportPeriodType === 'monthly') periodLabel = `ประจำเดือน ${reportMonth}`;
    else if (reportPeriodType === 'quarterly') periodLabel = `ประจำไตรมาส ${reportQuarter} ปี ${reportYear}`;
    else periodLabel = `ประจำปี ${reportYear}`;

    return {
      title: 'รายงานการซื้อ-ขาย และมูลค่าสต็อกสินค้า',
      companyName: printerSettings.shopName || 'MoneyMa POS & Business Ledger',
      periodLabel,
      products,
      totalSales: totalRetailValue,
      totalPurchases: totalCostValue,
      totalStockCostVal: totalCostValue,
      totalStockRetailVal: totalRetailValue,
    };
  };

  // เปิดตัวอย่างรายงานก่อน แล้วค่อยเลือกพิมพ์หรือบันทึกไฟล์
  const handlePreviewPeriodicReport = () => {
    setReportHtml(buildInventoryPOSReportHtml(buildReportPayload()));
  };

  const handlePrintReport = () => {
    try {
      const win = reportFrameRef.current?.contentWindow;
      if (!win) throw new Error('ยังโหลดตัวอย่างไม่เสร็จ');
      win.focus();
      win.print();
    } catch (e) {
      alert('❌ สั่งพิมพ์ไม่สำเร็จ: ' + (e?.message || e) + '\nลองใช้ปุ่มบันทึกไฟล์แทน');
    }
  };

  const handleSaveReportFile = () => {
    exportInventoryPOSReport(buildReportPayload());
  };

  // ────────── ทะเบียนเอกสารที่ออกแล้ว (เปิดดู/พิมพ์ซ้ำได้) ──────────
  const renderDocHistory = (title, storageKey, kind, emptyText) => {
    const list = readDocHistory(storageKey).slice(0, 20);
    return (
      <div className="mm-history">
        <h4>{title} ({readDocHistory(storageKey).length})</h4>
        {list.length === 0 ? (
          <div className="mm-history-empty">{emptyText}</div>
        ) : (
          list.map((rec, i) => (
            <div className="mm-history-item" key={rec.id || i}>
              <div className="mm-history-main">
                <div className="mm-history-no">{rec.id}</div>
                <div className="mm-history-sub">
                  {rec.dateText || rec.date} · {(rec.items || []).length} รายการ
                  {rec.customerName ? ` · ${rec.customerName}` : ''}
                  {rec.supplierName ? ` · ${rec.supplierName}` : ''}
                </div>
              </div>
              <div className="mm-history-amt">฿{(Number(rec.totalAmount) || 0).toLocaleString()}</div>
              <button className="mm-history-open" onClick={() => openHistoryDoc(rec, kind)}>เปิดดู</button>
            </div>
          ))
        )}
      </div>
    );
  };

  // ────────── ตัวเอกสารที่จะถูกพิมพ์จริง (อยู่ใน #moneyma-print-area) ──────────
  const renderPrintableDoc = () => {
    if (!printDoc) return null;
    const d = printDoc;
    const ps = printerSettings;
    const slipWidthMm = ps.paperWidth === '58' ? 48 : 72;
    const money = (n) => `฿${(Number(n) || 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

    if (d.kind === 'test') {
      return (
        <div className="mm-slip" style={{ width: `${slipWidthMm}mm` }}>
          <div className="mm-slip-shop">{ps.shopName || 'MoneyMa Store'}</div>
          <div className="mm-slip-sub">ทดสอบการพิมพ์ (Test Print)</div>
          <div className="mm-dash" />
          <div className="mm-row"><span>ความกว้างกระดาษ</span><span>{ps.paperWidth} มม.</span></div>
          <div className="mm-row"><span>วันที่</span><span>{d.dateText}</span></div>
          <div className="mm-dash" />
          <div className="mm-center">ถ้าอ่านบรรทัดนี้ได้ครบทั้งบรรทัด<br />แปลว่าตั้งค่าความกว้างถูกต้อง</div>
          <div className="mm-dash" />
          <div className="mm-center">1234567890 ABCDEFGHIJ กขคงจฉชซฌญ</div>
        </div>
      );
    }

    if (d.kind === 'receipt') {
      return (
        <div className="mm-slip" style={{ width: `${slipWidthMm}mm` }}>
          <div className="mm-slip-shop">{ps.shopName || 'MoneyMa Store'}</div>
          {ps.shopAddress ? <div className="mm-center mm-small">{ps.shopAddress}</div> : null}
          {ps.shopTaxId ? <div className="mm-center mm-small">เลขผู้เสียภาษี: {ps.shopTaxId}</div> : null}
          <div className="mm-slip-sub">ใบเสร็จรับเงิน / ใบกำกับภาษีอย่างย่อ</div>
          {ps.headerNote ? <div className="mm-center mm-small">{ps.headerNote}</div> : null}
          <div className="mm-dash" />
          <div className="mm-row"><span>เลขที่</span><span>{d.docNo}</span></div>
          <div className="mm-row"><span>วันที่</span><span>{d.dateText}</span></div>
          <div className="mm-row"><span>ลูกค้า</span><span>{d.customerName || 'ลูกค้าทั่วไป'}</span></div>
          {d.customerTaxId ? <div className="mm-row"><span>Tax ID</span><span>{d.customerTaxId}</span></div> : null}
          <div className="mm-dash" />
          {(d.items || []).map((item, i) => (
            <div key={item.id || i} className="mm-item">
              <div className="mm-item-name">{item.name}</div>
              <div className="mm-row">
                <span>{item.qty} x {money(item.price)}</span>
                <span>{money((Number(item.price) || 0) * (Number(item.qty) || 0))}</span>
              </div>
            </div>
          ))}
          <div className="mm-dash" />
          <div className="mm-row"><span>ยอดรวมสินค้า</span><span>{money(d.subtotal)}</span></div>
          {d.discount > 0 ? <div className="mm-row"><span>ส่วนลด</span><span>-{money(d.discount)}</span></div> : null}
          {d.vatAmount > 0 ? <div className="mm-row"><span>VAT {d.vatPercent}%</span><span>{money(d.vatAmount)}</span></div> : null}
          <div className="mm-row mm-total"><span>ยอดสุทธิ</span><span>{money(d.total)}</span></div>
          <div className="mm-dash" />
          {d.shareUrl ? (
            <div className="mm-slip-qr">
              <img src={qrSvgDataUrl(d.shareUrl, { quiet: 2 })} alt="สแกนเก็บใบเสร็จ" />
              <div className="mm-center mm-small">สแกนเก็บใบเสร็จใบนี้ไว้ในมือถือ ฟรี</div>
              <div className="mm-center mm-tiny">รหัส {d.shareToken}</div>
              <div className="mm-dash" />
            </div>
          ) : null}
          <div className="mm-center mm-small">{ps.footerNote || 'ขอบคุณที่ใช้บริการ'}</div>
          <div className="mm-center mm-small">ออกโดยระบบ MoneyMa Business Stock &amp; POS</div>
        </div>
      );
    }

    // ── เอกสารเต็มหน้า: ใบสั่งขาย (SO) / ใบสั่งซื้อ (PO) ──
    const isPo = d.kind === 'po';
    const qrUrl = !isPo && d.promptPayId
      ? `https://promptpay.io/${String(d.promptPayId).replace(/[^0-9]/g, '')}/${(Number(d.total) || 0).toFixed(2)}.png`
      : '';

    return (
      <div className={`mm-doc ${isPo ? 'mm-doc-po' : 'mm-doc-so'}`}>
        <div className="mm-doc-head">
          <div>
            <h1>{ps.shopName || 'MoneyMa Store'}</h1>
            <p>{isPo ? 'ใบสั่งซื้อสินค้าเข้าสต็อก (Purchase Order)' : 'ใบสั่งขาย / ใบกำกับภาษีอย่างย่อ (Sales Order)'}</p>
            {ps.shopAddress ? <p>{ps.shopAddress}</p> : null}
            {ps.shopTaxId ? <p>เลขผู้เสียภาษี: {ps.shopTaxId}</p> : null}
          </div>
          <div className="mm-doc-meta">
            <div className="mm-doc-no">เลขที่: {d.docNo}</div>
            <div>วันที่: {d.dateText}</div>
          </div>
        </div>

        <div className="mm-doc-parties">
          <div>
            <strong>{isPo ? 'ซัพพลายเออร์' : 'ผู้ซื้อ'}</strong>
            <div>{isPo ? (d.supplierName || '-') : (d.customerName || 'ลูกค้าทั่วไป')}</div>
            {(isPo ? d.supplierTaxId : d.customerTaxId)
              ? <div>Tax ID: {isPo ? d.supplierTaxId : d.customerTaxId}</div> : null}
          </div>
          <div className="mm-doc-right">
            {isPo ? (
              <>
                <strong>รับเข้าคลัง</strong>
                <div>{d.warehouseLabel || '-'}</div>
              </>
            ) : (
              <>
                <strong>วิธีชำระเงิน</strong>
                <div>PromptPay QR / โอนผ่านธนาคาร</div>
                {d.promptPayId ? <div>พร้อมเพย์: {d.promptPayId}</div> : null}
              </>
            )}
          </div>
        </div>

        <table className="mm-doc-table">
          <thead>
            <tr>
              <th>SKU</th>
              <th>รายการสินค้า</th>
              <th className="mm-right">จำนวน</th>
              <th className="mm-right">ราคา/หน่วย</th>
              <th className="mm-right">รวมเงิน</th>
            </tr>
          </thead>
          <tbody>
            {(d.items || []).map((item, i) => {
              const unit = Number(isPo ? (item.purchaseCost !== undefined ? item.purchaseCost : item.cost) : item.price) || 0;
              return (
                <tr key={item.id || i}>
                  <td className="mm-sku">{item.sku}</td>
                  <td>{item.name}</td>
                  <td className="mm-right">{item.qty}</td>
                  <td className="mm-right">{money(unit)}</td>
                  <td className="mm-right">{money(unit * (Number(item.qty) || 0))}</td>
                </tr>
              );
            })}
          </tbody>
        </table>

        <div className="mm-doc-summary">
          <div><span>ยอดรวมสินค้า</span><span>{money(d.subtotal)}</span></div>
          {d.discount > 0 ? <div><span>ส่วนลด</span><span>-{money(d.discount)}</span></div> : null}
          {d.vatAmount > 0 ? <div><span>VAT {d.vatPercent}%</span><span>{money(d.vatAmount)}</span></div> : null}
          <div className="mm-doc-grand"><span>ยอดสุทธิ</span><span>{money(d.total)}</span></div>
        </div>

        {qrUrl ? (
          <div className="mm-doc-qr">
            <div>สแกนชำระพร้อมเพย์</div>
            <img src={qrUrl} alt="PromptPay QR" />
            <div>{d.promptPayId}</div>
          </div>
        ) : null}

        <div className="mm-doc-foot">{ps.footerNote || ''} · ออกโดยระบบ MoneyMa Business Stock &amp; POS</div>
      </div>
    );
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

      {/* แถบเครื่องพิมพ์ — สถานะจริง ไม่ใช่ไฟเขียวปลอม */}
      <div className="pos-printer-bar">
        <div className="pos-printer-info">
          <span className="pos-printer-icon" aria-hidden="true">{CAN_SYSTEM_PRINT ? '🖨️' : '🖼️'}</span>
          <strong>
            {CAN_SYSTEM_PRINT
              ? 'พิมพ์ผ่านเครื่องพิมพ์ของระบบ (AirPrint)'
              : 'บันทึกเอกสารเป็นรูปภาพ เพื่อส่งต่อหรือสั่งพิมพ์'}
          </strong>
          {CAN_SYSTEM_PRINT && (
            <span className="pos-printer-chip">กระดาษ {printerSettings.paperWidth} มม.</span>
          )}
        </div>
        <div className="pos-printer-actions">
          <label className="pos-print-toggle">
            <input
              type="checkbox"
              checked={autoPrintReceipt}
              onChange={e => setAutoPrintReceipt(e.target.checked)}
            />
            <span>{CAN_SYSTEM_PRINT ? 'ขึ้นหน้าพิมพ์ทันทีหลังยืนยัน' : 'ออกรูปภาพทันทีหลังยืนยัน'}</span>
          </label>
          <button className="pos-btn-printer-settings" onClick={() => setShowPrinterSettings(true)}>
            {CAN_SYSTEM_PRINT ? '⚙️ ตั้งค่าเครื่องพิมพ์' : '⚙️ ตั้งค่าใบเสร็จ'}
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
              <strong className="pos-stat-val" style={{ color: 'var(--color-success)' }}>฿{totalRetailValue.toLocaleString()}</strong>
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
                  <th className="text-right" style={{ width: '90px', minWidth: '90px', color: 'var(--wh-1)' }}>คลัง 1 (หลัก)</th>
                  <th className="text-right" style={{ width: '90px', minWidth: '90px', color: 'var(--wh-2)' }}>คลัง 2 (หน้าร้าน)</th>
                  <th className="text-right" style={{ width: '90px', minWidth: '90px', color: 'var(--wh-3)' }}>คลัง 3 (สำรอง)</th>
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
                      <td className="text-right" style={{ fontWeight: 600, color: 'var(--wh-1)' }}>{w1}</td>
                      <td className="text-right" style={{ fontWeight: 600, color: 'var(--wh-2)' }}>{w2}</td>
                      <td className="text-right" style={{ fontWeight: 600, color: 'var(--wh-3)' }}>{w3}</td>
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
                    📝 ใบสั่งขาย (SO)
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
                  onClick={openReceiptPreview}
                >
                  🧾 ชำระเงินสด / ออกใบเสร็จ
                </button>
              </div>
            </div>

            {renderDocHistory('🧾 ใบเสร็จที่ออกแล้ว', 'moneyma_sales_history', 'receipt', 'ยังไม่มีใบเสร็จ')}
            {renderDocHistory('📝 ใบสั่งขายที่ออกแล้ว', 'moneyma_so_history', 'so', 'ยังไม่มีใบสั่งขาย')}
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
                <label style={{ fontSize: '11px', fontWeight: 700, color: 'var(--color-text-secondary)', display: 'block', marginBottom: '4px' }}>
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
                      <div className="mm-po-cost">
                        <span className="mm-po-cost-label">{t.poUnitCostLabel || 'ทุนซื้อ'}</span>
                        <div className="mm-po-cost-field">
                          <span className="mm-po-cost-cur">฿</span>
                          <input
                            type="number"
                            inputMode="decimal"
                            min="0"
                            step="0.01"
                            value={item.purchaseCost}
                            onChange={e => updatePoCost(item.id, e.target.value)}
                          />
                        </div>
                      </div>
                    </div>
                    <div className="pos-cart-qty-ctrl">
                      <button onClick={() => updatePoQty(item.id, item.qty - 1)}>-</button>
                      <span>{item.qty}</span>
                      <button onClick={() => updatePoQty(item.id, item.qty + 1)}>+</button>
                    </div>
                    <div className="pos-cart-item-total">
                      ฿{(Number(item.purchaseCost) * Number(item.qty) || 0).toLocaleString('th-TH', { maximumFractionDigits: 2 })}
                    </div>
                  </div>
                ))
              )}
            </div>

            <div className="pos-cart-summary">
              <div className="pos-sum-row total">
                <span>{t.poTotalExpense || 'ยอดสั่งซื้อรวม (Expense):'}</span>
                <span className="pos-grand-total" style={{ color: 'var(--color-danger)' }}>฿{subtotalPo.toLocaleString('th-TH', { maximumFractionDigits: 2 })}</span>
              </div>

              <div style={{ display: 'flex', gap: '8px', marginTop: '10px' }}>
                <button
                  className="pos-checkout-btn"
                  style={{ background: 'linear-gradient(135deg, #6366f1 0%, #4338ca 100%)', flex: 1 }}
                  disabled={poItems.length === 0}
                  onClick={openPoPreview}
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

              <button
                className="mm-btn mm-btn-line"
                style={{ width: '100%', marginTop: '8px' }}
                disabled={poItems.length === 0}
                onClick={handlePrintPo}
              >
                {CAN_SYSTEM_PRINT ? '🖨️ ดูตัวอย่าง / พิมพ์ใบสั่งซื้อ' : '🖼️ ดูตัวอย่าง / บันทึกใบสั่งซื้อ'}
              </button>
            </div>

            {renderDocHistory('🚚 ใบสั่งซื้อที่ออกแล้ว', 'moneyma_po_history', 'po', 'ยังไม่มีใบสั่งซื้อ')}
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
                <strong className="pos-stat-val" style={{ color: 'var(--color-success)' }}>
                  +฿{totalRetailValue.toLocaleString()}
                </strong>
                <small>รายรับจากการขายสินค้า</small>
              </div>

              <div className="pos-stat-card" style={{ borderLeft: '4px solid #ef4444' }}>
                <span className="pos-stat-label">ยอดสั่งซื้อเข้ารวม (Purchases)</span>
                <strong className="pos-stat-val" style={{ color: 'var(--color-danger)' }}>
                  -฿{totalCostValue.toLocaleString()}
                </strong>
                <small>รายจ่ายต้นทุนสินค้า</small>
              </div>

              <div className="pos-stat-card" style={{ borderLeft: '4px solid #3b82f6' }}>
                <span className="pos-stat-label">กำไรขั้นต้น (Gross Profit)</span>
                <strong className="pos-stat-val" style={{ color: 'var(--color-info)' }}>
                  ฿{(totalRetailValue - totalCostValue).toLocaleString()}
                </strong>
                <small>กำไรจากการดำเนินงาน</small>
              </div>

              <div className="pos-stat-card" style={{ borderLeft: '4px solid #6366f1' }}>
                <span className="pos-stat-label">มูลค่าสินค้าในคลังปัจจุบัน</span>
                <strong className="pos-stat-val" style={{ color: 'var(--accent-primary)' }}>
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
                    <th className="text-right" style={{ color: 'var(--wh-1)' }}>คลัง 1</th>
                    <th className="text-right" style={{ color: 'var(--wh-2)' }}>คลัง 2</th>
                    <th className="text-right" style={{ color: 'var(--wh-3)' }}>คลัง 3</th>
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
                        <td className="text-right" style={{ color: 'var(--wh-1)', fontWeight: 600 }}>{w1}</td>
                        <td className="text-right" style={{ color: 'var(--wh-2)', fontWeight: 600 }}>{w2}</td>
                        <td className="text-right" style={{ color: 'var(--wh-3)', fontWeight: 600 }}>{w3}</td>
                        <td className="text-right" style={{ fontWeight: 800 }}>{totalStk}</td>
                        <td className="text-right" style={{ fontWeight: 700, color: 'var(--accent-primary)' }}>฿{totalCostVal.toLocaleString()}</td>
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
                onClick={handlePreviewPeriodicReport}
              >
                {CAN_SYSTEM_PRINT ? '🖨️' : '📄'} ดูตัวอย่าง & ออกรายงานซื้อ-ขาย-สต็อก ({reportPeriodType.toUpperCase()})
              </button>
            </div>
          </div>
        </div>
      )}

      {/* PRODUCT MODAL */}
      {showProductModal && (
        <ModalPortal>
        <div className="pos-modal-backdrop">
          <div className="pos-modal mm-prod-modal">
            <h3>{editingProduct ? (t.editProductTitle || 'แก้ไขสินค้า') : (t.addProductTitle || 'เพิ่มสินค้าใหม่ในคลัง')}</h3>

            <form onSubmit={handleSaveProduct}>
              {/* 🔴 ให้เนื้อหาเลื่อนในกล่องของตัวเอง แถบปุ่มอยู่นอกกล่อง
                  ของเดิมใช้ position:sticky ซึ่งพื้นหลังเป็น --bg-card ที่มี alpha .86
                  ปุ่มจึงลอยทับช่องกรอกคลัง 1 จนอ่านไม่ออก */}
              <div className="mm-prod-body">

                {/* ให้ AI เติมข้อมูล — แถวเดียว ไม่ใช่การ์ดสีฟ้าเต็มความกว้าง
                    ของเดิมกินพื้นที่จนชื่อสินค้าตกไปอยู่ใต้ fold */}
                <div className="mm-ai-strip">
                  <span>{t.aiVisionModalHeader || 'ให้ AI เติมข้อมูลจากรูป'}</span>
                  <span className="mm-ai-strip-btns">
                    <button type="button" disabled={isScanningAi} onClick={handleAiScanCamera}>
                      {isScanningAi ? (t.aiScanningState || 'กำลังสแกน…') : (t.btnAiCameraScan || 'ถ่ายรูป')}
                    </button>
                    <button type="button" disabled={isScanningAi} onClick={() => fileInputRef.current?.click()}>
                      {isScanningAi ? (t.aiScanningState || 'กำลังสแกน…') : (t.btnAiFileScan || 'จากไฟล์')}
                    </button>
                  </span>
                </div>

                <div className="pos-field">
                  <label>{t.thProdName || 'ชื่อสินค้า'}</label>
                  <input type="text" value={prodName} onChange={e => setProdName(e.target.value)} required />
                </div>

                <div className="pos-field-row">
                  <div className="pos-field">
                    <label>{t.thSku || 'รหัส SKU'}</label>
                    <input type="text" value={prodSku} onChange={e => setProdSku(e.target.value)} required />
                  </div>
                  <div className="pos-field">
                    <label>{t.thCategory || 'หมวดหมู่'}</label>
                    <input type="text" value={prodCat} onChange={e => setProdCat(e.target.value)} />
                  </div>
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

                <div className="pos-field">
                  <label>{t.prodImageLabel || 'รูปสินค้า'}</label>
                  <div className="mm-img-row">
                    {prodImageUrl ? (
                      <img className="mm-img-thumb" src={prodImageUrl} alt="" />
                    ) : (
                      <div className="mm-img-thumb mm-img-thumb-empty">{t.prodImageNone || 'ยังไม่มีรูป'}</div>
                    )}
                    <div className="mm-img-fields">
                      <label className="mm-img-pick">
                        {t.prodImagePick || 'เลือกรูป / ถ่ายรูป'}
                        <input type="file" accept="image/*" hidden onChange={handleProductImageFileChange} />
                      </label>
                      <input
                        type="text"
                        placeholder={t.prodImageUrlHint || 'หรือวางลิงก์รูป'}
                        value={prodImageUrl}
                        onChange={e => setProdImageUrl(e.target.value)}
                      />
                    </div>
                  </div>
                </div>

                <fieldset className="mm-stock">
                  <legend>{t.prodStockLegend || 'จำนวนในคลัง'}</legend>
                  <div className="mm-stock-grid">
                    <div className="pos-field">
                      <label>คลัง 1 · หลัก</label>
                      <input type="number" value={prodWh1} onChange={e => setProdWh1(e.target.value)} required />
                    </div>
                    <div className="pos-field">
                      <label>คลัง 2 · หน้าร้าน {!hasMultiWh && <span className="mm-lock">Business</span>}</label>
                      <input type="number" value={prodWh2} onChange={e => setProdWh2(e.target.value)} disabled={!hasMultiWh} />
                    </div>
                    <div className="pos-field">
                      <label>คลัง 3 · สำรอง {!hasMultiWh && <span className="mm-lock">Business</span>}</label>
                      <input type="number" value={prodWh3} onChange={e => setProdWh3(e.target.value)} disabled={!hasMultiWh} />
                    </div>
                  </div>
                  <div className="mm-stock-foot">
                    <span className="mm-stock-total">
                      {t.prodStockTotal || 'รวม'}{' '}
                      <strong>{(Number(prodWh1) || 0) + (Number(prodWh2) || 0) + (Number(prodWh3) || 0)}</strong>{' '}
                      {t.prodStockUnit || 'ชิ้น'}
                    </span>
                    <label className="mm-stock-min">
                      {t.prodModalMinStock || 'เตือนเมื่อเหลือ'}
                      <input type="number" value={prodMinStock} onChange={e => setProdMinStock(e.target.value)} required />
                    </label>
                  </div>
                </fieldset>
              </div>

              <div className="pos-modal-actions">
                <button type="button" className="pos-btn-cancel" onClick={() => setShowProductModal(false)}>{t.cancel || 'ยกเลิก'}</button>
                <button type="submit" className="pos-btn-submit">{t.save || 'บันทึกสินค้า'}</button>
              </div>
            </form>
          </div>
        </div>
        </ModalPortal>
      )}

      {/* PROMPTPAY QR PAYMENT MODAL */}
      {showQrModal && (
        <ModalPortal>
        <div className="pos-modal-backdrop">
          <div className="pos-modal" style={{ textAlign: 'center', maxWidth: '420px' }}>
            <h3 style={{ margin: '0 0 4px 0', color: 'var(--color-success)' }}>📲 ชำระเงินด้วย PromptPay QR</h3>
            <p style={{ margin: '0 0 16px 0', fontSize: '13px', color: 'var(--color-text-secondary)' }}>
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
                style={{ flex: 2, background: 'linear-gradient(135deg, #047857 0%, #065f46 100%)', boxShadow: '0 4px 12px rgba(4,120,87,0.35)' }}
                onClick={handleConfirmQrPayment}
              >
                ✅ ยืนยันโอนเงินสำเร็จ & ออกใบเสร็จ
              </button>
            </div>
          </div>
        </div>
        </ModalPortal>
      )}

      {/* DOCUMENT JPG PREVIEW & SHARE MODAL */}
      {showJpgModal && (
        <ModalPortal>
        <div className="pos-modal-backdrop" style={{ zIndex: 10005 }}>
          <div className="pos-modal" style={{ maxWidth: '600px', padding: '20px', textAlign: 'center' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '14px' }}>
              <h3 style={{ margin: 0, fontSize: '18px', fontWeight: 800 }}>🖼️ เอกสารรูปภาพ (.jpg) บนมือถือ</h3>
              <button className="ecm-close" onClick={() => setShowJpgModal(false)} style={{ background: '#f1f5f9', border: 'none', borderRadius: '50%', width: '32px', height: '32px', cursor: 'pointer' }}>✕</button>
            </div>

            <div style={{ background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: '14px', padding: '10px', maxHeight: '58vh', overflowY: 'auto', overflowX: 'hidden', marginBottom: '16px', minWidth: 0, width: '100%', boxSizing: 'border-box' }}>
              {/* 🔴 minWidth:0 สำคัญ: .pos-modal เป็น flex column ลูกจะไม่ยอมหดต่ำกว่าความกว้างจริงของรูป (800px)
                  ทำให้รูปล้นออกนอก modal แล้วถูกตัดขอบขวา */}
              <img
                src={jpgDataUrl}
                alt="Document JPG Preview"
                style={{ width: '100%', maxWidth: '100%', height: 'auto', display: 'block', borderRadius: '8px', boxShadow: '0 4px 14px rgba(0,0,0,0.1)' }}
              />
            </div>

            <div style={{ display: 'flex', gap: '10px', justifyContent: 'center', flexWrap: 'wrap' }}>
              <button
                onClick={handleShareJpg}
                disabled={isSharingJpg}
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
                {isSharingJpg ? '⏳ กำลังบันทึก...' : '📲 บันทึกลงเครื่อง / แชร์รูปภาพ (.jpg)'}
              </button>

              {/* 🔴 <a download> ใช้ไม่ได้ใน WKWebView -> แสดงเฉพาะบนเว็บ */}
              {!Capacitor.isNativePlatform() && (
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
              )}

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
        </ModalPortal>
      )}

      {/* ────────── พรีวิวเอกสารก่อนพิมพ์ ──────────
          เอกสารจริงอยู่ใน #moneyma-print-area ซึ่ง @media print จะโชว์เฉพาะส่วนนี้ */}
      {printDoc && (
        <ModalPortal>
        <div className="pos-modal-backdrop mm-print-backdrop" style={{ zIndex: 10006 }}>
          <div className="pos-modal mm-print-modal">
            <div className="mm-print-head no-print">
              <h3>
                {printDoc.kind === 'receipt' && '🧾 ตรวจสอบใบเสร็จก่อนพิมพ์'}
                {printDoc.kind === 'so' && '📝 ใบสั่งขาย (Sales Order)'}
                {printDoc.kind === 'po' && '🚚 ใบสั่งซื้อ (Purchase Order)'}
                {printDoc.kind === 'test' && '🖨️ ทดสอบการพิมพ์'}
              </h3>
              <button className="mm-print-close" onClick={() => setPrintDoc(null)}>✕</button>
            </div>

            {printDoc.kind === 'receipt' && !printDoc.committed && (
              <div className="mm-print-warn no-print">
                ⚠️ ยังไม่บันทึกการขาย — ตรวจรายการให้ครบก่อนกดยืนยัน ระบบจะตัดสต็อกและบันทึกรายรับเมื่อกดยืนยันเท่านั้น
              </div>
            )}
            {printDoc.kind === 'receipt' && printDoc.committed && (
              <div className="mm-print-ok no-print">
                ✅ บันทึกการขายเรียบร้อย ตัดสต็อกและบันทึกรายรับแล้ว
              </div>
            )}
            {printDoc.kind === 'po' && !printDoc.committed && (
              <div className="mm-print-warn no-print">
                ⚠️ ยังไม่รับเข้าสต็อก — ตรวจรายการและทุนซื้อให้ครบก่อนกดยืนยัน ระบบจะเพิ่มสต็อกและบันทึกรายจ่ายเมื่อกดยืนยันเท่านั้น
              </div>
            )}
            {printDoc.kind === 'po' && printDoc.poReceived && (
              <div className="mm-print-ok no-print">
                ✅ รับเข้า{printDoc.warehouseLabel || 'คลัง'}เรียบร้อย เพิ่มสต็อกและบันทึกรายจ่ายแล้ว
              </div>
            )}

            <div className="mm-print-scroll">
              <div id="moneyma-print-area">
                {renderPrintableDoc()}
              </div>
            </div>

            <div className="mm-print-actions no-print">
              {printDoc.kind === 'po' && !printDoc.committed ? (
                <>
                  <button className="mm-btn mm-btn-ghost" onClick={() => setPrintDoc(null)}>ยกเลิก</button>
                  <button className="mm-btn mm-btn-primary" onClick={commitPO}>
                    📥 ยืนยันรับเข้าสต็อก
                  </button>
                </>
              ) : printDoc.kind === 'receipt' && !printDoc.committed ? (
                <>
                  <button className="mm-btn mm-btn-ghost" onClick={() => setPrintDoc(null)}>ยกเลิก</button>
                  {/* ปุ่มหลักทำตามสวิตช์ "พิมพ์อัตโนมัติ" บนแถบเครื่องพิมพ์ */}
                  <button className="mm-btn mm-btn-line" onClick={() => commitSale(!autoPrintReceipt)}>
                    {autoPrintReceipt ? '✅ ยืนยัน (ไม่ออกเอกสาร)' : (CAN_SYSTEM_PRINT ? '🖨️ ยืนยัน & พิมพ์' : '🖼️ ยืนยัน & บันทึกรูป')}
                  </button>
                  <button className="mm-btn mm-btn-primary" onClick={() => commitSale(autoPrintReceipt)}>
                    {autoPrintReceipt
                      ? (CAN_SYSTEM_PRINT ? '🖨️ ยืนยัน & พิมพ์' : '🖼️ ยืนยัน & บันทึกรูป')
                      : '✅ ยืนยันการขาย'}
                  </button>
                </>
              ) : (
                <>
                  <button className="mm-btn mm-btn-ghost" onClick={() => setPrintDoc(null)}>ปิด</button>
                  {printDoc.kind !== 'test' && (
                    <button className="mm-btn mm-btn-line" onClick={handleSaveDocAsImage}>🖼️ บันทึกเป็นรูปภาพ / แชร์</button>
                  )}
                  {CAN_SYSTEM_PRINT && (
                    <button className="mm-btn mm-btn-primary" onClick={doPrint}>🖨️ พิมพ์</button>
                  )}
                </>
              )}
            </div>
          </div>
        </div>
        </ModalPortal>
      )}

      {/* ────────── ตั้งค่าเครื่องพิมพ์ ────────── */}
      {showPrinterSettings && (
        <ModalPortal>
        <div className="pos-modal-backdrop" style={{ zIndex: 10007 }}>
          <div className="pos-modal" style={{ maxWidth: '460px' }}>
            <div className="mm-print-head">
              <h3>{CAN_SYSTEM_PRINT ? '⚙️ ตั้งค่าเครื่องพิมพ์ & ใบเสร็จ' : '⚙️ ตั้งค่าใบเสร็จ'}</h3>
              <button className="mm-print-close" onClick={() => setShowPrinterSettings(false)}>✕</button>
            </div>

            <div className="mm-bt">
              <div className="mm-bt-head">
                <span className="mm-bt-title">เครื่องพิมพ์สลิปบลูทูธ</span>
                <span className={`mm-bt-dot ${btConnected ? 'on' : ''}`} />
                <span className="mm-bt-state">
                  {btConnected ? (btName || 'ต่ออยู่') : 'ยังไม่ได้ต่อ'}
                </span>
              </div>

              {btSupport.ok ? (
                <>
                  <div className="mm-bt-actions">
                    {btConnected ? (
                      <>
                        <button type="button" className="mm-btn mm-btn-ghost" onClick={handleBtDisconnect}>
                          ตัดการเชื่อมต่อ
                        </button>
                        <button
                          type="button"
                          className="mm-btn mm-btn-line"
                          disabled={Boolean(btBusy)}
                          onClick={() => printViaBluetooth({ kind: 'test' })}
                        >
                          พิมพ์ใบทดสอบ
                        </button>
                      </>
                    ) : (
                      <button
                        type="button"
                        className="mm-btn mm-btn-primary"
                        disabled={Boolean(btBusy)}
                        onClick={handleBtConnect}
                      >
                        ค้นหาและต่อเครื่องพิมพ์
                      </button>
                    )}
                    {btBusy ? <span className="mm-bt-busy">{btBusy}</span> : null}
                  </div>
                  <p className="mm-bt-note">
                    รองรับเฉพาะเครื่องพิมพ์ที่เป็น <strong>BLE (Bluetooth 4.0 ขึ้นไป)</strong> เท่านั้น
                    รุ่นที่สเปกเขียนว่า Bluetooth 2.0/3.0 SPP ใช้ไม่ได้
                  </p>
                </>
              ) : (
                <p className="mm-bt-note">{btSupport.message}</p>
              )}
            </div>

            <p className="mm-hint">
              {CAN_SYSTEM_PRINT
                ? 'ถ้าไม่ได้ต่อเครื่องพิมพ์บลูทูธ แอปจะพิมพ์ผ่านระบบพิมพ์ของเครื่อง (AirPrint บน iPhone/iPad)'
                : 'ถ้าไม่ได้ต่อเครื่องพิมพ์บลูทูธ แอปจะบันทึกเอกสารเป็นรูปภาพให้ แล้วคุณส่งเข้าแอปเครื่องพิมพ์หรือส่งต่อทางแชทได้'}
            </p>

            <div className="pos-field">
              <label>ความกว้างกระดาษ</label>
              <div className="mm-seg">
                {['58', '80'].map(w => (
                  <button
                    key={w}
                    type="button"
                    className={printerSettings.paperWidth === w ? 'active' : ''}
                    onClick={() => setPrinterSettings(prev => ({ ...prev, paperWidth: w }))}
                  >
                    {w} มม.
                  </button>
                ))}
              </div>
            </div>

            <div className="pos-field">
              <label>ชื่อร้าน (หัวใบเสร็จ)</label>
              <input
                type="text"
                value={printerSettings.shopName}
                onChange={e => setPrinterSettings(prev => ({ ...prev, shopName: e.target.value }))}
              />
            </div>

            <div className="pos-field">
              <label>ที่อยู่ร้าน</label>
              <input
                type="text"
                value={printerSettings.shopAddress}
                placeholder="ไม่บังคับ"
                onChange={e => setPrinterSettings(prev => ({ ...prev, shopAddress: e.target.value }))}
              />
            </div>

            <div className="pos-field">
              <label>เลขประจำตัวผู้เสียภาษีของร้าน</label>
              <input
                type="text"
                value={printerSettings.shopTaxId}
                placeholder="ไม่บังคับ"
                onChange={e => setPrinterSettings(prev => ({ ...prev, shopTaxId: e.target.value }))}
              />
            </div>

            <div className="pos-field">
              <label>ข้อความหัวใบเสร็จ</label>
              <input
                type="text"
                value={printerSettings.headerNote}
                placeholder="ไม่บังคับ เช่น สาขาสีลม"
                onChange={e => setPrinterSettings(prev => ({ ...prev, headerNote: e.target.value }))}
              />
            </div>

            <div className="pos-field">
              <label>ข้อความท้ายใบเสร็จ</label>
              <input
                type="text"
                value={printerSettings.footerNote}
                onChange={e => setPrinterSettings(prev => ({ ...prev, footerNote: e.target.value }))}
              />
            </div>

            <div className="pos-modal-actions">
              <button
                type="button"
                className="pos-btn-cancel"
                onClick={() => setPrinterSettings(DEFAULT_PRINTER_SETTINGS)}
              >
                คืนค่าเริ่มต้น
              </button>
              {CAN_SYSTEM_PRINT && (
                <button
                  type="button"
                  className="mm-btn mm-btn-line"
                  onClick={() => { setShowPrinterSettings(false); handleTestPrint(); }}
                >
                  🖨️ พิมพ์ทดสอบ
                </button>
              )}
              <button
                type="button"
                className="mm-btn mm-btn-primary"
                onClick={() => setShowPrinterSettings(false)}
              >
                เสร็จสิ้น
              </button>
            </div>
          </div>
        </div>
        </ModalPortal>
      )}

      {/* ────────── ตัวอย่างรายงานประจำงวด ──────────
          แสดงในกรอบ iframe (sandbox ปิดสคริปต์) เพื่อให้เห็นหน้าตาจริงก่อนพิมพ์/บันทึก */}
      {reportHtml && (
        <ModalPortal>
        <div className="pos-modal-backdrop" style={{ zIndex: 10008 }}>
          <div className="pos-modal mm-report-modal">
            <div className="mm-print-head">
              <h3>📊 ตัวอย่างรายงานประจำงวด</h3>
              <button className="mm-print-close" onClick={() => setReportHtml('')}>✕</button>
            </div>

            <iframe
              ref={reportFrameRef}
              className="mm-report-frame"
              title="ตัวอย่างรายงานประจำงวด"
              srcDoc={reportHtml}
              sandbox="allow-same-origin allow-modals"
            />

            <div className="mm-print-actions">
              <button className="mm-btn mm-btn-ghost" onClick={() => setReportHtml('')}>ปิด</button>
              <button className="mm-btn mm-btn-line" onClick={handleSaveReportFile}>💾 บันทึกไฟล์ / แชร์</button>
              {CAN_SYSTEM_PRINT && (
                <button className="mm-btn mm-btn-primary" onClick={handlePrintReport}>🖨️ พิมพ์</button>
              )}
            </div>
          </div>
        </div>
        </ModalPortal>
      )}

      <AIConsentModal
        isOpen={showAIConsent}
        onAccept={handleConsentAccept}
        onDecline={handleConsentDecline}
      />
    </div>
  );
}
