/**
 * offlineSync.ts — Sistem Offline-first + Sync FIFO (Outbox & Optimistic UI).
 * ⚠️ ATENȚIE: Acest modul NU este integrat momentan în aplicație.
 * Mutatiile se fac direct prin Supabase fără coadă de offline sync.
 * Poate fi integrat ulterior prin înlocuirea apelurilor directe
 * cu apeluri prin `offlineSync.enqueueMutation()`.
 *
 * Conform specificației NutriAI v7 (Secțiunea 3.C).
 * - Sursă de adevăr locală (AsyncStorage)
 * - Fiecare mutație scrisă local imediat cu _syncStatus: 'pending' + uuid client
 * - Outbox FIFO la reconectare
 * - Idempotență + Conflict resolution prin last-write-wins (updated_at)
 */

import AsyncStorage from '@react-native-async-storage/async-storage';
import { AppState } from 'react-native';
import { supabase } from '../supabase';

export type SyncStatus = 'pending' | 'synced' | 'failed' | 'saving';

export interface OutboxMutation {
  client_uuid: string;
  table: string;
  action: 'insert' | 'update' | 'delete';
  payload: Record<string, any>;
  updated_at: string;
  _syncStatus: SyncStatus;
}

const OUTBOX_STORAGE_KEY = 'nutriai_offline_outbox_v7';

/**
 * Generează un UUID local client pentru idempotență
 */
export function generateClientUuid(): string {
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    const v = c === 'x' ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}

class OfflineSyncEngine {
  private isProcessing = false;

  constructor() {
    AppState.addEventListener('change', (state) => {
      if (state === 'active') {
        this.processOutbox();
      }
    });
  }

  async getOutbox(): Promise<OutboxMutation[]> {
    try {
      const raw = await AsyncStorage.getItem(OUTBOX_STORAGE_KEY);
      return raw ? JSON.parse(raw) : [];
    } catch {
      return [];
    }
  }

  async saveOutbox(list: OutboxMutation[]) {
    try {
      await AsyncStorage.setItem(OUTBOX_STORAGE_KEY, JSON.stringify(list));
    } catch (e) {
      console.warn('Eroare salvare outbox:', e);
    }
  }

  /**
   * Adaugă o mutație în coada locală (Optimistic UI) și încearcă sincronizarea
   */
  async enqueueMutation(
    table: string,
    action: 'insert' | 'update' | 'delete',
    payload: Record<string, any>
  ): Promise<OutboxMutation> {
    const client_uuid = payload.client_uuid || payload.id || generateClientUuid();
    const now = new Date().toISOString();

    const mutation: OutboxMutation = {
      client_uuid,
      table,
      action,
      payload: { ...payload, updated_at: payload.updated_at || now },
      updated_at: payload.updated_at || now,
      _syncStatus: 'pending',
    };

    const outbox = await this.getOutbox();
    // Conflict resolution: last-write-wins pe același client_uuid
    const existingIdx = outbox.findIndex((m) => m.client_uuid === client_uuid && m.table === table);
    if (existingIdx >= 0) {
      if (new Date(mutation.updated_at).getTime() >= new Date(outbox[existingIdx].updated_at).getTime()) {
        outbox[existingIdx] = mutation;
      }
    } else {
      outbox.push(mutation);
    }

    await this.saveOutbox(outbox);
    this.processOutbox(); // declanșare asincronă FIFO
    return mutation;
  }

  /**
   * Procesare FIFO outbox (când există rețea / la reconectare)
   */
  async processOutbox() {
    if (this.isProcessing) return;
    this.isProcessing = true;

    try {
      const outbox = await this.getOutbox();
      if (outbox.length === 0) {
        this.isProcessing = false;
        return;
      }

      const remaining: OutboxMutation[] = [];

      for (const item of outbox) {
        try {
          if (item.action === 'insert') {
            const { error } = await supabase.from(item.table).upsert(item.payload, { onConflict: 'id' });
            if (error) {
              console.warn(`[Sync FIFO] upsert eșuat pentru ${item.table}/${item.client_uuid}:`, error.message);
              remaining.push({ ...item, _syncStatus: 'failed' });
            }
          } else if (item.action === 'update') {
            const { error } = await supabase.from(item.table).update(item.payload).eq('id', item.payload.id || item.client_uuid);
            if (error) {
              remaining.push({ ...item, _syncStatus: 'failed' });
            }
          } else if (item.action === 'delete') {
            const { error } = await supabase.from(item.table).delete().eq('id', item.payload.id || item.client_uuid);
            if (error) {
              remaining.push({ ...item, _syncStatus: 'failed' });
            }
          }
        } catch {
          remaining.push({ ...item, _syncStatus: 'failed' });
        }
      }

      await this.saveOutbox(remaining);
    } finally {
      this.isProcessing = false;
    }
  }
}

export const offlineSync = new OfflineSyncEngine();
