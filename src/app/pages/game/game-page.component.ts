import { Component, inject, ChangeDetectionStrategy } from '@angular/core';
import { GameEngineService } from '../../services/game-engine.service';
import { GameSetupComponent } from '../../components/game-setup/game-setup.component';
import { GameBoardComponent } from '../../components/game-board/game-board.component';

@Component({
    selector: 'app-game-page',
    standalone: true,
    imports: [GameSetupComponent, GameBoardComponent],
    template: `
        @if (phase() === 'SETUP') {
            <app-game-setup></app-game-setup>
        } @else {
            <app-game-board [state]="engine.state()" (reset)="engine.reset()"></app-game-board>
        }
    `,
    styles: [`:host { display: flex; flex-direction: column; flex: 1; overflow: hidden; }`],
    changeDetection: ChangeDetectionStrategy.OnPush
})
export class GamePageComponent {
    protected engine = inject(GameEngineService);
    phase = this.engine.phase;
}
