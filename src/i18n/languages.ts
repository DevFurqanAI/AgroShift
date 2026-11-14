import type { SupportedLanguageCode } from '../types/farm';

export interface LanguageOption {
  code: SupportedLanguageCode;
  name: string;
  nativeName: string;
  dir: 'ltr' | 'rtl';
  available: boolean;
  note: string;
}

export const SUPPORTED_LANGUAGES: LanguageOption[] = [
  {
    code: 'en',
    name: 'English',
    nativeName: 'English',
    dir: 'ltr',
    available: true,
    note: 'Complete interface translation',
  },
  {
    code: 'es',
    name: 'Spanish',
    nativeName: 'Español',
    dir: 'ltr',
    available: false,
    note: 'Translation in progress',
  },
  {
    code: 'fr',
    name: 'French',
    nativeName: 'Français',
    dir: 'ltr',
    available: false,
    note: 'Translation in progress',
  },
  {
    code: 'pt',
    name: 'Portuguese',
    nativeName: 'Português',
    dir: 'ltr',
    available: false,
    note: 'Translation in progress',
  },
  {
    code: 'sw',
    name: 'Swahili',
    nativeName: 'Kiswahili',
    dir: 'ltr',
    available: false,
    note: 'Translation in progress',
  },
  {
    code: 'hi',
    name: 'Hindi',
    nativeName: 'हिन्दी',
    dir: 'ltr',
    available: false,
    note: 'Translation in progress',
  },
  {
    code: 'ur',
    name: 'Urdu',
    nativeName: 'اردو',
    dir: 'rtl',
    available: false,
    note: 'RTL layout supported · Translation in progress',
  },
  {
    code: 'ar',
    name: 'Arabic',
    nativeName: 'العربية',
    dir: 'rtl',
    available: false,
    note: 'RTL layout supported · Translation in progress',
  },
];

export function getLanguageMeta(code: SupportedLanguageCode): LanguageOption {
  return SUPPORTED_LANGUAGES.find((l) => l.code === code) ?? SUPPORTED_LANGUAGES[0];
}
