import { Injectable, signal } from '@angular/core';
import { Subject } from 'rxjs';
import { SpeakContext, VoteContext, TeamProposalContext, MissionContext, AssassinContext, SpeechAct, VoteAction, ProposeTeamAction, MissionAction, AssassinateAction } from '../models/agent.interface';

export type InteractionRequest =
    | { type: 'speak', context: SpeakContext, resolve: (action: SpeechAct) => void }
    | { type: 'vote', context: VoteContext, resolve: (action: VoteAction) => void }
    | { type: 'propose', context: TeamProposalContext, resolve: (action: ProposeTeamAction) => void }
    | { type: 'mission', context: MissionContext, resolve: (action: MissionAction) => void }
    | { type: 'assassinate', context: AssassinContext, resolve: (action: AssassinateAction) => void };

@Injectable({
    providedIn: 'root'
})
export class HumanInteractionService {
    private _currentRequest = signal<InteractionRequest | null>(null);
    readonly currentRequest = this._currentRequest.asReadonly();

    requestAction(request: InteractionRequest) {
        this._currentRequest.set(request);
    }

    resolveAction(action: any) {
        const req = this._currentRequest();
        if (req) {
            req.resolve(action);
            this._currentRequest.set(null);
        }
    }
}
