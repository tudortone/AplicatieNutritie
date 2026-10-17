import { useState, useEffect, useCallback, useRef } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useAuth } from '../context/AuthContext';
import { generareUuid } from '../lib/idUtils';

export interface AlimentFavorit {
  id: string;
  nume: string;
  calorii: number;
  proteine: number;
  carbohidrati: number;
  grasimi: number;
}

export const STORAGE_KEY_BASE = 'favorite_foods';

export function getFavoritesStorageKey(userId?: string | null): string {
  if (userId && typeof userId === 'string' && userId.trim().length > 0) {
    return `${STORAGE_KEY_BASE}_${userId.trim()}`;
  }
  return STORAGE_KEY_BASE;
}

export function useFavorite() {
  const [favorite, setFavorite] = useState<AlimentFavorit[]>([]);
  const [loading, setLoading] = useState(true);

  let userId: string | null = null;
  try {
    const auth = useAuth();
    userId = auth?.user?.id ?? null;
  } catch {
    userId = null;
  }

  const storageKey = getFavoritesStorageKey(userId);

  const loadFavorites = useCallback(async () => {
    setLoading(true);
    try {
      let stored = await AsyncStorage.getItem(storageKey);
      if (!stored && userId) {
        // Transparent backward compatibility: check legacy unpartitioned key
        const legacy = await AsyncStorage.getItem(STORAGE_KEY_BASE);
        if (legacy) {
          stored = legacy;
          await AsyncStorage.setItem(storageKey, legacy);
        }
      }
      if (stored) {
        setFavorite(JSON.parse(stored));
      } else {
        setFavorite([]);
      }
    } catch (e) {
      console.error('Eroare la citirea alimentelor favorite:', e);
      setFavorite([]);
    } finally {
      setLoading(false);
    }
  }, [storageKey, userId]);

  useEffect(() => {
    loadFavorites();
  }, [loadFavorites]);

  const addFavorite = async (aliment: Omit<AlimentFavorit, 'id'>) => {
    try {
      if (!aliment.nume.trim()) return false;
      
      const newFav: AlimentFavorit = {
        ...aliment,
        nume: aliment.nume.trim(),
        id: generareUuid(),
      };

      let updated: AlimentFavorit[] = [];
      setFavorite((current) => {
        const withoutDup = current.filter(
          (f) => f.nume.toLowerCase().trim() !== newFav.nume.toLowerCase()
        );
        updated = [newFav, ...withoutDup];
        return updated;
      });

      await AsyncStorage.setItem(storageKey, JSON.stringify(updated));
      return true;
    } catch (e) {
      console.error('Eroare la adăugare favorit:', e);
      return false;
    }
  };

  const removeFavorite = async (id: string) => {
    try {
      let updated: AlimentFavorit[] = [];
      setFavorite((current) => {
        updated = current.filter((f) => f.id !== id);
        return updated;
      });

      await AsyncStorage.setItem(storageKey, JSON.stringify(updated));
      return true;
    } catch (e) {
      console.error('Eroare la ștergere favorit:', e);
      return false;
    }
  };

  const isFavorite = (nume: string) => {
    return favorite.some((f) => f.nume.toLowerCase().trim() === nume.toLowerCase().trim());
  };

  return {
    favorite,
    loading,
    addFavorite,
    removeFavorite,
    isFavorite,
    reload: loadFavorites,
  };
}
