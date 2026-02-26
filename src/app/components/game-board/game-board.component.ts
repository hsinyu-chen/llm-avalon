import { Component, inject, computed, signal, effect, ChangeDetectionStrategy, DestroyRef } from '@angular/core';
import { GameEngineService } from '../../services/game-engine.service';
import { PlayerState } from '../../models/game-state';
import { PlayerListComponent } from '../player-list/player-list.component';
import { GameTimelineComponent } from '../game-timeline/game-timeline.component';
import { NgClass, DecimalPipe } from '@angular/common';
import { ROLE_META } from '../../models/role';
import { GameEvent, GamePhase } from '../../models/game-event';
import { TranslatePipe } from '../../i18n/translate.pipe';
import { I18nService } from '../../i18n/i18n.service';
import { ScoreboardComponent } from './scoreboard/scoreboard.component';
import { StatusPanelComponent } from './status-panel/status-panel.component';

@Component({
    selector: 'app-game-board',
    standalone: true,
    imports: [
        PlayerListComponent,
        GameTimelineComponent,
        ScoreboardComponent,
        StatusPanelComponent,
        NgClass,
        TranslatePipe,
        DecimalPipe
    ],
    templateUrl: './game-board.component.html',
    styleUrl: './game-board.component.scss',
    changeDetection: ChangeDetectionStrategy.OnPush
})
export class GameBoardComponent {
    private engine = inject(GameEngineService);
    private i18n = inject(I18nService);
    private destroyRef = inject(DestroyRef);

    state = this.engine.state;
    events = computed(() => this.state().events || []);
    currentRound = this.engine.currentRound;

    selectedPlayer = signal<PlayerState | null>(null);
    copySuccess = signal(false);
    isDesktop = signal(window.innerWidth >= 1024);

    totalTokenUsage = computed(() => {
        let promptTokens = 0;
        let cachedTokens = 0;
        let completionTokens = 0;
        let totalCost = 0;
        for (const p of this.state().players) {
            if (p.agent.getTokenUsage) {
                const usage = p.agent.getTokenUsage();
                if (usage) {
                    promptTokens += usage.promptTokens || 0;
                    cachedTokens += usage.cachedTokens || 0;
                    completionTokens += usage.completionTokens || 0;
                    totalCost += usage.totalCost || 0;
                }
            }
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


    reset() {
        this.engine.reset();
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
        lines.push(`| Name | Role | Team | Model | Note |`);
        lines.push(`|------|------|------|-------|------|`);
        for (const p of s.players) {
            const meta = ROLE_META[p.role];
            const team = meta.team === 'GOOD' ? '🔵 ' + this.i18n.translate('board.good') : '🔴 ' + this.i18n.translate('board.evil');
            const model = p.agent.modelName || 'N/A';
            const note = (p.agent.getPersonalNote() || '').replace(/\|/g, '\\|').replace(/\n/g, ' ');
            lines.push(`| ${p.agent.name} | ${this.i18n.translate('roles.' + p.role)} | ${team} | ${model} | ${note} |`);
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
                if (e.reasoning) thoughts.push(e.reasoning);
                const assassinText = this.i18n.translate('board.assassinateBtn');
                let line = `**${e.playerName}** ${assassinText}=> **${e.targetName}**`;
                if (thoughts.length > 0) {
                    line += `\n> *COT: ${thoughts.join(' | ')}*`;
                }
                return line;
            }
            case 'DISCUSSION': {
                const thoughts: string[] = [];
                if (e.reasoning) thoughts.push(e.reasoning);
                let line = `> **${e.playerName}**: _${e.message || '(PASS)'}_\n`;
                if (thoughts.length > 0) {
                    line += `\n> *COT: ${thoughts.join(' | ')}*`;
                }
                if (e.privateNotes && e.privateNotes[e.playerId]) {
                    line += `\n> *${e.privateNotes[e.playerId]}*`;
                }
                return line;
            }
            case 'TEAM_PROPOSAL':
                let proposalLine = `👑 **${e.leaderName}** proposed: ${e.teamNames.join(', ')}${e.reasoning ? ` (*${e.reasoning}*)` : ''}`;
                if (e.privateNotes && e.privateNotes[e.leaderId]) {
                    proposalLine += `\n> *${e.privateNotes[e.leaderId]}*`;
                }
                return proposalLine;
            case 'VOTE_RESULTS': {
                const result = e.passed ? '✅ PASSED' : '❌ REJECTED';
                const team = e.teamNames ? ` [${e.teamNames.join(', ')}]` : '';
                const votes = e.votes.map(v => `${v.name}:${v.approve ? '⚪' : '⚫'}${v.reasoning ? ` (*${v.reasoning}*)` : ''}`).join(' ');
                return `🗳 ${result}${team} — ${votes}`;
            }
            case 'MISSION_OUTCOME': {
                const icon = e.succeeded ? '🏆' : '💀';
                let res = `${icon} Mission ${e.succeeded ? 'SUCCESS' : 'FAIL'} (fails: ${e.failsCount}) — Team: ${e.teamNames.join(', ')}`;
                if (e.reasonings && e.reasonings.length > 0) {
                    res += '\n' + e.reasonings.map(r => `> **${r.name}** (${this.i18n.translate('timeline.reasoning')}): ${r.reasoning}`).join('\n');
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
                if (e.privateNotes && e.privateNotes[e.playerId]) {
                    res += `\n> *${e.privateNotes[e.playerId]}*`;
                }
                return res;
            }
            default:
                return '';
        }
    }

    protected readonly ROLE_META = ROLE_META;
}
