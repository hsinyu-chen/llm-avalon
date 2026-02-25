import { Component, inject } from '@angular/core';
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
        <input id="openaiModel" type="text" [(ngModel)]="config.settings.modelId" placeholder="gpt-4o">
      </div>
      <div class="form-group">
        <label for="openaiUrl">Base URL (For Proxy/Local):</label>
        <input id="openaiUrl" type="text" [(ngModel)]="config.settings.baseUrl" placeholder="https://api.openai.com/v1">
      </div>
      <div class="form-row">
        <div class="form-group">
          <label for="openaiTemp">{{ 'settings.temperature' | translate }}</label>
          <input id="openaiTemp" type="number" [(ngModel)]="config.settings.temperature" step="0.1" min="0" max="2">
        </div>
        <div class="form-group">
          <label for="openaiFreq">{{ 'settings.freqPenalty' | translate }}</label>
          <input id="openaiFreq" type="number" [(ngModel)]="config.settings.frequency_penalty" step="0.1" min="-2" max="2">
        </div>
        <div class="form-group">
          <label for="openaiPres">{{ 'settings.presPenalty' | translate }}</label>
          <input id="openaiPres" type="number" [(ngModel)]="config.settings.presence_penalty" step="0.1" min="-2" max="2">
        </div>
      </div>
    </div>
  `,
  styles: [`
    .form-row {
      display: flex;
      gap: 12px;
      .form-group { flex: 1; }
    }
    .form-group {
      margin-bottom: 16px;
      label { display: block; margin-bottom: 6px; color: #8b949e; font-size: 0.9em; }
      input {
        width: 100%;
        padding: 10px;
        background: #0d1117;
        border: 1px solid #30363d;
        border-radius: 6px;
        color: white;
        &:focus { border-color: #58a6ff; outline: none; }
      }
    }
  `]
})
export class OpenAIConfigComponent {
  config = inject(LLM_CONFIG_DATA);
}
