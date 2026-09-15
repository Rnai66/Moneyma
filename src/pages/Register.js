import React, { useState } from 'react';
import { useAuth } from '../services/AuthContext';
import { useLanguage } from '../services/LanguageContext';
import '../styles/Auth.css';
import { APP_ICON } from '../config/appInfo';
import AppleSignInButton from '../components/AppleSignInButton';

export default function Register({ onSwitchToLogin, onRegisterSuccess }) {
  const {
    signUp,
    signInWithGoogle,
    signInWithApple,
    error: authError,
    loading: isLoading,
  } = useAuth();
  const { t, language, switchLanguage } = useLanguage();
  const [formData, setFormData] = useState({
    firstName: '',
    lastName: '',
    email: '',
    password: '',
    confirmPassword: '',
  });
  const [error, setError] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isSuccess, setIsSuccess] = useState(false);

  const handleChange = (e) => {
    const { name, value } = e.target;
    setFormData((prev) => ({
      ...prev,
      [name]: value,
    }));
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');

    // Validation
    if (!formData.firstName.trim()) {
      setError(t.firstNameRequired);
      return;
    }

    if (!formData.lastName.trim()) {
      setError(t.lastNameRequired);
      return;
    }

    if (!formData.email.trim()) {
      setError(t.emailRequired);
      return;
    }

    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(formData.email)) {
      setError(t.invalidEmail);
      return;
    }

    if (formData.password.length < 6) {
      setError(t.passwordMinLength);
      return;
    }

    if (formData.password !== formData.confirmPassword) {
      setError(t.passwordMatch);
      return;
    }

    try {
      setIsSubmitting(true);
      const { error: signUpError } = await signUp(formData.email, formData.password, {
        firstName: formData.firstName,
        lastName: formData.lastName,
      });

      if (signUpError) {
        setError(signUpError.message || t.registerFailed);
      } else {
        setFormData({
          firstName: '',
          lastName: '',
          email: '',
          password: '',
          confirmPassword: '',
        });
        setIsSuccess(true);
      }
    } catch (err) {
      setError(err.message || t.registerFailed);
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
          <img className="auth-logo auth-logo--icon" src={APP_ICON} alt="MoneyMa" width={60} height={60} />
          <h1>MoneyMa</h1>
          {/* ใช้คีย์ i18n ตัวเดียวกับหน้าเกี่ยวกับ แก้ที่เดียวเปลี่ยนทั้งแอป */}
          <p>{t.appTagline}</p>
        </div>

        {isSuccess ? (
          <div className="auth-form" style={{ textAlign: 'center', padding: '20px 0' }}>
            <div style={{ fontSize: '48px', marginBottom: '16px' }}>📧</div>
            <h2>{language === 'th' ? 'สมัครสมาชิกสำเร็จ!' : 'Registration Successful!'}</h2>
            <p style={{ color: 'var(--color-text-secondary)', marginBottom: '24px', lineHeight: '1.5' }}>
              {t.registerConfirmSent}
            </p>
            <button
              type="button"
              className="auth-button"
              onClick={onSwitchToLogin}
            >
              {language === 'th' ? 'กลับไปหน้าเข้าสู่ระบบ' : 'Back to Login'}
            </button>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="auth-form">
            <h2>{t.registerTitle}</h2>

            {(error || authError) && (
            <div className="auth-error">
              <span>⚠️</span>
              <p>{error || (typeof authError === 'string' ? authError : authError?.message) || 'An error occurred'}</p>
            </div>
          )}

          <div className="form-row">
            <div className="form-group">
              <label htmlFor="firstName">{t.firstNameLabel}</label>
              <input
                id="firstName"
                type="text"
                name="firstName"
                value={formData.firstName}
                onChange={handleChange}
                placeholder={t.firstNamePlaceholder}
                disabled={isSubmitting || isLoading}
              />
            </div>

            <div className="form-group">
              <label htmlFor="lastName">{t.lastNameLabel}</label>
              <input
                id="lastName"
                type="text"
                name="lastName"
                value={formData.lastName}
                onChange={handleChange}
                placeholder={t.lastNamePlaceholder}
                disabled={isSubmitting || isLoading}
              />
            </div>
          </div>

          <div className="form-group">
            <label htmlFor="email">{t.emailLabel}</label>
            <input
              id="email"
              type="email"
              name="email"
              value={formData.email}
              onChange={handleChange}
              placeholder={t.emailPlaceholder}
              disabled={isSubmitting || isLoading}
            />
          </div>

          <div className="form-group">
            <label htmlFor="password">{t.passwordLabel}</label>
            <input
              id="password"
              type="password"
              name="password"
              value={formData.password}
              onChange={handleChange}
              placeholder={t.passwordPlaceholder}
              disabled={isSubmitting || isLoading}
            />
            <small>{t.passwordMinLength}</small>
          </div>

          <div className="form-group">
            <label htmlFor="confirmPassword">{t.passwordConfirmLabel}</label>
            <input
              id="confirmPassword"
              type="password"
              name="confirmPassword"
              value={formData.confirmPassword}
              onChange={handleChange}
              placeholder={t.passwordPlaceholder}
              disabled={isSubmitting || isLoading}
            />
          </div>

          <button
            type="submit"
            disabled={isSubmitting || isLoading}
            className="auth-button"
          >
            {isSubmitting || isLoading ? t.signingUp : t.signUpBtn}
          </button>

          <div className="auth-divider">
            <span>{t.orContinueWith || (language === 'th' ? 'หรือเข้าสู่ระบบด้วย' : 'or continue with')}</span>
          </div>
          <AppleSignInButton
            onClick={signInWithApple}
            disabled={isSubmitting || isLoading}
            language={language}
            mode="signUp"
          />

          <button
            type="button"
            className="google-button"
            onClick={signInWithGoogle}
            disabled={isSubmitting || isLoading}
          >
            <img src="https://www.gstatic.com/firebasejs/ui/2.0.0/images/auth/google.svg" alt="Google" />
            {t.signInWithGoogle || (language === 'th' ? 'เข้าสู่ระบบด้วย Google' : 'Sign in with Google')}
          </button>
        </form>
        )}

        <div className="auth-footer">
          <p>
            {t.haveAccount}
            <button
              type="button"
              onClick={onSwitchToLogin}
              className="auth-link"
            >
              {t.signInHere}
            </button>
          </p>
        </div>
      </div>
    </div>
  );
}
