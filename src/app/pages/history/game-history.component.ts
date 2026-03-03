import { Component, inject, ChangeDetectionStrategy, viewChild, ElementRef } from '@angular/core';
import { Router } from '@angular/router';
import { GameRecordService } from '../../services/game-record.service';
import { TranslatePipe } from '../../i18n/translate.pipe';
import { I18nService } from '../../i18n/i18n.service';
import { DatePipe, DecimalPipe } from '@angular/common';

@Component({
    selector: 'app-game-history',
    standalone: true,
    imports: [TranslatePipe, DatePipe, DecimalPipe],
    templateUrl: './game-history.component.html',
    styleUrl: './game-history.component.scss',
    changeDetection: ChangeDetectionStrategy.OnPush
})
export class GameHistoryComponent {
    private recordService = inject(GameRecordService);
    private router = inject(Router);
    protected i18n = inject(I18nService);

    records = this.recordService.records;
    fileInput = viewChild<ElementRef<HTMLInputElement>>('fileInput');

    openRecord(id: string) {
        this.router.navigate(['/history', id]);
    }

    deleteRecord(event: MouseEvent, id: string) {
        event.stopPropagation();
        if (confirm(this.i18n.translate('history.confirmDelete'))) {
            this.recordService.delete(id);
        }
    }

    goToGame() {
        this.router.navigate(['/']);
    }

    exportAll() {
        this.recordService.exportAll();
    }

    exportRecord(event: MouseEvent, id: string) {
        event.stopPropagation();
        this.recordService.exportRecord(id);
    }

    triggerImport() {
        this.fileInput()?.nativeElement.click();
    }

    async onFileSelected(event: Event) {
        const input = event.target as HTMLInputElement;
        const file = input.files?.[0];
        if (!file) return;
        try {
            const count = await this.recordService.importRecords(file);
            alert(this.i18n.translate('history.importSuccess', { count: String(count) }));
        } catch {
            alert(this.i18n.translate('history.importError'));
        }
        input.value = '';
    }

    formatTokens(n: number): string {
        if (n >= 1_000_000) return (n / 1_000_000).toFixed(1) + 'M';
        if (n >= 1_000) return (n / 1_000).toFixed(1) + 'K';
        return String(n);
    }
}
