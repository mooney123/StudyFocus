import React, { useState, useEffect } from 'react';
import { useDataContext } from '../context/DataContext';
import { useLanguage } from '../context/LanguageContext';
import DailyStudyChart from './charts/DailyStudyChart';
import SubjectPieChart from './charts/SubjectPieChart';
import './Analytics.css';

const Analytics = ({ user }) => {
  const { t, language } = useLanguage();
  const { loadTabData, isLoading } = useDataContext();
  const [sessionData, setSessionData] = useState(null);
  const [dateRange, setDateRange] = useState('7'); // '7', '30', 'custom'
  const [customStartDate, setCustomStartDate] = useState('');
  const [customEndDate, setCustomEndDate] = useState('');
  const [minStudyMinutes, setMinStudyMinutes] = useState(20); // Configurable minimum for streak
  const [analytics, setAnalytics] = useState(null);
  const [chartWidth, setChartWidth] = useState(800);

  // Handle responsive chart sizing
  useEffect(() => {
    const updateChartWidth = () => {
      const width = Math.min(800, window.innerWidth - 100);
      setChartWidth(width);
    };
    
    updateChartWidth();
    window.addEventListener('resize', updateChartWidth);
    return () => window.removeEventListener('resize', updateChartWidth);
  }, []);

  // Load study session data
  useEffect(() => {
    const fetchData = async () => {
      try {
        const data = await loadTabData('study-session');
        console.log('📊 Analytics: Loaded study session data:', {
          hasSessions: !!data.sessions,
          sessionCount: data.sessions?.length || 0,
          firstSession: data.sessions?.[0]
        });
        setSessionData(data);
      } catch (error) {
        console.error('Error loading study session data:', error);
      }
    };
    fetchData();
  }, [loadTabData]);


  // Calculate analytics when data or date range changes
  useEffect(() => {
    if (!sessionData || !sessionData.sessions) {
      setAnalytics(null);
      return;
    }

    const sessions = sessionData.sessions || [];
    
    // Determine date range
    let startDate, endDate;
    const today = new Date();
    today.setHours(23, 59, 59, 999); // End of today
    
    switch (dateRange) {
      case '7':
        startDate = new Date(today);
        startDate.setDate(today.getDate() - 7);
        startDate.setHours(0, 0, 0, 0);
        endDate = today;
        break;
      case '30':
        startDate = new Date(today);
        startDate.setDate(today.getDate() - 30);
        startDate.setHours(0, 0, 0, 0);
        endDate = today;
        break;
      case 'custom':
        if (customStartDate && customEndDate) {
          startDate = new Date(customStartDate);
          startDate.setHours(0, 0, 0, 0);
          endDate = new Date(customEndDate);
          endDate.setHours(23, 59, 59, 999);
        } else {
          setAnalytics(null);
          return;
        }
        break;
      default:
        setAnalytics(null);
        return;
    }

    // Filter sessions by date range
    const filteredSessions = sessions.filter(session => {
      if (!session.startTime) return false;
      const sessionDate = new Date(session.startTime);
      return sessionDate >= startDate && sessionDate <= endDate;
    });

    console.log('📊 Analytics: Filtered sessions for date range:', {
      totalSessions: sessions.length,
      filteredCount: filteredSessions.length,
      dateRange: { start: startDate.toISOString(), end: endDate.toISOString() },
      sampleFiltered: filteredSessions.slice(0, 3)
    });

    // Calculate basic statistics
    const totalSessions = filteredSessions.length;
    const totalMinutes = filteredSessions.reduce((sum, s) => sum + (s.actualDuration || 0), 0);
    const averageDuration = totalSessions > 0 ? Math.round(totalMinutes / totalSessions) : 0;
    const longestSession = filteredSessions.length > 0 
      ? Math.max(...filteredSessions.map(s => s.actualDuration || 0))
      : 0;

    // Study time per day - prioritize date field, fallback to startTime
    const studyTimeByDay = {};
    filteredSessions.forEach(session => {
      let dateKey = null;
      
      // First, try to use the date field if it exists and is in YYYY-MM-DD format
      if (session.date && typeof session.date === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(session.date)) {
        dateKey = session.date;
      } else if (session.startTime) {
        // Fallback to startTime, using local date to match user's timezone
        const sessionDate = new Date(session.startTime);
        const year = sessionDate.getFullYear();
        const month = String(sessionDate.getMonth() + 1).padStart(2, '0');
        const day = String(sessionDate.getDate()).padStart(2, '0');
        dateKey = `${year}-${month}-${day}`;
      }
      
      if (dateKey) {
        studyTimeByDay[dateKey] = (studyTimeByDay[dateKey] || 0) + (session.actualDuration || 0);
      }
    });

    // Study time by subject
    const studyTimeBySubject = {};
    filteredSessions.forEach(session => {
      const subject = session.subject || t('analytics.uncategorized');
      studyTimeBySubject[subject] = (studyTimeBySubject[subject] || 0) + (session.actualDuration || 0);
    });

    // Calculate streaks from the FULL sessions dataset rather than the
    // filtered range — otherwise "Longest streak" on a 7-day view would cap
    // at 7 even if the user had a 60-day streak historically, and the
    // current-streak loop would stop at the filter boundary.
    const toLocalDateKey = (d) => {
      const year = d.getFullYear();
      const month = String(d.getMonth() + 1).padStart(2, '0');
      const day = String(d.getDate()).padStart(2, '0');
      return `${year}-${month}-${day}`;
    };

    const calculateStreaks = () => {
      // Unique local-date keys where user studied at least `minStudyMinutes`.
      const studyDays = new Set();
      sessions.forEach(session => {
        if (session.startTime && (session.actualDuration || 0) >= minStudyMinutes) {
          studyDays.add(toLocalDateKey(new Date(session.startTime)));
        }
      });

      if (studyDays.size === 0) {
        return { currentStreak: 0, longestStreak: 0 };
      }

      const sortedDates = Array.from(studyDays).sort();

      // Longest streak — compare by calendar-date keys instead of ms arithmetic,
      // which would misbehave on DST boundaries (23h / 25h days).
      let longestStreak = 1;
      let run = 1;
      for (let i = 1; i < sortedDates.length; i++) {
        const prev = new Date(sortedDates[i - 1] + 'T00:00:00');
        prev.setDate(prev.getDate() + 1);
        const expectedNextKey = toLocalDateKey(prev);
        if (sortedDates[i] === expectedNextKey) {
          run++;
          if (run > longestStreak) longestStreak = run;
        } else {
          run = 1;
        }
      }

      // Current streak — walk backwards from today (or yesterday if today
      // has no session) without being bounded by the display filter.
      let currentStreak = 0;
      let checkDate = new Date();
      checkDate.setHours(0, 0, 0, 0);
      if (!studyDays.has(toLocalDateKey(checkDate))) {
        checkDate.setDate(checkDate.getDate() - 1);
      }
      while (studyDays.has(toLocalDateKey(checkDate))) {
        currentStreak++;
        checkDate.setDate(checkDate.getDate() - 1);
      }

      return { currentStreak, longestStreak };
    };

    const streaks = calculateStreaks();

    // Format study time by day for chart - use local dates consistently
    const daysArray = [];
    const currentDate = new Date(startDate);
    while (currentDate <= endDate) {
      // Use local date key to match the grouping logic
      const year = currentDate.getFullYear();
      const month = String(currentDate.getMonth() + 1).padStart(2, '0');
      const day = String(currentDate.getDate()).padStart(2, '0');
      const dateKey = `${year}-${month}-${day}`;
      
      daysArray.push({
        date: dateKey,
        dateLabel: currentDate.toLocaleDateString(language === 'zh' ? 'zh-CN' : 'en-US', { month: 'short', day: 'numeric' }),
        minutes: studyTimeByDay[dateKey] || 0
      });
      currentDate.setDate(currentDate.getDate() + 1);
    }

    // Format study time by subject for chart/list
    const subjectsArray = Object.entries(studyTimeBySubject)
      .map(([subject, minutes]) => ({ subject, minutes }))
      .sort((a, b) => b.minutes - a.minutes);

    setAnalytics({
      totalSessions,
      totalMinutes,
      totalHours: Math.round((totalMinutes / 60) * 10) / 10,
      averageDuration,
      longestSession,
      studyTimeByDay: daysArray,
      studyTimeBySubject: subjectsArray,
      streaks,
      dateRange: { startDate, endDate }
    });
  }, [sessionData, dateRange, customStartDate, customEndDate, minStudyMinutes]);

  if (isLoading('study-session')) {
    return (
      <div className="analytics-container">
        <div className="loading">{t('analytics.loading')}</div>
      </div>
    );
  }

  if (!analytics) {
    return (
      <div className="analytics-container">
        <div className="analytics-header">
          <h1>{t('analytics.header')}</h1>
          <p>{t('analytics.subtitle')}</p>
        </div>
        <div className="date-range-selector">
          <label>{t('analytics.dateRange')}</label>
          <select value={dateRange} onChange={(e) => setDateRange(e.target.value)}>
            <option value="7">{t('analytics.last7Days')}</option>
            <option value="30">{t('analytics.last30Days')}</option>
            <option value="custom">{t('analytics.customRange')}</option>
          </select>
          {dateRange === 'custom' && (
            <div className="custom-date-inputs">
              <input
                type="date"
                value={customStartDate}
                onChange={(e) => setCustomStartDate(e.target.value)}
                placeholder={t('analytics.startDate')}
              />
              <input
                type="date"
                value={customEndDate}
                onChange={(e) => setCustomEndDate(e.target.value)}
                placeholder={t('analytics.endDate')}
              />
            </div>
          )}
        </div>
        {dateRange === 'custom' && (!customStartDate || !customEndDate) && (
          <div className="empty-state">
            <p>{t('analytics.selectDates')}</p>
          </div>
        )}
      </div>
    );
  }

  const maxSubjectMinutes = Math.max(...analytics.studyTimeBySubject.map(s => s.minutes), 1);

  return (
    <div className="analytics-container">
      <div className="analytics-header">
        <h1>{t('analytics.header')}</h1>
        <p>{t('analytics.subtitle')}</p>
      </div>

      {/* Date Range Selector */}
      <div className="date-range-selector">
        <label>{t('analytics.dateRange')}</label>
        <select value={dateRange} onChange={(e) => setDateRange(e.target.value)}>
          <option value="7">{t('analytics.last7Days')}</option>
          <option value="30">{t('analytics.last30Days')}</option>
          <option value="custom">{t('analytics.customRange')}</option>
        </select>
        {dateRange === 'custom' && (
          <div className="custom-date-inputs">
            <input
              type="date"
              value={customStartDate}
              onChange={(e) => setCustomStartDate(e.target.value)}
              placeholder={t('analytics.startDate')}
            />
            <span>{t('analytics.to')}</span>
            <input
              type="date"
              value={customEndDate}
              onChange={(e) => setCustomEndDate(e.target.value)}
              placeholder={t('analytics.endDate')}
            />
          </div>
        )}
        <div className="streak-config">
          <label>{t('analytics.minStreakTime')}</label>
          <input
            type="number"
            value={minStudyMinutes}
            onChange={(e) => setMinStudyMinutes(parseInt(e.target.value) || 20)}
            min="1"
            max="120"
          />
        </div>
      </div>

      {/* Summary Cards */}
      <div className="analytics-summary">
        <div className="stat-card">
          <div className="stat-icon">⏱️</div>
          <div className="stat-content">
            <div className="stat-value">{analytics.totalHours}h</div>
            <div className="stat-label">{t('analytics.totalStudyTime')}</div>
            <div className="stat-subtext">{analytics.totalMinutes} {t('analytics.minutes')}</div>
          </div>
        </div>
        <div className="stat-card">
          <div className="stat-icon">📚</div>
          <div className="stat-content">
            <div className="stat-value">{analytics.totalSessions}</div>
            <div className="stat-label">{t('analytics.totalSessions')}</div>
          </div>
        </div>
        <div className="stat-card">
          <div className="stat-icon">📊</div>
          <div className="stat-content">
            <div className="stat-value">{analytics.averageDuration} min</div>
            <div className="stat-label">{t('analytics.averageSession')}</div>
          </div>
        </div>
        <div className="stat-card">
          <div className="stat-icon">🏆</div>
          <div className="stat-content">
            <div className="stat-value">{analytics.longestSession} min</div>
            <div className="stat-label">{t('analytics.longestSession')}</div>
          </div>
        </div>
      </div>

      {/* Streaks */}
      <div className="streaks-section">
        <h2>{t('analytics.studyStreaks')}</h2>
        <div className="streaks-cards">
          <div className="streak-card current">
            <div className="streak-label">{t('analytics.currentStreak')}</div>
            <div className="streak-value">{analytics.streaks.currentStreak}</div>
            <div className="streak-unit">{t('analytics.days')}</div>
          </div>
          <div className="streak-card longest">
            <div className="streak-label">{t('analytics.longestStreak')}</div>
            <div className="streak-value">{analytics.streaks.longestStreak}</div>
            <div className="streak-unit">{t('analytics.days')}</div>
          </div>
        </div>
        <p className="streak-note">
          {t('analytics.streakNote').replace('{minutes}', minStudyMinutes)}
        </p>
      </div>

      {/* Study Time Per Day Chart - D3.js */}
      <div className="chart-section">
        <h2>{t('analytics.studyTimePerDay')}</h2>
        {analytics.studyTimeByDay.length === 0 ? (
          <div className="empty-state">
            <p>{t('analytics.noSessionsInRange')}</p>
          </div>
        ) : (
          <div className="daily-chart-wrapper">
            <DailyStudyChart 
              data={analytics.studyTimeByDay} 
              width={chartWidth} 
              height={300} 
            />
          </div>
        )}
      </div>

      {/* Study Time By Subject - D3.js Pie Chart */}
      <div className="chart-section">
        <h2>{t('analytics.studyTimeBySubject')}</h2>
        {analytics.studyTimeBySubject.length === 0 ? (
          <div className="empty-state">
            <p>{t('analytics.noSubjectsInRange')}</p>
          </div>
        ) : (
          <>
            <div className="d3-charts-wrapper">
              <SubjectPieChart 
                data={analytics.studyTimeBySubject} 
                width={Math.min(500, chartWidth)} 
                height={Math.min(500, chartWidth)} 
              />
              {/* Keep the list view as additional info */}
              <div className="subject-list">
                {analytics.studyTimeBySubject.map((item, index) => (
                  <div key={index} className="subject-item">
                    <div className="subject-name">{item.subject || t('analytics.uncategorized')}</div>
                    <div className="subject-bar-container">
                      <div
                        className="subject-bar"
                        style={{
                          width: `${(item.minutes / maxSubjectMinutes) * 100}%`
                        }}
                      />
                    </div>
                    <div className="subject-time">
                      {Math.round((item.minutes / 60) * 10) / 10}h ({item.minutes}m)
                    </div>
                  </div>
                ))}
              </div>
            </div>
            {/* Legend positioned at bottom right of chart-section */}
            <div className="pie-chart-legend">
              {analytics.studyTimeBySubject.map((item, index) => {
                const colors = [
                  '#3b82f6', '#10b981', '#f59e0b', '#ef4444', 
                  '#8b5cf6', '#06b6d4', '#ec4899', '#84cc16'
                ];
                const color = colors[index % colors.length];
                return (
                  <div key={`legend-${index}`} className="legend-item">
                    <div 
                      className="legend-color" 
                      style={{ backgroundColor: color }}
                    ></div>
                    <span className="legend-text">{item.subject || t('analytics.uncategorized')}</span>
                  </div>
                );
              })}
            </div>
          </>
        )}
      </div>


      {/* Edge Cases Handling */}
      {analytics.totalSessions === 0 && (
        <div className="empty-state-large">
          <div className="empty-icon">📊</div>
          <h3>{t('analytics.noSessionsYet')}</h3>
          <p>{t('analytics.startFirstSession')}</p>
        </div>
      )}
    </div>
  );
};

export default Analytics;

