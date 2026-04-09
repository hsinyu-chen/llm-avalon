import { Component, inject, computed, signal, effect, ChangeDetectionStrategy, DestroyRef, input, output } from '@angular/core';
import { PlayerState, GameState } from '../../models/game-state';
import { PlayerListComponent } from '../player-list/player-list.component';
import { GameTimelineComponent } from '../game-timeline/game-timeline.component';
import { NgClass, DecimalPipe } from '@angular/common';
import { ROLE_META } from '../../models/role';
import { GameEvent, GamePhase } from '../../models/game-event';
import { TranslatePipe } from '../../i18n/translate.pipe';
import { MarkdownPipe } from '../../pipes/markdown.pipe';
import { I18nService } from '../../i18n/i18n.service';
import { ScoreboardComponent } from './scoreboard/scoreboard.component';
import { StatusPanelComponent } from './status-panel/status-panel.component';
import { HumanInteractionComponent } from './human-interaction/human-interaction.component';

@Component({
    selector: 'app-game-board',
    standalone: true,
    imports: [
        PlayerListComponent,
        GameTimelineComponent,
        ScoreboardComponent,
        StatusPanelComponent,
        HumanInteractionComponent,
        NgClass,
        TranslatePipe,
        MarkdownPipe,
        DecimalPipe
    ],
    templateUrl: './game-board.component.html',
    styleUrl: './game-board.component.scss',
    changeDetection: ChangeDetectionStrategy.OnPush
})
export class GameBoardComponent {
    private i18n = inject(I18nService);
    private destroyRef = inject(DestroyRef);

    state = input.required<GameState>();
    isReplay = input<boolean>(false);
    reset = output<void>();

    events = computed(() => this.state().events || []);
    currentRound = computed(() => this.state().currentRound);
    perspectiveId = computed(() => this.state().perspectiveId ?? null);

    selectedPlayer = signal<PlayerState | null>(null);
    copySuccess = signal(false);
    isSideNavCollapsed = signal(false);

    toggleSideNav() {
        this.isSideNavCollapsed.update(v => !v);
    }

    gameHistory = computed(() => {
        const events = this.events();
        const rounds: any[] = [];
        let currentRound: any = null;

        for (const e of events) {
            if (e.type === 'ROUND_START') {
                currentRound = { round: e.round, attempts: [], outcome: null };
                rounds.push(currentRound);
            }
            if (!currentRound) {
                // Handle cases where ROUND_START might be missing but we have events
                if ('round' in e && typeof e.round === 'number') {
                    currentRound = rounds.find(r => r.round === e.round);
                    if (!currentRound) {
                        currentRound = { round: e.round, attempts: [], outcome: null };
                        rounds.push(currentRound);
                    }
                } else {
                    continue;
                }
            }

            if (e.type === 'TEAM_PROPOSAL') {
                currentRound.attempts.push({
                    leaderName: e.leaderName,
                    teamNames: e.teamNames,
                    votes: [],
                    passed: false
                });
            } else if (e.type === 'VOTE_RESULTS') {
                const attempt = currentRound.attempts[currentRound.attempts.length - 1];
                if (attempt) {
                    attempt.votes = e.votes.map(v => ({ name: v.name, approve: v.approve }));
                    attempt.passed = e.passed;
                }
            } else if (e.type === 'MISSION_OUTCOME') {
                currentRound.outcome = {
                    succeeded: e.succeeded,
                    failsCount: e.failsCount,
                    teamNames: e.teamNames
                };
            }
        }
        return rounds;
    });

    getPlayerName(id: string): string {
        const p = this.state().players.find(p => p.agent.id === id);
        return p ? p.agent.name : id;
    }

    getAvatarColor(name: string): string {
        let hash = 0;
        for (let i = 0; i < name.length; i++) {
            hash = name.charCodeAt(i) + ((hash << 5) - hash);
        }
        const h = hash % 360;
        return `hsl(${h}, 70%, 25%)`;
    }
    isDesktop = signal(window.innerWidth >= 1024);

    totalTokenUsage = computed(() => {
        let promptTokens = 0;
        let cachedTokens = 0;
        let completionTokens = 0;
        let totalCost = 0;

        // All usage data from events (single source of truth)
        for (const e of this.events()) {
            promptTokens += e.promptTokens || 0;
            cachedTokens += e.cachedTokens || 0;
            completionTokens += e.completionTokens || 0;
            totalCost += e.cost || 0;
        }

        return { promptTokens, cachedTokens, completionTokens, totalCost };
    });

    constructor() {
        effect(() => {
            if (this.state().phase === GamePhase.GameOver) {
                // Done: Handled by winner-banner in template
            }
        });

        const onResize = () => {
            this.isDesktop.set(window.innerWidth >= 1024);
        };
        window.addEventListener('resize', onResize);
        this.destroyRef.onDestroy(() => {
            window.removeEventListener('resize', onResize);
        });
    }

    playerRoleMap = computed(() => {
        const map: Record<string, { role: string; team: string }> = {};
        for (const p of this.state().players) {
            const meta = ROLE_META[p.role];
            if (meta) {
                map[p.agent.name] = { role: p.role, team: meta.team };
            }
        }
        return map;
    });

    playerSystemInstructions = computed(() => {
        const map: Record<string, string> = {};
        for (const p of this.state().players) {
            const instruction = p.agent.getSystemInstruction?.() || '';
            if (instruction) {
                map[p.agent.name] = instruction;
            }
        }
        return map;
    });


    resetGame() {
        this.reset.emit();
    }


    async copyGameLog() {
        const s = this.state();
        const lines: string[] = [];

        lines.push(`# Avalon Game Log`);
        lines.push(`- **Winner**: ${s.winner ? (s.winner === 'GOOD' ? '🔵 ' + this.i18n.translate('board.good') : '🔴 ' + this.i18n.translate('board.evil')) : 'TBD'}`);
        lines.push(`- **Players**: ${s.players.length}`);
        lines.push(`- **Missions**: ${s.missions.map(m => m.succeeded ? '✅' : '❌').join(' ')}`);
        lines.push('');

        lines.push(`## Players`);
        lines.push(`| Name | Role | Team | Model |`);
        lines.push(`|------|------|------|-------|`);
        for (const p of s.players) {
            const meta = ROLE_META[p.role];
            const team = meta.team === 'GOOD' ? '🔵 ' + this.i18n.translate('board.good') : '🔴 ' + this.i18n.translate('board.evil');
            const model = p.agent.modelName || 'N/A';
            lines.push(`| ${p.agent.name} | ${this.i18n.translate('roles.' + p.role)} | ${team} | ${model} |`);
        }
        lines.push('');

        lines.push(`## Note History`);
        for (const p of s.players) {
            const history = p.agent.getNoteHistory?.();
            if (history && history.length > 0) {
                lines.push(`### ${p.agent.name} (${this.i18n.translate('roles.' + p.role)})`);
                for (const entry of history) {
                    lines.push(`#### Round ${entry.round}`);
                    lines.push(entry.note);
                    lines.push('');
                }
            }
        }
        lines.push('');

        lines.push(`## Timeline`);
        const allEvents = (s.events || []).filter(e => {
            if (e.type === 'SYSTEM' || e.type === 'PHASE_CHANGE' || e.type === 'ROUND_START' || e.type === 'GAME_OVER') return true;
            return e.status === 'success';
        });
        let currentRound = 0;
        for (const e of allEvents) {
            const eRound = ('round' in e && e.round !== undefined) ? e.round : currentRound;
            const round = eRound;
            if (round !== currentRound) {
                currentRound = round;
                lines.push('');
                lines.push(`### Round ${round}`);
            }
            const line = this.formatEventMarkdown(e);
            if (line) lines.push(line);
        }

        const text = lines.join('\n');
        try {
            await navigator.clipboard.writeText(text);
            this.copySuccess.set(true);
            setTimeout(() => this.copySuccess.set(false), 2000);
        } catch {
            console.error('[GameBoard] Clipboard write failed');
        }
    }

    private formatEventMarkdown(e: GameEvent): string {
        let text = this._getEventMarkdownString(e);
        if (text && (e.promptSpeed !== undefined || e.completionSpeed !== undefined)) {
            const speedInfo: string[] = [];
            if (e.promptSpeed !== undefined) speedInfo.push(`PP: ${e.promptSpeed.toFixed(1)} t/s`);
            if (e.completionSpeed !== undefined) speedInfo.push(`Out: ${e.completionSpeed.toFixed(1)} t/s`);
            if (speedInfo.length > 0) text += ` [${speedInfo.join(' | ')}]`;
        }
        return text;
    }

    private _getEventMarkdownString(e: GameEvent): string {
        switch (e.type) {
            case 'PHASE_CHANGE': {
                const phaseNames: Record<string, string> = {
                    [GamePhase.Night]: this.i18n.translate('board.currentPhase') + ' ' + GamePhase.Night,
                    [GamePhase.TeamProposal]: this.i18n.translate('board.proposeBtn'),
                    [GamePhase.Discussion]: this.i18n.translate('board.chat'),
                    [GamePhase.Vote]: this.i18n.translate('timeline.vote'),
                    [GamePhase.Mission]: this.i18n.translate('timeline.missionLabel'),
                    [GamePhase.MissionDebrief]: this.i18n.translate('timeline.missionReview'),
                    [GamePhase.AssassinationDiscussion]: this.i18n.translate('engine.assassinDiscussionPhase'),
                    [GamePhase.Assassination]: this.i18n.translate('timeline.phaseAssassination'),
                    [GamePhase.GameDebrief]: this.i18n.translate('timeline.gameDebrief'),
                    [GamePhase.GameOver]: this.i18n.translate('timeline.gameOver')
                };
                const phaseName = phaseNames[e.phase] || e.phase;
                return `\n**── ${phaseName} ──**`;
            }
            case 'ASSASSINATION': {
                const thoughts: string[] = [];
                if (e.reasoning) thoughts.push(`Reasoning: ${e.reasoning}`);
                const assassinText = this.i18n.translate('board.assassinateBtn');
                let line = `**${e.playerName}** ${assassinText}=> **${e.targetName}**`;
                if (thoughts.length > 0) {
                    line += `\n> *${thoughts.join(' | ')}*`;
                }
                return line;
            }
            case 'DISCUSSION': {
                const thoughts: string[] = [];
                if (e.reasoning) thoughts.push(`Reasoning: ${e.reasoning}`);
                let line = `> **${e.playerName}**: _${e.message || '(PASS)'}_\n`;
                if (thoughts.length > 0) {
                    line += `\n> *${thoughts.join(' | ')}*`;
                }
                if (e.privateNotes && e.privateNotes[e.playerId]) {
                    line += `\n> *Note: ${e.privateNotes[e.playerId]}*`;
                }
                return line;
            }
            case 'TEAM_PROPOSAL':
                let proposalLine = `👑 **${e.leaderName}** proposed: ${e.teamNames.join(', ')}`;
                const pThoughts: string[] = [];
                if (e.reasoning) pThoughts.push(`Reasoning: ${e.reasoning}`);
                if (pThoughts.length > 0) {
                    proposalLine += `\n> *${pThoughts.join(' | ')}*`;
                }
                if (e.privateNotes && e.privateNotes[e.leaderId]) {
                    proposalLine += `\n> *Note: ${e.privateNotes[e.leaderId]}*`;
                }
                return proposalLine;
            case 'VOTE_RESULTS': {
                const result = e.passed ? '✅ PASSED' : '❌ REJECTED';
                const team = e.teamNames ? ` [${e.teamNames.join(', ')}]` : '';
                const votes = e.votes.map(v => {
                    const vRes = `${v.name}:${v.approve ? '⚪' : '⚫'}`;
                    const vThoughts: string[] = [];
                    if (v.reasoning) vThoughts.push(`R:${v.reasoning}`);
                    return vRes + (vThoughts.length > 0 ? ` (*${vThoughts.join(' | ')}*)` : '');
                }).join(' ');
                return `🗳 ${result}${team} — ${votes}`;
            }
            case 'MISSION_OUTCOME': {
                const icon = e.succeeded ? '🏆' : '💀';
                let res = `${icon} Mission ${e.succeeded ? 'SUCCESS' : 'FAIL'} (fails: ${e.failsCount}) — Team: ${e.teamNames.join(', ')}`;
                if (e.reasonings && e.reasonings.length > 0) {
                    res += '\n' + e.reasonings.map(r => {
                        const rThoughts: string[] = [];
                        if (r.reasoning) rThoughts.push(`Reasoning: ${r.reasoning}`);
                        return `> **${r.name}**: ${rThoughts.join(' | ')}`;
                    }).join('\n');
                }
                return res;
            }
            case 'SYSTEM':
                if (e.subType === 'PLAYER_PASS' || e.subType === 'PLAYER_FINISH' || e.subType === 'FORCED_PASS') return '';
                return `ℹ️ ${e.message}`;
            case 'GAME_OVER':
                return `\n🏁 **GAME OVER** — ${e.winner === 'GOOD' ? 'Good wins' : 'Evil wins'}: ${e.reason}`;
            case 'GAME_DEBRIEF': {
                let res = `💬 **${e.playerName} (${this.i18n.translate('board.debrief')})**: ${e.message}`;
                const dThoughts: string[] = [];
                if (e.reasoning) dThoughts.push(`Reasoning: ${e.reasoning}`);
                if (dThoughts.length > 0) {
                    res += `\n> *${dThoughts.join(' | ')}*`;
                }
                if (e.privateNotes && e.privateNotes[e.playerId]) {
                    res += `\n> *Note: ${e.privateNotes[e.playerId]}*`;
                }
                return res;
            }
            default:
                return '';
        }
    }

    protected readonly ROLE_META = ROLE_META;
}
