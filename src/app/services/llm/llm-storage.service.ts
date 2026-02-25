import { Injectable, signal } from '@angular/core';
import { LLMConfig } from './llm-provider';

/**
 * LLMStorageService - IndexedDB Persistence for LLM Configurations.
 * 
 * Handles the management of multiple LLM profiles.
 */
@Injectable({
    providedIn: 'root'
})
export class LLMStorageService {
    private dbName = 'AvalonLLMDB';
    private storeName = 'configs';
    private db: IDBDatabase | null = null;

    private _configs = signal<LLMConfig[]>([]);
    readonly configs = this._configs.asReadonly();

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
                    db.createObjectStore(this.storeName, { keyPath: 'id' });
                }
            };

            request.onsuccess = (event: Event) => {
                const target = event.target as IDBOpenDBRequest;
                this.db = target.result;
                this.loadConfigs();
                resolve();
            };

            request.onerror = (event: Event) => {
                const target = event.target as IDBOpenDBRequest;
                console.error('[LLMStorage] Database error:', target.error);
                reject(target.error);
            };
        });
    }

    async loadConfigs(): Promise<void> {
        const configs = await this.getAll();
        this._configs.set(configs);
    }

    private async getStore(mode: IDBTransactionMode): Promise<IDBObjectStore> {
        if (!this.db) await this.initDB();
        const transaction = this.db!.transaction(this.storeName, mode);
        return transaction.objectStore(this.storeName);
    }

    async getAll(): Promise<LLMConfig[]> {
        const store = await this.getStore('readonly');
        return new Promise((resolve, reject) => {
            const request = store.getAll();
            request.onsuccess = () => resolve(request.result);
            request.onerror = () => reject(request.error);
        });
    }

    async save(config: LLMConfig): Promise<void> {
        // Ensure only one default
        if (config.isDefault) {
            const all = await this.getAll();
            for (const item of all) {
                if (item.id !== config.id && item.isDefault) {
                    item.isDefault = false;
                    await this.save(item);
                }
            }
        }

        const store = await this.getStore('readwrite');
        return new Promise((resolve) => {
            const request = store.put(config);
            request.onsuccess = () => {
                this.loadConfigs();
                resolve();
            };
            request.onerror = () => resolve(); // Silently continue on error or handle as needed
        });
    }

    async delete(id: string): Promise<void> {
        const store = await this.getStore('readwrite');
        return new Promise((resolve) => {
            const request = store.delete(id);
            request.onsuccess = () => {
                this.loadConfigs();
                resolve();
            };
            request.onerror = () => resolve();
        });
    }

    async getById(id: string): Promise<LLMConfig | undefined> {
        const store = await this.getStore('readonly');
        return new Promise((resolve, reject) => {
            const request = store.get(id);
            request.onsuccess = () => resolve(request.result);
            request.onerror = () => reject(request.error);
        });
    }

    async setDefault(id: string): Promise<void> {
        const configs = await this.getAll();
        for (const config of configs) {
            config.isDefault = (config.id === id);
            await this.save(config);
        }
    }
}
