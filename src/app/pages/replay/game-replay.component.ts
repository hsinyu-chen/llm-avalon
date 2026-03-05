import { Component, inject, signal, ChangeDetectionStrategy, effect, computed } from '@angular/core';
import { ActivatedRoute, Router } from '@angular/router';
import { toSignal } from '@angular/core/rxjs-interop';
import { GameRecordService } from '../../services/game-record.service';
import { GameRecord } from '../../models/game-record';
import { GameBoardComponent } from '../../components/game-board/game-board.component';
import { TranslatePipe } from '../../i18n/translate.pipe';
import { I18nService } from '../../i18n/i18n.service';
import { DatePipe } from '@angular/common';
import { recordToGameState } from '../../utils/record-converter';

@Component({
    selector: 'app-game-replay',
    standalone: true,
    imports: [GameBoardComponent, TranslatePipe, DatePipe],
    templateUrl: './game-replay.component.html',
    styleUrl: './game-replay.component.scss',
    changeDetection: ChangeDetectionStrategy.OnPush
})
export class GameReplayComponent {
    private recordService = inject(GameRecordService);
    private route = inject(ActivatedRoute);
    private queryParams = toSignal(this.route.queryParamMap);
    private routeParams = toSignal(this.route.paramMap);
    private router = inject(Router);
    protected i18n = inject(I18nService);

    record = signal<GameRecord | null>(null);
    loading = signal(true);
    loadError = signal<string | null>(null);

    replayedState = computed(() => {
        const rec = this.record();
        return rec ? recordToGameState(rec) : null;
    });

    constructor() {
        effect(() => {
            const fileUrl = this.queryParams()?.get('file');

            if (fileUrl) {
                this.loadFromUrl(fileUrl);
                return;
            }

            const id = this.routeParams()?.get('id');
            if (id) {
                this.loadRecord(id);
            }
        });
    }

    private async loadFromUrl(url: string) {
        this.loading.set(true);
        this.loadError.set(null);
        try {
            const response = await fetch(url);
            if (!response.ok) {
                throw new Error(`HTTP ${response.status}: ${response.statusText}`);
            }
            const data: GameRecord = (await response.json())[0];
            this.record.set(data);
        } catch (err) {
            const message = err instanceof Error ? err.message : 'Unknown error';
            this.loadError.set(`Failed to load replay from URL: ${message}`);
        } finally {
            this.loading.set(false);
        }
    }

    private async loadRecord(id: string) {
        this.loading.set(true);
        const record = await this.recordService.getById(id);
        if (record) {
            this.record.set(record);
        }
        this.loading.set(false);
    }

    goBack() {
        this.router.navigate(['/history']);
    }
}
