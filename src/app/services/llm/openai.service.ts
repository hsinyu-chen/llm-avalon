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
 * OpenAIService - OpenAI-Compatible Provider
 * Supports standard /v1/chat/completions endpoint.
 */
@Injectable({
    providedIn: 'root'
})
export class OpenAIService implements LLMProvider {
    readonly providerName = 'openai';
    settingsComponent?: Type<LLMSettingsComponent>;

    private baseUrl = signal('https://api.openai.com/v1');
    private apiKey = signal('');
    private modelId = signal('gpt-4o');
    private temperature = signal(0.8);
    private frequencyPenalty = signal(0.6);
    private presencePenalty = signal(0.4);
    private inputPrice = signal(0);
    private outputPrice = signal(0);

    init(config: LLMProviderConfig): void {
        if (config.baseUrl) {
            this.baseUrl.set(config.baseUrl.replace(/\/$/, ''));
        }
        if (config.apiKey !== undefined) {
            this.apiKey.set(config.apiKey);
        }
        if (config.modelId) {
            this.modelId.set(config.modelId);
        }
        if (config.temperature !== undefined) {
            this.temperature.set(config.temperature);
        }
        if (config.frequency_penalty !== undefined) {
            this.frequencyPenalty.set(config.frequency_penalty);
        }
        if (config.presence_penalty !== undefined) {
            this.presencePenalty.set(config.presence_penalty);
        }
        if (config.inputPrice !== undefined) {
            this.inputPrice.set(config.inputPrice);
        }
        if (config.outputPrice !== undefined) {
            this.outputPrice.set(config.outputPrice);
        }
    }

    isConfigured(): boolean {
        return !!this.apiKey().trim() && !!this.baseUrl().trim();
    }

    getCapabilities(): LLMProviderCapabilities {
        return {
            supportsContextCaching: false,
            supportsThinking: false,
            supportsStructuredOutput: true,
            isLocalProvider: false
        };
    }

    getAvailableModels(): LLMModelDefinition[] {
        return [
            {
                id: this.modelId(),
                name: `OpenAI: ${this.modelId()}`,
                getRates: () => ({
                    input: this.inputPrice(),
                    output: this.outputPrice()
                })
            }
        ];
    }

    getDefaultModelId(): string {
        return this.modelId();
    }

    getModelId(): string {
        return this.modelId();
    }



    async *generateContentStream(
        contents: LLMContent[],
        systemInstruction: string,
        config: LLMGenerateConfig
    ): AsyncGenerator<LLMStreamChunk> {
        const baseUrl = this.baseUrl();
        const apiKey = this.apiKey();

        const messages = [
            { role: 'system', content: systemInstruction },
            ...contents.map(c => ({
                role: c.role === 'model' ? 'assistant' : c.role,
                content: c.parts.map(p => p.text || '').join('\n')
            }))
        ];

        const requestBody: Record<string, unknown> = {
            model: this.modelId(),
            messages,
            stream: true,
            temperature: this.temperature(),
            frequency_penalty: this.frequencyPenalty(),
            presence_penalty: this.presencePenalty(),
            stream_options: { include_usage: true },
            cache_prompt: true, // Optimizes for llama.cpp / LocalAI caching
            ...(config.responseSchema ? {
                response_format: {
                    type: 'json_schema',
                    json_schema: {
                        name: 'structured_output',
                        strict: true,
                        schema: this.prepareSchema(config.responseSchema, true)
                    }
                },
                // Top-level json_schema for some local backends (llama.cpp)
                json_schema: this.prepareSchema(config.responseSchema, true)
            } : {})
        };

        try {
            const response = await fetch(`${baseUrl}/chat/completions`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${apiKey}`
                },
                body: JSON.stringify(requestBody),
                signal: config.signal
            });

            if (!response.ok) {
                const errorText = await response.text();
                throw new Error(`OpenAI API error (${response.status}): ${errorText}`);
            }

            if (!response.body) throw new Error('No response body from server.');

            const reader = response.body.getReader();
            const decoder = new TextDecoder();
            let buffer = '';
            let isDiscardingGarbage = !!config.responseSchema;

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

                            if (delta?.content) {
                                let content = delta.content;

                                // Robust JSON Scan: Discard everything until we find '{' or '"'
                                if (isDiscardingGarbage) {
                                    const matchIndex = content.search(/[{"]/);

                                    if (matchIndex !== -1) {
                                        // Found start!
                                        const char = content[matchIndex];
                                        isDiscardingGarbage = false;

                                        // If we hit a quote first, it means the brace was missed. Inject it.
                                        const prefix = char === '"' ? '{' : '';

                                        // Keep only the valid part
                                        content = prefix + content.slice(matchIndex);
                                    } else {
                                        // No valid start token in this chunk, discard entirely
                                        continue;
                                    }
                                }

                                yield { text: content };
                            }

                            // Usage tracking for official OpenAI
                            if (data.usage) {
                                yield {
                                    usageMetadata: {
                                        prompt: data.usage.prompt_tokens || 0,
                                        candidates: data.usage.completion_tokens || 0,
                                        cached: 0
                                    }
                                };
                            }
                            // Usage tracking for llama.cpp OpenAI-compatible servers
                            else if (data.timings) {
                                yield {
                                    usageMetadata: {
                                        prompt: data.timings.prompt_n || 0,
                                        candidates: data.timings.predicted_n || 0,
                                        cached: 0
                                    }
                                };
                            }
                        } catch {
                            // Partial JSON, wait for more data
                        }
                    }
                }
            } finally {
                reader.releaseLock();
            }
        } catch (error) {
            console.error('OpenAI generation failed:', error);
            throw error;
        }
    }

    async countTokens(_modelId: string, contents: LLMContent[]): Promise<number> {
        // Rough estimate for OpenAI
        const text = contents.flatMap(c => c.parts).map(p => p.text || '').join('\n');
        return Math.ceil(text.length / 4);
    }

    /**
     * Prepares the schema for strict mode:
     * 1. Removes descriptions (for cleaner local compat).
     * 2. Injects additionalProperties: false.
     * 3. Ensures all properties are required.
     */
    private prepareSchema(schema: unknown, strictMode: boolean): object {
        if (!schema || typeof schema !== 'object') return schema as object;

        if (Array.isArray(schema)) {
            return schema.map(item => this.prepareSchema(item, strictMode));
        }

        const processed: Record<string, unknown> = {};
        const input = schema as Record<string, unknown>;

        // Copy and recurse
        for (const [key, value] of Object.entries(input)) {
            if (key === 'description') continue;
            if (value !== null && typeof value === 'object') {
                processed[key] = this.prepareSchema(value, strictMode);
            } else {
                processed[key] = value;
            }
        }

        // Apply strict requirements to Objects
        if (strictMode && processed['type'] === 'object') {
            processed['additionalProperties'] = false;

            // OpenAI Strict Mode requires all properties to be in the 'required' array
            const props = processed['properties'] as Record<string, unknown> | undefined;
            if (props) {
                processed['required'] = Object.keys(props);
            }
        }

        return processed;
    }
}
