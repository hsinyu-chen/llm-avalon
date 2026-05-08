import { en } from './en';
import { zhTW } from './zh';

export {
    UI_LOCALES,
    FALLBACK_UI_LOCALE_ID,
    type UiLocale,
    type UiLocaleId,
    type TranslationDict,
} from './ui-locales';

/**
 * Literal-typed dictionary map kept for direct sub-tree access (e.g.
 * `TRANSLATIONS[lang].namePool` — a `string[]` whose shape `translate()`
 * can't return). New plumbing should iterate {@link UI_LOCALES} instead;
 * this export stays for historical leaf-array consumers.
 */
export const TRANSLATIONS = { en, 'zh-TW': zhTW };

export type LangType = keyof typeof TRANSLATIONS;
