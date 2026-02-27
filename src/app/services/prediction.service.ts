import { Injectable, inject } from '@angular/core';
import { LLMConfig, LLMPricingRates } from './llm/llm-provider';
import { LLMManagerService } from './llm/llm-manager.service';

@Injectable({
    providedIn: 'root'
})
export class PredictionService {
    private llmManager = inject(LLMManagerService);

    // Estimation Constants (Approx. per 7 agents total game cost divided by 7)
    readonly EST_INPUT_TOKENS = 250_000;
    readonly EST_CACHED_TOKENS = 100_000;
    readonly EST_OUTPUT_TOKENS = 30_000;

    /**
     * Calculates the estimated cost for a single agent based on pricing rates.
     */
    getAgentCostEstimate(rates: LLMPricingRates): number {
        const inputCost = (this.EST_INPUT_TOKENS / 1_000_000) * rates.input;
        const cachedCost = (this.EST_CACHED_TOKENS / 1_000_000) * (rates.cached || 0);
        const outputCost = (this.EST_OUTPUT_TOKENS / 1_000_000) * rates.output;

        return inputCost + cachedCost + outputCost;
    }

    /**
     * Resolves pricing rates for a given LLM configuration.
     */
    getPricingRates(config: LLMConfig): LLMPricingRates | null {
        if (config.provider === 'gemini') {
            const provider = this.llmManager.getProvider('gemini');
            if (provider) {
                const models = provider.getAvailableModels();
                const selectedModel = models.find(m => m.id === config.settings.modelId);
                if (selectedModel && selectedModel.getRates) {
                    return selectedModel.getRates(0);
                }
            }
        } else {
            // Use custom pricing if provided for OpenAI / local providers
            if (config.settings.inputPrice !== undefined || config.settings.cacheInputPrice !== undefined || config.settings.outputPrice !== undefined) {
                return {
                    input: config.settings.inputPrice || 0,
                    cached: config.settings.cacheInputPrice || 0,
                    output: config.settings.outputPrice || 0
                };
            }
        }
        return null;
    }

    /**
     * Calculates the estimated cost for a single agent directly from its configuration.
     */
    getCostFromConfig(config: LLMConfig): number | null {
        const rates = this.getPricingRates(config);
        if (!rates) return null;
        return this.getAgentCostEstimate(rates);
    }
}
