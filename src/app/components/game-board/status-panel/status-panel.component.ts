import { Component, input, ChangeDetectionStrategy } from '@angular/core';
import { DecimalPipe } from '@angular/common';
import { TranslatePipe } from '../../../i18n/translate.pipe';

@Component({
    selector: 'app-status-panel',
    standalone: true,
    imports: [DecimalPipe, TranslatePipe],
    templateUrl: './status-panel.component.html',
    styleUrl: './status-panel.component.scss',
    changeDetection: ChangeDetectionStrategy.OnPush
})
export class StatusPanelComponent {
    round = input.required<number>();
    failedVotes = input.required<number>();
    phase = input.required<string>();
    tokenUsage = input.required<{
        promptTokens: number;
        cachedTokens: number;
        completionTokens: number;
        totalCost: number;
    }>();
}
