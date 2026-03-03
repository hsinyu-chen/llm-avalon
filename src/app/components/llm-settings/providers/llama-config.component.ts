import { Component, inject, output, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { LLM_CONFIG_DATA } from '../../../services/llm/llm-config-portal';
import { TranslatePipe } from '../../../i18n/translate.pipe';

@Component({
  selector: 'app-llama-config',
  standalone: true,
  imports: [CommonModule, FormsModule, TranslatePipe],
  template: `
    <div class="provider-fields">
      <div class="form-group row-with-btn">
        <label for="llamaUrl">Llama.cpp URL:</label>
        <div class="input-with-btn">
          <input id="llamaUrl" type="text" [(ngModel)]="config.settings.baseUrl" placeholder="http://localhost:8080">
          <button (click)="fetchModel()" [disabled]="!config.settings.baseUrl || isFetching()" class="fetch-btn">
            {{ isFetching() ? '...' : ( 'common.fetch' | translate ) }}
          </button>
        </div>
      </div>
      <div class="form-group">
        <label for="llamaModel">Display Model ID:</label>
        <input id="llamaModel" type="text" [(ngModel)]="config.settings.modelId" (ngModelChange)="configChanged.emit()" placeholder="Llama-3-8B">
      </div>

      <div class="form-grid columns-3">
        <div class="form-group-vertical">
          <label for="llamaInputPrice">{{ 'settings.customInputPrice' | translate }}</label>
          <input id="llamaInputPrice" type="number" [(ngModel)]="config.settings.inputPrice" (ngModelChange)="configChanged.emit()" step="0.01" min="0">
        </div>
        <div class="form-group-vertical">
          <label for="llamaCachePrice">{{ 'settings.customCachePrice' | translate }}</label>
          <input id="llamaCachePrice" type="number" [(ngModel)]="config.settings.cacheInputPrice" (ngModelChange)="configChanged.emit()" step="0.01" min="0">
        </div>
        <div class="form-group-vertical">
          <label for="llamaOutputPrice">{{ 'settings.customOutputPrice' | translate }}</label>
          <input id="llamaOutputPrice" type="number" [(ngModel)]="config.settings.outputPrice" (ngModelChange)="configChanged.emit()" step="0.01" min="0">
        </div>
      </div>

      <div class="extra-kwargs-panel">
        <div class="form-group-toggle">
          <label for="llamaEnableThinking">Enable Thinking:</label>
          <input id="llamaEnableThinking" type="checkbox" [(ngModel)]="config.settings.additionalSettings!['enableThinking']" (ngModelChange)="configChanged.emit()">
        </div>
        <div class="form-group-inline">
          <label for="llamaReasoningEffort">Reasoning Effort:</label>
          <select id="llamaReasoningEffort" [(ngModel)]="config.settings.additionalSettings!['reasoningEffort']" (ngModelChange)="configChanged.emit()">
            <option value="low">Low</option>
            <option value="medium">Medium</option>
            <option value="high">High</option>
          </select>
        </div>
      </div>

      <div class="form-grid columns-3">
        <div class="form-group-vertical">
          <label for="llamaTemp">{{ 'settings.temperature' | translate }}</label>
          <input id="llamaTemp" type="number" [(ngModel)]="config.settings.temperature" step="0.1" min="0" max="2">
        </div>
        <div class="form-group-vertical">
          <label for="llamaFreq">{{ 'settings.freqPenalty' | translate }}</label>
          <input id="llamaFreq" type="number" [(ngModel)]="config.settings.frequency_penalty" (ngModelChange)="configChanged.emit()" step="0.1" min="-2" max="2">
        </div>
        <div class="form-group-vertical">
          <label for="llamaPres">{{ 'settings.presPenalty' | translate }}</label>
          <input id="llamaPres" type="number" [(ngModel)]="config.settings.presence_penalty" (ngModelChange)="configChanged.emit()" step="0.1" min="-2" max="2">
        </div>
      </div>

      <div class="form-grid columns-4">
        <div class="form-group-vertical">
          <label for="llamaTopP">Top P</label>
          <input id="llamaTopP" type="number" [(ngModel)]="config.settings.additionalSettings!['topP']" (ngModelChange)="configChanged.emit()" step="0.05" min="0" max="1">
        </div>
        <div class="form-group-vertical">
          <label for="llamaTopK">Top K</label>
          <input id="llamaTopK" type="number" [(ngModel)]="config.settings.additionalSettings!['topK']" (ngModelChange)="configChanged.emit()" step="1" min="0">
        </div>
        <div class="form-group-vertical">
          <label for="llamaMinP">Min P</label>
          <input id="llamaMinP" type="number" [(ngModel)]="config.settings.additionalSettings!['minP']" (ngModelChange)="configChanged.emit()" step="0.01" min="0" max="1">
        </div>
        <div class="form-group-vertical">
          <label for="llamaRepPen">Rep. Penalty</label>
          <input id="llamaRepPen" type="number" [(ngModel)]="config.settings.additionalSettings!['repetitionPenalty']" (ngModelChange)="configChanged.emit()" step="0.1" min="0" max="2">
        </div>
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
    .row-with-btn {
      .input-with-btn {
        display: flex; gap: 8px;
        input { flex: 1; }
        .fetch-btn {
          padding: 0 16px; background: #238636; color: white; border: none; border-radius: 6px;
          cursor: pointer; font-size: 0.9em; font-weight: 600; min-width: 80px;
          &:disabled { opacity: 0.5; cursor: not-allowed; }
          &:hover:not(:disabled) { background: #2ea043; }
        }
      }
    }
    .form-grid {
      display: grid; gap: 12px; margin-bottom: 16px;
      &.columns-2 { grid-template-columns: 1fr 1fr; }
      &.columns-3 { grid-template-columns: 1fr 1fr 1fr; }
      &.columns-4 { grid-template-columns: 1fr 1fr 1fr 1fr; }
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
export class LlamaConfigComponent {
  config = inject(LLM_CONFIG_DATA);
  configChanged = output<void>();
  isFetching = signal(false);

  constructor() {
    if (!this.config.settings.additionalSettings) {
      this.config.settings.additionalSettings = {};
    }
  }

  async fetchModel() {
    const url = this.config.settings.baseUrl;
    if (!url) return;

    this.isFetching.set(true);
    try {
      const cleanUrl = url.replace(/\/$/, '');
      const response = await fetch(`${cleanUrl}/props`);
      if (response.ok) {
        const data = await response.json();
        if (data.model_alias) {
          this.config.settings.modelId = data.model_alias;
          this.configChanged.emit();
        } else if (data.model_path) {
          // Fallback to basename of model_path
          this.config.settings.modelId = data.model_path.split(/[/\\]/).pop() || data.model_path;
          this.configChanged.emit();
        }
      }
    } catch (e) {
      console.warn('[LlamaConfig] Fetch failed', e);
    } finally {
      this.isFetching.set(false);
    }
  }
}
