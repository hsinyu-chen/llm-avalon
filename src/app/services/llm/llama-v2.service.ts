import { Injectable, signal, Type } from '@angular/core';
import {
    LLMProvider,
    LLMProviderCapabilities,
    LLMProviderConfig,
    LLMContent,
    LLMGenerateConfig,
    LLMStreamChunk,
    LLMModelDefinition,
    LLMSettingsComponent
} from './llm-provider';

/**
 * LlamaV2Service - Optimized llama.cpp Provider
 * Uses OpenAI-compatible /v1/chat/completions to support:
 * 1. Native Chat Templates (handled by server)
 * 2. Thinking/Reasoning (via reasoning_content)
 * 3. GBNF with Thinking (server handles phase transition)
 */
@Injectable({
    providedIn: 'root'
})
export class LlamaV2Service implements LLMProvider {
    readonly providerName = 'llama.cpp'; // Use same name to replace legacy LlamaService in registry
    settingsComponent?: Type<LLMSettingsComponent>;

    // Stateless helper
    private extractConfig(config: LLMProviderConfig) {
        const cleanStr = (val: any) => (typeof val === 'string' && val.trim() === '') ? undefined : val;
        const settings = config.additionalSettings || {};

        return {
            baseUrl: config.baseUrl ? config.baseUrl.replace(/\/$/, '') : 'http://localhost:8080',
            modelId: cleanStr(config.modelId) || 'local-model',
            temperature: cleanStr(config.temperature) as number | undefined,
            frequencyPenalty: cleanStr(config.frequency_penalty) as number | undefined,
            presencePenalty: cleanStr(config.presence_penalty) as number | undefined,
            inputPrice: cleanStr(config.inputPrice) as number | undefined,
            cacheInputPrice: cleanStr(config.cacheInputPrice) as number | undefined,
            outputPrice: cleanStr(config.outputPrice) as number | undefined,
            topP: cleanStr(settings['topP']) as number | undefined,
            topK: cleanStr(settings['topK']) as number | undefined,
            minP: cleanStr(settings['minP']) as number | undefined,
            repetitionPenalty: cleanStr(settings['repetitionPenalty']) as number | undefined,
            enableThinking: (settings['enableThinking'] === undefined ? false : settings['enableThinking']) as boolean,
            reasoningEffort: (settings['reasoningEffort'] === undefined ? 'low' : settings['reasoningEffort']) as string
        };
    }

    isConfigured(config: LLMProviderConfig): boolean {
        return !!(config.baseUrl && config.baseUrl.trim());
    }

    getCapabilities(): LLMProviderCapabilities {
        return {
            supportsContextCaching: true, // Supported via n_keep + cache_prompt
            supportsThinking: true,      // Supported via OpenAI reasoning_content
            supportsStructuredOutput: true,
            isLocalProvider: true,
            supportsSpeedMetrics: true
        };
    }

    getAvailableModels(config: LLMProviderConfig): LLMModelDefinition[] {
        const c = this.extractConfig(config);
        const modelId = c.modelId;
        return [
            {
                id: modelId,
                name: `Local Model (${modelId})`,
                getRates: () => ({
                    input: c.inputPrice ?? 0,
                    output: c.outputPrice ?? 0,
                    cached: c.cacheInputPrice ?? 0,
                    cacheStorage: 0
                })
            }
        ];
    }

    getDefaultModelId(): string {
        return 'local-model';
    }

    async *generateContentStream(
        providerConfig: LLMProviderConfig,
        contents: LLMContent[],
        systemInstruction: string,
        config: LLMGenerateConfig
    ): AsyncGenerator<LLMStreamChunk> {
        const c = this.extractConfig(providerConfig);
        const baseUrl = c.baseUrl;
        // Don't wait for props dynamically during generation to stay stateless. 
        // We will just pass the modelId as provided (or 'local-model').

        const messages: any[] = [
            ...(systemInstruction ? [{ role: 'system', content: systemInstruction }] : []),
            ...contents.map(c => ({
                role: c.role === 'model' ? 'assistant' : c.role,
                content: c.parts.map(p => p.text || '').join('\n')
            }))
        ];

        // Optimal n_keep calculation
        let n_keep = -1;
        try {
            if (systemInstruction) {
                n_keep = await this.countTokens(providerConfig, c.modelId, [
                    { role: 'system', parts: [{ text: systemInstruction }] }
                ]);
            }
        } catch (e) {
            console.warn('[LlamaV2] Failed to calculate n_keep', e);
        }

        const preparedSchema = config.responseSchema ? this.prepareSchema(config.responseSchema) : null;

        // Map reasoning effort to token budget (llama.cpp uses reasoning_budget, not reasoning_effort)
        const reasoningBudgetMap: Record<string, number> = { low: 512, medium: 2048, high: 8192 };
        const thinkingEnabled = c.enableThinking;
        const reasoningBudget = thinkingEnabled
            ? (reasoningBudgetMap[c.reasoningEffort] ?? 2048)
            : 0;

        const requestBody: Record<string, unknown> = {
            model: c.modelId,
            messages,
            stream: true,
            stream_options: { include_usage: true },
            cache_prompt: true,
            n_keep: n_keep,
            ...(c.temperature != null ? { temperature: c.temperature } : {}),
            ...(c.frequencyPenalty != null ? { frequency_penalty: c.frequencyPenalty } : {}),
            ...(c.presencePenalty != null ? { presence_penalty: c.presencePenalty } : {}),
            ...(c.topP != null ? { top_p: c.topP } : {}),
            ...(c.topK != null ? { top_k: c.topK } : {}),
            ...(c.minP != null ? { min_p: c.minP } : {}),
            ...(c.repetitionPenalty != null ? { repetition_penalty: c.repetitionPenalty } : {}),
            ...(config.responseSchema ? {
                response_format: {
                    type: 'json_schema',
                    json_schema: {
                        name: 'structured_output',
                        strict: true,
                        schema: this.prepareSchema(config.responseSchema)
                    }
                }
            } : {}),
            // llama.cpp native: enable_thinking must be inside chat_template_kwargs
            chat_template_kwargs: {
                enable_thinking: thinkingEnabled
            },
            reasoning_budget: reasoningBudget
        };

        try {
            const response = await fetch(`${baseUrl}/v1/chat/completions`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify(requestBody),
                signal: config.signal
            });

            if (!response.ok) {
                throw new Error(`llama.cpp OAI error (${response.status}): ${await response.text()}`);
            }

            if (!response.body) throw new Error('No response body from server.');

            const reader = response.body.getReader();
            const decoder = new TextDecoder();
            let buffer = '';

            try {
                while (true) {
                    const { done, value } = await reader.read();

                    if (value) {
                        buffer += decoder.decode(value, { stream: true });
                    }
                    if (done && buffer.trim()) {
                        buffer += '\n'; // Flush remaining text in buffer
                    }

                    const lines = buffer.split('\n');
                    buffer = lines.pop() || '';

                    for (const line of lines) {
                        const trimmed = line.trim();
                        if (!trimmed || trimmed === 'data: [DONE]') continue;
                        if (!trimmed.startsWith('data: ')) continue;

                        try {
                            const data = JSON.parse(trimmed.slice(6));
                            const delta = data.choices?.[0]?.delta;

                            // Handle standard content
                            if (delta?.content) {
                                yield { text: delta.content };
                            }

                            // Handle explicit thinking content (standard OAI field)
                            if (delta?.reasoning_content) {
                                yield { text: delta.reasoning_content, thought: true };
                            }

                            // Usage and timings
                            if (data.usage || data.timings) {
                                const usage = data.usage;
                                const timings = data.timings;
                                console.log('[llama-v2] SSE Stream End: Usage and Timings raw data:', { usage, timings });
                                yield {
                                    usageMetadata: {
                                        // Prefer timings for more detail (cached vs active prompt)
                                        prompt: (timings?.prompt_n ?? usage?.prompt_tokens) || 0,
                                        candidates: (timings?.predicted_n ?? usage?.completion_tokens) || 0,
                                        cached: (timings?.cache_n ?? usage?.prompt_tokens_details?.cached_tokens) || 0,
                                        promptSpeed: timings?.prompt_per_second,
                                        completionSpeed: timings?.predicted_per_second
                                    }
                                };
                            }
                        } catch { /* Partial chunks */ }
                    }

                    if (done) break;
                }
            } finally {
                reader.releaseLock();
            }

        } catch (error) {
            console.error('LlamaV2 generation failed:', error);
            throw error;
        }
    }

    async countTokens(providerConfig: LLMProviderConfig, _modelId: string, contents: LLMContent[]): Promise<number> {
        const baseUrl = this.extractConfig(providerConfig).baseUrl;
        const text = contents.flatMap(c => c.parts).map(p => p.text || '').join('\n');
        if (!text) return 0;
        try {
            const response = await fetch(`${baseUrl}/tokenize`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ content: text })
            });
            if (response.ok) {
                const data = await response.json();
                return Array.isArray(data.tokens) ? data.tokens.length : 0;
            }
        } catch { /* Ignore token counting errors */ }
        return Math.ceil(text.length / 3.5);
    }

    /**
     * Robust schema preparation for Structured Outputs.
     * 1. Removes non-structural fields (title, description, etc.)
     * 2. Forces additionalProperties: false
     * 3. Ensures all properties are in 'required' array
     */
    private prepareSchema(schema: any): any {
        if (!schema || typeof schema !== 'object') return schema;

        const result = JSON.parse(JSON.stringify(schema)); // Clone

        const process = (obj: any) => {
            if (obj.type === 'object' && obj.properties) {
                // Mandatory for strict mode:
                obj.additionalProperties = false;
                obj.required = Object.keys(obj.properties);

                for (const key in obj.properties) {
                    process(obj.properties[key]);
                }
            } else if (obj.type === 'array' && obj.items) {
                process(obj.items);
            }

            // Strip metadata
            delete obj.title;
            delete obj.description;
            delete obj.default;
            delete obj.$schema;
        };

        process(result);
        return result;
    }
}
