import { Component, inject, signal, ChangeDetectionStrategy, effect } from '@angular/core';
import { ActivatedRoute, Router } from '@angular/router';
import { GameRecordService } from '../../services/game-record.service';
import { GameRecord } from '../../models/game-record';
import { GameTimelineComponent } from '../../components/game-timeline/game-timeline.component';
import { TranslatePipe } from '../../i18n/translate.pipe';
import { I18nService } from '../../i18n/i18n.service';
import { DatePipe } from '@angular/common';

@Component({
    selector: 'app-game-replay',
    standalone: true,
    imports: [GameTimelineComponent, TranslatePipe, DatePipe],
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

    playerRoles = signal<Record<string, { role: string; team: string }>>({});

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
            const roles: Record<string, { role: string; team: string }> = {};
            for (const p of record.players) {
                roles[p.name] = { role: p.role, team: p.team };
            }
            this.playerRoles.set(roles);
        }
        this.loading.set(false);
    }

    goBack() {
        this.router.navigate(['/history']);
    }
}
