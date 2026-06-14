import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';

const FAVORITES_STORAGE_KEY = 'studyfocus_favorites';

// Tab metadata for all favoritable tabs
const TAB_METADATA = {
  'study-session': { name: 'Study Session', icon: '📚' },
  'analytics': { name: 'Analytics', icon: '📊' },
  'schedule-planner': { name: 'Schedule Planner', icon: '📅' },
  'study-together': { name: 'Study Together', icon: '🤝' },
  'friends': { name: 'Friends', icon: '👥' },
  'leaderboard': { name: 'Leaderboard', icon: '🏆' },
  'messages': { name: 'Messages', icon: '💬' },
  'study-ai': { name: 'StudyFocus AI', icon: '🤖' }
};

const FavoritesContext = createContext();

export const useFavorites = () => {
  const context = useContext(FavoritesContext);
  if (!context) {
    throw new Error('useFavorites must be used within a FavoritesProvider');
  }
  return context;
};

// Load favorites from localStorage
const loadFavorites = () => {
  try {
    const stored = localStorage.getItem(FAVORITES_STORAGE_KEY);
    if (stored) {
      const favorites = JSON.parse(stored);
      // Validate that all favorites are valid tab IDs
      return favorites.filter(tabId => TAB_METADATA[tabId]);
    }
  } catch (error) {
    console.error('Error loading favorites:', error);
  }
  return [];
};

// Save favorites to localStorage
const saveFavorites = (favorites) => {
  try {
    localStorage.setItem(FAVORITES_STORAGE_KEY, JSON.stringify(favorites));
  } catch (error) {
    console.error('Error saving favorites:', error);
  }
};

export const FavoritesProvider = ({ children }) => {
  const [favorites, setFavorites] = useState([]);

  // Load favorites on mount
  useEffect(() => {
    const loaded = loadFavorites();
    setFavorites(loaded);
  }, []);

  // Toggle favorite status for a tab
  const toggleFavorite = useCallback((tabId) => {
    setFavorites(prev => {
      const isFavorited = prev.includes(tabId);
      let newFavorites;
      
      if (isFavorited) {
        // Remove from favorites
        newFavorites = prev.filter(id => id !== tabId);
      } else {
        // Add to favorites (add to end to maintain order)
        newFavorites = [...prev, tabId];
      }
      
      saveFavorites(newFavorites);
      return newFavorites;
    });
  }, []);

  // Check if a tab is favorited
  const isFavorited = useCallback((tabId) => {
    return favorites.includes(tabId);
  }, [favorites]);

  // Get favorited tabs with metadata
  const getFavoritedTabs = useCallback(() => {
    return favorites
      .map(tabId => ({
        id: tabId,
        ...TAB_METADATA[tabId]
      }))
      .filter(tab => tab.name); // Filter out any invalid tabs
  }, [favorites]);

  const value = {
    favorites,
    toggleFavorite,
    isFavorited,
    getFavoritedTabs
  };

  return (
    <FavoritesContext.Provider value={value}>
      {children}
    </FavoritesContext.Provider>
  );
};

