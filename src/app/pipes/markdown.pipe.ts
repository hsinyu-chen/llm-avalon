import { Pipe, PipeTransform, inject } from '@angular/core';
import { DomSanitizer, SafeHtml } from '@angular/platform-browser';
import { marked } from 'marked';

@Pipe({
    name: 'markdown',
    standalone: true
})
export class MarkdownPipe implements PipeTransform {
    private sanitizer = inject(DomSanitizer);

    transform(value: string | null | undefined): SafeHtml {
        if (!value) return '';

        // marked.parse(value) is synchronous if no async extensions are used.
        const html = marked.parse(value, {
            breaks: true,
            gfm: true,
        }) as string;

        return this.sanitizer.bypassSecurityTrustHtml(html);
    }
}
