import { Directive, ElementRef, inject, effect, input } from '@angular/core';
import { I18nService } from './i18n.service';

@Directive({
    // eslint-disable-next-line @angular-eslint/directive-selector
    selector: '[translate]',
    standalone: true
})
export class TranslateDirective {
    key = input<string>('', { alias: 'translate' });
    translateParams = input<Record<string, string | number> | undefined>();

    private el = inject(ElementRef);
    private i18n = inject(I18nService);

    constructor() {
        effect(() => {
            this.i18n.currentLang(); // Track language changes
            this.updateText();
        });
    }

    private updateText() {
        if (!this.key()) return;
        const translated = this.i18n.translate(this.key(), this.translateParams());
        this.el.nativeElement.textContent = translated;
    }
}
