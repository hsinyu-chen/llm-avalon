import { Injectable } from '@angular/core';

@Injectable({
    providedIn: 'root'
})
export class WakeLockService {
    private audio: HTMLAudioElement | null = null;
    private readonly silentBlob = "data:audio/wav;base64,UklGRigAAABXQVZFZm10IBAAAAABAAEARKwAAIhYAQACABAAZGF0YQQAAAAAAP8A/w==";

    constructor() { }

    /**
     * Starts playing a silent audio loop to prevent the system from sleeping.
     * This should be called from a user interaction context to avoid browser autoplay blocks.
     */
    start() {
        if (this.audio) {
            console.log('[WakeLockService] Already running');
            return;
        }

        console.log('[WakeLockService] Starting silent audio playback');
        this.audio = new Audio(this.silentBlob);
        this.audio.loop = true;
        this.audio.play().then(() => {
            console.log('[WakeLockService] Silent audio playing');
        }).catch(err => {
            console.warn('[WakeLockService] Audio play failed (browser might be blocking autoplay):', err);
        });
    }

    /**
     * Stops the silent audio playback.
     */
    stop() {
        if (this.audio) {
            console.log('[WakeLockService] Stopping silent audio playback');
            this.audio.pause();
            this.audio.src = '';
            this.audio = null;
        }
    }
}
