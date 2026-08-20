import React, { createContext, useContext, useState, useEffect } from 'react';
import { getTranslation } from '../i18n';
import { resolveLanguage } from '../i18n/lang';

const LanguageContext = createContext();

export const LanguageProvider = ({ children }) => {
  const [language, setLanguage] = useState(() => {
    return resolveLanguage();
  });

  const [t, setT] = useState(() => getTranslation(language));

  useEffect(() => {
    // Update translations when language changes
    setT(getTranslation(language));
    localStorage.setItem('language', language);
    // ให้ native control (เช่น <input type="month">, date picker) ใช้โลแคลตามภาษาที่เลือก
    // ไม่งั้นเบราว์เซอร์จะยึดภาษาของเครื่อง ทำให้ชื่อเดือนเป็นไทยทั้งที่ UI เป็นอังกฤษ
    document.documentElement.lang = language === 'th' ? 'th-TH' : 'en-US';
  }, [language]);

  const toggleLanguage = () => {
    setLanguage((prev) => (prev === 'en' ? 'th' : 'en'));
  };

  const switchLanguage = (lang) => {
    if (lang === 'en' || lang === 'th') {
      setLanguage(lang);
    }
  };

  return (
    <LanguageContext.Provider
      value={{
        language,
        t,
        toggleLanguage,
        switchLanguage,
      }}
    >
      {children}
    </LanguageContext.Provider>
  );
};

export const useLanguage = () => {
  const context = useContext(LanguageContext);
  if (!context) {
    throw new Error('useLanguage must be used within LanguageProvider');
  }
  return context;
};
