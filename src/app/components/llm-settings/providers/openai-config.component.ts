import { Component, inject, output } from '@angular/core';
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

      <div class="form-grid columns-2">
        <div class="form-group-vertical">
          <label for="openaiInputPrice">{{ 'settings.customInputPrice' | translate }}</label>
          <input id="openaiInputPrice" type="number" [(ngModel)]="config.settings.inputPrice" (ngModelChange)="configChanged.emit()" step="0.01" min="0">
        </div>
        <div class="form-group-vertical">
          <label for="openaiOutputPrice">{{ 'settings.customOutputPrice' | translate }}</label>
          <input id="openaiOutputPrice" type="number" [(ngModel)]="config.settings.outputPrice" (ngModelChange)="configChanged.emit()" step="0.01" min="0">
        </div>
      </div>

      <div class="form-grid columns-3">
        <div class="form-group-vertical">
          <label for="openaiTemp">{{ 'settings.temperature' | translate }}</label>
          <input id="openaiTemp" type="number" [(ngModel)]="config.settings.temperature" step="0.1" min="0" max="2">
        </div>
        <div class="form-group-vertical">
          <label for="openaiFreq">{{ 'settings.freqPenalty' | translate }}</label>
          <input id="openaiFreq" type="number" [(ngModel)]="config.settings.frequency_penalty" (ngModelChange)="configChanged.emit()" step="0.1" min="-2" max="2">
        </div>
        <div class="form-group-vertical">
          <label for="openaiPres">{{ 'settings.presPenalty' | translate }}</label>
          <input id="openaiPres" type="number" [(ngModel)]="config.settings.presence_penalty" (ngModelChange)="configChanged.emit()" step="0.1" min="-2" max="2">
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
  `]
})
export class OpenAIConfigComponent {
  config = inject(LLM_CONFIG_DATA);
  configChanged = output<void>();
}
