import { Component, inject, computed, signal, output } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { LLM_CONFIG_DATA } from '../../../services/llm/llm-config-portal';
import { GeminiService } from '../../../services/llm/gemini.service';
import { TranslatePipe } from '../../../i18n/translate.pipe';

@Component({
  selector: 'app-gemini-config',
  standalone: true,
  imports: [CommonModule, FormsModule, TranslatePipe],
  template: `
    <div class="provider-fields">
      <div class="form-group">
        <label for="geminiKey">Gemini API Key:</label>
        <input id="geminiKey" type="password" [(ngModel)]="config.settings.apiKey" placeholder="AIza...">
      </div>

      <div class="form-group">
        <label for="geminiModel">Model ID:</label>
        <select id="geminiModel" [ngModel]="modelId()" (ngModelChange)="onModelChange($event)">
          @for (m of models; track m.id) {
            <option [value]="m.id">{{m.name}}</option>
          }
        </select>
      </div>

      @if (supportsThinking()) {
        <div class="form-group">
          <label for="thinkingLevel">Thinking Level:</label>
          <select id="thinkingLevel" 
                  [(ngModel)]="config.settings.additionalSettings!['thinkingLevel']"
                  (ngModelChange)="configChanged.emit()">
            @for (level of thinkingLevels(); track level) {
              <option [value]="level">{{level | titlecase}}</option>
            }
          </select>
          <small class="field-note">{{ 'settings.thinkingNote' | translate }}</small>
        </div>
      }
    </div>
  `,
  styles: [`
    .provider-fields {
      display: flex;
      flex-direction: column;
      gap: 4px;
    }
    .form-group {
      display: grid;
      grid-template-columns: 140px 1fr;
      align-items: center;
      gap: 12px;
      margin-bottom: 16px;

      label { 
        color: #8b949e; 
        font-size: 0.9em; 
        font-weight: 500;
        white-space: nowrap;
        overflow: hidden;
        text-overflow: ellipsis;
      }

      input, select {
        width: 100%;
        box-sizing: border-box;
        padding: 10px;
        background: #0d1117;
        border: 1px solid #30363d;
        border-radius: 6px;
        color: white;
        font-size: 0.95em;
        &:focus { border-color: #58a6ff; outline: none; }
      }

      .field-note {
        grid-column: 2;
        display: block;
        margin-top: 2px;
        font-size: 0.8em;
        color: #8b949e;
        line-height: 1.4;
      }
    }
  `]
})
export class GeminiConfigComponent {
  config = inject(LLM_CONFIG_DATA);
  private geminiService = inject(GeminiService);

  models = this.geminiService.getAvailableModels();

  // Make modelId reactive for computed properties
  modelId = signal(this.config.settings.modelId || this.geminiService.getDefaultModelId());

  configChanged = output<void>();

  constructor() {
    // Ensure additionalSettings is initialized
    if (!this.config.settings.additionalSettings) {
      this.config.settings.additionalSettings = {};
    }
  }

  onModelChange(newModelId: string) {
    this.modelId.set(newModelId);
    this.config.settings.modelId = newModelId;
    this.configChanged.emit();
  }

  thinkingLevels = computed(() => {
    const selectedModel = this.models.find(m => m.id === this.modelId());
    return selectedModel?.allowedThinkingLevels ?? ['minimal', 'low', 'medium', 'high'];
  });

  supportsThinking = computed(() => {
    const selectedModel = this.models.find(m => m.id === this.modelId());
    return selectedModel?.supportsThinking ?? false;
  });
}
