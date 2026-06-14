import React, { useState, useEffect } from 'react';
import Login from './Login';
import Signup from './Signup';
import MainApp from '../App';
import { DataProvider } from '../context/DataContext';
import { ThemeProvider } from '../context/ThemeContext';
import { LanguageProvider } from '../context/LanguageContext';
import { FavoritesProvider } from '../context/FavoritesContext';

const AuthWrapper = () => {
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [user, setUser] = useState(null);
  const [showLogin, setShowLogin] = useState(true);
  const [loading, setLoading] = useState(true);
  const [isNewSignup, setIsNewSignup] = useState(false);

  useEffect(() => {
    // Check if user is already logged in
    const token = localStorage.getItem('token');
    const userData = localStorage.getItem('user');

    if (token && userData) {
      // Verify token is still valid
      fetch('http://localhost:3001/api/auth/verify', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        }
      })
      .then(response => response.json())
      .then(data => {
        if (data.valid) {
          setUser(JSON.parse(userData));
          setIsAuthenticated(true);
          setIsNewSignup(false); // Existing session, not a new signup
        } else {
          // Token is invalid, clear storage
          localStorage.removeItem('token');
          localStorage.removeItem('user');
        }
      })
      .catch(() => {
        // Network error, clear storage
        localStorage.removeItem('token');
        localStorage.removeItem('user');
      })
      .finally(() => {
        setLoading(false);
      });
    } else {
      setLoading(false);
    }
  }, []);

  const handleLogin = (userData) => {
    setUser(userData);
    setIsAuthenticated(true);
    setIsNewSignup(false); // Never show welcome for login
  };

  const handleSignup = (userData) => {
    setUser(userData);
    setIsAuthenticated(true);
    setIsNewSignup(true); // Mark as new signup to show welcome modal
  };

  const handleLogout = () => {
    localStorage.removeItem('token');
    localStorage.removeItem('user');
    setUser(null);
    setIsAuthenticated(false);
    setShowLogin(true);
  };

  const switchToLogin = () => setShowLogin(true);
  const switchToSignup = () => setShowLogin(false);

  if (loading) {
    return (
      <div className="loading-container">
        <div className="loading-spinner"></div>
        <p>Loading StudyFocus...</p>
      </div>
    );
  }

  if (isAuthenticated && user) {
    return (
      <LanguageProvider>
        <ThemeProvider>
          <DataProvider user={user}>
            <FavoritesProvider>
              <MainApp user={user} onLogout={handleLogout} isNewSignup={isNewSignup} />
            </FavoritesProvider>
          </DataProvider>
        </ThemeProvider>
      </LanguageProvider>
    );
  }

  return (
    <LanguageProvider>
      <ThemeProvider>
        {showLogin ? (
          <Login onLogin={handleLogin} switchToSignup={switchToSignup} />
        ) : (
          <Signup onSignup={handleSignup} switchToLogin={switchToLogin} />
        )}
      </ThemeProvider>
    </LanguageProvider>
  );
};

export default AuthWrapper;
