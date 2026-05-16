import i18n from 'i18next'
import { initReactI18next } from 'react-i18next'
import AsyncStorage from '@react-native-async-storage/async-storage'
import vi from './vi.json'
import en from './en.json'
import { AsyncStorageKey } from '../types'

export const initI18n = async () => {
  const savedLanguage = await AsyncStorage.getItem(AsyncStorageKey.APP_LANGUAGE) || 'vi'

  await i18n
    .use(initReactI18next)
    .init({
      resources:   { vi: { translation: vi }, en: { translation: en } },
      lng:         savedLanguage,
      fallbackLng: 'vi',
      interpolation: { escapeValue: false },
    })
}

export const changeLanguage = async (lang: 'vi' | 'en') => {
  await i18n.changeLanguage(lang)
  await AsyncStorage.setItem(AsyncStorageKey.APP_LANGUAGE, lang)
}

export default i18n
