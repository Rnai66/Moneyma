import React, { useEffect, useState } from 'react';
import PaymentService from '../services/PaymentService';
import { Capacitor } from '@capacitor/core';
import '../styles/App.css'; // Utilizing existing App.css (if any global classes exist)

const planHighlights = [
  {
    id: 'one-time',
    eyebrow: 'One-time',
    price: '$14.99',
    subtitle: 'จ่ายครั้งเดียว',
    recommended: false,
    points: [
      'ใช้งานตลอดชีพ',
      'อัปเดตฟรี',
      'บักทึกข้อมูลในตัวเครื่อง',
      'Backup&Restore',
    ],
  },
  {
    id: 'subscription',
    eyebrow: 'Subscription',
    price: '$4.99/เดือน',
    subtitle: 'หรือ $39.99/ปี (save 33%)',
    recommended: true,
    points: [
      'online database',
      'Cloud backup',
      'Support ต่อเนื่อง',
      'web App mobile App Desktop Software',
    ],
  },
];

const manualPaymentChannels = [
  { id: 'promptpay', label: 'PromptPay', value: '0959987090' },
  { id: 'paynow', label: 'PayNow', value: '84879698' },
];

const contactChannels = [
  { id: 'line', label: 'LINE', value: 'jawnai99' },
  { id: 'whatsapp', label: 'WhatsApp', value: '+65 8487 9698' },
  { id: 'email', label: 'Email', value: 'Rnaibro@gmail.com' },
];

const PremiumSettings = ({ setCurrentPage }) => {
  const [packages, setPackages] = useState([]);
  const [isPremium, setIsPremium] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [copiedChannel, setCopiedChannel] = useState('');

  useEffect(() => {
    const fetchData = async () => {
      try {
        await PaymentService.init(); // Initialize first just in case
        const premiumStatus = await PaymentService.checkPremiumStatus();
        setIsPremium(premiumStatus);

        if (!premiumStatus) {
            const offerings = await PaymentService.getOfferings();
            if (offerings && offerings.availablePackages) {
                setPackages(offerings.availablePackages);
            }
        }
      } catch (error) {
        console.error("Error fetching payment data:", error);
      } finally {
        setIsLoading(false);
      }
    };

    fetchData();
  }, []);

  const handlePurchase = async (pkg) => {
    try {
      setIsLoading(true);
      const customerInfo = await PaymentService.purchasePackage(pkg);
      
      // Re-check premium status after purchase
      const isNowPremium = typeof customerInfo?.entitlements?.active?.['Premium'] !== "undefined";
      if (isNowPremium || Capacitor.getPlatform() === 'web') {
        setIsPremium(true);
        alert('🎉 ยินดีด้วย! คุณได้รับการอัปเกรดเป็นสมาชิกระดับ Premium แล้ว');
      }
    } catch (error) {
      if (!error.userCancelled) {
          alert('เกิดข้อผิดพลาดในการทำรายการ: ' + error.message);
      }
    } finally {
      setIsLoading(false);
    }
  };

  const handleRestore = async () => {
    try {
      setIsLoading(true);
      const customerInfo = await PaymentService.restorePurchases();
      const isNowPremium = typeof customerInfo?.entitlements?.active?.['Premium'] !== "undefined";
      if (isNowPremium) {
        setIsPremium(true);
        alert('กู้คืนการซื้อสำเร็จ! คุณเป็นสมาชิกระดับ Premium');
      } else {
        alert('ไม่พบข้อมูลการเป็นสมาชิก Premium ในบัญชีนี้');
      }
    } catch (error) {
      alert('เกิดข้อผิดพลาดในการกู้คืน: ' + error.message);
    } finally {
      setIsLoading(false);
    }
  };

  const handleCopyPayment = async (channel) => {
    try {
      await navigator.clipboard.writeText(channel.value);
      setCopiedChannel(channel.id);
      window.setTimeout(() => setCopiedChannel(''), 2000);
    } catch (error) {
      alert(`คัดลอกไม่สำเร็จ กรุณาคัดลอกเอง: ${channel.value}`);
    }
  };

  return (
    <div className="premium-container" style={styles.container}>
      <div style={styles.header}>
        <button onClick={() => setCurrentPage ? setCurrentPage('dashboard') : window.history.back()} style={styles.backButton}>&larr; กลับ</button>
        <h2 style={styles.title}>MoneyMa Premium</h2>
      </div>

      <div style={styles.content}>
        {isLoading ? (
          <p style={styles.loadingText}>กำลังโหลดข้อมูล...</p>
        ) : isPremium ? (
          <div style={styles.premiumCard}>
            <h3 style={styles.premiumTitle}>💎 คุณเป็นสมาชิกระดับ Premium แล้ว</h3>
            <p>ขอบคุณที่สนับสนุนเรา! คุณสามารถใช้งานทุกฟีเจอร์ได้อย่างไร้ขีดจำกัด</p>
          </div>
        ) : (
          <>
            <div style={styles.planGrid}>
              {planHighlights.map((plan) => (
                <div
                  key={plan.id}
                  style={{
                    ...styles.planCard,
                    ...(plan.recommended ? styles.planCardRecommended : {}),
                  }}
                >
                  <div style={styles.planHeader}>
                    <div>
                      <div style={styles.planEyebrow}>{plan.eyebrow}</div>
                      <h3 style={styles.planPrice}>{plan.price}</h3>
                      <p style={styles.planSubtitle}>{plan.subtitle}</p>
                    </div>
                    {plan.recommended && <span style={styles.planBadge}>แนะนำ</span>}
                  </div>

                  <div style={styles.planPoints}>
                    {plan.points.map((point) => {
                      return (
                        <div key={point} style={styles.planPoint}>
                          <span style={{ ...styles.planPointIcon, color: '#0e9f6e' }}>
                            ✓
                          </span>
                          <span>{point}</span>
                        </div>
                      );
                    })}
                  </div>
                </div>
              ))}
            </div>

            <div style={styles.benefits}>
              <h3>ทำไมต้องอัปเกรดเป็น Premium?</h3>
              <ul style={styles.benefitsList}>
                <li>✅ ไม่จำกัดจำนวนบัญชีและหมวดหมู่</li>
                <li>✅ ซิงค์ข้อมูลข้ามอุปกรณ์อัตโนมัติ</li>
                <li>✅ ดูรายงานเชิงลึกรายปี</li>
                <li>✅ สนับสนุนผู้พัฒนาให้อัปเดตแอปต่อไป</li>
              </ul>
            </div>

            <div style={styles.manualPaymentCard}>
              <div style={styles.manualPaymentHeader}>
                <div>
                  <h3 style={styles.manualPaymentTitle}>ช่องทางชำระเงินเพิ่มเติม</h3>
                  <p style={styles.manualPaymentSubtitle}>โอนแล้วส่งหลักฐานเพื่อให้ทีมช่วยเปิดสิทธิ์ให้</p>
                </div>
              </div>

              <div style={styles.manualPaymentGrid}>
                {manualPaymentChannels.map((channel) => (
                  <div key={channel.id} style={styles.manualPaymentItem}>
                    <div>
                      <div style={styles.manualPaymentLabel}>{channel.label}</div>
                      <div style={styles.manualPaymentValue}>{channel.value}</div>
                    </div>
                    <button
                      type="button"
                      style={styles.copyButton}
                      onClick={() => handleCopyPayment(channel)}
                    >
                      {copiedChannel === channel.id ? 'คัดลอกแล้ว' : 'คัดลอก'}
                    </button>
                  </div>
                ))}
              </div>

              <div style={styles.contactSection}>
                <h4 style={styles.contactTitle}>ช่องทางติดต่อ</h4>
                <div style={styles.contactGrid}>
                  {contactChannels.map((channel) => (
                    <div key={channel.id} style={styles.contactItem}>
                      <span style={styles.contactLabel}>{channel.label}</span>
                      <span style={styles.contactValue}>{channel.value}</span>
                    </div>
                  ))}
                </div>
              </div>
            </div>

            <div style={styles.packagesContainer}>
              {packages.length > 0 ? packages.map((pkg) => (
                <div key={pkg.identifier} style={styles.packageCard}>
                  <div>
                    <h4 style={styles.pkgTitle}>{pkg.product.title}</h4>
                    <p style={styles.pkgDesc}>{pkg.product.description}</p>
                  </div>
                  <button 
                    style={styles.buyButton}
                    onClick={() => handlePurchase(pkg)}
                  >
                    สมัคร {pkg.product.priceString}
                  </button>
                </div>
              )) : (
                <p>ไม่พบแพ็กเกจ กรุณาลองใหม่อีกครั้ง หรือตั้งค่าใน Play Console ก่อน</p>
              )}
            </div>

            <button style={styles.restoreButton} onClick={handleRestore}>
              กู้คืนการซื้อ (Restore Purchases)
            </button>
          </>
        )}
      </div>
    </div>
  );
};

// Vanilla CSS inline styles for a premium look
const styles = {
  container: {
    minHeight: '100vh',
    backgroundColor: '#f8f9fa',
    padding: '20px',
    fontFamily: 'Inter, Roboto, sans-serif'
  },
  header: {
    display: 'flex',
    alignItems: 'center',
    marginBottom: '20px',
  },
  backButton: {
    background: 'none',
    border: 'none',
    fontSize: '16px',
    color: '#007bff',
    marginRight: '15px',
    cursor: 'pointer'
  },
  title: {
    margin: 0,
    fontSize: '24px',
    fontWeight: '700',
    color: '#333'
  },
  content: {
    backgroundColor: '#fff',
    color: '#1f2937',
    borderRadius: '12px',
    padding: '20px',
    boxShadow: '0 4px 6px rgba(0,0,0,0.05)'
  },
  loadingText: {
    textAlign: 'center',
    color: '#666',
    padding: '40px 0'
  },
  premiumCard: {
    textAlign: 'center',
    padding: '40px 20px',
    background: 'linear-gradient(135deg, #FFD700 0%, #FFA500 100%)',
    borderRadius: '12px',
    color: '#fff'
  },
  premiumTitle: {
    fontSize: '22px',
    marginBottom: '10px'
  },
  planGrid: {
    display: 'grid',
    gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))',
    gap: '16px',
    marginBottom: '24px',
  },
  planCard: {
    border: '1px solid #d7deea',
    borderRadius: '18px',
    padding: '18px',
    backgroundColor: '#f9fbff',
    color: '#1f2937',
  },
  planCardRecommended: {
    border: '1px solid #7c6cff',
    background: 'linear-gradient(180deg, #f6f2ff 0%, #fff 100%)',
    boxShadow: '0 12px 30px rgba(124,108,255,0.14)',
  },
  planHeader: {
    display: 'flex',
    justifyContent: 'space-between',
    gap: '12px',
    marginBottom: '16px',
  },
  planEyebrow: {
    fontSize: '12px',
    fontWeight: '700',
    letterSpacing: '0.08em',
    textTransform: 'uppercase',
    color: '#6b7280',
    marginBottom: '8px',
  },
  planPrice: {
    margin: 0,
    fontSize: '30px',
    lineHeight: '1.1',
    color: '#111827',
  },
  planSubtitle: {
    margin: '8px 0 0',
    color: '#6b7280',
    fontSize: '14px',
  },
  planBadge: {
    alignSelf: 'flex-start',
    padding: '6px 10px',
    borderRadius: '999px',
    backgroundColor: '#7c6cff',
    color: '#fff',
    fontSize: '12px',
    fontWeight: '700',
  },
  planPoints: {
    display: 'flex',
    flexDirection: 'column',
    gap: '10px',
  },
  planPoint: {
    display: 'flex',
    alignItems: 'center',
    gap: '10px',
    fontSize: '14px',
  },
  planPointIcon: {
    fontWeight: '700',
    minWidth: '14px',
  },
  benefits: {
    marginBottom: '30px',
    padding: '15px',
    color: '#1f2937',
    backgroundColor: '#f0f7ff',
    borderRadius: '8px'
  },
  manualPaymentCard: {
    marginBottom: '24px',
    padding: '18px',
    borderRadius: '16px',
    backgroundColor: '#fff7ed',
    border: '1px solid #fed7aa',
    color: '#1f2937',
  },
  manualPaymentHeader: {
    marginBottom: '14px',
  },
  manualPaymentTitle: {
    margin: '0 0 6px',
    fontSize: '18px',
  },
  manualPaymentSubtitle: {
    margin: 0,
    color: '#7c5a35',
    fontSize: '14px',
  },
  manualPaymentGrid: {
    display: 'grid',
    gap: '12px',
  },
  contactSection: {
    marginTop: '18px',
    paddingTop: '16px',
    borderTop: '1px solid #f3c992',
  },
  contactTitle: {
    margin: '0 0 12px',
    fontSize: '16px',
    color: '#7c5a35',
  },
  contactGrid: {
    display: 'grid',
    gap: '10px',
  },
  contactItem: {
    display: 'flex',
    justifyContent: 'space-between',
    gap: '12px',
    padding: '10px 12px',
    borderRadius: '12px',
    backgroundColor: 'rgba(255,255,255,0.72)',
  },
  contactLabel: {
    fontSize: '13px',
    fontWeight: '700',
    color: '#9a6b2f',
    textTransform: 'uppercase',
    letterSpacing: '0.06em',
  },
  contactValue: {
    fontSize: '14px',
    fontWeight: '600',
    color: '#111827',
    textAlign: 'right',
  },
  manualPaymentItem: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    gap: '12px',
    padding: '14px',
    borderRadius: '14px',
    backgroundColor: '#fff',
    border: '1px solid #f3c992',
  },
  manualPaymentLabel: {
    fontSize: '13px',
    color: '#9a6b2f',
    textTransform: 'uppercase',
    letterSpacing: '0.06em',
    marginBottom: '4px',
  },
  manualPaymentValue: {
    fontSize: '20px',
    fontWeight: '700',
    color: '#111827',
  },
  benefitsList: {
    listStyleType: 'none',
    padding: 0,
    lineHeight: '2.5'
  },
  packagesContainer: {
    display: 'flex',
    flexDirection: 'column',
    gap: '15px'
  },
  packageCard: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    color: '#1f2937',
    border: '2px solid #e0e0e0',
    borderRadius: '10px',
    padding: '15px',
    transition: 'border-color 0.3s ease'
  },
  pkgTitle: {
    margin: '0 0 5px 0',
    fontSize: '18px',
    fontWeight: '600'
  },
  pkgDesc: {
    margin: 0,
    color: '#666',
    fontSize: '14px'
  },
  buyButton: {
    backgroundColor: '#007bff',
    color: '#fff',
    border: 'none',
    padding: '10px 20px',
    borderRadius: '25px',
    fontWeight: '600',
    cursor: 'pointer',
    boxShadow: '0 2px 4px rgba(0,123,255,0.3)',
    whiteSpace: 'nowrap',
    marginLeft: '15px'
  },
  copyButton: {
    backgroundColor: '#111827',
    color: '#fff',
    border: 'none',
    padding: '10px 14px',
    borderRadius: '12px',
    fontWeight: '600',
    cursor: 'pointer',
    whiteSpace: 'nowrap',
  },
  restoreButton: {
    display: 'block',
    width: '100%',
    textAlign: 'center',
    background: 'none',
    border: 'none',
    color: '#6c757d',
    marginTop: '25px',
    cursor: 'pointer',
    textDecoration: 'underline'
  }
};

export default PremiumSettings;
