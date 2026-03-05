import { Routes } from '@angular/router';
import { GamePageComponent } from './pages/game/game-page.component';
import { GameHistoryComponent } from './pages/history/game-history.component';
import { GameReplayComponent } from './pages/replay/game-replay.component';

export const routes: Routes = [
    { path: '', component: GamePageComponent },
    { path: 'history', component: GameHistoryComponent },
    { path: 'history/:id', component: GameReplayComponent },
    { path: 'replay', component: GameReplayComponent },
    { path: '**', redirectTo: '' }
];
