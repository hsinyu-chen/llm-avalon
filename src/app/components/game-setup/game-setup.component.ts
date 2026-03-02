import { Component, inject, signal, linkedSignal, computed, ChangeDetectionStrategy } from '@angular/core';
import { CommonModule, DecimalPipe } from '@angular/common';
import { GameEngineService } from '../../services/game-engine.service';
import { LLMManagerService } from '../../services/llm/llm-manager.service';
import { I18nService } from '../../i18n/i18n.service';
import { TranslatePipe } from '../../i18n/translate.pipe';
import { PredictionService } from '../../services/prediction.service';
import { Role } from '../../models/role';
import { LLMPricingRates } from '../../services/llm/llm-provider';
import { RandomAgent } from '../../agents/random-agent';
import { LLMAgent } from '../../agents/llm-agent';
import { HumanAgent } from '../../agents/human-agent';
import { HumanInteractionService } from '../../services/human-interaction.service';
import { FormsModule } from '@angular/forms';

interface PlayerAgentConfig {
    id: string;
    name: string;
    type: 'random' | 'llm' | 'human';
    configId: string;
}

import { TRANSLATIONS } from '../../i18n/translations';

@Component({
    selector: 'app-game-setup',
    standalone: true,
    imports: [FormsModule, TranslatePipe, DecimalPipe],
    templateUrl: './game-setup.component.html',
    styleUrl: './game-setup.component.scss',
    changeDetection: ChangeDetectionStrategy.OnPush
})
export class GameSetupComponent {
    private engine = inject(GameEngineService);
    private llmManager = inject(LLMManagerService);
    public i18n = inject(I18nService);
    private prediction = inject(PredictionService);
    private humanInteraction = inject(HumanInteractionService);

    playerCount = signal(7);
    llmConfigs = this.llmManager.configs;

    getAgentCostEstimate(configId: string) {
        if (!configId) return null;
        const config = this.llmConfigs().find(c => c.id === configId);
        if (!config) return null;

        return this.prediction.getCostFromConfig(config);
    }

    playerAgents = linkedSignal<number, PlayerAgentConfig[]>({
        source: this.playerCount,
        computation: (count) => {
            const defConfig = this.llmConfigs().find(c => c.isDefault) || this.llmConfigs()[0];
            const defId = defConfig?.id || '';

            const names = this.getRandomNames(count);

            return Array.from({ length: count }, (_, i) => ({
                id: `p${i + 1}`,
                name: names[i],
                type: 'random',
                configId: defId
            }));
        }
    });

    private getRandomNames(count: number): string[] {
        const lang = this.i18n.currentLangValue;
        const pool = TRANSLATIONS[lang].namePool;
        const shuffled = [...pool].sort(() => Math.random() - 0.5);
        return shuffled.slice(0, count);
    }

    updateName(index: number, name: string) {
        this.updateAgent(index, { name });
    }

    allAgentsConfigured = computed(() => {
        return this.playerAgents().every(pa =>
            pa.type === 'random' ||
            pa.type === 'human' ||
            (pa.type === 'llm' && pa.configId)
        );
    });

    applyBulk(configId: string) {
        if (!configId) return;
        this.playerAgents.update(agents => agents.map(a => {
            return { ...a, type: 'llm', configId };
        }));
    }

    updateAgent(index: number, patch: Partial<PlayerAgentConfig>) {
        this.playerAgents.update(agents => {
            let newAgents = [...agents];

            // If setting to human, make sure no other player is human
            if (patch.type === 'human') {
                newAgents = newAgents.map((a, i) => {
                    if (i !== index && a.type === 'human') {
                        return { ...a, type: 'random' };
                    }
                    return a;
                });
            }

            newAgents[index] = { ...newAgents[index], ...patch };
            return newAgents;
        });
    }

    targetCounts = computed(() => this.getCounts(this.playerCount()));

    usePercivalMorgana = linkedSignal({
        source: this.playerCount,
        computation: (count) => count >= 6
    });

    useMordred = linkedSignal({
        source: this.playerCount,
        computation: (count) => count >= 9
    });

    useOberon = signal(true);
    enableExcalibur = signal(false);
    enableLady = signal(false);
    enableQuestVoting = signal(false);
    enablePlotCards = signal(false);

    specialGoodCount = computed(() => {
        let count = 1; // Merlin
        if (this.usePercivalMorgana()) count++;
        return count;
    });

    specialEvilCount = computed(() => {
        let count = 1; // Assassin
        if (this.usePercivalMorgana()) count++;
        if (this.useMordred()) count++;
        if (this.useOberon()) count++;
        return count;
    });

    remainingServants = computed(() => this.targetCounts().good - this.specialGoodCount());
    remainingMinions = computed(() => this.targetCounts().evil - this.specialEvilCount());

    totalEstimatedCost = computed(() => {
        let total = 0;
        for (const pa of this.playerAgents()) {
            if (pa.type === 'llm' && pa.configId) {
                const est = this.getAgentCostEstimate(pa.configId);
                if (est) {
                    total += est;
                }
            }
        }
        return total;
    });

    async onStart() {
        const roles: Role[] = [Role.Merlin, Role.Assassin];
        if (this.usePercivalMorgana()) {
            roles.push(Role.Percival, Role.Morgana);
        }
        if (this.useMordred()) roles.push(Role.Mordred);
        if (this.useOberon()) roles.push(Role.Oberon);

        const goodToFill = this.remainingServants();
        const evilToFill = this.remainingMinions();

        for (let i = 0; i < goodToFill; i++) roles.push(Role.LoyalServant);
        for (let i = 0; i < evilToFill; i++) roles.push(Role.MinionOfMordred);

        const agents = this.playerAgents().map(pa => {
            if (pa.type === 'human') {
                return new HumanAgent(pa.id, pa.name, this.humanInteraction);
            }
            return pa.type === 'llm' && pa.configId
                ? new LLMAgent(pa.id, pa.name, this.llmManager, this.i18n, pa.configId)
                : new RandomAgent(pa.id, pa.name);
        });

        this.engine.startGame(agents, roles, {
            excalibur: this.enableExcalibur(),
            lady: this.enableLady(),
            questVoting: this.enableQuestVoting(),
            plotCards: this.enablePlotCards()
        });
    }

    private getCounts(players: number): { good: number, evil: number } {
        const table: Record<number, { good: number, evil: number }> = {
            5: { good: 3, evil: 2 },
            6: { good: 4, evil: 2 },
            7: { good: 4, evil: 3 },
            8: { good: 5, evil: 3 },
            9: { good: 6, evil: 3 },
            10: { good: 6, evil: 4 }
        };
        return table[players] || { good: 3, evil: 2 };
    }
}
