import { Component, inject, signal, output, computed, Injector, Type } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { PortalModule, ComponentPortal } from '@angular/cdk/portal';
import { LLMManagerService } from '../../services/llm/llm-manager.service';
import { LLMStorageService } from '../../services/llm/llm-storage.service';
import { LLMConfig } from '../../services/llm/llm-provider';
import { LLM_CONFIG_DATA } from '../../services/llm/llm-config-portal';
import { GeminiConfigComponent } from './providers/gemini-config.component';
import { OpenAIConfigComponent } from './providers/openai-config.component';
import { LlamaConfigComponent } from './providers/llama-config.component';
import { I18nService } from '../../i18n/i18n.service';
import { TranslatePipe } from '../../i18n/translate.pipe';

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

    onProviderChange(newProvider: string) {
        const current = this.editingConfig();
        if (current) {
            // Get default model for the NEW provider
            let defaultModelId = '';
            const providerInstance = this.manager.getProvider(newProvider);
            if (providerInstance) {
                defaultModelId = providerInstance.getDefaultModelId();
            }

            const newSettings = { ...current.settings, modelId: defaultModelId };

            // Specifically for Gemini, set default thinking levels
            if (newProvider === 'gemini') {
                newSettings.thinkingLevelGeneral = 'high';
                newSettings.thinkingLevelStory = 'minimal';
                newSettings.frequency_penalty = 0.2;
                newSettings.presence_penalty = 0.2;
            } else if (newProvider === 'openai' || newProvider === 'llama.cpp') {
                newSettings.temperature = 0.8;
                newSettings.frequency_penalty = 0.6;
                newSettings.presence_penalty = 0.4;
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
            provider: 'gemini',
            settings: {
                modelId: 'gemini-3-flash-preview',
                apiKey: '',
                thinkingLevelGeneral: 'high',
                thinkingLevelStory: 'minimal',
                frequency_penalty: 0.2,
                presence_penalty: 0.2
            }
        };
        this.editingConfig.set(newConfig);
        this.testStatus.set('');
    }

    editConfig(config: LLMConfig) {
        const cloned = JSON.parse(JSON.stringify(config));

        // Ensure defaults for new fields in existing configs
        if (cloned.provider === 'gemini') {
            if (cloned.settings.frequency_penalty === undefined) cloned.settings.frequency_penalty = 0.2;
            if (cloned.settings.presence_penalty === undefined) cloned.settings.presence_penalty = 0.2;
        } else if (cloned.provider === 'openai' || cloned.provider === 'llama.cpp') {
            if (cloned.settings.temperature === undefined) cloned.settings.temperature = 0.8;
            if (cloned.settings.frequency_penalty === undefined) cloned.settings.frequency_penalty = 0.6;
            if (cloned.settings.presence_penalty === undefined) cloned.settings.presence_penalty = 0.4;
        }

        this.editingConfig.set(cloned);
        this.testStatus.set('');
    }

    async saveConfig() {
        const config = this.editingConfig();
        if (config) {
            await this.storage.save(config);
            this.editingConfig.set(null);
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
