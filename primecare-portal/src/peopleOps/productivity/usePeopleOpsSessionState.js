import { useCallback, useEffect, useState } from "react";

const RECENT_KEY = "primecare.peopleOps.recentlyViewed";
const FAVORITES_KEY = "primecare.peopleOps.favorites";
const MAX_RECENT = 8;
const MAX_FAVORITES = 12;

function readList(key) {
  try {
    const raw = sessionStorage.getItem(key);
    const parsed = raw ? JSON.parse(raw) : [];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function writeList(key, rows) {
  try {
    sessionStorage.setItem(key, JSON.stringify(rows));
  } catch {
    // ignore quota errors
  }
}

/**
 * Browser-session persistence for recently viewed and favorites.
 */
export function usePeopleOpsSessionState() {
  const [recentlyViewed, setRecentlyViewed] = useState(() => readList(RECENT_KEY));
  const [favorites, setFavorites] = useState(() => readList(FAVORITES_KEY));

  useEffect(() => {
    writeList(RECENT_KEY, recentlyViewed);
  }, [recentlyViewed]);

  useEffect(() => {
    writeList(FAVORITES_KEY, favorites);
  }, [favorites]);

  const trackView = useCallback((item) => {
    if (!item?.id || !item?.label) return;
    setRecentlyViewed((prev) => {
      const next = [{ ...item, viewedAt: Date.now() }, ...prev.filter((row) => row.id !== item.id)];
      return next.slice(0, MAX_RECENT);
    });
  }, []);

  const toggleFavorite = useCallback((item) => {
    if (!item?.favoriteKey) return;
    setFavorites((prev) => {
      const exists = prev.some((row) => row.favoriteKey === item.favoriteKey);
      if (exists) return prev.filter((row) => row.favoriteKey !== item.favoriteKey);
      return [{ ...item, pinnedAt: Date.now() }, ...prev].slice(0, MAX_FAVORITES);
    });
  }, []);

  const isFavorite = useCallback(
    (favoriteKey) => favorites.some((row) => row.favoriteKey === favoriteKey),
    [favorites]
  );

  return {
    recentlyViewed,
    favorites,
    trackView,
    toggleFavorite,
    isFavorite,
  };
}
