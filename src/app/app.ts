import { Component, inject, signal } from '@angular/core';
import { GameEngineService } from './services/game-engine.service';
import { GameSetupComponent } from './components/game-setup/game-setup.component';
import { GameBoardComponent } from './components/game-board/game-board.component';
import { LLMSettingsComponent } from './components/llm-settings/llm-settings.component';
import { LLMProviderInitService } from './services/llm/llm-provider-init.service';
import { I18nService } from './i18n/i18n.service';
import { TranslatePipe } from './i18n/translate.pipe';
import { FormsModule } from '@angular/forms';

@Component({
  selector: 'app-root',
  standalone: true,
  imports: [GameSetupComponent, GameBoardComponent, LLMSettingsComponent, TranslatePipe, FormsModule],
  template: `
    <div class="app-layout">
      <header>
        <div class="header-content">
          <div class="title-group">
            <h1>{{ (phase() === 'SETUP' ? 'setup.title' : 'board.gameTitle') | translate }}</h1>
          </div>
          <div class="header-actions">
            <select class="global-lang-select" [ngModel]="i18n.userLang()" (ngModelChange)="i18n.setLanguage($event)">
              <option value="system">🌍 Auto</option>
              <option value="en">🇺🇸 EN</option>
              <option value="zh-TW">🇹🇼 中文</option>
            </select>
            @if (phase() !== 'SETUP') {
              <button class="interrupt-btn" (click)="confirmInterrupt()" title="Abort Game">
                🛑 {{ 'board.interruptBtn' | translate }}
              </button>
            }
            <button class="settings-trigger" (click)="showSettings.set(true)" title="LLM Settings">
              ⚙️ Config
            </button>
          </div>
        </div>
      </header>
      
      <main>
        @if (phase() === 'SETUP') {
          <app-game-setup></app-game-setup>
        } @else {
          <app-game-board></app-game-board>
        }
      </main>

      @if (showSettings()) {
        <app-llm-settings (settingsClosed)="showSettings.set(false)"></app-llm-settings>
      }
    </div>
  `,
  styles: [`
    .app-layout {
      display: flex;
      flex-direction: column;
      height: 100vh;
      background: #0d1117;
      color: #c9d1d9;
      overflow: hidden;
    }
    header {
      flex: 0 0 70px;
      padding: 0 20px;
      background: #161b22;
      border-bottom: 1px solid #30363d;
      display: flex;
      align-items: center;
    }
    .header-content {
      width: 100%;
      max-width: 1200px;
      margin: 0 auto;
      display: flex;
      justify-content: space-between;
      align-items: center;
    }
    h1 { margin: 0; color: #58a6ff; font-size: 1.5em; }
    
    .header-actions {
      display: flex;
      gap: 12px;
      align-items: center;
    }
    .global-lang-select {
      background: #21262d;
      border: 1px solid #30363d;
      color: #c9d1d9;
      padding: 6px;
      border-radius: 6px;
      cursor: pointer;
      font-size: 0.9em;
      outline: none;
    }
    .global-lang-select:hover { border-color: #8b949e; }
    
    .interrupt-btn {
      background: #3e1b1b;
      border: 1px solid #da3633;
      color: #f85149;
      padding: 8px 16px;
      border-radius: 6px;
      cursor: pointer;
      font-size: 0.9em;
      transition: all 0.2s;
      &:hover { background: #da3633; color: white; }
    }
    .settings-trigger {
      background: #21262d;
      border: 1px solid #30363d;
      color: #c9d1d9;
      padding: 8px 16px;
      border-radius: 6px;
      cursor: pointer;
      font-size: 0.9em;
      transition: all 0.2s;
      &:hover { background: #30363d; border-color: #8b949e; }
    }

    main { 
      flex: 1; 
      overflow: hidden;
      display: flex;
      flex-direction: column;
    }
  `]
})
export class AppComponent {
  private engine = inject(GameEngineService);
  private llmInit = inject(LLMProviderInitService);

  phase = this.engine.phase;
  showSettings = signal(false);

  public i18n = inject(I18nService);

  constructor() {
    this.llmInit.initialize();
  }

  confirmInterrupt() {
    if (confirm('Are you sure you want to interrupt and exit the current game?')) {
      this.engine.reset();
    }
  }
}
