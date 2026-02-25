import { Injectable, inject, signal, effect } from '@angular/core';
import { LLMStorageService } from './llm-storage.service';
import { LLMProviderRegistryService } from './llm-provider-registry.service';
import { LLMConfig, LLMProvider } from './llm-provider';

/**
 * LLMManagerService - Orchestrates Multiple LLM Configurations.
 */
@Injectable({
    providedIn: 'root'
})
export class LLMManagerService {
    private storage = inject(LLMStorageService);
    private registry = inject(LLMProviderRegistryService);

    // List of all configs from storage
    readonly configs = this.storage.configs;

    // Active config (defaults to the one marked as isDefault)
    private _activeConfig = signal<LLMConfig | null>(null);
    readonly activeConfig = this._activeConfig.asReadonly();

    constructor() {
        effect(() => {
            const currentConfigs = this.configs();
            if (currentConfigs.length > 0 && !this._activeConfig()) {
                const def = currentConfigs.find(c => c.isDefault) || currentConfigs[0];
                this.setActiveConfig(def);
            }
        });
    }

    /**
     * Set the active LLM configuration.
     * This will also activate the corresponding provider in the registry.
     */
    setActiveConfig(config: LLMConfig): void {
        this._activeConfig.set(config);
        this.registry.setActive(config.provider);
        const provider = this.registry.getActive();
        if (provider) {
            provider.init(config.settings);
        }
    }

    /**
     * Get a provider initialized with a specific config.
     * Note: Because providers are singletons, this sets the global state of that provider.
     */
    getProviderForConfig(config: LLMConfig): LLMProvider | undefined {
        const provider = this.registry.getProvider(config.provider);
        if (provider) {
            provider.init(config.settings);
        }
        return provider;
    }

    /**
     * Get a provider initialized with a specific config GUID.
     */
    async getProviderByConfigId(configId: string): Promise<LLMProvider | undefined> {
        const config = await this.storage.getById(configId);
        if (!config) return undefined;
        return this.getProviderForConfig(config);
    }

    /**
     * Get a provider by name (passthrough to registry).
     */
    getProvider(providerName: string): LLMProvider | undefined {
        return this.registry.getProvider(providerName);
    }
}
