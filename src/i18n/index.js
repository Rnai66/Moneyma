import { th } from './th';
import { en } from './en';

export const translations = {
    th,
    en
};

export const getTranslation = (language) => {
    return translations[language] || translations.en;
};