import { Component, inject, computed, ChangeDetectionStrategy, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { HumanInteractionService } from '../../../services/human-interaction.service';
import { I18nService } from '../../../i18n/i18n.service';
import { TranslatePipe } from '../../../i18n/translate.pipe';
import { GameEngineService } from '../../../services/game-engine.service';
import { Team } from '../../../models/role';
import { SignalType } from '../../../models/agent.interface';

@Component({
    selector: 'app-human-interaction',
    standalone: true,
    imports: [CommonModule, TranslatePipe],
    templateUrl: './human-interaction.component.html',
    styleUrl: './human-interaction.component.scss',
    changeDetection: ChangeDetectionStrategy.OnPush
})
export class HumanInteractionComponent {
    private interactionService = inject(HumanInteractionService);
    private i18n = inject(I18nService);
    private engine = inject(GameEngineService);

    currentRequest = this.interactionService.currentRequest;
    gameState = this.engine.state;

    messageInput = signal('');
    selectedPlayerIds = signal<string[]>([]);

    signalTarget = signal<string>('none');
    signalType = signal<SignalType>(SignalType.None);

    protected readonly SignalType = SignalType;

    remainingRounds = computed(() => {
        const req = this.currentRequest();
        if (req && req.type === 'speak') {
            const ctx = req.context;
            return ctx.maxDiscussionRounds - ctx.discussionRound + 1;
        }
        return 0;
    });

    // Helpers for template
    get players() {
        return this.gameState().players;
    }

    get isEvil() {
        const pid = this.gameState().perspectiveId;
        if (!pid) return false;
        const player = this.players.find(p => p.agent.id === pid);
        return player?.role === 'ASSASSIN' || player?.role === 'MORGANA' || player?.role === 'MORDRED' || player?.role === 'MINION';
    }

    updateMessage(event: Event) {
        const input = event.target as HTMLTextAreaElement;
        this.messageInput.set(input.value);
    }

    togglePlayerSelection(id: string) {
        const current = this.selectedPlayerIds();
        if (current.includes(id)) {
            this.selectedPlayerIds.set(current.filter(i => i !== id));
        } else {
            const req = this.currentRequest();
            if (req && req.type === 'propose') {
                const required = req.context.teamSize || 99;
                if (current.length < required) {
                    this.selectedPlayerIds.set([...current, id]);
                }
            } else if (req && req.type === 'assassinate') {
                if (current.length < 1) {
                    this.selectedPlayerIds.set([...current, id]);
                }
            }
        }
    }

    onSpeak() {
        const req = this.currentRequest();
        if (req && req.type === 'speak') {
            this.interactionService.resolveAction({
                self_check: '',
                reasoning: '',
                situation_assessment: '',
                action_strategy: '',
                action: {
                    speech: this.messageInput(),
                    readyToVote: false, // Don't end turn yet
                    pass_hidden_signal: {
                        target: this.signalTarget(),
                        signal: this.signalType()
                    }
                }
            });
            this.messageInput.set('');
            // Reset signals after one send? Or keep them? Logic says reset after use.
            this.signalTarget.set('none');
            this.signalType.set(SignalType.None);
        }
    }

    onPass() {
        const req = this.currentRequest();
        if (req && req.type === 'speak') {
            this.interactionService.resolveAction({
                self_check: '',
                reasoning: '',
                situation_assessment: '',
                action_strategy: '',
                action: {
                    speech: this.messageInput(),
                    readyToVote: true, // End turn
                    pass_hidden_signal: {
                        target: this.signalTarget(),
                        signal: this.signalType()
                    }
                }
            });
            this.messageInput.set('');
            this.signalTarget.set('none');
            this.signalType.set(SignalType.None);
        }
    }

    onVote(approve: boolean) {
        this.interactionService.resolveAction({
            self_check: '',
            reasoning: '',
            situation_assessment: '',
            action_strategy: '',
            action: {
                voteChoice: approve
            }
        });
    }

    onPropose() {
        this.interactionService.resolveAction({
            self_check: '',
            reasoning: '',
            situation_assessment: '',
            action_strategy: '',
            action: {
                teamMemberIds: this.selectedPlayerIds()
            }
        });
        this.selectedPlayerIds.set([]);
    }

    onMission(succeeded: boolean) {
        this.interactionService.resolveAction({
            self_check: '',
            reasoning: '',
            situation_assessment: '',
            action_strategy: '',
            action: {
                playedMissionResult: succeeded
            }
        });
    }

    onAssassinate() {
        if (this.selectedPlayerIds().length === 1) {
            this.interactionService.resolveAction({
                self_check: '',
                reasoning: '',
                situation_assessment: '',
                action_strategy: '',
                action: {
                    targetId: this.selectedPlayerIds()[0]
                }
            });
            this.selectedPlayerIds.set([]);
        }
    }
}
