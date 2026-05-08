import { Injectable, computed, signal } from '@angular/core';
import {
    FALLBACK_UI_LOCALE_ID,
    UI_LOCALES,
    type LangType,
    type TranslationDict,
} from './translations';

/**
 * Single global regex matching all `{{ name }}` placeholders. Captured once
 * at module load (vs. per-call `new RegExp(...)` inside a loop) and reused
 * with a replacement callback so each `translate()` does one pass over the
 * string regardless of param count. Also dodges the regex-injection edge
 * case of params whose names contain regex metachars.
 */
const PLACEHOLDER_RE = /\{\{\s*(\w+)\s*\}\}/g;

@Injectable({
    providedIn: 'root'
})
export class I18nService {
    private _userLang = signal<'system' | LangType>('system');
    private _currentLang = signal<LangType>(FALLBACK_UI_LOCALE_ID);

    // Expose signals
    readonly userLang = this._userLang.asReadonly();
    readonly currentLang = this._currentLang.asReadonly();

    /**
     * Active dictionary, memoized via `computed` so the `pure: false` pipe's
     * per-CD-cycle `translate()` calls don't repeat the `UI_LOCALES.find` walk.
     */
    private readonly currentDict = computed<TranslationDict>(() =>
        UI_LOCALES.find(l => l.id === this._currentLang())?.dictionary ?? {});

    constructor() {
        const savedLang = localStorage.getItem('avalon-user-lang') as 'system' | LangType;
        if (savedLang) {
            this._userLang.set(savedLang);
        }
        this.detectLanguage();
    }

    /**
     * Resolve `_userLang` to a concrete dictionary id. When the user picked
     * "system", walk the `UI_LOCALES` registry's `matchPrefixes` against the
     * browser locale — adding a new language is one registry entry, no
     * resolver change needed.
     */
    private detectLanguage() {
        const override = this._userLang();
        if (override !== 'system') {
            this._currentLang.set(override);
            return;
        }

        const browser = navigator.language.toLowerCase();
        const matched = UI_LOCALES.find(l => l.matchPrefixes.some(p => browser.startsWith(p)));
        this._currentLang.set(matched?.id ?? FALLBACK_UI_LOCALE_ID);
    }

    setLanguage(lang: 'system' | LangType) {
        this._userLang.set(lang);
        localStorage.setItem('avalon-user-lang', lang);
        this.detectLanguage();
    }

    get currentLangValue(): LangType {
        return this._currentLang();
    }

    /**
     * Programmatic translation getter. Wait for reactivity.
     * Format: translate('namespace.key', { param: 'value' })
     */
    translate(key: string, params?: Record<string, string | number>): string {
        const dict = this.currentDict() as Record<string, unknown>;

        // Resolve dot notation
        const keys = key.split('.');
        let value: unknown = dict;
        for (const k of keys) {
            if (value && typeof value === 'object' && k in value) {
                value = (value as Record<string, unknown>)[k];
            } else {
                return key; // Fallback to key if not found
            }
        }

        if (typeof value !== 'string') {
            return key;
        }
        if (!params) return value;

        return value.replace(PLACEHOLDER_RE, (match, name: string) =>
            name in params ? String(params[name]) : match);
    }
}
