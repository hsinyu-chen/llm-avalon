import { Component, inject, output } from '@angular/core';
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
      <div class="form-group">
        <label for="llamaUrl">Llama.cpp URL:</label>
        <input id="llamaUrl" type="text" [(ngModel)]="config.settings.baseUrl" placeholder="http://localhost:8080">
      </div>
      <div class="form-group">
        <label for="llamaModel">Display Model ID:</label>
        <input id="llamaModel" type="text" [(ngModel)]="config.settings.modelId" (ngModelChange)="configChanged.emit()" placeholder="Llama-3-8B">
      </div>

      <div class="form-grid columns-2">
        <div class="form-group-vertical">
          <label for="llamaInputPrice">{{ 'settings.customInputPrice' | translate }}</label>
          <input id="llamaInputPrice" type="number" [(ngModel)]="config.settings.inputPrice" (ngModelChange)="configChanged.emit()" step="0.01" min="0">
        </div>
        <div class="form-group-vertical">
          <label for="llamaOutputPrice">{{ 'settings.customOutputPrice' | translate }}</label>
          <input id="llamaOutputPrice" type="number" [(ngModel)]="config.settings.outputPrice" (ngModelChange)="configChanged.emit()" step="0.01" min="0">
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
export class LlamaConfigComponent {
  config = inject(LLM_CONFIG_DATA);
  configChanged = output<void>();
}
