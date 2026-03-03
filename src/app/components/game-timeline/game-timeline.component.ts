import { Component, input, computed, inject, ChangeDetectionStrategy, signal, viewChild, ElementRef, effect } from '@angular/core';
import { CommonModule } from '@angular/common';
import { GameEvent, GamePhase } from '../../models/game-event';
import { TranslatePipe } from '../../i18n/translate.pipe';
import { MarkdownPipe } from '../../pipes/markdown.pipe';
import { I18nService } from '../../i18n/i18n.service';
import { GameEngineService } from '../../services/game-engine.service';
import { LLMProviderRegistryService } from '../../services/llm/llm-provider-registry.service';

interface RoundGroup {
    round: number;
    events: GameEvent[];
    isOpen: boolean;
}

@Component({
    selector: 'app-game-timeline',
    standalone: true,
    imports: [CommonModule, TranslatePipe, MarkdownPipe],
    templateUrl: './game-timeline.component.html',
    styleUrl: './game-timeline.component.scss',
    changeDetection: ChangeDetectionStrategy.OnPush
})
export class GameTimelineComponent {
    events = input.required<GameEvent[]>();
    playerRoles = input<Record<string, { role: string; team: string }>>();
    perspectiveId = input<string | null>(null);
    isGodView = input<boolean>(true);

    private i18n = inject(I18nService);
    private gameEngine = inject(GameEngineService);
    private llmRegistry = inject(LLMProviderRegistryService);

    showGodView = computed(() => this.isGodView() || !this.perspectiveId());
    isUpdatingNotes = this.gameEngine.isUpdatingNotes;
    updatingNotePlayerNames = computed(() => this.gameEngine.updatingNotePlayerIds().map(id => this.getPlayerName(id)));

    getPlayerName(id: string): string {
        const p = this.gameEngine.state().players.find(p => p.agent.id === id);
        return p ? p.agent.name : id;
    }

    autoScrollEnabled = signal(true);
    scrollFrame = viewChild<ElementRef<HTMLDivElement>>('scrollFrame');

    selectedPromptText = signal<string | null>(null);
    selectedReasoningText = signal<string | null>(null);
    selectedRetryLogs = signal<string[] | null>(null);
    promptDialog = viewChild<ElementRef<HTMLDialogElement>>('promptDialog');
    reasoningDialog = viewChild<ElementRef<HTMLDialogElement>>('reasoningDialog');
    retryLogsDialog = viewChild<ElementRef<HTMLDialogElement>>('retryLogsDialog');

    openPromptDialog(text: string) {
        this.selectedPromptText.set(text);
        this.promptDialog()?.nativeElement.showModal();
    }

    closePromptDialog() {
        this.promptDialog()?.nativeElement.close();
        this.selectedPromptText.set(null);
    }

    openReasoningDialog(reasoning?: string, thought?: string) {
        const text = thought?.trim();
        if (!text) return;

        this.selectedReasoningText.set(text);
        this.reasoningDialog()?.nativeElement.showModal();
    }

    closeReasoningDialog() {
        this.reasoningDialog()?.nativeElement.close();
        this.selectedReasoningText.set(null);
    }

    openRetryLogsDialog(logs: string[]) {
        this.selectedRetryLogs.set(logs);
        this.retryLogsDialog()?.nativeElement.showModal();
    }

    closeRetryLogsDialog() {
        this.retryLogsDialog()?.nativeElement.close();
        this.selectedRetryLogs.set(null);
    }

    onDialogClick(event: MouseEvent) {
        if (event.target === this.promptDialog()?.nativeElement) {
            this.closePromptDialog();
        }
        if (event.target === this.reasoningDialog()?.nativeElement) {
            this.closeReasoningDialog();
        }
        if (event.target === this.retryLogsDialog()?.nativeElement) {
            this.closeRetryLogsDialog();
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

    onRetry(event: GameEvent) {
        this.gameEngine.retryEvent(event);
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
        if (rawEvents.length === 0) return [];

        // Map rounds to groups to ensure uniqueness
        const groupMap = new Map<number, RoundGroup>();
        const orderedRounds: number[] = [];

        let lastKnownRound = 1;
        rawEvents.forEach(e => {
            const eRound = ('round' in e && e.round !== undefined) ? (e.round as number) : lastKnownRound;
            lastKnownRound = eRound;

            if (!groupMap.has(eRound)) {
                const group = { round: eRound, events: [], isOpen: false };
                groupMap.set(eRound, group);
                orderedRounds.push(eRound);
            }
            groupMap.get(eRound)!.events.push(e);
        });

        const groups = orderedRounds.map(r => groupMap.get(r)!);
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

    shouldShowNote(event: GameEvent, noteKey: string): boolean {
        const perspectiveId = this.perspectiveId();
        if (perspectiveId) {
            // In Player Perspective, only show notes belonging to that player
            return noteKey === perspectiveId;
        }
        // God View: show the sender's note for each event to keep it consistent
        const senderId = (event as any).playerId || (event as any).leaderId;
        return noteKey === senderId;
    }

    getAgentModelName(name: string): string | undefined {
        const p = this.gameEngine.state().players.find(p => p.agent.name === name);
        return p?.agent.modelName;
    }
}
