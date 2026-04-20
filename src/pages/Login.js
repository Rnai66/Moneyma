import React, { useState } from 'react';
import { useAuth } from '../services/AuthContext';
import { useLanguage } from '../services/LanguageContext';
import '../styles/Auth.css';

export default function Login({ onSwitchToRegister, onLoginSuccess, onContinueAsGuest }) {
  const {
    signIn,
    resetPassword,
    enableDevBypass,
    isDevBypassEnabled,
    error: authError,
    loading: isLoading,
  } = useAuth();
  const { t, language, switchLanguage } = useLanguage();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [successMsg, setSuccessMsg] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isResetting, setIsResetting] = useState(false);
  
  const handleResetSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setSuccessMsg('');

    if (!email.trim() || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      setError(t.invalidEmail || 'Invalid email address');
      return;
    }

    try {
      setIsSubmitting(true);
      const { error: resetError } = await resetPassword(email);
      if (resetError) {
        setError(resetError.message || 'Failed to send reset link');
      } else {
        setSuccessMsg(t.resetLinkSent || (language === 'th' ? 'ส่งลิงก์ตั้งรหัสผ่านใหม่ไปที่อีเมลของคุณแล้ว' : 'Password reset link sent to your email.'));
      }
    } catch (err) {
      setError(err.message || 'Error sending link');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');

    if (!email.trim()) {
      setError(t.emailRequired);
      return;
    }

    if (!password) {
      setError(t.passwordRequired);
      return;
    }

    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      setError(t.invalidEmail);
      return;
    }

    try {
      setIsSubmitting(true);
      const { error: signInError } = await signIn(email, password);

      if (signInError) {
        setError(signInError.message || t.loginFailed);
      } else {
        setEmail('');
        setPassword('');
        if (onLoginSuccess) {
          onLoginSuccess();
        }
      }
    } catch (err) {
      setError(err.message || t.loginFailed);
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleDevBypass = async () => {
    setError('');
    setSuccessMsg('');

    try {
      setIsSubmitting(true);
      const { error: bypassError } = await enableDevBypass();
      if (bypassError) {
        setError(bypassError.message || 'Failed to enable dev bypass');
        return;
      }

      if (onLoginSuccess) {
        onLoginSuccess();
      }
    } catch (err) {
      setError(err.message || 'Failed to enable dev bypass');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="auth-container">
      <div className="auth-card">
        {/* Language Switcher */}
        <div className="language-switcher">
          <button
            className={`lang-btn ${language === 'en' ? 'active' : ''}`}
            onClick={() => switchLanguage('en')}
          >
            EN
          </button>
          <button
            className={`lang-btn ${language === 'th' ? 'active' : ''}`}
            onClick={() => switchLanguage('th')}
          >
            ไทย
          </button>
        </div>

        <div className="auth-header">
          <div className="auth-logo">💰</div>
          <h1>MoneyMa</h1>
          <p>{language === 'en' ? 'Personal Finance Manager' : 'ตัวจัดการการเงินส่วนตัว'}</p>
        </div>

        {isResetting ? (
          <form onSubmit={handleResetSubmit} className="auth-form">
            <h2>{t.resetPasswordTitle || (language === 'th' ? 'ลืมรหัสผ่าน' : 'Reset Password')}</h2>
            
            {(error || authError) && (
              <div className="auth-error">
                <span>⚠️</span>
                <p>{error || authError?.message || 'An error occurred'}</p>
              </div>
            )}
            
            {successMsg && (
              <div className="auth-success" style={{ background: 'rgba(14,159,110,0.12)', border: '1px solid rgba(14,159,110,0.22)', color: 'var(--color-success)', padding: '12px', borderRadius: '8px', marginBottom: '16px', display: 'flex', alignItems: 'center', gap: '8px' }}>
                <span>✅</span>
                <p style={{ margin: 0, fontWeight: 500 }}>{successMsg}</p>
              </div>
            )}

            <div className="form-group">
              <label htmlFor="email">{t.emailLabel}</label>
              <input
                id="email"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder={t.emailPlaceholder}
                disabled={isSubmitting || isLoading}
              />
            </div>

            <button
              type="submit"
              disabled={isSubmitting || !!successMsg || isLoading}
              className="auth-button"
            >
              {isSubmitting || isLoading ? t.loading || 'Loading...' : (t.sendResetLink || (language === 'th' ? 'ส่งลิงก์กู้คืน' : 'Send Reset Link'))}
            </button>
            
            <button
              type="button"
              className="auth-button"
              style={{ background: 'transparent', color: 'var(--color-text-secondary)', border: '1px solid var(--color-border)', marginTop: '8px' }}
              onClick={() => { setIsResetting(false); setError(''); setSuccessMsg(''); }}
              disabled={isSubmitting}
            >
              {language === 'th' ? 'กลับไปหน้าเข้าสู่ระบบ' : 'Back to Login'}
            </button>
          </form>
        ) : (
          <form onSubmit={handleSubmit} className="auth-form">
            <h2>{t.loginTitle}</h2>

          {(error || authError) && (
            <div className="auth-error">
              <span>⚠️</span>
              <p>{error || authError?.message || 'An error occurred'}</p>
            </div>
          )}

          <div className="form-group">
            <label htmlFor="email">{t.emailLabel}</label>
            <input
              id="email"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder={t.emailPlaceholder}
              disabled={isSubmitting || isLoading}
            />
          </div>

            <div className="form-group">
              <label htmlFor="password">{t.passwordLabel}</label>
              <input
                id="password"
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder={t.passwordPlaceholder}
                disabled={isSubmitting || isLoading}
              />
              <div style={{ textAlign: 'right', marginTop: '6px' }}>
                <button
                  type="button"
                  style={{ background: 'none', border: 'none', color: 'var(--accent-primary)', fontSize: '13px', cursor: 'pointer', padding: 0 }}
                  onClick={() => setIsResetting(true)}
                >
                  {language === 'th' ? 'ลืมรหัสผ่าน?' : 'Forgot Password?'}
                </button>
              </div>
            </div>

            <button
              type="submit"
              disabled={isSubmitting || isLoading}
              className="auth-button"
            >
              {isSubmitting || isLoading ? t.signingIn : t.signInBtn}
            </button>
          </form>
        )}

        <div className="auth-footer">
          <p>
            {t.noAccount}
            <button
              type="button"
              onClick={onSwitchToRegister}
              className="auth-link"
            >
              {t.signUpHere}
            </button>
          </p>
        </div>

        <div className="auth-demo">
          <p>{t.demoMode}</p>
          <button
            type="button"
            onClick={onContinueAsGuest || onLoginSuccess}
            className="demo-button"
            disabled={isSubmitting || isLoading}
          >
            {t.continueGuest}
          </button>
          {isDevBypassEnabled && (
            <button
              type="button"
              onClick={handleDevBypass}
              className="demo-button"
              disabled={isSubmitting || isLoading}
              style={{ marginTop: '10px' }}
            >
              {language === 'th' ? 'เข้าแบบ Dev Bypass' : 'Continue with Dev Bypass'}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
