import { Component, inject, signal, ChangeDetectionStrategy, effect, computed } from '@angular/core';
import { ActivatedRoute, Router } from '@angular/router';
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
    private router = inject(Router);
    protected i18n = inject(I18nService);

    record = signal<GameRecord | null>(null);
    loading = signal(true);

    replayedState = computed(() => {
        const rec = this.record();
        return rec ? recordToGameState(rec) : null;
    });

    constructor() {
        effect(() => {
            const params = this.route.snapshot.paramMap;
            const id = params.get('id');
            if (id) {
                this.loadRecord(id);
            }
        });
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
