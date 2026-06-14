import { useState, useEffect, useCallback, useRef } from 'react';

const useDataPersistence = (tabName, initialData = {}) => {
  const [data, setData] = useState(initialData);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(null);
  const saveTimeoutRef = useRef(null);
  const lastSavedRef = useRef(null);

  // Get auth token from localStorage
  const getAuthToken = () => {
    return localStorage.getItem('token');
  };

  // Load data from server
  const loadData = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      
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
        throw new Error(`Failed to load data: ${response.statusText}`);
      }

      const serverData = await response.json();
      setData(serverData);
      lastSavedRef.current = JSON.stringify(serverData);
      
    } catch (err) {
      console.error('Error loading data:', err);
      setError(err.message);
      // Keep using initial data if server fails
      setData(initialData);
    } finally {
      setLoading(false);
    }
  }, [tabName, initialData]);

  // Save data to server
  const saveData = useCallback(async (newData, immediate = false) => {
    try {
      setSaving(true);
      setError(null);

      const token = getAuthToken();
      if (!token) {
        throw new Error('No authentication token found');
      }

      const response = await fetch(`http://localhost:3001/api/${tabName}`, {
        method: 'PUT',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(newData)
      });

      if (!response.ok) {
        if (response.status === 401) {
          throw new Error('Authentication failed');
        }
        throw new Error(`Failed to save data: ${response.statusText}`);
      }

      const savedData = await response.json();
      setData(savedData.data);
      lastSavedRef.current = JSON.stringify(savedData.data);
      
      return savedData.data;
    } catch (err) {
      console.error('Error saving data:', err);
      setError(err.message);
      throw err;
    } finally {
      setSaving(false);
    }
  }, [tabName]);

  // Auto-save with debouncing
  const updateData = useCallback((newData, autoSave = true) => {
    setData(newData);
    
    if (autoSave) {
      // Clear existing timeout
      if (saveTimeoutRef.current) {
        clearTimeout(saveTimeoutRef.current);
      }

      // Set new timeout for auto-save (debounced)
      saveTimeoutRef.current = setTimeout(() => {
        const currentDataString = JSON.stringify(newData);
        if (currentDataString !== lastSavedRef.current) {
          saveData(newData).catch(err => {
            console.error('Auto-save failed:', err);
          });
        }
      }, 1000); // Auto-save after 1 second of inactivity
    }
  }, [saveData]);

  // Force save immediately
  const forceSave = useCallback(async (newData = data) => {
    if (saveTimeoutRef.current) {
      clearTimeout(saveTimeoutRef.current);
    }
    return await saveData(newData, true);
  }, [data, saveData]);

  // Load data on mount and when tab changes
  useEffect(() => {
    loadData();
  }, [loadData]);

  // Cleanup timeout on unmount
  useEffect(() => {
    return () => {
      if (saveTimeoutRef.current) {
        clearTimeout(saveTimeoutRef.current);
      }
    };
  }, []);

  // Check if data has unsaved changes
  const hasUnsavedChanges = useCallback(() => {
    return JSON.stringify(data) !== lastSavedRef.current;
  }, [data]);

  return {
    data,
    loading,
    saving,
    error,
    updateData,
    forceSave,
    reloadData: loadData,
    hasUnsavedChanges
  };
};

export default useDataPersistence;







