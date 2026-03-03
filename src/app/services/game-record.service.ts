import { Injectable, signal } from '@angular/core';
import { GameRecord, GameRecordSummary } from '../models/game-record';

/**
 * GameRecordService - IndexedDB Persistence for Game Records.
 *
 * Follows the same pattern as LLMStorageService.
 */
@Injectable({
    providedIn: 'root'
})
export class GameRecordService {
    private dbName = 'AvalonGameRecordsDB';
    private storeName = 'records';
    private db: IDBDatabase | null = null;

    private _records = signal<GameRecordSummary[]>([]);
    readonly records = this._records.asReadonly();

    constructor() {
        this.initDB();
    }

    private initDB(): Promise<void> {
        return new Promise((resolve, reject) => {
            const request = indexedDB.open(this.dbName, 1);

            request.onupgradeneeded = (event: IDBVersionChangeEvent) => {
                const target = event.target as IDBOpenDBRequest;
                const db = target.result;
                if (!db.objectStoreNames.contains(this.storeName)) {
                    const store = db.createObjectStore(this.storeName, { keyPath: 'id' });
                    store.createIndex('createdAt', 'createdAt', { unique: false });
                }
            };

            request.onsuccess = (event: Event) => {
                const target = event.target as IDBOpenDBRequest;
                this.db = target.result;
                this.loadRecords();
                resolve();
            };

            request.onerror = (event: Event) => {
                const target = event.target as IDBOpenDBRequest;
                console.error('[GameRecordService] Database error:', target.error);
                reject(target.error);
            };
        });
    }

    private async getStore(mode: IDBTransactionMode): Promise<IDBObjectStore> {
        if (!this.db) await this.initDB();
        const transaction = this.db!.transaction(this.storeName, mode);
        return transaction.objectStore(this.storeName);
    }

    async loadRecords(): Promise<void> {
        const all = await this.getAll();
        // Sort newest first, strip events for the summary list
        const summaries: GameRecordSummary[] = all
            .sort((a, b) => b.createdAt - a.createdAt)
            .map(({ events: _events, ...rest }) => rest);
        this._records.set(summaries);
    }

    async getAll(): Promise<GameRecord[]> {
        const store = await this.getStore('readonly');
        return new Promise((resolve, reject) => {
            const request = store.getAll();
            request.onsuccess = () => resolve(request.result);
            request.onerror = () => reject(request.error);
        });
    }

    async getById(id: string): Promise<GameRecord | undefined> {
        const store = await this.getStore('readonly');
        return new Promise((resolve, reject) => {
            const request = store.get(id);
            request.onsuccess = () => resolve(request.result);
            request.onerror = () => reject(request.error);
        });
    }

    async save(record: GameRecord): Promise<void> {
        const store = await this.getStore('readwrite');
        return new Promise((resolve) => {
            const request = store.put(record);
            request.onsuccess = () => {
                this.loadRecords();
                resolve();
            };
            request.onerror = () => resolve();
        });
    }

    async delete(id: string): Promise<void> {
        const store = await this.getStore('readwrite');
        return new Promise((resolve) => {
            const request = store.delete(id);
            request.onsuccess = () => {
                this.loadRecords();
                resolve();
            };
            request.onerror = () => resolve();
        });
    }

    async exportRecord(id: string): Promise<void> {
        const record = await this.getById(id);
        if (!record) return;
        this.downloadJson([record], `avalon-record-${id}.json`);
    }

    async exportAll(): Promise<void> {
        const all = await this.getAll();
        if (all.length === 0) return;
        this.downloadJson(all, `avalon-records-${Date.now()}.json`);
    }

    async importRecords(file: File): Promise<number> {
        const text = await file.text();
        const data: GameRecord[] = JSON.parse(text);
        const records = Array.isArray(data) ? data : [data];

        let imported = 0;
        for (const record of records) {
            if (record.id && record.events && record.players) {
                await this.save(record);
                imported++;
            }
        }
        return imported;
    }

    private downloadJson(data: GameRecord[], filename: string) {
        const json = JSON.stringify(data, null, 2);
        const blob = new Blob([json], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = filename;
        a.click();
        URL.revokeObjectURL(url);
    }
}
