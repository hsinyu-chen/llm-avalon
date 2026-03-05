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
    playerCount = input<number>(5);

    missionTrack = computed(() => {
        const track = Array(5).fill('PENDING');
        this.missions().forEach((m, i) => {
            track[i] = m.succeeded ? 'SUCCESS' : 'FAIL';
        });
        return track;
    });

    missionRequirements = computed(() => {
        const pc = this.playerCount();
        // Standard Avalon Mission Chart: [size, failsRequired]
        const charts: Record<number, [number, number][]> = {
            5: [[2, 1], [3, 1], [2, 1], [3, 1], [3, 1]],
            6: [[2, 1], [3, 1], [4, 1], [3, 1], [4, 1]],
            7: [[2, 1], [3, 1], [3, 1], [4, 2], [4, 1]],
            8: [[3, 1], [4, 1], [4, 1], [5, 2], [5, 1]],
            9: [[3, 1], [4, 1], [4, 1], [5, 2], [5, 1]],
            10: [[3, 1], [4, 1], [4, 1], [5, 2], [5, 1]]
        };
        const config = charts[pc] || charts[5];
        return config.map((c, i) => {
            const m = this.missions()[i];
            return {
                size: c[0],
                failsRequired: c[1],
                actualFails: m ? m.failsCount : 0,
                status: this.missionTrack()[i]
            };
        });
    });
}
