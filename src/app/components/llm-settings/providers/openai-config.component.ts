import { Component, computed, inject, output } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { LLM_CONFIG_DATA } from '../../../services/llm/llm-config-portal';
import { TranslatePipe } from '../../../i18n/translate.pipe';

@Component({
  selector: 'app-openai-config',
  standalone: true,
  imports: [CommonModule, FormsModule, TranslatePipe],
  template: `
    <div class="provider-fields">
      <div class="form-group">
        <label for="openaiKey">API Key:</label>
        <input id="openaiKey" type="password" [(ngModel)]="config.settings.apiKey" placeholder="sk-...">
      </div>
      <div class="form-group">
        <label for="openaiModel">Model ID:</label>
        <input id="openaiModel" type="text" [(ngModel)]="config.settings.modelId" (ngModelChange)="configChanged.emit()" placeholder="gpt-4o">
      </div>
      <div class="form-group">
        <label for="openaiUrl">Base URL:</label>
        <input id="openaiUrl" type="text" [(ngModel)]="config.settings.baseUrl" placeholder="https://api.openai.com/v1">
      </div>

      <div class="form-grid columns-3">
        <div class="form-group-vertical">
          <label for="openaiInputPrice">{{ 'settings.customInputPrice' | translate }}</label>
          <input id="openaiInputPrice" type="text" inputmode="decimal" [ngModel]="config.settings.inputPrice" (ngModelChange)="config.settings.inputPrice = $event === '' ? undefined : +$event; configChanged.emit()" placeholder="0.00">
        </div>
        <div class="form-group-vertical">
          <label for="openaiCachePrice">{{ 'settings.customCachePrice' | translate }}</label>
          <input id="openaiCachePrice" type="text" inputmode="decimal" [ngModel]="config.settings.cacheInputPrice" (ngModelChange)="config.settings.cacheInputPrice = $event === '' ? undefined : +$event; configChanged.emit()" placeholder="0.00">
        </div>
        <div class="form-group-vertical">
          <label for="openaiOutputPrice">{{ 'settings.customOutputPrice' | translate }}</label>
          <input id="openaiOutputPrice" type="text" inputmode="decimal" [ngModel]="config.settings.outputPrice" (ngModelChange)="config.settings.outputPrice = $event === '' ? undefined : +$event; configChanged.emit()" placeholder="0.00">
        </div>
      </div>

      <div class="form-grid columns-3">
        <div class="form-group-vertical">
          <label for="openaiTemp">{{ 'settings.temperature' | translate }}</label>
          <input id="openaiTemp" type="text" inputmode="decimal" [ngModel]="config.settings.temperature" (ngModelChange)="config.settings.temperature = $event === '' ? undefined : +$event" placeholder="0.7">
        </div>
        <div class="form-group-vertical">
          <label for="openaiFreq">{{ 'settings.freqPenalty' | translate }}</label>
          <input id="openaiFreq" type="text" inputmode="decimal" [ngModel]="config.settings.frequency_penalty" (ngModelChange)="config.settings.frequency_penalty = $event === '' ? undefined : +$event; configChanged.emit()" placeholder="0.0">
        </div>
        <div class="form-group-vertical">
          <label for="openaiPres">{{ 'settings.presPenalty' | translate }}</label>
          <input id="openaiPres" type="text" inputmode="decimal" [ngModel]="config.settings.presence_penalty" (ngModelChange)="config.settings.presence_penalty = $event === '' ? undefined : +$event; configChanged.emit()" placeholder="0.0">
        </div>
      </div>

      <div class="form-group-toggle">
        <label for="openaiUseChatKwargs">Use Chat Template Kwargs (OpenRouter/etc):</label>
        <input id="openaiUseChatKwargs" type="checkbox" [(ngModel)]="config.settings.additionalSettings!['useChatTemplateKwargs']" (ngModelChange)="configChanged.emit()">
      </div>

      <div class="extra-kwargs-panel" *ngIf="config.settings.additionalSettings!['useChatTemplateKwargs']">
        <div class="form-group-inline">
          <label for="openaiEnableThinking">Enable Thinking:</label>
          <input id="openaiEnableThinking" type="checkbox" [(ngModel)]="config.settings.additionalSettings!['enableThinking']" (ngModelChange)="configChanged.emit()">
        </div>
        <div class="form-group-inline">
          <label for="openaiReasoningEffort">Reasoning Effort:</label>
          <select id="openaiReasoningEffort" [(ngModel)]="config.settings.additionalSettings!['reasoningEffort']" (ngModelChange)="configChanged.emit()">
            <option value="low">Low</option>
            <option value="medium">Medium</option>
            <option value="high">High</option>
          </select>
        </div>
      </div>

      <div class="form-group preset-group" *ngIf="isOpenAIUrl()">
        <label for="openaiPreset">{{ 'settings.presetModel' | translate }}</label>
        <select id="openaiPreset" (change)="onPresetChange($event)">
          <option value="">-- Choose Preset Pricing --</option>
          <option *ngFor="let p of presets" [value]="p.id">{{ p.id }}</option>
        </select>
      </div>
    </div>
  `,
  styles: [`
    .provider-fields { display: flex; flex-direction: column; gap: 4px; }
    .form-group {
      display: grid;
      grid-template-columns: 140px 1fr;
      align-items: center;
      gap: 12px;
      margin-bottom: 16px;
      label { color: #8b949e; font-size: 0.9em; font-weight: 500; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
      input {
        width: 100%; box-sizing: border-box; padding: 10px; background: #0d1117; border: 1px solid #30363d;
        border-radius: 6px; color: white; font-size: 0.95em;
        &:focus { border-color: #58a6ff; outline: none; }
      }
    }
    .form-grid {
      display: grid; gap: 12px; margin-bottom: 16px;
      &.columns-2 { grid-template-columns: 1fr 1fr; }
      &.columns-3 { grid-template-columns: 1fr 1fr 1fr; }
      .form-group-vertical {
        display: flex; flex-direction: column; gap: 6px;
        label { color: #8b949e; font-size: 0.85em; font-weight: 500; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
        input {
          width: 100%; box-sizing: border-box; padding: 8px 10px; background: #0d1117; border: 1px solid #30363d;
          border-radius: 6px; color: white; font-size: 0.9em;
          &:focus { border-color: #58a6ff; outline: none; }
        }
      }
    }
    .preset-group {
      margin-top: 8px;
      select {
        width: 100%; box-sizing: border-box; padding: 10px; background: #0d1117; border: 1px solid #30363d;
        border-radius: 6px; color: white; font-size: 0.95em;
        &:focus { border-color: #58a6ff; outline: none; }
      }
    }
    .form-group-toggle {
      display: flex; align-items: center; gap: 12px; margin-bottom: 12px;
      label { color: #8b949e; font-size: 0.9em; font-weight: 500; cursor: pointer; }
      input[type="checkbox"] { width: 18px; height: 18px; cursor: pointer; }
    }
    .extra-kwargs-panel {
      background: #161b22; border: 1px solid #30363d; border-radius: 6px; padding: 12px; margin-bottom: 16px;
      display: flex; flex-direction: column; gap: 10px;
    }
    .form-group-inline {
      display: flex; align-items: center; gap: 12px;
      label { color: #8b949e; font-size: 0.85em; width: 120px; }
      input[type="checkbox"] { width: 16px; height: 16px; }
      select {
        flex: 1; padding: 6px; background: #0d1117; border: 1px solid #30363d;
        border-radius: 4px; color: white; font-size: 0.9em;
      }
    }
  `]
})
export class OpenAIConfigComponent {
  config = inject(LLM_CONFIG_DATA);
  configChanged = output<void>();

  presets = OPENAI_PRESETS;

  constructor() {
    if (!this.config.settings.additionalSettings) {
      this.config.settings.additionalSettings = {};
    }
  }

  isOpenAIUrl = computed(() => {
    const url = this.config.settings.baseUrl || '';
    return url === '' || url.toLowerCase().includes('openai');
  });

  onPresetChange(event: Event) {
    const select = event.target as HTMLSelectElement;
    const presetId = select.value;
    const preset = this.presets.find(p => p.id === presetId);
    if (preset) {
      this.config.settings.modelId = preset.id;
      this.config.settings.inputPrice = preset.input;
      this.config.settings.cacheInputPrice = preset.cached;
      this.config.settings.outputPrice = preset.output;
      this.configChanged.emit();
    }
  }
}

const OPENAI_PRESETS = [
  { id: 'gpt-5.2', input: 1.75, cached: 0.175, output: 14.00 },
  { id: 'gpt-5.1', input: 1.25, cached: 0.125, output: 10.00 },
  { id: 'gpt-5', input: 1.25, cached: 0.125, output: 10.00 },
  { id: 'gpt-5-mini', input: 0.25, cached: 0.025, output: 2.00 },
  { id: 'gpt-5-nano', input: 0.05, cached: 0.005, output: 0.40 },
  { id: 'gpt-5.2-chat-latest', input: 1.75, cached: 0.175, output: 14.00 },
  { id: 'gpt-5.1-chat-latest', input: 1.25, cached: 0.125, output: 10.00 },
  { id: 'gpt-5-chat-latest', input: 1.25, cached: 0.125, output: 10.00 },
  { id: 'gpt-5.3-codex', input: 1.75, cached: 0.175, output: 14.00 },
  { id: 'gpt-5.2-codex', input: 1.75, cached: 0.175, output: 14.00 },
  { id: 'gpt-5.1-codex-max', input: 1.25, cached: 0.125, output: 10.00 },
  { id: 'gpt-5.1-codex', input: 1.25, cached: 0.125, output: 10.00 },
  { id: 'gpt-5-codex', input: 1.25, cached: 0.125, output: 10.00 },
  { id: 'gpt-5.2-pro', input: 21.00, cached: 0, output: 168.00 },
  { id: 'gpt-5-pro', input: 15.00, cached: 0, output: 120.00 },
  { id: 'gpt-4.1', input: 2.00, cached: 0.50, output: 8.00 },
  { id: 'gpt-4.1-mini', input: 0.40, cached: 0.10, output: 1.60 },
  { id: 'gpt-4.1-nano', input: 0.10, cached: 0.025, output: 0.40 },
  { id: 'gpt-4o', input: 2.50, cached: 1.25, output: 10.00 },
  { id: 'gpt-4o-mini', input: 0.15, cached: 0.075, output: 0.60 },
  { id: 'gpt-4o-audio-preview', input: 2.50, cached: 0, output: 10.00 },
  { id: 'gpt-4o-mini-audio-preview', input: 0.15, cached: 0, output: 0.60 },
  { id: 'o1', input: 15.00, cached: 7.50, output: 60.00 },
  { id: 'o1-pro', input: 150.00, cached: 0, output: 600.00 },
  { id: 'o3-pro', input: 20.00, cached: 0, output: 80.00 },
  { id: 'o3', input: 2.00, cached: 0.50, output: 8.00 },
  { id: 'o3-deep-research', input: 10.00, cached: 2.50, output: 40.00 },
  { id: 'o4-mini', input: 1.10, cached: 0.275, output: 4.40 },
  { id: 'o4-mini-deep-research', input: 2.00, cached: 0.50, output: 8.00 },
  { id: 'o3-mini', input: 1.10, cached: 0.55, output: 4.40 },
  { id: 'o1-mini', input: 1.10, cached: 0.55, output: 4.40 },
];
