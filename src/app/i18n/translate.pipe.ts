import { Pipe, PipeTransform, inject, ChangeDetectorRef } from '@angular/core';
import { I18nService } from './i18n.service';
import { effect } from '@angular/core';

type ParamsBag = Record<string, string | number> | undefined;

/**
 * Shallow equality on the param record. Avoids the `JSON.stringify` cost in
 * a `pure: false` pipe that runs every change-detection cycle — params are
 * always shallow `{ key: value }` objects, so a key/length/value walk is
 * strictly cheaper than serializing twice.
 */
function paramsEqual(a: ParamsBag, b: ParamsBag): boolean {
    if (a === b) return true;
    if (!a || !b) return false;
    const ak = Object.keys(a);
    const bk = Object.keys(b);
    if (ak.length !== bk.length) return false;
    for (const k of ak) {
        if (a[k] !== b[k]) return false;
    }
    return true;
}

@Pipe({
    name: 'translate',
    standalone: true,
    pure: false // needed to trigger on external signal change if used dynamically, though zoneless effect handles it cleanly if done right. Leaving false to be safe but efficient in standard templates
})
export class TranslatePipe implements PipeTransform {
    private i18n = inject(I18nService);
    private cdr = inject(ChangeDetectorRef);
    private lastKey = '';
    private lastParams: ParamsBag;
    private lastResult = '';

    constructor() {
        // Create an effect to watch language changes
        effect(() => {
            // Track the dependency
            this.i18n.currentLang();

            // Re-evaluate the current key if we have one
            if (this.lastKey) {
                const newResult = this.i18n.translate(this.lastKey, this.lastParams);
                if (newResult !== this.lastResult) {
                    this.lastResult = newResult;
                    this.cdr.markForCheck();
                }
            }
        });
    }

    transform(key: string, params?: Record<string, string | number>): string {
        if (!key) return '';

        // If key or params change, re-translate
        if (key !== this.lastKey || !paramsEqual(params, this.lastParams)) {
            this.lastKey = key;
            this.lastParams = params;
            this.lastResult = this.i18n.translate(key, params);
        }

        return this.lastResult;
    }

    // Removed ngOnDestroy
}
