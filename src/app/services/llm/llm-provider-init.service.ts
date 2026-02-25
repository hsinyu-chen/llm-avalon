import { Injectable, inject } from '@angular/core';
import { LLMProviderRegistryService } from './llm-provider-registry.service';
import { GeminiService } from './gemini.service';
import { LlamaService } from './llama.service';
import { OpenAIService } from './openai.service';
import { LLMManagerService } from './llm-manager.service';

/**
 * LLMProviderInitService - Bootstraps the LLM ecosystem.
 * Handles registration of providers and initial configuration loading.
 */
@Injectable({
    providedIn: 'root'
})
export class LLMProviderInitService {
    private registry = inject(LLMProviderRegistryService);
    private manager = inject(LLMManagerService);

    private gemini = inject(GeminiService);
    private llama = inject(LlamaService);
    private openai = inject(OpenAIService);

    initialize() {
        // Register available providers
        this.registry.register(this.gemini);
        this.registry.register(this.llama);
        this.registry.register(this.openai);

        // Note: UI component wiring (settingsComponent) will be handled 
        // by the LLMSettingsComponent or a dedicated UI bridge if needed.
        // For now, we focus on functional initialization.

        console.log('[LLMProviderInit] Providers registered.');
    }
}
