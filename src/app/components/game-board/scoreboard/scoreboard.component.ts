import { Component, input, computed, ChangeDetectionStrategy } from '@angular/core';
import { NgClass } from '@angular/common';

@Component({
    selector: 'app-scoreboard',
    standalone: true,
    imports: [NgClass],
    templateUrl: './scoreboard.component.html',
    styleUrl: './scoreboard.component.scss',
    changeDetection: ChangeDetectionStrategy.OnPush
})
export class ScoreboardComponent {
    missions = input.required<any[]>();
    currentRound = input.required<number>();

    missionTrack = computed(() => {
        const track = Array(5).fill('PENDING');
        this.missions().forEach((m, i) => {
            track[i] = m.succeeded ? 'SUCCESS' : 'FAIL';
        });
        return track;
    });
}
