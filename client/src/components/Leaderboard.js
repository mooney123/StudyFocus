import React, { useState, useEffect } from 'react';
import { useLanguage } from '../context/LanguageContext';
import './Leaderboard.css';

const Leaderboard = ({ user }) => {
  const { t } = useLanguage();
  const [leaderboardData, setLeaderboardData] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    loadLeaderboardData();
  }, [user]);

  // Function to calculate study score (future-proof for any data)
  const calculateStudyScore = (userData) => {
    const sessions = userData.sessions || 0;
    const totalMinutes = userData.totalMinutes || 0;
    const averageDuration = userData.averageDuration || 0;
    const completionRate = userData.completionRate || 0;
    
    const studyScore = ((sessions * 10) + (totalMinutes * 0.5) + (averageDuration * 2) + (completionRate * 5)) / 20;
    return Math.round(studyScore * 10) / 10; // Round to 1 decimal place
  };

  const loadLeaderboardData = async () => {
    try {
      setLoading(true);
      setError(null);
      const token = localStorage.getItem('token');
      
      if (!token) {
        throw new Error('No authentication token found');
      }

      const response = await fetch('/api/leaderboard', {
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        }
      });

      if (!response.ok) {
        throw new Error('Failed to fetch leaderboard data');
      }

      const data = await response.json();
      console.log('Leaderboard API response:', data);
      console.log('Leaderboard API response type:', Array.isArray(data) ? 'array' : typeof data);
      console.log('Leaderboard API response length:', Array.isArray(data) ? data.length : 'not an array');
      
      // Ensure data is an array
      const apiData = Array.isArray(data) ? data : [];
      
      console.log('Leaderboard: Processing', apiData.length, 'users');
      
      // Study scores are already calculated on the server, but recalculate if missing
      const leaderboardWithScores = apiData.map(userData => {
        if (userData.studyScore !== undefined) {
          return userData; // Server already calculated it
        }
        // Fallback: calculate on client if server didn't provide it
        return {
          ...userData,
          studyScore: calculateStudyScore(userData)
        };
      });
      
      // Sort by study score (descending) - server already sorts, but ensure it's sorted
      leaderboardWithScores.sort((a, b) => b.studyScore - a.studyScore);
      
      console.log('Leaderboard: Final data to display:', leaderboardWithScores);
      setLeaderboardData(leaderboardWithScores);
    } catch (err) {
      console.error('Error loading leaderboard:', err);
      setError(t('leaderboard.loading'));
      setLeaderboardData([]); // Set empty array on error
    } finally {
      setLoading(false);
    }
  };

  const formatDuration = (minutes) => {
    const hours = Math.floor(minutes / 60);
    const mins = minutes % 60;
    if (hours > 0) {
      return `${hours}h ${mins}m`;
    }
    return `${mins}m`;
  };

  const getRankIcon = (index) => {
    return `#${index + 1}`;
  };

  const getStudyScoreLevel = (score) => {
    if (score >= 80) return { level: t('leaderboard.studyMaster'), emoji: '🧠', color: '#10b981' };
    if (score >= 60) return { level: t('leaderboard.studyPro'), emoji: '⚡', color: '#3b82f6' };
    if (score >= 40) return { level: t('leaderboard.studyRegular'), emoji: '📖', color: '#f59e0b' };
    if (score >= 20) return { level: t('leaderboard.studyBeginner'), emoji: '🌱', color: '#ef4444' };
    return { level: t('leaderboard.gettingStarted'), emoji: '🌱', color: '#6b7280' };
  };

  if (loading) {
    return (
      <div className="leaderboard-container">
        <div className="leaderboard-header">
          <h1>📊 {t('leaderboard.title')}</h1>
          <p>{t('leaderboard.subtitle')}</p>
        </div>
        <div className="loading">{t('leaderboard.loading')}</div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="leaderboard-container">
        <div className="leaderboard-header">
          <h1>📊 {t('leaderboard.title')}</h1>
          <p>{t('leaderboard.subtitle')}</p>
        </div>
        <div className="error">{error}</div>
      </div>
    );
  }

  return (
    <div className="leaderboard-container">
      <div className="leaderboard-header">
        <h1>📊 {t('leaderboard.title')}</h1>
        <p>{t('leaderboard.subtitle')}</p>
      </div>

      {!Array.isArray(leaderboardData) || leaderboardData.length === 0 ? (
        <div className="empty-state">
          <p>{t('leaderboard.noData')}</p>
        </div>
      ) : (
        <div className="leaderboard-table-container">
          <table className="leaderboard-table">
            <thead>
              <tr>
                <th>{t('leaderboard.rank')}</th>
                <th>{t('leaderboard.name')}</th>
                <th>{t('leaderboard.studyScore')}</th>
                <th>{t('leaderboard.sessions')}</th>
                <th>{t('leaderboard.totalTime')}</th>
                <th>{t('leaderboard.avgDuration')}</th>
                <th>{t('leaderboard.completionRate')}</th>
              </tr>
            </thead>
            <tbody>
              {Array.isArray(leaderboardData) && leaderboardData.map((entry, index) => (
                <tr key={entry.userId} className={entry.userId === user?.id ? 'current-user' : ''}>
                  <td className="rank-cell">
                    <span className="rank">{getRankIcon(index)}</span>
                  </td>
                  <td className="name-cell">
                    <div className="user-info">
                      <span className="user-name">{entry.name}</span>
                      {entry.userId === user?.id && <span className="you-badge">{t('leaderboard.you')}</span>}
                    </div>
                  </td>
                  <td className="score-cell">
                    <div className="study-score-container">
                      <span className="study-score">{entry.studyScore}/100</span>
                      <span className="study-level" style={{ color: getStudyScoreLevel(entry.studyScore).color }}>
                        {getStudyScoreLevel(entry.studyScore).emoji} {getStudyScoreLevel(entry.studyScore).level}
                      </span>
                    </div>
                  </td>
                  <td className="stat-cell">{entry.sessions}</td>
                  <td className="stat-cell">{formatDuration(entry.totalMinutes)}</td>
                  <td className="stat-cell">{formatDuration(entry.averageDuration)}</td>
                  <td className="stat-cell">
                    <span className={`completion-rate ${entry.completionRate >= 80 ? 'high' : entry.completionRate >= 60 ? 'medium' : 'low'}`}>
                      {entry.completionRate}%
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <div className="leaderboard-footer">
        <p>{t('leaderboard.tip')}</p>
      </div>
    </div>
  );
};

export default Leaderboard;
