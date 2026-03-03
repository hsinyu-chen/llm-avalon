import { Injectable, Type, signal } from '@angular/core';
import { CachedContent, Content, Part, CreateCachedContentParameters, CreateCachedContentConfig, GoogleGenAI, ThinkingLevel, GenerateContentParameters, GenerateContentConfig, Tool, HarmCategory, HarmBlockThreshold, Schema } from '@google/genai';
import {
    LLMProvider,
    LLMProviderCapabilities,
    LLMProviderConfig,
    LLMContent,
    LLMPart,
    LLMGenerateConfig,
    LLMStreamChunk,
    LLMModelDefinition,
    LLMSettingsComponent,
    LLMCacheInfo
} from './llm-provider';

interface ExtendedThinkingConfig {
    includeThoughts?: boolean;
    thinkingLevel?: ThinkingLevel;
    thinkingBudget?: number;
}

/** Default Gemini model ID */
export const DEFAULT_GEMINI_MODEL_ID = 'gemini-3-flash-preview';

@Injectable({
    providedIn: 'root'
})
export class GeminiService implements LLMProvider {
    readonly providerName = 'gemini';
    settingsComponent?: Type<LLMSettingsComponent>;

    private readonly defaultTools: Tool[] = [];

    // =========================================================================
    // LLMProvider Interface - Converters
    // =========================================================================

    /**
     * Convert provider-agnostic LLMContent to Gemini Content format.
     */
    private toGeminiContent(content: LLMContent): Content {
        return {
            role: content.role === 'system' ? 'user' : content.role,
            parts: content.parts.map(p => this.toGeminiPart(p))
        };
    }

    /**
     * Convert provider-agnostic LLMPart to Gemini Part format.
     */
    private toGeminiPart(part: LLMPart): Part {
        const result: Part = {};
        if (part.text !== undefined) result.text = part.text;
        if (part.functionCall) result.functionCall = part.functionCall as Part['functionCall'];
        if (part.functionResponse) result.functionResponse = part.functionResponse as Part['functionResponse'];
        return result;
    }

    // =========================================================================
    // LLMProvider Interface - Required Methods
    // =========================================================================

    /**
     * Get capability flags for Gemini provider.
     */
    getCapabilities(): LLMProviderCapabilities {
        return {
            supportsContextCaching: true,
            supportsThinking: true,
            supportsStructuredOutput: true,
            isLocalProvider: false,
            supportsSpeedMetrics: false
        };
    }

    /**
     * Get available Gemini models with pricing.
     */
    getAvailableModels(config: LLMProviderConfig): LLMModelDefinition[] {
        return [
            {
                id: 'gemini-3.1-pro-preview',
                name: 'Gemini 3.1 Pro Preview',
                supportsThinking: true,
                allowedThinkingLevels: ['low', 'high'],
                getRates: (prompt = 0) => {
                    const isLong = prompt > 200000;
                    return {
                        input: isLong ? 4.00 : 2.00,
                        output: isLong ? 18.00 : 12.00,
                        cached: isLong ? 0.40 : 0.20,
                        cacheStorage: 4.50
                    };
                }
            },
            {
                id: 'gemini-3-pro-preview',
                name: 'Gemini 3 Pro Preview',
                supportsThinking: true,
                allowedThinkingLevels: ['low', 'high'],
                getRates: (prompt = 0) => {
                    const isLong = prompt > 200000;
                    return {
                        input: isLong ? 4.00 : 2.00,
                        output: isLong ? 18.00 : 12.00,
                        cached: isLong ? 0.40 : 0.20,
                        cacheStorage: 4.50
                    };
                }
            },
            {
                id: 'gemini-3-flash-preview',
                name: 'Gemini 3 Flash Preview',
                supportsThinking: true,
                allowedThinkingLevels: ['minimal', 'low', 'medium', 'high'],
                getRates: () => {
                    return {
                        input: 0.50,
                        output: 3.00,
                        cached: 0.05,
                        cacheStorage: 1.00
                    };
                }
            },
            {
                id: 'gemini-3.1-flash-lite-preview',
                name: 'Gemini 3.1 Flash Lite Preview',
                supportsThinking: true,
                allowedThinkingLevels: ['minimal', 'low', 'medium', 'high'],
                getRates: () => {
                    return {
                        input: 0.25,
                        output: 1.50,
                        cached: 0.025,
                        cacheStorage: 1.00
                    };
                }
            },
            {
                id: 'gemini-2.5-flash-lite',
                name: 'Gemini 2.5 Flash-Lite',
                supportsThinking: true,
                thinkingBudgetLevelMapping: {
                    minimal: 1024,
                    low: 4096,
                    medium: 12288,
                    high: 24576
                },
                getRates: () => {
                    return {
                        input: 0.10,
                        output: 0.40,
                        cached: 0.01,
                        cacheStorage: 1.00
                    };
                }
            },
            {
                id: 'gemini-2.5-flash',
                name: 'Gemini 2.5 Flash',
                supportsThinking: true,
                thinkingBudgetLevelMapping: {
                    minimal: 1024,
                    low: 4096,
                    medium: 12288,
                    high: 24576
                },
                getRates: () => {
                    return {
                        input: 0.30,
                        output: 2.50,
                        cached: 0.03,
                        cacheStorage: 1.00
                    };
                }
            }
        ];
    }

    /**
     * Get default model ID for Gemini.
     */
    getDefaultModelId(): string {
        return DEFAULT_GEMINI_MODEL_ID;
    }

    private getClient(config: LLMProviderConfig): GoogleGenAI {
        if (!config.apiKey) throw new Error('Gemini API key is required');
        return new GoogleGenAI({ apiKey: config.apiKey });
    }

    private getModelId(config: LLMProviderConfig): string {
        return config.modelId || DEFAULT_GEMINI_MODEL_ID;
    }


    isConfigured(config: LLMProviderConfig): boolean {
        return !!(config.apiKey && config.apiKey.trim());
    }

    /**
     * Implements LLMProvider.generateContentStream using provider-agnostic types.
     */
    async *generateContentStream(
        config: LLMProviderConfig,
        contents: LLMContent[],
        systemInstruction: string,
        genConfig: LLMGenerateConfig
    ): AsyncGenerator<LLMStreamChunk> {
        // Convert to Gemini format
        const geminiContents = contents.map(c => this.toGeminiContent(c));

        // Use existing method logic directly instead of proxy method to avoid passing too many flags
        const stream = await this.sendMessageStream(
            config,
            geminiContents,
            systemInstruction,
            genConfig
        );

        // Yield converted chunks
        for await (const chunk of stream) {
            // Check for abortion
            if (genConfig.signal?.aborted) {
                return; // Stop yielding
            }

            const candidate = chunk.candidates?.[0];
            const finishReason = candidate?.finishReason;

            if (candidate?.content?.parts) {
                for (const part of candidate.content.parts) {
                    const extPart = part as Part & { thought?: boolean; thoughtSignature?: string };
                    yield {
                        text: extPart.text,
                        thought: extPart.thought,
                        thoughtSignature: extPart.thoughtSignature,
                        functionCall: extPart.functionCall as object | undefined,
                        finishReason,
                        usageMetadata: chunk.usageMetadata ? {
                            prompt: chunk.usageMetadata.promptTokenCount || 0,
                            candidates: chunk.usageMetadata.candidatesTokenCount || 0,
                            cached: chunk.usageMetadata.cachedContentTokenCount || 0
                        } : undefined
                    };
                }
            } else if (finishReason) {
                // Yield reason even if no parts (e.g. blocked or max tokens)
                yield {
                    finishReason,
                    usageMetadata: chunk.usageMetadata ? {
                        prompt: chunk.usageMetadata.promptTokenCount || 0,
                        candidates: chunk.usageMetadata.candidatesTokenCount || 0,
                        cached: chunk.usageMetadata.cachedContentTokenCount || 0
                    } : undefined
                };
            }
        }
    }

    /**
     * Get a preview-friendly version of the contents for Gemini.
     * Removes thoughtSignature as requested.
     */
    getPreview(contents: LLMContent[]): LLMContent[] {
        return contents.map(content => ({
            ...content,
            parts: content.parts.map(part => {
                const newPart = { ...part };
                delete newPart.thoughtSignature;
                return newPart;
            })
        }));
    }

    // =========================================================================
    // Original Methods (Backward Compatibility)
    // =========================================================================

    /**
     * Sends a stream of contents and system instructions to the Gemini model for generation.
     */
    async sendMessageStream(
        providerConfig: LLMProviderConfig,
        contents: Content[],
        systemInstruction: string,
        config: LLMGenerateConfig = {}
    ) {
        const client = this.getClient(providerConfig);
        const lastModelId = this.getModelId(providerConfig);

        const cachedContentName = config.cachedContentName;
        const responseSchema = config.responseSchema as Schema;
        const responseMimeType = config.responseMimeType;
        const toolConfig = config.toolConfig;

        // Check if current model supports thinking
        const currentModel = this.getAvailableModels(providerConfig).find(m => m.id === lastModelId);
        const modelSupportsThinking = currentModel?.supportsThinking ?? false;

        let currentThinkingLevel: ThinkingLevel = ThinkingLevel.MINIMAL;
        const confLevel = providerConfig.additionalSettings?.['thinkingLevel'];
        if (confLevel) currentThinkingLevel = this.mapThinkingLevel(confLevel as string);

        // Extract configuration with defaults from LLMProviderConfig if not in GenerateConfig
        const maxOutputTokens = config.maxOutputTokens;
        const frequency_penalty = config.frequency_penalty;
        const presence_penalty = config.presence_penalty;

        // Version check: Gemini 2.0 and below benefit from frequency penalty to avoid repetition
        // Gemini 2.5 and Gemini 3+ models (like gemini-3-flash) do not support or do not need it
        const modelVersionMatch = lastModelId.match(/gemini-(\d+\.?\d*)/);
        const version = modelVersionMatch ? parseFloat(modelVersionMatch[1]) : 3.0;
        const isLegacyModel = version < 2.5;

        // Build config object dynamicly to allow API defaults
        const generationConfig: GenerateContentConfig = {
            safetySettings: [
                { category: HarmCategory.HARM_CATEGORY_HARASSMENT, threshold: HarmBlockThreshold.BLOCK_NONE },
                { category: HarmCategory.HARM_CATEGORY_HATE_SPEECH, threshold: HarmBlockThreshold.BLOCK_NONE },
                { category: HarmCategory.HARM_CATEGORY_SEXUALLY_EXPLICIT, threshold: HarmBlockThreshold.BLOCK_NONE },
                { category: HarmCategory.HARM_CATEGORY_DANGEROUS_CONTENT, threshold: HarmBlockThreshold.BLOCK_NONE },
                { category: HarmCategory.HARM_CATEGORY_CIVIC_INTEGRITY, threshold: HarmBlockThreshold.BLOCK_NONE }
            ]
        };

        if (maxOutputTokens) generationConfig.maxOutputTokens = maxOutputTokens;

        // Apply presence penalty if provided
        if (presence_penalty !== undefined) generationConfig.presencePenalty = presence_penalty;

        // Apply frequency penalty
        // 1. Use explicit config if provided
        // 2. Otherwise apply a subtle 0.2 default for legacy (< v3) models to prevent repetitive "}}}}"
        if (frequency_penalty !== undefined) {
            generationConfig.frequencyPenalty = frequency_penalty;
        } else if (isLegacyModel) {
            generationConfig.frequencyPenalty = 0.2;
        }

        // Only add thinkingConfig for models that support it
        if (modelSupportsThinking) {
            generationConfig.thinkingConfig = {
                includeThoughts: true
            };

            // Handle Thinking Budget Mapping (e.g. Gemini 2.5 Flash)
            if (currentModel?.thinkingBudgetLevelMapping) {
                const budget = currentModel.thinkingBudgetLevelMapping[currentThinkingLevel];
                if (budget !== undefined) {
                    (generationConfig.thinkingConfig as ExtendedThinkingConfig).thinkingBudget = budget;
                }
            }
            // Handle Legacy Thinking Level (e.g. Gemini 3)
            else {
                generationConfig.thinkingConfig.thinkingLevel = currentThinkingLevel;
            }
        }

        if (systemInstruction && !cachedContentName) {
            generationConfig.systemInstruction = {
                parts: [{ text: systemInstruction }]
            };
        }

        if (cachedContentName) {
            generationConfig.cachedContent = cachedContentName;
        } else {
            // Only include tools if NOT using cache (tools must be baked into cache otherwise)
            generationConfig.tools = this.defaultTools;
        }

        // responseMimeType must be set when responseSchema is used
        if (responseSchema) generationConfig.responseMimeType = "application/json";
        if (responseMimeType && !responseSchema) generationConfig.responseMimeType = responseMimeType;
        if (responseSchema) generationConfig.responseSchema = responseSchema;
        // API Limitation: toolConfig cannot be used with CachedContent.
        if (toolConfig && !cachedContentName) generationConfig.toolConfig = toolConfig;

        const request: GenerateContentParameters = {
            model: lastModelId,
            contents: contents,
            config: generationConfig
        };

        const response = await client.models.generateContentStream(request);

        return response;
    }


    /**
     * Counts the number of tokens in a set of contents for a specific model.
     * @param config The provider config
     * @param model The model ID.
     * @param contents Array of Content objects.
     * @returns The total token count.
     */
    async countTokens(config: LLMProviderConfig, model: string, contents: LLMContent[]): Promise<number> {
        let client;
        try {
            client = this.getClient(config);
        } catch { return 0; }

        const geminiContents = contents.map(c => this.toGeminiContent(c));

        try {
            const response = await client.models.countTokens({
                model: model,
                contents: geminiContents
            });
            return response.totalTokens || 0;
        } catch (e) {
            console.warn('Failed to count tokens:', e);
            return 0;
        }
    }

    /**
     * Creates a context cache on the Gemini server.
     * Gemini-specific method for backward compatibility.
     * @param config Provider configuration
     * @param model The model ID.
     * @param systemInstruction The system-level prompt to bake into the cache.
     * @param contents The content history to bake into the cache.
     * @param ttlSeconds The time-to-live for the cache in seconds.
     * @returns The created CachedContent object or null on failure.
     */
    async createGeminiCache(configObj: LLMProviderConfig, model: string, systemInstruction: string, contents: Content[], ttlSeconds = 1800): Promise<CachedContent | null> {
        let client;
        try { client = this.getClient(configObj); } catch { return null; }
        try {
            const config: CreateCachedContentConfig = {
                contents: contents, // Content[] matches ContentListUnion
                systemInstruction: {
                    parts: [{ text: systemInstruction }]
                },
                tools: this.defaultTools,
                ttl: ttlSeconds + ' s'
            };

            const params: CreateCachedContentParameters = {
                model,
                config
            };

            const cache = await client.caches.create(params);
            return cache;
        } catch (e) {
            console.warn('Cache creation failed:', e);
            return null;
        }
    }

    /**
     * Updates the TTL of an existing context cache.
     * Gemini-specific method for backward compatibility.
     * @param name The name of the cache resource.
     * @param ttlSeconds The new time-to-live in seconds.
     * @returns The updated CachedContent object or null on failure.
     */
    async updateGeminiCache(configObj: LLMProviderConfig, name: string, ttlSeconds: number): Promise<CachedContent | null> {
        let client;
        try { client = this.getClient(configObj); } catch { return null; }
        try {
            const cache = await client.caches.update({
                name,
                config: {
                    ttl: ttlSeconds + ' s'
                }
            });
            console.log('Cache TTL updated:', name);
            return cache;
        } catch (e) {
            console.warn('Failed to update cache:', e);
            return null;
        }
    }

    /**
     * Deletes a specific context cache from the server.
     * @param name The name of the cache resource.
     */
    async deleteCache(configObj: LLMProviderConfig, name: string): Promise<void> {
        let client;
        try { client = this.getClient(configObj); } catch { return; }
        try {
            await client.caches.delete({ name });
            console.log('Cache deleted:', name);
        } catch (e) {
            console.warn('Failed to delete cache:', e);
        }
    }

    /**
     * Retrieves the status and metadata of a specific context cache.
     * Gemini-specific method for backward compatibility.
     * @param name The name of the cache resource.
     * @returns The CachedContent object or null if not found.
     */
    async getGeminiCache(configObj: LLMProviderConfig, name: string): Promise<CachedContent | null> {
        let client;
        try { client = this.getClient(configObj); } catch { return null; }
        try {
            const cache = await client.caches.get({ name });
            return cache;
        } catch (e) {
            console.warn('Failed to get cache:', name, e);
            return null;
        }
    }

    /**
     * Lists and deletes all context caches belongs to the API key on the server.
     * @returns The total number of caches deleted.
     */
    async listAndDeleteAllCaches(configObj: LLMProviderConfig): Promise<number> {
        let client;
        try { client = this.getClient(configObj); } catch { return 0; }
        let count = 0;
        try {
            const list = await client.caches.list();
            for await (const cache of list) {
                if (cache.name) {
                    try {
                        await client.caches.delete({ name: cache.name });
                        console.log('Deleted cache:', cache.name);
                        count++;
                    } catch (e) {
                        console.warn('Failed to delete cache:', cache.name, e);
                    }
                }
            }
            console.log(`Cleared ${count} caches.`);
        } catch (e) {
            console.warn('Error listing/deleting caches:', e);
        }
        return count;
    }

    // =========================================================================
    // LLMProvider Interface - Cache Operations (Optional)
    // =========================================================================

    /**
     * LLMProvider interface: Create a context cache.
     */
    async createCache(
        config: LLMProviderConfig,
        modelId: string,
        systemInstruction: string,
        contents: LLMContent[],
        ttlSeconds: number
    ): Promise<LLMCacheInfo | null> {
        const geminiContents = contents.map(c => this.toGeminiContent(c));
        const result = await this.createGeminiCache(config, modelId, systemInstruction, geminiContents, ttlSeconds);
        if (!result) return null;
        return {
            name: result.name || '',
            displayName: result.displayName || undefined,
            model: result.model || '',
            createTime: result.createTime ? new Date(result.createTime).getTime() : undefined,
            expireTime: result.expireTime ? new Date(result.expireTime).getTime() : undefined,
            usageMetadata: result.usageMetadata ? { totalTokenCount: result.usageMetadata.totalTokenCount || 0 } : undefined
        };
    }

    /**
     * LLMProvider interface: Get cache status by name.
     */
    async getCache(config: LLMProviderConfig, name: string): Promise<LLMCacheInfo | null> {
        const result = await this.getGeminiCache(config, name);
        if (!result) return null;
        return {
            name: result.name || '',
            displayName: result.displayName || undefined,
            model: result.model || '',
            createTime: result.createTime ? new Date(result.createTime).getTime() : undefined,
            expireTime: result.expireTime ? new Date(result.expireTime).getTime() : undefined,
            usageMetadata: result.usageMetadata ? { totalTokenCount: result.usageMetadata.totalTokenCount || 0 } : undefined
        };
    }

    /**
     * LLMProvider interface: Update cache TTL.
     */
    async updateCacheTTL(config: LLMProviderConfig, name: string, ttlSeconds: number): Promise<LLMCacheInfo | null> {
        const result = await this.updateGeminiCache(config, name, ttlSeconds);
        if (!result) return null;
        return {
            name: result.name || '',
            displayName: result.displayName || undefined,
            model: result.model || '',
            createTime: result.createTime ? new Date(result.createTime).getTime() : undefined,
            expireTime: result.expireTime ? new Date(result.expireTime).getTime() : undefined,
            usageMetadata: result.usageMetadata ? { totalTokenCount: result.usageMetadata.totalTokenCount || 0 } : undefined
        };
    }

    /**
     * LLMProvider interface: Delete all caches.
     */
    async deleteAllCaches(config: LLMProviderConfig): Promise<number> {
        return this.listAndDeleteAllCaches(config);
    }


    /**
     * Maps string thinking level to ThinkingLevel enum.
     */
    private mapThinkingLevel(level: string): ThinkingLevel {
        switch (level.toLowerCase()) {
            case 'minimal': return ThinkingLevel.MINIMAL;
            case 'low': return ThinkingLevel.LOW;
            case 'medium': return ThinkingLevel.MEDIUM;
            case 'high': return ThinkingLevel.HIGH;
            default: return ThinkingLevel.HIGH;
        }
    }
}

