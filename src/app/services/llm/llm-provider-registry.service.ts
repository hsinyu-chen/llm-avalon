import { Injectable, signal, computed } from '@angular/core';
import { LLMProvider, LLMProviderCapabilities } from './llm-provider';

/**
 * LLM Provider Registry Service
 *
 * Factory pattern for managing and switching between LLM providers.
 * Maintains a registry of available providers and tracks the active one.
 */
@Injectable({
    providedIn: 'root'
})
export class LLMProviderRegistryService {
    /** Map of registered providers by name */
    private providers = new Map<string, LLMProvider>();

    /**
     * Register a provider with the registry.
     * @param provider The LLM provider instance to register
     */
    register(provider: LLMProvider): void {
        if (this.providers.has(provider.providerName)) {
            console.warn(`[LLMRegistry] Provider '${provider.providerName}' is already registered. Replacing.`);
        }
        this.providers.set(provider.providerName, provider);
        console.log(`[LLMRegistry] Registered provider: ${provider.providerName}`);
    }

    /**
     * Get a specific provider by name (without activating it).
     * @param providerName The name of the provider to retrieve
     * @returns The provider or undefined if not found
     */
    getProvider(providerName: string): LLMProvider | undefined {
        return this.providers.get(providerName);
    }

    /**
     * Get capability flags for a specific provider.
     * @returns Capabilities object or a default "no capabilities" object if provider not found
     */
    getCapabilities(providerName: string): LLMProviderCapabilities {
        const provider = this.getProvider(providerName);
        if (provider) {
            return provider.getCapabilities();
        }
        // Default: no capabilities
        return {
            supportsContextCaching: false,
            supportsThinking: false,
            supportsStructuredOutput: false,
            isLocalProvider: false,
            supportsSpeedMetrics: false
        };
    }

    /**
     * List all registered provider names.
     * @returns Array of provider names
     */
    listProviders(): string[] {
        return Array.from(this.providers.keys());
    }

    /**
     * Check if a specific provider is registered.
     * @param providerName The name to check
     * @returns True if registered
     */
    hasProvider(providerName: string): boolean {
        return this.providers.has(providerName);
    }
}
