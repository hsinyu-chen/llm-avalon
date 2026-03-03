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

    /**
     * Get the default LLM configuration.
     */
    getDefaultConfig(): LLMConfig | undefined {
        const currentConfigs = this.configs();
        if (currentConfigs.length === 0) return undefined;
        return currentConfigs.find(c => c.isDefault) || currentConfigs[0];
    }

    /**
     * Get a provider for a specific config.
     * Providers are stateless singletons now, so this just returns the instance.
     */
    getProviderForConfig(config: LLMConfig): LLMProvider | undefined {
        return this.registry.getProvider(config.provider);
    }

    /**
     * Get a provider initialized with a specific config GUID.
     */
    async getProviderByConfigId(configId: string): Promise<LLMProvider | undefined> {
        const config = await this.storage.getById(configId);
        if (!config) return undefined;
        return this.getProviderForConfig(config);
    }

    async getConfigById(configId: string): Promise<LLMConfig | undefined> {
        return this.storage.getById(configId);
    }

    /**
     * Get a provider by name (passthrough to registry).
     */
    getProvider(providerName: string): LLMProvider | undefined {
        return this.registry.getProvider(providerName);
    }
}
