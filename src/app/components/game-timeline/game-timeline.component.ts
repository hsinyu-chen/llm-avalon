import { Component, input, computed, inject, ChangeDetectionStrategy, signal, viewChild, ElementRef, effect } from '@angular/core';
import { CommonModule } from '@angular/common';
import { GameEvent, GamePhase } from '../../models/game-event';
import { TranslatePipe } from '../../i18n/translate.pipe';
import { I18nService } from '../../i18n/i18n.service';

interface RoundGroup {
    round: number;
    events: GameEvent[];
    isOpen: boolean;
}

@Component({
    selector: 'app-game-timeline',
    standalone: true,
    imports: [CommonModule, TranslatePipe],
    templateUrl: './game-timeline.component.html',
    styleUrl: './game-timeline.component.scss',
    changeDetection: ChangeDetectionStrategy.OnPush
})
export class GameTimelineComponent {
    events = input.required<GameEvent[]>();
    playerRoles = input<Record<string, { role: string; team: string }>>();
    private i18n = inject(I18nService);

    autoScrollEnabled = signal(true);
    scrollFrame = viewChild<ElementRef<HTMLDivElement>>('scrollFrame');

    selectedPromptText = signal<string | null>(null);
    promptDialog = viewChild<ElementRef<HTMLDialogElement>>('promptDialog');

    openPromptDialog(text: string) {
        this.selectedPromptText.set(text);
        this.promptDialog()?.nativeElement.showModal();
    }

    closePromptDialog() {
        this.promptDialog()?.nativeElement.close();
        this.selectedPromptText.set(null);
    }

    onDialogClick(event: MouseEvent) {
        if (event.target === this.promptDialog()?.nativeElement) {
            this.closePromptDialog();
        }
    }

    constructor() {
        effect(() => {
            this.events(); // Track event changes

            if (!this.autoScrollEnabled()) return;

            const container = this.scrollFrame()?.nativeElement;
            if (!container) return;

            // Wait for DOM to update
            setTimeout(() => {
                container.scrollTo({
                    top: container.scrollHeight,
                    behavior: 'smooth'
                });
            }, 100);
        });
    }

    onUserInteraction() {
        if (this.autoScrollEnabled()) {
            this.autoScrollEnabled.set(false);
        }
    }

    resumeAutoScroll() {
        this.autoScrollEnabled.set(true);
        const container = this.scrollFrame()?.nativeElement;
        if (container) {
            container.scrollTo({
                top: container.scrollHeight,
                behavior: 'smooth'
            });
        }
    }

    groupedEvents = computed(() => {
        const rawEvents = this.events();
        const groups: RoundGroup[] = [];

        if (rawEvents.length === 0) return [];

        let currentGroup: RoundGroup | null = null;

        rawEvents.forEach(e => {
            const eRound = ('round' in e && e.round !== undefined) ? e.round : (currentGroup?.round || 1);
            const r = eRound;

            if (!currentGroup || currentGroup.round !== r) {
                currentGroup = { round: r, events: [], isOpen: false };
                groups.push(currentGroup);
            }
            currentGroup.events.push(e);
        });

        if (groups.length > 0) {
            groups[groups.length - 1].isOpen = true;
        }

        return groups;
    });

    getPhaseName(phase: GamePhase): string {
        const phaseNames: Record<string, string> = {
            [GamePhase.Night]: this.i18n.translate('board.currentPhase') + ' ' + GamePhase.Night,
            [GamePhase.TeamProposal]: this.i18n.translate('board.proposeBtn'),
            [GamePhase.Discussion]: this.i18n.translate('board.chat'),
            [GamePhase.Vote]: this.i18n.translate('timeline.vote'),
            [GamePhase.Mission]: this.i18n.translate('timeline.missionLabel'),
            [GamePhase.MissionDebrief]: this.i18n.translate('timeline.missionReview'),
            [GamePhase.AssassinationDiscussion]: this.i18n.translate('engine.assassinDiscussionPhase'),
            [GamePhase.Assassination]: this.i18n.translate('board.assassinateBtn'),
            [GamePhase.GameDebrief]: this.i18n.translate('timeline.gameDebrief'),
            [GamePhase.GameOver]: this.i18n.translate('timeline.gameOver')
        };
        return phaseNames[phase] || phase;
    }

    getAvatarColor(name: string): string {
        let hash = 0;
        for (let i = 0; i < name.length; i++) {
            hash = name.charCodeAt(i) + ((hash << 5) - hash);
        }
        const hue = Math.abs(hash % 360);
        return `hsl(${hue}, 60%, 50%)`;
    }

    getPlayerRoleInfo(name: string) {
        return this.playerRoles()?.[name];
    }
}
