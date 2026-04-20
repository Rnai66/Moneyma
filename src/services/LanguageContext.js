import React, { createContext, useContext, useState, useEffect } from 'react';
import { getTranslation } from '../i18n';

const LanguageContext = createContext();

export const LanguageProvider = ({ children }) => {
  const [language, setLanguage] = useState(() => {
    // Get language from localStorage or default to 'en'
    return localStorage.getItem('language') || 'en';
  });

  const [t, setT] = useState(() => getTranslation(language));

  useEffect(() => {
    // Update translations when language changes
    setT(getTranslation(language));
    localStorage.setItem('language', language);
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
