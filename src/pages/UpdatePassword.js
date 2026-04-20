import React, { useState } from 'react';
import { useAuth } from '../services/AuthContext';
import { useLanguage } from '../services/LanguageContext';
import '../styles/Auth.css';

export default function UpdatePassword({ onUpdateSuccess }) {
  const { updatePassword, loading: isLoading } = useAuth();
  const { t, language, switchLanguage } = useLanguage();
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setMessage('');

    if (password.length < 6) {
      setError(t.passwordMinLength || 'Password must be at least 6 characters');
      return;
    }

    if (password !== confirmPassword) {
      setError(t.passwordMatch || 'Passwords do not match');
      return;
    }

    try {
      setIsSubmitting(true);
      const { error: updateError } = await updatePassword(password);

      if (updateError) {
        setError(updateError.message || 'Failed to update password');
      } else {
        setMessage('Password updated successfully!');
        if (onUpdateSuccess) {
          setTimeout(onUpdateSuccess, 2000); // Redirect after 2s
        }
      }
    } catch (err) {
      setError(err.message || 'An error occurred');
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
          <div className="auth-logo">🔒</div>
          <h1>{t.resetPasswordTitle || (language === 'th' ? 'ตั้งรหัสผ่านใหม่' : 'Reset Password')}</h1>
          <p>{t.resetPasswordSubtitle || (language === 'th' ? 'กรุณากรอกรหัสผ่านใหม่ของคุณ' : 'Please enter your new password')}</p>
        </div>

        <form onSubmit={handleSubmit} className="auth-form">
          {error && (
            <div className="auth-error">
              <span>⚠️</span>
              <p>{error}</p>
            </div>
          )}

          {message && (
            <div className="auth-success" style={{ background: 'rgba(14,159,110,0.12)', border: '1px solid rgba(14,159,110,0.22)', color: 'var(--color-success)', padding: '12px', borderRadius: '8px', marginBottom: '16px', display: 'flex', alignItems: 'center', gap: '8px' }}>
              <span>✅</span>
              <p style={{ margin: 0, fontWeight: 500 }}>{message}</p>
            </div>
          )}

          <div className="form-group">
            <label htmlFor="password">{t.newPasswordLabel || (language === 'th' ? 'รหัสผ่านใหม่' : 'New Password')}</label>
            <input
              id="password"
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder={t.passwordPlaceholder}
              disabled={isSubmitting || !!message || isLoading}
            />
          </div>

          <div className="form-group">
            <label htmlFor="confirmPassword">{t.passwordConfirmLabel || (language === 'th' ? 'ยืนยันรหัสผ่านใหม่' : 'Confirm New Password')}</label>
            <input
              id="confirmPassword"
              type="password"
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              placeholder={t.passwordPlaceholder}
              disabled={isSubmitting || !!message || isLoading}
            />
          </div>

          <button
            type="submit"
            disabled={isSubmitting || !!message || isLoading}
            className="auth-button"
          >
            {isSubmitting || isLoading ? t.loading || 'Loading...' : t.updatePasswordBtn || (language === 'th' ? 'อัปเดตรหัสผ่าน' : 'Update Password')}
          </button>
        </form>
      </div>
    </div>
  );
}
