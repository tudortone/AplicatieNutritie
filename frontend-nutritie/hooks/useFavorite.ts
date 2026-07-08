import { useState, useEffect, useCallback } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Alert } from 'react-native';

export interface AlimentFavorit {
  id: string;
  nume: string;
  calorii: number;
  proteine: number;
  carbohidrati: number;
  grasimi: number;
}

const STORAGE_KEY = 'favorite_foods';

export function useFavorite() {
  const [favorite, setFavorite] = useState<AlimentFavorit[]>([]);
  const [loading, setLoading] = useState(true);

  const loadFavorites = useCallback(async () => {
    setLoading(true);
    try {
      const stored = await AsyncStorage.getItem(STORAGE_KEY);
      if (stored) {
        setFavorite(JSON.parse(stored));
      } else {
        setFavorite([]);
      }
    } catch (e) {
      console.error('Eroare la citirea alimentelor favorite:', e);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadFavorites();
  }, [loadFavorites]);

  const addFavorite = async (aliment: Omit<AlimentFavorit, 'id'>) => {
    try {
      if (!aliment.nume.trim()) return false;
      
      const newFav: AlimentFavorit = {
        ...aliment,
        nume: aliment.nume.trim(),
        id: Date.now().toString() + Math.random().toString(36).substring(2, 6),
      };

      const updated = [newFav, ...favorite];
      await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(updated));
      setFavorite(updated);
      Alert.alert('❤️ Salvat la Favorite', `"${newFav.nume}" a fost adăugat în lista ta de alimente frecvente.`);
      return true;
    } catch (e) {
      console.error('Eroare la adăugare favorit:', e);
      return false;
    }
  };

  const removeFavorite = async (id: string) => {
    try {
      const updated = favorite.filter((f) => f.id !== id);
      await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(updated));
      setFavorite(updated);
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
