import { Component, input, output, ChangeDetectionStrategy } from '@angular/core';
import { PlayerState } from '../../models/game-state';
import { NgClass, DecimalPipe } from '@angular/common';
import { ROLE_META } from '../../models/role';
import { TranslatePipe } from '../../i18n/translate.pipe';

@Component({
    selector: 'app-player-list',
    standalone: true,
    imports: [NgClass, TranslatePipe, DecimalPipe],
    templateUrl: './player-list.component.html',
    styleUrl: './player-list.component.scss',
    changeDetection: ChangeDetectionStrategy.OnPush
})
export class PlayerListComponent {
    players = input.required<PlayerState[]>();
    leaderIndex = input.required<number>();
    proposedIds = input.required<string[]>();
    layout = input<'grid' | 'vertical'>('grid');
    playerClick = output<PlayerState>();

    protected readonly ROLE_META = ROLE_META;
}
