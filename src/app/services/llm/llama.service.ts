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
 * LlamaService - llama.cpp Server Provider (With Schema Injection Shim)
 * * Includes "Schema Injection" logic to force local models to follow 
 * complex JSON structures defined in GameEngine.
 */
@Injectable({
    providedIn: 'root'
})
export class LlamaService implements LLMProvider {
    readonly providerName = 'llama.cpp';
    settingsComponent?: Type<LLMSettingsComponent>;

    private baseUrl = signal('http://localhost:8080');
    private modelId = signal('local-model');
    private temperature = signal(0.8);
    private frequencyPenalty = signal(0.6);
    private presencePenalty = signal(0.4);
    private inputPrice = signal(0);
    private outputPrice = signal(0);

    init(config: LLMProviderConfig): void {
        if (config.baseUrl) {
            this.baseUrl.set(config.baseUrl.replace(/\/$/, ''));
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
        return !!this.baseUrl().trim();
    }

    getCapabilities(): LLMProviderCapabilities {
        return {
            supportsContextCaching: false, // Local handles caching implicitly
            supportsThinking: false,
            supportsStructuredOutput: true, // Supported via Shim + JSON Mode
            isLocalProvider: true
        };
    }

    getAvailableModels(): LLMModelDefinition[] {
        return [
            {
                id: this.modelId(),
                name: `Local Model (${this.modelId()})`,
                getRates: () => ({
                    input: this.inputPrice(),
                    output: this.outputPrice(),
                    cached: 0,
                    cacheStorage: 0
                })
            }
        ];
    }

    getDefaultModelId(): string {
        return 'local-model';
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

        const systemPart = `<|start|>system<|message|>Reasoning: low\n\n${systemInstruction || ''}<|end|>`;

        let historyPart = '';
        for (const content of contents) {
            const role = content.role === 'model' ? 'assistant' : content.role;
            const text = content.parts.map(p => p.text || '').filter(t => t).join('\n');
            if (role === 'assistant') {
                historyPart += `<|start|>assistant<|channel|>final<|message|>${text}<|end|>`;
            } else {
                historyPart += `<|start|>${role}<|message|>${text}<|end|>`;
            }
        }
        historyPart += `<|start|>assistant<|channel|>final<|message|>{`;

        const prompt = systemPart + historyPart;

        let n_keep = -1;
        try {
            const sysTokens = await this.countTokens(this.modelId(), [{ role: 'system', parts: [{ text: systemPart }] }]);
            n_keep = sysTokens;
        } catch (e) {
            console.warn('[LlamaService] Failed to calculate n_keep, defaulting to -1 (Keep All)', e);
        }

        const requestBody = {
            prompt,
            stream: true,
            n_predict: -1,
            temperature: this.temperature(),
            frequency_penalty: this.frequencyPenalty(),
            presence_penalty: this.presencePenalty(),
            repeat_penalty: 1.1,
            stop: [
                "\nUser:",
                "\nSystem:",
                "\n\n\n",
                "</s>",
                "<|eot_id|>",
                "<|im_end|>",
                "<|end|>"
            ],
            cache_prompt: true,
            n_keep: n_keep,
            return_progress: true,
            ...(config.responseSchema ? {
                json_schema: this.cleanSchema(config.responseSchema)
            } : {})
        };

        if (config.responseSchema) {
            console.log(`[LlamaService] Native Schema active. n_keep=${n_keep}.`);
        } else {
            console.log('[LlamaService] Schema not provided, running in free-text mode.');
        }

        try {
            const response = await fetch(`${baseUrl}/completion`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify(requestBody),
                signal: config.signal
            });

            if (!response.ok) {
                throw new Error(`llama.cpp error (${response.status}): ${await response.text()}`);
            }

            if (!response.body) throw new Error('No response body from server.');

            // No manual yield of '{' here because llama.cpp's json_schema 
            // will generate it as the first token of the output.

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
                        if (!trimmed.startsWith('data: ')) continue;

                        const data = trimmed.slice(6);

                        try {
                            const parsed = JSON.parse(data);

                            if (parsed.content) {
                                yield { text: parsed.content };
                            }

                            if (parsed.stop) {
                                yield { finishReason: 'stop' };
                            }

                            // Handle Prompt Processing Progress
                            if (parsed.prompt_progress) {
                                const total = parsed.prompt_progress.total || 1;
                                const processed = parsed.prompt_progress.processed || 0;
                                yield {
                                    usageMetadata: {
                                        prompt: total,
                                        candidates: 0,
                                        cached: 0,
                                        promptProgress: processed / total
                                    }
                                };
                            }

                            // Native llama.cpp usage and timings (final chunk usually)
                            if (parsed.tokens_predicted || parsed.tokens_evaluated || parsed.timings) {
                                yield {
                                    usageMetadata: {
                                        prompt: parsed.tokens_evaluated || 0,
                                        candidates: parsed.tokens_predicted || 0,
                                        cached: parsed.tokens_cached || 0,
                                        promptSpeed: parsed.timings?.prompt_per_second,
                                        completionSpeed: parsed.timings?.predicted_per_second,
                                        totalDuration: (parsed.timings?.predicted_ms || 0) + (parsed.timings?.prompt_ms || 0)
                                    }
                                };
                            }
                        } catch { /* Ignore partial chunks */ }
                    }
                }
            } finally {
                reader.releaseLock();
            }

        } catch (error) {
            console.error('Llama generation failed:', error);
            if (error instanceof TypeError && error.message?.includes('fetch')) {
                throw new Error(`Connection Failed: Check if llama.cpp server is running at ${baseUrl}`, { cause: error });
            }
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

    // =========================================================================
    // Helper Methods
    // =========================================================================

    // NOTE: toNativePrompt removed (inlined in generateContentStream for n_keep calculation)

    /**
     * Recursively removes 'description' keys from a JSON schema.
     * llama.cpp's internal schema-to-gbnf converter can fail on non-structural fields.
     */
    private cleanSchema(schema: object): object {
        if (!schema || typeof schema !== 'object') return schema;

        if (Array.isArray(schema)) {
            return schema.map(item => this.cleanSchema(item));
        }

        const cleaned: Record<string, object | string | number | boolean | null> = {};
        const entries = Object.entries(schema);

        for (const [key, value] of entries) {
            if (key === 'description') continue;
            if (value !== null && typeof value === 'object') {
                cleaned[key] = this.cleanSchema(value);
            } else {
                cleaned[key] = value;
            }
        }
        return cleaned;
    }
}