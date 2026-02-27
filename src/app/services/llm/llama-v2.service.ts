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

    private baseUrl = signal('http://localhost:8080');
    private modelId = signal<string | undefined>(undefined);
    private temperature = signal<number | undefined>(undefined);
    private frequencyPenalty = signal<number | undefined>(undefined);
    private presencePenalty = signal<number | undefined>(undefined);
    private inputPrice = signal<number | undefined>(undefined);
    private cacheInputPrice = signal<number | undefined>(undefined);
    private outputPrice = signal<number | undefined>(undefined);

    // Dynamic props from server
    private serverChatTemplate = signal<string | null>(null);

    init(config: LLMProviderConfig): void {
        const cleanStr = (val: any) => (typeof val === 'string' && val.trim() === '') ? undefined : val;

        if (config.baseUrl) {
            this.baseUrl.set(config.baseUrl.replace(/\/$/, ''));
        }
        if (config.modelId !== undefined) {
            this.modelId.set(cleanStr(config.modelId));
        }
        if (config.temperature !== undefined) {
            this.temperature.set(cleanStr(config.temperature));
        }
        if (config.frequency_penalty !== undefined) {
            this.frequencyPenalty.set(cleanStr(config.frequency_penalty));
        }
        if (config.presence_penalty !== undefined) {
            this.presencePenalty.set(cleanStr(config.presence_penalty));
        }
        if (config.inputPrice !== undefined) {
            this.inputPrice.set(cleanStr(config.inputPrice));
        }
        if (config.cacheInputPrice !== undefined) {
            this.cacheInputPrice.set(cleanStr(config.cacheInputPrice));
        }
        if (config.outputPrice !== undefined) {
            this.outputPrice.set(cleanStr(config.outputPrice));
        }

        // Proactively fetch props to identify model and template
        this.fetchProps();
    }

    private async fetchProps() {
        try {
            const response = await fetch(`${this.baseUrl()}/props`);
            if (response.ok) {
                const data = await response.json();
                if (data.chat_template) {
                    this.serverChatTemplate.set(data.chat_template);
                }
                // If modelId is still default or not set, use model_alias from server
                if (data.model_alias && (this.modelId() === 'local-model' || !this.modelId())) {
                    this.modelId.set(data.model_alias);
                    console.log(`[LlamaV2] Model ID updated from server: ${data.model_alias}`);
                }
            }
        } catch (e) {
            console.warn('[LlamaV2] Failed to fetch server props', e);
        }
    }

    isConfigured(): boolean {
        return !!this.baseUrl().trim();
    }

    getCapabilities(): LLMProviderCapabilities {
        return {
            supportsContextCaching: true, // Supported via n_keep + cache_prompt
            supportsThinking: true,      // Supported via OpenAI reasoning_content
            supportsStructuredOutput: true,
            isLocalProvider: true
        };
    }

    getAvailableModels(): LLMModelDefinition[] {
        const modelId = this.modelId() || 'local-model';
        return [
            {
                id: modelId,
                name: `Local Model (${modelId})`,
                getRates: () => ({
                    input: this.inputPrice() ?? 0,
                    output: this.outputPrice() ?? 0,
                    cached: this.cacheInputPrice() ?? 0,
                    cacheStorage: 0
                })
            }
        ];
    }

    getDefaultModelId(): string {
        return this.modelId() || 'local-model';
    }

    getModelId(): string {
        return this.modelId() || 'local-model';
    }

    async *generateContentStream(
        contents: LLMContent[],
        systemInstruction: string,
        config: LLMGenerateConfig
    ): AsyncGenerator<LLMStreamChunk> {
        const baseUrl = this.baseUrl();

        // Ensure we have server info before starting if we're still on default
        if (this.modelId() === 'local-model') {
            await this.fetchProps();
        }

        // Map contents to OpenAI format
        const messages = [
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
                n_keep = await this.countTokens(this.modelId() || 'local-model', [
                    { role: 'system', parts: [{ text: systemInstruction }] }
                ]);
            }
        } catch (e) {
            console.warn('[LlamaV2] Failed to calculate n_keep', e);
        }

        const preparedSchema = config.responseSchema ? this.prepareSchema(config.responseSchema) : null;

        const requestBody: Record<string, unknown> = {
            model: this.modelId() || 'local-model',
            messages,
            stream: true,
            stream_options: { include_usage: true },
            cache_prompt: true,
            n_keep: n_keep,
            ...(this.temperature() != null ? { temperature: this.temperature() } : {}),
            ...(this.frequencyPenalty() != null ? { frequency_penalty: this.frequencyPenalty() } : {}),
            ...(this.presencePenalty() != null ? { presence_penalty: this.presencePenalty() } : {}),
            ...(config.responseSchema ? {
                // Combined style for maximum server compatibility
                response_format: {
                    type: 'json_schema',
                    json_schema: {
                        name: 'structured_output',
                        strict: true,
                        schema: this.prepareSchema(config.responseSchema)
                    }
                },
                // Some versions look directly at the root json_schema
                json_schema: {
                    name: 'structured_output',
                    strict: true,
                    schema: this.prepareSchema(config.responseSchema)
                }
            } : {})
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
                    if (done) break;

                    buffer += decoder.decode(value, { stream: true });
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

                            // Robust Thinking Detection: Some llama.cpp templates put thinking inside <|channel|>analysis
                            if (delta?.content && (delta.content.includes('<|channel|>analysis') || delta.content.includes('<|start|>assistant<|channel|>analysis'))) {
                                // This is thinking! Since we are yielding text, we should ideally mark it.
                                // But if it's mixed in content, we just let it be or try to mark it.
                                // For now, the JSON Scan above will naturally skip it if it's before '{'.
                            }

                            // Usage and timings
                            if (data.usage || data.timings) {
                                const usage = data.usage;
                                const timings = data.timings;
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
                }
            } finally {
                reader.releaseLock();
            }

        } catch (error) {
            console.error('LlamaV2 generation failed:', error);
            throw error;
        }
    }

    async countTokens(_modelId: string, contents: LLMContent[]): Promise<number> {
        const text = contents.flatMap(c => c.parts).map(p => p.text || '').join('\n');
        if (!text) return 0;
        try {
            const response = await fetch(`${this.baseUrl()}/tokenize`, {
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
