import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';

const DataContext = createContext();

export const useDataContext = () => {
  const context = useContext(DataContext);
  if (!context) {
    throw new Error('useDataContext must be used within a DataProvider');
  }
  return context;
};

export const DataProvider = ({ children, user }) => {
  const [tabData, setTabData] = useState({});
  const [loadingStates, setLoadingStates] = useState({});
  const [savingStates, setSavingStates] = useState({});
  const [errors, setErrors] = useState({});

  // Get auth token
  const getAuthToken = () => {
    return localStorage.getItem('token');
  };

  // Load data for a specific tab
  const loadTabData = useCallback(async (tabName, initialData = {}) => {
    try {
      setLoadingStates(prev => ({ ...prev, [tabName]: true }));
      setErrors(prev => ({ ...prev, [tabName]: null }));
      
      const token = getAuthToken();
      if (!token) {
        throw new Error('No authentication token found');
      }

      const response = await fetch(`http://localhost:3001/api/${tabName}`, {
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        }
      });

      if (!response.ok) {
        if (response.status === 401) {
          throw new Error('Authentication failed');
        }
        throw new Error(`Failed to load ${tabName} data: ${response.statusText}`);
      }

      const serverData = await response.json();
      setTabData(prev => ({ ...prev, [tabName]: serverData }));
      
      return serverData;
    } catch (err) {
      console.error(`Error loading ${tabName} data:`, err);
      setErrors(prev => ({ ...prev, [tabName]: err.message }));
      // Use initial data as fallback
      setTabData(prev => ({ ...prev, [tabName]: initialData }));
      return initialData;
    } finally {
      setLoadingStates(prev => ({ ...prev, [tabName]: false }));
    }
  }, []);

  // Save data for a specific tab
  const saveTabData = async (tabName, data) => {
    try {
      setSavingStates(prev => ({ ...prev, [tabName]: true }));
      setErrors(prev => ({ ...prev, [tabName]: null }));
      
      const token = getAuthToken();
      if (!token) {
        throw new Error('No authentication token found');
      }

      // Add metadata
      const dataToSave = {
        ...data,
        lastUpdated: new Date().toISOString(),
        userId: user?.id
      };

      const response = await fetch(`http://localhost:3001/api/${tabName}`, {
        method: 'PUT',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(dataToSave)
      });

      if (!response.ok) {
        if (response.status === 401) {
          throw new Error('Authentication failed');
        }
        throw new Error(`Failed to save ${tabName} data: ${response.statusText}`);
      }

      const savedData = await response.json();
      setTabData(prev => ({ ...prev, [tabName]: savedData.data }));
      
      return savedData.data;
    } catch (err) {
      console.error(`Error saving ${tabName} data:`, err);
      setErrors(prev => ({ ...prev, [tabName]: err.message }));
      throw err;
    } finally {
      setSavingStates(prev => ({ ...prev, [tabName]: false }));
    }
  };

  // Update data for a specific tab (optimistic update)
  const updateTabData = useCallback((tabName, newData) => {
    setTabData(prev => ({ ...prev, [tabName]: newData }));
  }, []);

  // Get current data for a tab
  const getTabData = useCallback((tabName) => {
    return tabData[tabName] || {};
  }, [tabData]);

  // Get loading state for a tab
  const isLoading = (tabName) => {
    return loadingStates[tabName] || false;
  };

  // Get saving state for a tab
  const isSaving = (tabName) => {
    return savingStates[tabName] || false;
  };

  // Get error for a tab
  const getError = (tabName) => {
    return errors[tabName];
  };

  // Clear error for a tab
  const clearError = (tabName) => {
    setErrors(prev => ({ ...prev, [tabName]: null }));
  };

  // Load all user data
  const loadAllUserData = async () => {
    const tabs = ['study-session', 'friends', 'leaderboard', 'stats', 'schedule-planner'];
    
    try {
      const token = getAuthToken();
      if (!token) {
        throw new Error('No authentication token found');
      }

      const response = await fetch('http://localhost:3001/api/user/data', {
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        }
      });

      if (!response.ok) {
        throw new Error(`Failed to load user data: ${response.statusText}`);
      }

      const userData = await response.json();
      setTabData(userData);
      
      return userData;
    } catch (err) {
      console.error('Error loading all user data:', err);
      // Load each tab individually as fallback
      tabs.forEach(tab => {
        loadTabData(tab);
      });
    }
  };

  // Clear all data (on logout)
  const clearAllData = () => {
    setTabData({});
    setLoadingStates({});
    setSavingStates({});
    setErrors({});
  };

  // Auto-save with debouncing
  const autoSave = useCallback((() => {
    const timeouts = {};
    
    return (tabName, data, delay = 2000) => {
      if (timeouts[tabName]) {
        clearTimeout(timeouts[tabName]);
      }
      
      timeouts[tabName] = setTimeout(() => {
        saveTabData(tabName, data).catch(err => {
          console.error(`Auto-save failed for ${tabName}:`, err);
        });
      }, delay);
    };
  })(), []);

  const value = {
    // Data management
    tabData,
    getTabData,
    updateTabData,
    loadTabData,
    saveTabData,
    loadAllUserData,
    clearAllData,
    
    // States
    isLoading,
    isSaving,
    getError,
    clearError,
    
    // Auto-save
    autoSave
  };

  return (
    <DataContext.Provider value={value}>
      {children}
    </DataContext.Provider>
  );
};
