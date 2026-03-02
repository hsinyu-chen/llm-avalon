import { Component, input, output, ChangeDetectionStrategy } from '@angular/core';
import { PlayerState } from '../../models/game-state';
import { DecimalPipe } from '@angular/common';
import { Role, Team, ROLE_META } from '../../models/role';
import { TranslatePipe } from '../../i18n/translate.pipe';
import { inject } from '@angular/core';
import { GameEngineService } from '../../services/game-engine.service';

@Component({
    selector: 'app-player-list',
    standalone: true,
    imports: [TranslatePipe, DecimalPipe],
    templateUrl: './player-list.component.html',
    styleUrl: './player-list.component.scss',
    changeDetection: ChangeDetectionStrategy.OnPush
})
export class PlayerListComponent {
    players = input.required<PlayerState[]>();
    leaderIndex = input.required<number>();
    proposedIds = input.required<string[]>();
    layout = input<'grid' | 'vertical'>('grid');
    perspectiveId = input<string | null>(null);
    playerClick = output<PlayerState>();

    private gameEngine = inject(GameEngineService);

    getVisibleInfo(p: PlayerState) {
        return this.gameEngine.getVisibleRoleInfo(this.perspectiveId(), p);
    }

    protected readonly ROLE_META = ROLE_META;
    protected readonly Team = Team;
}
