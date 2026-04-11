import { Component, inject, signal, output, computed, Injector, Type, ComponentRef } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { PortalModule, ComponentPortal } from '@angular/cdk/portal';
import { LLMManagerService } from '../../services/llm/llm-manager.service';
import { LLMStorageService } from '../../services/llm/llm-storage.service';
import { LLMConfig, LLMPricingRates } from '../../services/llm/llm-provider';
import { LLM_CONFIG_DATA } from '../../services/llm/llm-config-portal';
import { GeminiConfigComponent } from './providers/gemini-config.component';
import { OpenAIConfigComponent } from './providers/openai-config.component';
import { LlamaConfigComponent } from './providers/llama-config.component';
import { I18nService } from '../../i18n/i18n.service';
import { TranslatePipe } from '../../i18n/translate.pipe';
import { PredictionService } from '../../services/prediction.service';

@Component({
    selector: 'app-llm-settings',
    standalone: true,
    imports: [CommonModule, FormsModule, PortalModule, TranslatePipe],
    templateUrl: './llm-settings.component.html',
    styleUrl: './llm-settings.component.scss'
})
export class LLMSettingsComponent {
    settingsClosed = output<void>();

    private manager = inject(LLMManagerService);
    private storage = inject(LLMStorageService);
    private injector = inject(Injector);
    public i18n = inject(I18nService);
    public prediction = inject(PredictionService);

    // Available Providers
    providers = [
        { id: 'gemini', name: 'Google Gemini' },
        { id: 'openai', name: 'OpenAI / Web-API' },
        { id: 'llama.cpp', name: 'Llama.cpp (Local)' }
    ];

    // List of configs from storage
    configs = this.storage.configs;

    // Editing state
    editingConfig = signal<LLMConfig | null>(null);
    private costTrigger = signal(0);
    
    // Dynamic Portal for Provider-specific settings
    configPortal = computed(() => {
        const config = this.editingConfig();
        if (!config) return null;

        // Map provider ID to component
        const componentMap: Record<string, Type<unknown>> = {
            'gemini': GeminiConfigComponent,
            'openai': OpenAIConfigComponent,
            'llama.cpp': LlamaConfigComponent
        };

        const component = componentMap[config.provider] || OpenAIConfigComponent;

        // Custom Injector to pass config data
        const portalInjector = Injector.create({
            providers: [{ provide: LLM_CONFIG_DATA, useValue: config }],
            parent: this.injector
        });

        return new ComponentPortal(component, null, portalInjector);
    });

    costInfo = computed(() => {
        this.costTrigger();
        const config = this.editingConfig();
        if (!config) return null;

        const rates = this.prediction.getPricingRates(config);
        if (!rates) return null;

        const total = this.prediction.getAgentCostEstimate(rates);

        return {
            rates,
            min: total * 0.5,
            max: total * 2
        };
    });

    onProviderChange(newProvider: string) {
        const current = this.editingConfig();
        if (current) {
            // Get default model for the NEW provider
            let defaultModelId = '';
            const providerInstance = this.manager.getProvider(newProvider);
            if (providerInstance) {
                defaultModelId = providerInstance.getDefaultModelId();
            }

            const newSettings: any = { ...current.settings, modelId: defaultModelId };

            // Specifically for Gemini, set default thinking levels
            if (newProvider === 'gemini') {
                newSettings.thinkingLevel = 'minimal';
            } else if (newProvider === 'openai' || newProvider === 'llama.cpp') {
                // Clear optional parameters to be blank/undefined
                delete newSettings.temperature;
                delete newSettings.frequency_penalty;
                delete newSettings.presence_penalty;
                delete newSettings.inputPrice;
                delete newSettings.outputPrice;
            }

            this.editingConfig.set({
                ...current,
                provider: newProvider,
                settings: newSettings
            });
        }
    }

    // Test connection status
    testStatus = signal<string>('');
    testResponse = signal<string>('');
    isTesting = signal(false);

    createConfig() {
        const newConfig: LLMConfig = {
            id: crypto.randomUUID(),
            name: this.i18n.translate('settings.newConfigName'),
            provider: 'openai', // Default to OpenAI which has more visible params
            settings: {
                modelId: undefined, // Will use placeholder in UI
                apiKey: ''
            }
        };
        this.editingConfig.set(newConfig);
        this.testStatus.set('');
    }

    editConfig(config: LLMConfig) {
        const cloned = JSON.parse(JSON.stringify(config));
        this.editingConfig.set(cloned);
        this.testStatus.set('');
    }

    saveConfig() {
        const config = this.editingConfig();
        if (config) {
            this.storage.save(config);
            this.editingConfig.set(null);
        }
    }

    onPortalAttached(ref: any) {
        if (!ref || !(ref instanceof ComponentRef)) return;

        // Subscribe to child's configChanged output if it exists
        const instance = ref.instance;
        if (instance.configChanged) {
            instance.configChanged.subscribe(() => {
                this.costTrigger.update(v => v + 1);
            });
        }
    }

    async deleteConfig(id: string) {
        if (confirm(this.i18n.translate('settings.confirmDelete'))) {
            await this.storage.delete(id);
        }
    }

    async testConnection() {
        const config = this.editingConfig();
        if (!config) return;

        this.isTesting.set(true);
        this.testStatus.set(this.i18n.translate('settings.testing'));
        this.testResponse.set('');

        try {
            const provider = this.manager.getProviderForConfig(config);
            if (!provider) throw new Error('Provider not found');

            const stream = provider.generateContentStream(
                config.settings,
                [{ role: 'user', parts: [{ text: 'Hello, are you alive? Please reply with a short greeting.' }] }],
                'You are a testing assistant.',
                { signal: AbortSignal.timeout(10000) }
            );

            let result = '';
            for await (const chunk of stream) {
                if (chunk.text) {
                    result += chunk.text;
                    this.testResponse.set(result);
                }
            }

            if (result) {
                this.testStatus.set(this.i18n.translate('settings.testSuccess'));
            } else {
                this.testStatus.set(this.i18n.translate('settings.testFailEmpty'));
            }
        } catch (e: unknown) {
            const msg = e instanceof Error ? e.message : String(e);
            this.testStatus.set(this.i18n.translate('settings.testError', { msg }));
        } finally {
            this.isTesting.set(false);
        }
    }

    cancelEdit() {
        if (this.editingConfig()) {
            this.editingConfig.set(null);
        } else {
            this.settingsClosed.emit();
        }
    }
}
