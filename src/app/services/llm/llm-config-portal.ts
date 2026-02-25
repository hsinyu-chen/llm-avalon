import { InjectionToken } from '@angular/core';
import { LLMConfig } from './llm-provider';

/**
 * Injection Token to pass configuration data into provider-specific portal components.
 */
export const LLM_CONFIG_DATA = new InjectionToken<LLMConfig>('LLM_CONFIG_DATA');
