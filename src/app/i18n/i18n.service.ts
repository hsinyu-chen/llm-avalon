import { Injectable, signal } from '@angular/core';
import { TRANSLATIONS, LangType } from './translations';

@Injectable({
    providedIn: 'root'
})
export class I18nService {
    private _userLang = signal<'system' | LangType>('system');
    private _currentLang = signal<LangType>('en'); // Default is now English

    // Expose signals
    readonly userLang = this._userLang.asReadonly();
    readonly currentLang = this._currentLang.asReadonly();

    constructor() {
        const savedLang = localStorage.getItem('avalon-user-lang') as 'system' | LangType;
        if (savedLang) {
            this._userLang.set(savedLang);
        }
        this.detectLanguage();
    }

    private detectLanguage() {
        const override = this._userLang();
        if (override !== 'system') {
            this._currentLang.set(override);
            return;
        }

        const browserLang = navigator.language.toLowerCase();
        if (browserLang.startsWith('zh')) {
            this._currentLang.set('zh-TW');
        } else {
            this._currentLang.set('en');
        }
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
        const lang = this._currentLang();
        const dict = TRANSLATIONS[lang] as Record<string, unknown>;

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

        let result = value;
        if (params) {
            for (const p in params) {
                // Replace {{param}}
                result = result.replace(new RegExp(`{{\\s*${p}\\s*}}`, 'g'), String(params[p]));
            }
        }

        return result;
    }
}
