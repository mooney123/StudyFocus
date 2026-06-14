import React, { createContext, useContext, useState, useEffect } from 'react';
import translations from '../translations';

const LanguageContext = createContext();

export const useLanguage = () => {
  const context = useContext(LanguageContext);
  if (!context) {
    throw new Error('useLanguage must be used within a LanguageProvider');
  }
  return context;
};

export const LanguageProvider = ({ children }) => {
  // Load language from localStorage or default to English
  const [language, setLanguage] = useState(() => {
    const savedLanguage = localStorage.getItem('language');
    if (savedLanguage && translations[savedLanguage]) {
      return savedLanguage;
    }
    return 'en'; // Default to English
  });

  // Apply language and RTL direction to root element
  useEffect(() => {
    const root = document.documentElement;
    const html = document.documentElement;
    
    // Set language attribute
    html.setAttribute('lang', language);
    
    // Handle RTL languages (currently none in the list, but prepared for future)
    const rtlLanguages = ['ar', 'he', 'fa', 'ur'];
    if (rtlLanguages.includes(language)) {
      root.setAttribute('dir', 'rtl');
    } else {
      root.setAttribute('dir', 'ltr');
    }
    
    // Persist to localStorage
    localStorage.setItem('language', language);
  }, [language]);

  // Load language on mount
  useEffect(() => {
    const savedLanguage = localStorage.getItem('language');
    if (savedLanguage && translations[savedLanguage]) {
      const html = document.documentElement;
      html.setAttribute('lang', savedLanguage);
      
      const rtlLanguages = ['ar', 'he', 'fa', 'ur'];
      if (rtlLanguages.includes(savedLanguage)) {
        html.setAttribute('dir', 'rtl');
      } else {
        html.setAttribute('dir', 'ltr');
      }
    }
  }, []);

  const changeLanguage = (newLanguage) => {
    if (translations[newLanguage]) {
      setLanguage(newLanguage);
    }
  };

  // Translation function - supports nested keys like 'sidebar.search'
  const t = (key, fallback = '') => {
    const keys = key.split('.');
    let value = translations[language];
    
    for (const k of keys) {
      if (value && typeof value === 'object' && k in value) {
        value = value[k];
      } else {
        // Fallback to English if translation not found
        value = translations['en'];
        for (const k2 of keys) {
          if (value && typeof value === 'object' && k2 in value) {
            value = value[k2];
          } else {
            return fallback || key;
          }
        }
        break;
      }
    }
    
    return typeof value === 'string' ? value : (fallback || key);
  };

  const value = {
    language,
    changeLanguage,
    t
  };

  return (
    <LanguageContext.Provider value={value}>
      {children}
    </LanguageContext.Provider>
  );
};

