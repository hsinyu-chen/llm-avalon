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
    private modelId = signal<string | undefined>(undefined);
    private temperature = signal<number | undefined>(undefined);
    private frequencyPenalty = signal<number | undefined>(undefined);
    private presencePenalty = signal<number | undefined>(undefined);
    private inputPrice = signal<number | undefined>(undefined);
    private cacheInputPrice = signal<number | undefined>(undefined);
    private outputPrice = signal<number | undefined>(undefined);
    private useChatTemplateKwargs = signal<boolean>(false);
    private enableThinking = signal<boolean>(false);
    private reasoningEffort = signal<string>('low');

    init(config: LLMProviderConfig): void {
        const cleanStr = (val: any) => (typeof val === 'string' && val.trim() === '') ? undefined : val;

        if (config.baseUrl) {
            this.baseUrl.set(config.baseUrl.replace(/\/$/, ''));
        }
        if (config.apiKey !== undefined) {
            this.apiKey.set(config.apiKey);
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
        const settings = config.additionalSettings || {};
        if (settings['useChatTemplateKwargs'] !== undefined) {
            this.useChatTemplateKwargs.set(settings['useChatTemplateKwargs'] as boolean);
        }
        if (settings['enableThinking'] !== undefined) {
            this.enableThinking.set(settings['enableThinking'] as boolean);
        }
        if (settings['reasoningEffort'] !== undefined) {
            this.reasoningEffort.set(settings['reasoningEffort'] as string);
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
            isLocalProvider: false,
            supportsSpeedMetrics: false
        };
    }

    getAvailableModels(): LLMModelDefinition[] {
        const id = this.modelId() || 'gpt-4o';
        return [
            {
                id: id,
                name: `OpenAI: ${id}`,
                getRates: () => ({
                    input: this.inputPrice() ?? 0,
                    cached: this.cacheInputPrice() ?? 0,
                    output: this.outputPrice() ?? 0
                })
            }
        ];
    }

    getDefaultModelId(): string {
        return this.modelId() || 'gpt-4o';
    }

    getModelId(): string {
        return this.modelId() || 'gpt-4o';
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
            model: this.modelId() || 'gpt-4o',
            messages,
            stream: true,
            stream_options: { include_usage: true },
            ...(this.temperature() != null ? { temperature: this.temperature() } : {}),
            ...(this.frequencyPenalty() != null ? { frequency_penalty: this.frequencyPenalty() } : {}),
            ...(this.presencePenalty() != null ? { presence_penalty: this.presencePenalty() } : {}),
            ...(config.responseSchema ? {
                response_format: {
                    type: 'json_schema',
                    json_schema: {
                        name: 'structured_output',
                        strict: true,
                        schema: this.prepareSchema(config.responseSchema)
                    }
                },
            } : {}),
            ...(this.useChatTemplateKwargs() ? {
                extra_body: {
                    chat_template_kwargs: {
                        enable_thinking: this.enableThinking(),
                        reasoning_effort: this.reasoningEffort()
                    }
                }
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
                                yield { text: delta.content };
                            }

                            // Handle explicit thinking content (if server supports it)
                            if (delta?.reasoning_content) {
                                yield { text: delta.reasoning_content, thought: true };
                            }

                            // Usage tracking
                            if (data.usage || data.timings) {
                                const usage = data.usage;
                                const timings = data.timings;
                                yield {
                                    usageMetadata: {
                                        prompt: (usage?.prompt_tokens ?? timings?.prompt_n) || 0,
                                        candidates: (usage?.completion_tokens ?? timings?.predicted_n) || 0,
                                        cached: (usage?.prompt_tokens_details?.cached_tokens ?? timings?.cache_n) || 0
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
