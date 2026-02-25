import { Component, inject, computed } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { LLM_CONFIG_DATA } from '../../../services/llm/llm-config-portal';
import { GeminiService } from '../../../services/llm/gemini.service';

@Component({
  selector: 'app-gemini-config',
  standalone: true,
  imports: [CommonModule, FormsModule],
  template: `
    <div class="provider-fields">
      <div class="form-group">
        <label for="geminiKey">Gemini API Key:</label>
        <input id="geminiKey" type="password" [(ngModel)]="config.settings.apiKey" placeholder="AIza...">
      </div>

      <div class="form-group">
        <label for="geminiModel">Model ID:</label>
        <select id="geminiModel" [(ngModel)]="config.settings.modelId">
          @for (m of models; track m.id) {
            <option [value]="m.id">{{m.name}}</option>
          }
        </select>
      </div>

      @if (supportsThinking()) {
        <div class="form-group">
          <label for="thinkingLevel">Thinking Level (General):</label>
          <select id="thinkingLevel" [(ngModel)]="config.settings.thinkingLevelGeneral">
            @for (level of thinkingLevels; track level) {
              <option [value]="level">{{level | titlecase}}</option>
            }
          </select>
        </div>
      }

      <div class="form-group">
        <label for="frequencyPenalty">Frequency Penalty:</label>
        <input id="frequencyPenalty" type="number" step="0.1" min="-2" max="2" [(ngModel)]="config.settings.frequency_penalty">
      </div>

      <div class="form-group">
        <label for="presencePenalty">Presence Penalty:</label>
        <input id="presencePenalty" type="number" step="0.1" min="-2" max="2" [(ngModel)]="config.settings.presence_penalty">
      </div>
    </div>
  `,
  styles: [`
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
export class GeminiConfigComponent {
  config = inject(LLM_CONFIG_DATA);
  private geminiService = inject(GeminiService);

  models = this.geminiService.getAvailableModels();

  thinkingLevels = ['minimal', 'low', 'medium', 'high'];

  supportsThinking = computed(() => {
    const selectedModel = this.models.find(m => m.id === this.config.settings.modelId);
    return selectedModel?.supportsThinking ?? false;
  });
}
