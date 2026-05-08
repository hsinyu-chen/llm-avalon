import { en } from './en';
import { zhTW } from './zh';

export type TranslationDict = { readonly [key: string]: string | string[] | TranslationDict };

export interface UiLocale {
    /** Stable id used as `interfaceLanguage` value and registry key. */
    id: string;
    /** Native-language label shown in the language picker. */
    label: string;
    /**
     * Lowercase prefixes matched against `navigator.language.toLowerCase()`
     * when the user selects "system". First registered locale whose prefix
     * list matches wins; if none match, {@link FALLBACK_UI_LOCALE_ID} is used.
     * Adding a language = push a new entry; resolver code stays put.
     */
    matchPrefixes: readonly string[];
    dictionary: TranslationDict;
}

export const UI_LOCALES = [
    { id: 'zh-TW', label: '繁體中文', matchPrefixes: ['zh'], dictionary: zhTW },
    { id: 'en', label: 'English', matchPrefixes: ['en'], dictionary: en },
] as const satisfies readonly UiLocale[];

export type UiLocaleId = (typeof UI_LOCALES)[number]['id'];
export type LangType = UiLocaleId;

export const FALLBACK_UI_LOCALE_ID: UiLocaleId = 'en';
