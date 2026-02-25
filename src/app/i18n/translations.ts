import { en } from './en';
import { zhTW } from './zh';

export const TRANSLATIONS = {
    en,
    'zh-TW': zhTW
};

export type LangType = keyof typeof TRANSLATIONS;
