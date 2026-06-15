import React, { useState, useEffect, useCallback, useRef, useImperativeHandle, forwardRef } from 'react';
import { useDataContext } from '../context/DataContext';
import { useLanguage } from '../context/LanguageContext';
import DataInput from './DataInput';
import SessionSettingsModal from './SessionSettingsModal';
import './StudySession.css';
import './SynchronizedStudySession.css';

const StudySession = forwardRef(({ minimizedSession, setMinimizedSession }, ref) => {
  const { t } = useLanguage();
  const { 
    getTabData, 
    updateTabData, 
    loadTabData, 
    autoSave 
  } = useDataContext();

  const [localData, setLocalData] = useState({});
  const [activeSession, setActiveSession] = useState(null);
  const [timeLeft, setTimeLeft] = useState(0);
  const [isRunning, setIsRunning] = useState(false);
  const [sessionType, setSessionType] = useState('pomodoro');
  const [customMinutes, setCustomMinutes] = useState(25);
  
  // Break timer states
  const [isBreakMode, setIsBreakMode] = useState(false);
  const [breakTimeLeft, setBreakTimeLeft] = useState(0);
  const [isBreakRunning, setIsBreakRunning] = useState(false);
  const pausedStudyTimeRef = useRef(0);

  // Wall-clock baselines for the study / break timers. Browsers throttle
  // setInterval in backgrounded tabs (~1Hz/min on Chrome), so a pure
  // `time - 1` decrement drifts badly. We instead anchor each running
  // segment to (a) the wall-clock timestamp when it started running and
  // (b) the timeLeft value at that moment. Each tick derives the current
  // timeLeft from `baseline - (Date.now() - startedAt)/1000` so catching
  // up after a long background pause is automatic.
  const studyTimerStartedAtRef = useRef(null);
  const studyTimerBaselineRef = useRef(0);
  const breakTimerStartedAtRef = useRef(null);
  const breakTimerBaselineRef = useRef(0);
  
  // Settings modal state
  const [showSettings, setShowSettings] = useState(false);

  // Blackboard state
  const [showBlackboard, setShowBlackboard] = useState(false);
  const [blackboardTool, setBlackboardTool] = useState('pen'); // 'pen', 'eraser'
  const [blackboardColor, setBlackboardColor] = useState('#ffffff');
  const [isDrawing, setIsDrawing] = useState(false);
  const blackboardCanvasRef = useRef(null);
  const blackboardCtxRef = useRef(null);
  const blackboardSyncIntervalRef = useRef(null);
  const lastBlackboardStateRef = useRef(null);
  const drawingHistoryRef = useRef([]);
  const redoHistoryRef = useRef([]);
  const sessionJustEndedRef = useRef(false);
  const prevMinimizedSessionRef = useRef(null);
  // Debounce handle for blackboard network saves. Rapid strokes used to fire
  // one POST per stroke (a 500ms setTimeout with no cancel), which flooded the
  // server and uploaded ~1 MB PNGs each time. We now reset this timer on every
  // stroke and only flush once drawing has actually stopped for a moment.
  const blackboardSaveTimeoutRef = useRef(null);
  // Cap undo/redo. Each snapshot is a canvas-sized PNG dataURL — at
  // 1200x700 that's ~300 KB–1 MB each. 50 snapshots is 50 MB of live heap
  // per user; 15 is a much friendlier ceiling and still covers normal usage.
  const BLACKBOARD_HISTORY_LIMIT = 15;

  // Load and validate data on mount
  // SINGLE SOURCE OF TRUTH: localData.activeSession is the authoritative state
  // This effect ONLY validates and cleans data - it does NOT restore sessions
  useEffect(() => {
    console.log('[StudySession] Loading data...');
    loadTabData('study-session').then(data => {
      console.log('[StudySession] Data loaded:', { 
        hasActiveSession: !!data.activeSession,
        activeSessionStatus: data.activeSession?.status 
      });
      // Deduplicate sessions by ID to prevent duplicate keys
      if (data && data.sessions && Array.isArray(data.sessions)) {
        const sessions = data.sessions || [];
        const uniqueSessions = sessions.reduce((acc, session) => {
          const existingIndex = acc.findIndex(s => s.id === session.id);
          if (existingIndex >= 0) {
            // If duplicate found, keep the one with the most recent endTime or startTime
            const existing = acc[existingIndex];
            const currentEndTime = session.endTime ? new Date(session.endTime).getTime() : 0;
            const existingEndTime = existing.endTime ? new Date(existing.endTime).getTime() : 0;
            if (currentEndTime > existingEndTime || (!currentEndTime && !existingEndTime && new Date(session.startTime).getTime() > new Date(existing.startTime).getTime())) {
              acc[existingIndex] = session;
            }
          } else {
            acc.push(session);
          }
          return acc;
        }, []);
        
        // If duplicates were found, update data
        if (uniqueSessions.length !== sessions.length) {
          data.sessions = uniqueSessions;
          updateTabData('study-session', data);
        }
      }
      
      // Recalculate totals from actual sessions to ensure accuracy
      if (data && data.sessions) {
        const sessions = data.sessions || [];
        const actualTotalSessions = sessions.length;
        const actualTotalTime = sessions.reduce((sum, s) => sum + (s.actualDuration || 0), 0);
        
        // Update totals if they don't match (fix any discrepancies)
        if (data.totalSessions !== actualTotalSessions || data.totalTime !== actualTotalTime) {
          data.totalSessions = actualTotalSessions;
          data.totalTime = actualTotalTime;
          // Save corrected data
          updateTabData('study-session', data);
        }
      }
      
      // Validate and clean up any invalid active sessions in persisted data
      // This ensures data integrity but does NOT affect local state restoration
      if (data.activeSession) {
        const session = data.activeSession;
        
        // CRITICAL: Check if session has been stopped or completed
        if (session.status === 'stopped' || session.status === 'completed') {
          // Clear stopped/completed session from persisted data
          const cleanedData = { ...data, activeSession: null };
          updateTabData('study-session', cleanedData);
          setLocalData(cleanedData);
          return;
        }
        
        // Validate session is genuinely active
        const hasValidTime = (session.timeLeft > 0) || (session.breakTimeLeft > 0);
        const isRunning = session.isRunning || session.isBreakRunning;
        const sessionAge = session.startTime 
          ? (Date.now() - new Date(session.startTime).getTime()) / (1000 * 60 * 60) // hours
          : Infinity;
        const isRecent = sessionAge < 24;
        
        // Clear invalid/expired sessions from persisted data
        if (!hasValidTime && !isRunning && !isRecent) {
          const cleanedData = { ...data, activeSession: null };
          updateTabData('study-session', cleanedData);
          setLocalData(cleanedData);
          return;
        }
      }
      
      // Set validated data (restore logic will handle session restoration separately)
      setLocalData(data);
    });
  }, [loadTabData, updateTabData]);
  
  // Handle session end when minimizedSession is cleared (from App.js X button)
  useEffect(() => {
    // Only clear session if minimizedSession transitions FROM a value TO null
    // AND the data has been explicitly cleared (session actually ended, not just maximizing)
    // This prevents clearing when maximizing (where data still exists) or when starting new sessions
    const wasMinimized = prevMinimizedSessionRef.current !== null;
    const isNowNull = minimizedSession === null;
    
    // Only proceed if we transitioned from minimized to null
    if (!wasMinimized || !isNowNull) {
      prevMinimizedSessionRef.current = minimizedSession;
      return;
    }
    
    // Check if data exists - if it does, we're maximizing (restore will handle it)
    // Only clear if data is explicitly cleared AND we have an active session locally
    // Also check that localData has been initialized (not empty object) to avoid race conditions
    const dataInitialized = Object.keys(localData).length > 0 || localData.activeSession !== undefined;
    const dataExists = !!localData.activeSession;
    
    // Only clear if: data is initialized, data doesn't exist, and we have active session
    // This means the session was explicitly ended (App.js cleared the data)
    if (dataInitialized && !dataExists && activeSession) {
      console.log('[StudySession] Session ended via X button - clearing state immediately');
      // Stop all timers by clearing running states
      setIsRunning(false);
      setIsBreakRunning(false);
      setIsBreakMode(false);
      setTimeLeft(0);
      setBreakTimeLeft(0);
      pausedStudyTimeRef.current = 0;
      // Clear active session
      setActiveSession(null);
      sessionJustEndedRef.current = true;
    }
    
    // Update previous value for next comparison
    prevMinimizedSessionRef.current = minimizedSession;
  }, [minimizedSession, activeSession, localData]);

  // Restore session when maximizing (minimizedSession becomes null)
  // SINGLE RESTORE POINT: Only restore when explicitly maximizing AND there's valid data
  useEffect(() => {
    // Hard guard: if an end just happened (set by App on X), skip any restore
    // Keep checking the guard for a short period to handle multiple effect runs
    if (localStorage.getItem('ss_end_guard') === '1') {
      // Reload data to ensure we have the latest state (with activeSession cleared)
      loadTabData('study-session').then(data => {
        setLocalData(data);
        // Only clear the guard if data confirms session is cleared
        // This prevents restore if data update hasn't completed yet
        if (!data.activeSession) {
          // Data is updated, safe to clear guard after a brief delay
          setTimeout(() => {
            localStorage.removeItem('ss_end_guard');
          }, 50);
        }
        // If data still has activeSession, keep guard set (App.js will clear it eventually)
      });
      return;
    }

    console.log('[StudySession] Restore check:', { 
      minimizedSession: !!minimizedSession, 
      hasActiveSessionInData: !!localData.activeSession,
      hasActiveSessionLocal: !!activeSession,
      sessionJustEnded: sessionJustEndedRef.current
    });
    
    // If session was just ended, don't restore - clear the flag after a delay
    if (sessionJustEndedRef.current) {
      // Reset the flag after ensuring data is cleared
      if (!localData.activeSession) {
        setTimeout(() => {
          sessionJustEndedRef.current = false;
        }, 200);
      }
      return;
    }
    
    // Case 1: Maximizing - restore from persisted data if valid
    // IMPORTANT: Only restore if minimizedSession was previously set (user clicked expand)
    // If minimizedSession goes from null to null, or if we don't have a previous minimized state,
    // we should NOT restore (this prevents restore when X is clicked)
    if (!minimizedSession && localData.activeSession && !activeSession) {
      const savedSession = localData.activeSession;
      
      // Double-check: session must be active (already validated in loadTabData)
      if (savedSession.status === 'stopped' || savedSession.status === 'completed') {
        // Should not happen (loadTabData should have cleared this), but handle it
        const updatedData = { ...localData, activeSession: null };
        setLocalData(updatedData);
        updateTabData('study-session', updatedData);
        return;
      }
      
      // Restore the session
      setActiveSession(savedSession);
      
      // Calculate elapsed time since minimization
      let restoredTimeLeft = savedSession.timeLeft || 0;
      let restoredBreakTimeLeft = savedSession.breakTimeLeft || 0;
      
      if (savedSession.minimizedAt && savedSession.isRunning) {
        const elapsedSeconds = Math.floor((Date.now() - savedSession.minimizedAt) / 1000);
        if (savedSession.isBreakMode && savedSession.isBreakRunning) {
          restoredBreakTimeLeft = Math.max(0, (savedSession.breakTimeLeft || 0) - elapsedSeconds);
        } else if (!savedSession.isBreakMode) {
          restoredTimeLeft = Math.max(0, (savedSession.timeLeft || 0) - elapsedSeconds);
        }
      }
      
      // Restore timer state
      if (restoredTimeLeft > 0) {
        setTimeLeft(restoredTimeLeft);
      } else if (savedSession.duration) {
        setTimeLeft(savedSession.duration * 60);
      } else {
        setTimeLeft(0);
      }
      setIsRunning(savedSession.isRunning || false);
      setIsBreakMode(savedSession.isBreakMode || false);
      setBreakTimeLeft(restoredBreakTimeLeft);
      setIsBreakRunning(savedSession.isBreakRunning || false);
      setSessionType(savedSession.sessionType || savedSession.type || 'pomodoro');
    }
    
    // Case 2: Session ended - clear local state if data says no active session
    if (!minimizedSession && !localData.activeSession && activeSession) {
      // Session was ended (X button clicked), clear all local state
      console.log('[StudySession] Case 2: Clearing local state after session ended');
      sessionJustEndedRef.current = true; // Mark that session was just ended
      setActiveSession(null);
      setIsRunning(false);
      setIsBreakMode(false);
      setIsBreakRunning(false);
      setTimeLeft(0);
      setBreakTimeLeft(0);
      pausedStudyTimeRef.current = 0;
    }
  }, [minimizedSession, localData.activeSession, activeSession]);

  // Main study timer logic - continues running even when minimized.
  // Wall-clock anchored so background-tab throttling cannot cause drift.
  useEffect(() => {
    if (!(isRunning && !isBreakMode && activeSession)) {
      // Not running — release the baseline so the next resume re-anchors.
      studyTimerStartedAtRef.current = null;
      return undefined;
    }

    // Anchor the current running segment to wall-clock on (re)start.
    studyTimerStartedAtRef.current = Date.now();
    studyTimerBaselineRef.current = timeLeft;

    const computeRemaining = () => {
      const startedAt = studyTimerStartedAtRef.current;
      if (startedAt == null) return timeLeft;
      const elapsed = Math.floor((Date.now() - startedAt) / 1000);
      return Math.max(0, studyTimerBaselineRef.current - elapsed);
    };

    const tick = () => {
      const newTime = computeRemaining();

      // Propagate to minimized widget (pure display)
      if (minimizedSession) {
        setMinimizedSession(prev => (prev ? { ...prev, timeLeft: newTime } : prev));
      }

      // Persist current remaining so refresh/minimize restores correctly
      if (activeSession) {
        setLocalData(prevData => {
          const updatedSession = { ...activeSession, timeLeft: newTime };
          const updatedData = { ...prevData, activeSession: updatedSession };
          updateTabData('study-session', updatedData);
          return updatedData;
        });
      }

      setTimeLeft(newTime);

      if (newTime <= 0) {
        completeSession();
      }
    };

    const interval = setInterval(tick, 1000);

    // When the tab becomes visible again, immediately reconcile the timer
    // instead of waiting up to a minute for the next throttled tick.
    const handleVisibility = () => {
      if (document.visibilityState === 'visible') tick();
    };
    document.addEventListener('visibilitychange', handleVisibility);

    return () => {
      clearInterval(interval);
      document.removeEventListener('visibilitychange', handleVisibility);
      // Capture current remaining so the next resume re-anchors from here.
      studyTimerBaselineRef.current = computeRemaining();
      studyTimerStartedAtRef.current = null;
    };
    // `timeLeft` intentionally NOT in deps — the baseline is only taken on
    // (re)start; including it would restart the anchor every tick.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isRunning, isBreakMode, activeSession, minimizedSession]);

  // Break timer logic - continues running even when minimized.
  // Wall-clock anchored (see study timer above for rationale).
  useEffect(() => {
    if (!(isBreakRunning && activeSession)) {
      breakTimerStartedAtRef.current = null;
      return undefined;
    }

    breakTimerStartedAtRef.current = Date.now();
    breakTimerBaselineRef.current = breakTimeLeft;

    const computeRemaining = () => {
      const startedAt = breakTimerStartedAtRef.current;
      if (startedAt == null) return breakTimeLeft;
      const elapsed = Math.floor((Date.now() - startedAt) / 1000);
      return Math.max(0, breakTimerBaselineRef.current - elapsed);
    };

    const tick = () => {
      const newTime = computeRemaining();

      if (minimizedSession) {
        setMinimizedSession(prev => (prev ? { ...prev, timeLeft: newTime, isBreakMode: true } : prev));
      }

      if (activeSession) {
        setLocalData(prevData => {
          const updatedSession = { ...activeSession, breakTimeLeft: newTime };
          const updatedData = { ...prevData, activeSession: updatedSession };
          updateTabData('study-session', updatedData);
          return updatedData;
        });
      }

      setBreakTimeLeft(newTime);

      if (newTime <= 0) {
        // Break completed, return to study timer
        setIsBreakMode(false);
        setIsBreakRunning(false);
        setBreakTimeLeft(0);

        // Resume study timer with paused time
        setTimeLeft(pausedStudyTimeRef.current);
        setIsRunning(true);
      }
    };

    const interval = setInterval(tick, 1000);

    const handleVisibility = () => {
      if (document.visibilityState === 'visible') tick();
    };
    document.addEventListener('visibilitychange', handleVisibility);

    return () => {
      clearInterval(interval);
      document.removeEventListener('visibilitychange', handleVisibility);
      breakTimerBaselineRef.current = computeRemaining();
      breakTimerStartedAtRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isBreakRunning, activeSession, minimizedSession]);

  // Handle data changes
  const handleDataChange = (field, value) => {
    const newData = { ...localData, [field]: value };
    setLocalData(newData);
    updateTabData('study-session', newData);
    autoSave('study-session', newData);
  };

  // Start a new study session
  const startSession = (type, duration) => {
    const sessionId = Date.now().toString();
    const newSession = {
      id: sessionId,
      type: type,
      duration: duration,
      startTime: new Date().toISOString(),
      status: 'active',
      subject: localData.currentSubject || '',
      notes: localData.sessionNotes || ''
    };

    setActiveSession(newSession);
    setTimeLeft(duration * 60); // Convert minutes to seconds
    setIsRunning(true);
    setSessionType(type);
    
    // Save active session to data
    const updatedData = {
      ...localData,
      activeSession: {
        ...newSession,
        timeLeft: duration * 60,
        isRunning: true,
        isBreakMode: false,
        breakTimeLeft: 0,
        isBreakRunning: false,
        sessionType: type
      }
    };
    setLocalData(updatedData);
    updateTabData('study-session', updatedData);
  };

  // Complete a study session
  const completeSession = () => {
    if (!activeSession) return;

    const completedSession = {
      ...activeSession,
      endTime: new Date().toISOString(),
      status: 'completed',
      actualDuration: Math.round((Date.now() - new Date(activeSession.startTime).getTime()) / 60000) // minutes
    };

    // Add to history - check if session already exists to prevent duplicates
    const sessions = localData.sessions || [];
    const existingIndex = sessions.findIndex(s => s.id === completedSession.id);
    let updatedSessions;
    let shouldIncrementTotal = false;
    
    if (existingIndex >= 0) {
      // Update existing session instead of adding duplicate
      const oldSession = sessions[existingIndex];
      updatedSessions = [...sessions];
      updatedSessions[existingIndex] = completedSession;
      // Adjust totals if duration changed
      const durationDiff = completedSession.actualDuration - (oldSession.actualDuration || 0);
      const newData = {
        ...localData,
        sessions: updatedSessions,
        totalTime: (localData.totalTime || 0) + durationDiff,
        activeSession: null // Clear active session
      };
      setLocalData(newData);
      updateTabData('study-session', newData);
      autoSave('study-session', newData);
    } else {
      // Add new session
      updatedSessions = [completedSession, ...sessions];
      shouldIncrementTotal = true;
    }
    
    if (shouldIncrementTotal) {
      const newData = {
        ...localData,
        sessions: updatedSessions,
        totalSessions: (localData.totalSessions || 0) + 1,
        totalTime: (localData.totalTime || 0) + completedSession.actualDuration,
        activeSession: null // Clear active session
      };

      setLocalData(newData);
      updateTabData('study-session', newData);
      autoSave('study-session', newData);
    }

    // Reset active session state
    setActiveSession(null);
    setIsRunning(false);
    setIsBreakMode(false);
    setIsBreakRunning(false);
    setTimeLeft(0);
    setBreakTimeLeft(0);
    pausedStudyTimeRef.current = 0;

    // Clear minimized session if it exists
    if (minimizedSession && minimizedSession.type === 'solo') {
      setMinimizedSession(null);
    }

    // Show completion notification
    if ('Notification' in window && Notification.permission === 'granted') {
      new Notification(t('studySession.sessionComplete'), {
        body: t('studySession.sessionCompleteMessage').replace('{type}', sessionType),
        icon: '/favicon.ico'
      });
    }
  };

  // Start break timer
  const startBreak = useCallback((breakDuration) => {
    // Use functional updates to ensure we get the current state
    setTimeLeft(currentTimeLeft => {
      pausedStudyTimeRef.current = currentTimeLeft;
      return currentTimeLeft;
    });
    
    setIsRunning(false);
    setIsBreakMode(true);
    setBreakTimeLeft(breakDuration * 60);
    setIsBreakRunning(true);
  }, []);

  // End break and return to study timer
  const endBreak = () => {
    setIsBreakMode(false);
    setIsBreakRunning(false);
    setBreakTimeLeft(0);
    
    // Resume study timer with paused time
    setTimeLeft(pausedStudyTimeRef.current);
    setIsRunning(true);
  };

  // Stop break manually
  const stopBreak = () => {
    if (window.confirm(t('studySession.endBreakConfirm'))) {
      endBreak();
    }
  };

  // Stop entire session (including during breaks)
  const stopEntireSession = () => {
    if (window.confirm(t('studySession.stopEntireConfirm'))) {
      if (activeSession) {
        // Calculate actual duration
        let actualDuration = 0;
        if (isBreakMode) {
          // If in break mode, use the paused study time
          actualDuration = Math.round(pausedStudyTimeRef.current / 60);
        } else {
          // If in study mode, calculate based on time elapsed.
          // activeSession.duration is in minutes, timeLeft is in seconds, so
          // convert duration to seconds before subtracting.
          const elapsedSeconds = (activeSession.duration * 60) - timeLeft;
          actualDuration = Math.round(elapsedSeconds / 60);
        }
        
        const stoppedSession = {
          ...activeSession,
          endTime: new Date().toISOString(),
          status: 'stopped',
          actualDuration: actualDuration > 0 ? actualDuration : 1
        };

        // Add to history - check if session already exists to prevent duplicates
        const sessions = localData.sessions || [];
        const existingIndex = sessions.findIndex(s => s.id === stoppedSession.id);
        let updatedSessions;
        let shouldIncrementTotal = false;
        
        if (existingIndex >= 0) {
          // Update existing session instead of adding duplicate
          const oldSession = sessions[existingIndex];
          updatedSessions = [...sessions];
          updatedSessions[existingIndex] = stoppedSession;
          // Adjust totals if duration changed
          const durationDiff = stoppedSession.actualDuration - (oldSession.actualDuration || 0);
          const newData = {
            ...localData,
            sessions: updatedSessions,
            totalTime: (localData.totalTime || 0) + durationDiff,
            activeSession: null // Clear active session
          };
          setLocalData(newData);
          updateTabData('study-session', newData);
          autoSave('study-session', newData);
        } else {
          // Add new session
          updatedSessions = [stoppedSession, ...sessions];
          shouldIncrementTotal = true;
        }
        
        if (shouldIncrementTotal) {
          const newData = {
            ...localData,
            sessions: updatedSessions,
            totalSessions: (localData.totalSessions || 0) + 1,
            totalTime: (localData.totalTime || 0) + stoppedSession.actualDuration,
            activeSession: null // Clear active session
          };

          setLocalData(newData);
          updateTabData('study-session', newData);
          autoSave('study-session', newData);
        }
      }

      setActiveSession(null);
      setIsRunning(false);
      setIsBreakMode(false);
      setIsBreakRunning(false);
      setTimeLeft(0);
      setBreakTimeLeft(0);
      pausedStudyTimeRef.current = 0;
      
      // Clear minimized session if it exists
      if (minimizedSession && minimizedSession.type === 'solo') {
        setMinimizedSession(null);
      }
    }
  };

  // Expose stopEntireSession via ref so App can call it from minimized timer X button
  useImperativeHandle(ref, () => ({
    stopEntireSession
  }));

  // Pause/Resume session (works for both study and break timers)
  const toggleSession = () => {
    if (isBreakMode) {
      setIsBreakRunning(!isBreakRunning);
    } else {
      setIsRunning(!isRunning);
    }
  };

  // Stop session
  const stopSession = () => {
    if (window.confirm(t('studySession.stopConfirm'))) {
      if (activeSession) {
        // Calculate actual duration (including any break time).
        // activeSession.duration is in minutes, timeLeft is in seconds, so
        // convert duration to seconds before subtracting.
        const elapsedSeconds = (activeSession.duration * 60) - timeLeft;
        const actualDuration = Math.round(elapsedSeconds / 60); // Convert back to minutes
        
        const stoppedSession = {
          ...activeSession,
          endTime: new Date().toISOString(),
          status: 'stopped',
          actualDuration: actualDuration > 0 ? actualDuration : 1 // At least 1 minute if very short
        };

        // Add to history - check if session already exists to prevent duplicates
        const sessions = localData.sessions || [];
        const existingIndex = sessions.findIndex(s => s.id === stoppedSession.id);
        let updatedSessions;
        let shouldIncrementTotal = false;
        
        if (existingIndex >= 0) {
          // Update existing session instead of adding duplicate
          const oldSession = sessions[existingIndex];
          updatedSessions = [...sessions];
          updatedSessions[existingIndex] = stoppedSession;
          // Adjust totals if duration changed
          const durationDiff = stoppedSession.actualDuration - (oldSession.actualDuration || 0);
          const newData = {
            ...localData,
            sessions: updatedSessions,
            totalTime: (localData.totalTime || 0) + durationDiff,
            activeSession: null // Clear active session
          };
          setLocalData(newData);
          updateTabData('study-session', newData);
          autoSave('study-session', newData);
        } else {
          // Add new session
          updatedSessions = [stoppedSession, ...sessions];
          shouldIncrementTotal = true;
        }
        
        if (shouldIncrementTotal) {
          const newData = {
            ...localData,
            sessions: updatedSessions,
            totalSessions: (localData.totalSessions || 0) + 1,
            totalTime: (localData.totalTime || 0) + stoppedSession.actualDuration,
            activeSession: null // Clear active session
          };

          setLocalData(newData);
          updateTabData('study-session', newData);
          autoSave('study-session', newData);
        }

        setActiveSession(null);
        setIsRunning(false);
        setIsBreakMode(false);
        setIsBreakRunning(false);
        setTimeLeft(0);
        setBreakTimeLeft(0);
        pausedStudyTimeRef.current = 0;
      }
      
      // Clear minimized session if it exists
      if (minimizedSession && minimizedSession.type === 'solo') {
        setMinimizedSession(null);
      }
    }
  };

  // Delete session from history
  const deleteSession = (sessionId) => {
    if (window.confirm(t('studySession.deleteConfirm'))) {
      const sessions = localData.sessions || [];
      const sessionToDelete = sessions.find(s => s.id === sessionId);
      const updatedSessions = sessions.filter(s => s.id !== sessionId);
      
      const newData = {
        ...localData,
        sessions: updatedSessions,
        totalSessions: Math.max((localData.totalSessions || 0) - 1, 0),
        totalTime: Math.max((localData.totalTime || 0) - (sessionToDelete?.actualDuration || 0), 0)
      };

      setLocalData(newData);
      updateTabData('study-session', newData);
      autoSave('study-session', newData);
    }
  };

  // Request notification permission
  const requestNotificationPermission = () => {
    if ('Notification' in window && Notification.permission === 'default') {
      Notification.requestPermission();
    }
  };

  // Format time display
  const formatTime = (seconds) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
  };

  // Save blackboard state to server.
  //
  // We serialize to JPEG at 0.7 quality for the network hop: the blackboard
  // is a dark flat background with a handful of strokes, so lossy compression
  // is imperceptible but slashes payload size by roughly 5-10x versus PNG.
  // Undo/redo stacks still keep the lossless canvas.toDataURL() snapshots.
  const serializeForNetwork = () => {
    const canvas = blackboardCanvasRef.current;
    if (!canvas) return null;
    try {
      return canvas.toDataURL('image/jpeg', 0.7);
    } catch (_e) {
      return canvas.toDataURL();
    }
  };

  const saveBlackboardState = async () => {
    if (!blackboardCanvasRef.current || !activeSession?.id) return;

    try {
      const state = serializeForNetwork();
      if (!state) return;
      if (state === lastBlackboardStateRef.current) return; // No changes

      const token = localStorage.getItem('token');
      const response = await fetch(`/api/study-session/blackboard/${activeSession.id}`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ state })
      });

      if (response.ok) {
        lastBlackboardStateRef.current = state;
      }
    } catch (error) {
      console.error('Error saving blackboard state:', error);
    }
  };

  // Debounced wrapper. Each call resets the timer, so a burst of strokes
  // collapses into a single POST ~600ms after the user stops drawing instead
  // of one POST per stroke.
  const scheduleBlackboardSave = (delay = 600) => {
    if (blackboardSaveTimeoutRef.current) {
      clearTimeout(blackboardSaveTimeoutRef.current);
    }
    blackboardSaveTimeoutRef.current = setTimeout(() => {
      blackboardSaveTimeoutRef.current = null;
      saveBlackboardState();
    }, delay);
  };

  // Load blackboard state from server
  const loadBlackboardState = async () => {
    if (!activeSession?.id || !blackboardCanvasRef.current) return;
    
    try {
      const token = localStorage.getItem('token');
      const response = await fetch(`/api/study-session/blackboard/${activeSession.id}`, {
        headers: {
          'Authorization': `Bearer ${token}`
        }
      });

      if (response.ok) {
        const result = await response.json();
        if (result.state) {
          // Ensure context exists before loading state
          ensureCanvasInitialized();
          
          if (blackboardCtxRef.current) {
            // Always load the saved state when reopening blackboard
            // This ensures persistence works correctly
            const img = new Image();
            img.onload = () => {
              if (blackboardCtxRef.current && blackboardCanvasRef.current) {
                // Clear and restore the saved state
                blackboardCtxRef.current.clearRect(0, 0, blackboardCanvasRef.current.width, blackboardCanvasRef.current.height);
                blackboardCtxRef.current.drawImage(img, 0, 0);
                lastBlackboardStateRef.current = result.state;
              }
            };
            img.onerror = () => {
              console.error('Error loading blackboard image');
            };
            img.src = result.state;
          }
        } else {
          // No saved state - ensure canvas is initialized but don't clear it
          ensureCanvasInitialized();
        }
      } else {
        // Failed to load - ensure canvas is initialized anyway
        ensureCanvasInitialized();
      }
    } catch (error) {
      console.error('Error loading blackboard state:', error);
      // On error, still ensure canvas is initialized
      ensureCanvasInitialized();
    }
  };

  // Initialize canvas context if needed (helper function)
  const ensureCanvasInitialized = () => {
    if (!blackboardCanvasRef.current) return false;
    
    if (!blackboardCtxRef.current) {
      const canvas = blackboardCanvasRef.current;
      const ctx = canvas.getContext('2d');
      
      // Set canvas size to match container
      const container = canvas.parentElement;
      if (container) {
        canvas.width = container.offsetWidth;
        canvas.height = container.offsetHeight;
      }
      
      // Set drawing styles
      ctx.strokeStyle = blackboardColor;
      ctx.fillStyle = blackboardColor;
      ctx.lineCap = 'round';
      ctx.lineJoin = 'round';
      ctx.lineWidth = 3;
      blackboardCtxRef.current = ctx;
    }
    
    return true;
  };

  // Blackboard drawing functions
  //
  // The canvas backing buffer (canvas.width / canvas.height) is sized to the
  // container's pixel dimensions in ensureCanvasInitialized, but CSS can still
  // scale the element (responsive layout, zoom, devicePixelRatio on HiDPI
  // screens). If we feed raw client coords into the 2D context the stroke
  // appears offset from the cursor — worse the more the element is scaled.
  // Multiply by the ratio between the backing buffer and the rendered box so
  // drawing tracks the pointer exactly regardless of scaling.
  const getCoordinates = (e) => {
    const canvas = blackboardCanvasRef.current;
    if (!canvas) return { x: 0, y: 0 };
    const rect = canvas.getBoundingClientRect();
    const scaleX = rect.width > 0 ? canvas.width / rect.width : 1;
    const scaleY = rect.height > 0 ? canvas.height / rect.height : 1;
    return {
      x: (e.clientX - rect.left) * scaleX,
      y: (e.clientY - rect.top) * scaleY
    };
  };

  const startDrawing = (e) => {
    // Ensure canvas is initialized before drawing
    if (!ensureCanvasInitialized()) return;
    
    // Save current state to history before starting a new stroke
    if (blackboardCanvasRef.current && blackboardCtxRef.current) {
      const currentState = blackboardCanvasRef.current.toDataURL();
      drawingHistoryRef.current.push(currentState);
      // Limit history to last 50 states to prevent memory issues
      if (drawingHistoryRef.current.length > BLACKBOARD_HISTORY_LIMIT) {
        drawingHistoryRef.current.shift();
      }
      // Clear redo history when a new action is performed
      redoHistoryRef.current = [];
    }
    
    setIsDrawing(true);
    // Any pending save is about to be superseded; drop it.
    if (blackboardSaveTimeoutRef.current) {
      clearTimeout(blackboardSaveTimeoutRef.current);
      blackboardSaveTimeoutRef.current = null;
    }
    const { x, y } = getCoordinates(e);
    if (blackboardCtxRef.current) {
      blackboardCtxRef.current.beginPath();
      blackboardCtxRef.current.moveTo(x, y);
    }
  };

  const draw = (e) => {
    if (!isDrawing) return;
    
    // Ensure canvas is initialized before drawing
    if (!ensureCanvasInitialized() || !blackboardCtxRef.current) return;
    
    const { x, y } = getCoordinates(e);
    if (blackboardTool === 'pen') {
      blackboardCtxRef.current.strokeStyle = blackboardColor;
      blackboardCtxRef.current.lineWidth = 3;
      blackboardCtxRef.current.lineTo(x, y);
      blackboardCtxRef.current.stroke();
    } else if (blackboardTool === 'eraser') {
      blackboardCtxRef.current.strokeStyle = '#1a1a1a';
      blackboardCtxRef.current.lineWidth = 20;
      blackboardCtxRef.current.lineTo(x, y);
      blackboardCtxRef.current.stroke();
    }
  };

  const stopDrawing = () => {
    if (isDrawing && blackboardCtxRef.current) {
      blackboardCtxRef.current.beginPath();
      setIsDrawing(false);
      // Debounced — if the user starts another stroke within 600ms, this
      // timer is cancelled by startDrawing instead of firing a throwaway POST.
      scheduleBlackboardSave();
    }
  };

  const clearBlackboard = () => {
    if (window.confirm(t('studySession.clearBlackboardConfirm'))) {
      // Ensure canvas is initialized
      if (ensureCanvasInitialized() && blackboardCanvasRef.current && blackboardCtxRef.current) {
        // Save current state to history before clearing
        const currentState = blackboardCanvasRef.current.toDataURL();
        drawingHistoryRef.current.push(currentState);
        if (drawingHistoryRef.current.length > BLACKBOARD_HISTORY_LIMIT) {
          drawingHistoryRef.current.shift();
        }
        // Clear redo history when a new action is performed
        redoHistoryRef.current = [];

        // Clear canvas
        blackboardCtxRef.current.clearRect(0, 0, blackboardCanvasRef.current.width, blackboardCanvasRef.current.height);
        // Update the last saved state reference to reflect the cleared state
        lastBlackboardStateRef.current = blackboardCanvasRef.current.toDataURL();
        saveBlackboardState();
      }
    }
  };

  const undoDrawing = () => {
    if (!blackboardCanvasRef.current || !blackboardCtxRef.current || drawingHistoryRef.current.length === 0) {
      return;
    }
    
    // Save current state to redo stack before undoing
    const currentState = blackboardCanvasRef.current.toDataURL();
    redoHistoryRef.current.push(currentState);
    // Limit redo history
    if (redoHistoryRef.current.length > BLACKBOARD_HISTORY_LIMIT) {
      redoHistoryRef.current.shift();
    }
    
    // Restore the previous state from history
    const previousState = drawingHistoryRef.current.pop();
    
    if (previousState) {
      ensureCanvasInitialized();
      const img = new Image();
      img.onload = () => {
        if (blackboardCtxRef.current && blackboardCanvasRef.current) {
          blackboardCtxRef.current.clearRect(0, 0, blackboardCanvasRef.current.width, blackboardCanvasRef.current.height);
          blackboardCtxRef.current.drawImage(img, 0, 0);
          lastBlackboardStateRef.current = previousState;
          saveBlackboardState();
        }
      };
      img.onerror = () => {
        console.error('Error loading undo state');
      };
      img.src = previousState;
    }
  };

  const redoDrawing = () => {
    if (!blackboardCanvasRef.current || !blackboardCtxRef.current || redoHistoryRef.current.length === 0) {
      return;
    }
    
    // Save current state to undo stack before redoing
    const currentState = blackboardCanvasRef.current.toDataURL();
    drawingHistoryRef.current.push(currentState);
    // Limit undo history
    if (drawingHistoryRef.current.length > BLACKBOARD_HISTORY_LIMIT) {
      drawingHistoryRef.current.shift();
    }
    
    // Restore the next state from redo history
    const nextState = redoHistoryRef.current.pop();
    
    if (nextState) {
      ensureCanvasInitialized();
      const img = new Image();
      img.onload = () => {
        if (blackboardCtxRef.current && blackboardCanvasRef.current) {
          blackboardCtxRef.current.clearRect(0, 0, blackboardCanvasRef.current.width, blackboardCanvasRef.current.height);
          blackboardCtxRef.current.drawImage(img, 0, 0);
          lastBlackboardStateRef.current = nextState;
          saveBlackboardState();
        }
      };
      img.onerror = () => {
        console.error('Error loading redo state');
      };
      img.src = nextState;
    }
  };

  // Initialize canvas whenever blackboard is shown (reinitialize on every open)
  useEffect(() => {
    if (showBlackboard && blackboardCanvasRef.current) {
      const canvas = blackboardCanvasRef.current;
      
      // Always reinitialize context when blackboard is shown
      // This ensures drawing works after re-entry
      const ctx = canvas.getContext('2d');
      
      // Set canvas size to match container
      const container = canvas.parentElement;
      if (container) {
        // Save current state before resizing (if canvas was already initialized)
        let savedState = null;
        if (blackboardCtxRef.current && canvas.width > 0 && canvas.height > 0) {
          savedState = canvas.toDataURL();
        }
        
        const newWidth = container.offsetWidth;
        const newHeight = container.offsetHeight;
        const oldWidth = canvas.width;
        const oldHeight = canvas.height;
        
        canvas.width = newWidth;
        canvas.height = newHeight;
        
        // Restore saved state if it existed (preserve drawing during resize)
        if (savedState && oldWidth > 0 && oldHeight > 0) {
          const img = new Image();
          img.onload = () => {
            if (ctx) {
              ctx.clearRect(0, 0, newWidth, newHeight);
              ctx.drawImage(img, 0, 0, oldWidth, oldHeight, 0, 0, newWidth, newHeight);
            }
          };
          img.src = savedState;
        }
      }
      
      // Set drawing styles
      ctx.strokeStyle = blackboardColor;
      ctx.fillStyle = blackboardColor;
      ctx.lineCap = 'round';
      ctx.lineJoin = 'round';
      ctx.lineWidth = 3;
      blackboardCtxRef.current = ctx;
    }
    
    // Handle window resize - preserve canvas content
    const handleResize = () => {
      if (showBlackboard && blackboardCanvasRef.current && blackboardCtxRef.current) {
        const canvas = blackboardCanvasRef.current;
        const container = canvas.parentElement;
        if (container && (canvas.width !== container.offsetWidth || canvas.height !== container.offsetHeight)) {
          // Save current state before resize
          const currentState = canvas.toDataURL();
          const oldWidth = canvas.width;
          const oldHeight = canvas.height;
          canvas.width = container.offsetWidth;
          canvas.height = container.offsetHeight;
          // Restore state after resize
          const img = new Image();
          img.onload = () => {
            if (blackboardCtxRef.current) {
              blackboardCtxRef.current.clearRect(0, 0, canvas.width, canvas.height);
              blackboardCtxRef.current.drawImage(img, 0, 0, oldWidth, oldHeight, 0, 0, canvas.width, canvas.height);
            }
          };
          img.src = currentState;
        }
      }
    };
    
    window.addEventListener('resize', handleResize);
    return () => {
      window.removeEventListener('resize', handleResize);
    };
  }, [showBlackboard, blackboardColor]);

  // Update drawing context when color changes
  useEffect(() => {
    if (blackboardCtxRef.current) {
      blackboardCtxRef.current.strokeStyle = blackboardColor;
      blackboardCtxRef.current.fillStyle = blackboardColor;
    }
  }, [blackboardColor]);

  // Save blackboard state when hiding (but don't clear context - preserve it for next open)
  useEffect(() => {
    if (!showBlackboard && blackboardCanvasRef.current && blackboardCtxRef.current) {
      // Flush any debounced save immediately so closing the blackboard doesn't
      // race with a pending 600ms timer that never fires (unmount / remount).
      if (blackboardSaveTimeoutRef.current) {
        clearTimeout(blackboardSaveTimeoutRef.current);
        blackboardSaveTimeoutRef.current = null;
      }
      saveBlackboardState();
      // Note: We don't clear blackboardCtxRef.current here - we keep it so drawing works immediately on re-entry
    }
  }, [showBlackboard]);

  // Clear any pending debounced save on unmount so the closure doesn't fire
  // after the component is gone. Network save is best-effort anyway.
  useEffect(() => {
    return () => {
      if (blackboardSaveTimeoutRef.current) {
        clearTimeout(blackboardSaveTimeoutRef.current);
        blackboardSaveTimeoutRef.current = null;
      }
    };
  }, []);

  // Sync blackboard state (load when showing) - only when blackboard is visible
  useEffect(() => {
    if (showBlackboard && activeSession?.id) {
      // Ensure canvas is initialized first
      ensureCanvasInitialized();
      
      // Load state when showing blackboard (with a small delay to ensure canvas is ready)
      setTimeout(() => {
        loadBlackboardState();
      }, 50);
      
      // Clear any existing sync interval (for consistency with StudyTogether pattern)
      if (blackboardSyncIntervalRef.current) {
        clearInterval(blackboardSyncIntervalRef.current);
      }

      return () => {
        if (blackboardSyncIntervalRef.current) {
          clearInterval(blackboardSyncIntervalRef.current);
        }
      };
    }
  }, [showBlackboard, activeSession?.id]);

  // Get current timer display
  const getCurrentTimer = () => {
    return isBreakMode ? breakTimeLeft : timeLeft;
  };

  // Get current timer running state
  const getCurrentTimerRunning = () => {
    return isBreakMode ? isBreakRunning : isRunning;
  };

  // Update minimized session state if session is minimized
  useEffect(() => {
    if (minimizedSession && minimizedSession.type === 'solo' && activeSession) {
      setMinimizedSession(prev => ({
        ...prev,
        timeLeft: getCurrentTimer(),
        isRunning: getCurrentTimerRunning(),
        isPaused: !getCurrentTimerRunning(),
        isBreakMode: isBreakMode,
        state: isBreakMode ? 'break' : 'study'
      }));
    }
  }, [timeLeft, breakTimeLeft, isRunning, isBreakRunning, isBreakMode, sessionType]);

  // Handle settings changes
  const handleSettingsChange = (newSettings) => {
    const updatedData = {
      ...localData,
      settings: {
        ...localData.settings,
        ...newSettings
      }
    };
    setLocalData(updatedData);
    updateTabData('study-session', updatedData);
    autoSave('study-session', updatedData);
  };


  // Study session techniques with dynamic durations
  const getStudyTechniques = () => {
    const settings = localData.settings || {};
    return [
      { id: 'pomodoro', name: t('studySession.pomodoroName'), duration: settings.studyTime || 25, description: t('studySession.pomodoroDesc').replace('{studyTime}', settings.studyTime || 25).replace('{shortBreak}', settings.shortBreak || 5) },
      { id: 'short', name: t('studySession.shortSessionName'), duration: 15, description: t('studySession.shortSessionDesc') },
      { id: 'medium', name: t('studySession.mediumSessionName'), duration: 45, description: t('studySession.mediumSessionDesc') },
      { id: 'long', name: t('studySession.longSessionName'), duration: 90, description: t('studySession.longSessionDesc') },
      { id: 'custom', name: t('studySession.customName'), duration: customMinutes, description: t('studySession.customDesc') }
    ];
  };

  // REMOVED: Duplicate restore logic - single restore point above handles all cases

  return (
    <div className={`study-session-container ${activeSession && !minimizedSession ? 'fullscreen-mode' : ''}`}>
      {/* Current Session Display */}
      {activeSession && !minimizedSession && (
        <div className={`active-session fullscreen theme-${(localData.settings || {}).gradientTheme || 'original'}`}>
          {/* Minimize Button */}
          <button 
            className="session-minimize-btn"
            onClick={() => {
              // Save current session state before minimizing
              const currentTimer = getCurrentTimer();
              const currentRunning = getCurrentTimerRunning();
              const sessionState = {
                ...activeSession,
                timeLeft: currentTimer,
                isRunning: currentRunning,
                isPaused: !currentRunning,
                isBreakMode: isBreakMode,
                breakTimeLeft: breakTimeLeft,
                isBreakRunning: isBreakRunning,
                sessionType: sessionType,
                minimizedAt: Date.now() // Save timestamp for elapsed time calculation
              };
              
              // Save to localData to persist across tab switches
              const updatedData = {
                ...localData,
                activeSession: sessionState
              };
              setLocalData(updatedData);
              updateTabData('study-session', updatedData);
              autoSave('study-session', updatedData);
              
              // Set minimized session (timer continues running)
              setMinimizedSession({
                type: 'solo',
                subject: activeSession.subject || activeSession.type,
                timeLeft: currentTimer,
                isRunning: currentRunning,
                isPaused: false, // Timer continues, so not paused
                isBreakMode: isBreakMode,
                sessionType: sessionType,
                state: isBreakMode ? 'break' : 'study',
                minimizedAt: Date.now()
              });
            }}
            title={t('studySession.minimizeSession')}
          >
            ←
          </button>
          
          <div className="session-subject-display">
            <h2 className="session-subject-title">{activeSession.subject || t('studySession.generalStudy')}</h2>
          </div>
          
          <div className="timer-display">
            <span className="time-text">{formatTime(getCurrentTimer())}</span>
            {isBreakMode && (
              <div className="break-indicator">
                <span className="break-text">{t('studySession.breakTime')}</span>
              </div>
            )}
          </div>

          <div className="mode-selector">
            <button 
              className={`mode-btn ${sessionType === 'pomodoro' ? 'active' : ''}`}
              onClick={() => {
                if (!isBreakMode) setSessionType('pomodoro');
              }}
              disabled={isBreakMode}
            >
              {t('studySession.pomodoro')}
            </button>
            <button 
              className={`mode-btn ${isBreakMode && sessionType === 'short' ? 'active' : ''}`}
              onClick={() => {
                if (!isBreakMode && activeSession) {
                  const settings = localData.settings || {};
                  startBreak(settings.shortBreak || 5); // Use custom short break duration
                  setSessionType('short');
                }
              }}
              disabled={isBreakMode}
            >
              {t('studySession.shortBreak')}
            </button>
            <button 
              className={`mode-btn ${isBreakMode && sessionType === 'long' ? 'active' : ''}`}
              onClick={() => {
                if (!isBreakMode && activeSession) {
                  const settings = localData.settings || {};
                  startBreak(settings.longBreak || 15); // Use custom long break duration
                  setSessionType('long');
                }
              }}
              disabled={isBreakMode}
            >
              {t('studySession.longBreak')}
            </button>
          </div>

          <div className="timer-controls">
            <button 
              className="control-btn play"
              onClick={toggleSession}
            >
              {getCurrentTimerRunning() ? '⏸️' : '▶️'}
            </button>
            {isBreakMode && (
              <button 
                className="control-btn stop" 
                onClick={stopBreak}
                title={t('studySession.skipBreak')}
              >
                ⏭️
              </button>
            )}
            <button 
              className="control-btn stop-all" 
              onClick={stopEntireSession}
              title={t('studySession.stopEntireSession')}
            >
              ⏹️
            </button>
            <button className="control-btn settings" onClick={() => setShowSettings(true)}>
              ⚙️
            </button>
          </div>

          {/* Blackboard Button - Right Edge (on session screen) */}
          <button 
            className="blackboard-open-btn"
            onClick={(e) => {
              e.preventDefault();
              e.stopPropagation();
              setShowBlackboard(true);
            }}
            title={t('studySession.openBlackboard')}
          >
            <div className="blackboard-btn-icon">
              <svg width="24" height="24" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                {/* Marker body */}
                <rect x="8" y="2" width="8" height="16" rx="1" fill="currentColor" opacity="0.9"/>
                {/* Marker tip */}
                <path d="M8 18L12 22L16 18L16 16L8 16L8 18Z" fill="currentColor" opacity="0.9"/>
                {/* Marker cap */}
                <rect x="9" y="1" width="6" height="2" rx="0.5" fill="currentColor" opacity="0.7"/>
                {/* Highlight on marker body */}
                <rect x="9" y="3" width="2" height="13" rx="0.5" fill="white" opacity="0.3"/>
              </svg>
            </div>
            <span className="blackboard-btn-text">{t('studySession.board')}</span>
            </button>

        </div>
      )}

      {/* Blackboard Screen */}
      {showBlackboard && activeSession && (
        <div className="blackboard-screen fullscreen">
          <div className="blackboard-panel">
            <div className="blackboard-header">
              <div className="blackboard-header-left">
                <button 
                  className="blackboard-back-btn"
                  onClick={() => setShowBlackboard(false)}
                  title={t('studySession.backToSession')}
                >
                  ← {t('studySession.backToSession')}
            </button>
              </div>
              <h3>{t('studySession.studyBlackboard')}</h3>
              <div className="blackboard-header-right">
                {/* Mini Timer */}
                <div className="blackboard-mini-timer">
                  <span className="mini-timer-time">{formatTime(getCurrentTimer())}</span>
                  <span className="mini-timer-state">
                    {!getCurrentTimerRunning()
                      ? t('studySession.paused')
                      : isBreakMode
                        ? t('studySession.break')
                        : t('studySession.study')}
                  </span>
                </div>
                <button 
                  className="blackboard-close-btn"
                  onClick={() => setShowBlackboard(false)}
                  title={t('studySession.closeBlackboard')}
                >
                  ✕
                </button>
              </div>
          </div>

            <div className="blackboard-toolbar">
              <button 
                className={`toolbar-btn ${blackboardTool === 'pen' ? 'active' : ''}`}
                onClick={() => setBlackboardTool('pen')}
                title={t('studySession.pen')}
              >
                ✏️
          </button>
              <button 
                className={`toolbar-btn ${blackboardTool === 'eraser' ? 'active' : ''}`}
                onClick={() => setBlackboardTool('eraser')}
                title={t('studySession.eraser')}
              >
                🧹
              </button>
              
              <div className="color-picker">
                <button 
                  className={`color-btn ${blackboardColor === '#ffffff' ? 'active' : ''}`}
                  onClick={() => setBlackboardColor('#ffffff')}
                  style={{ backgroundColor: '#ffffff' }}
                  title={t('studySession.white')}
                />
                <button 
                  className={`color-btn ${blackboardColor === '#3b82f6' ? 'active' : ''}`}
                  onClick={() => setBlackboardColor('#3b82f6')}
                  style={{ backgroundColor: '#3b82f6' }}
                  title={t('studySession.blue')}
                />
                <button 
                  className={`color-btn ${blackboardColor === '#22c55e' ? 'active' : ''}`}
                  onClick={() => setBlackboardColor('#22c55e')}
                  style={{ backgroundColor: '#22c55e' }}
                  title={t('studySession.green')}
                />
                <button 
                  className={`color-btn ${blackboardColor === '#f59e0b' ? 'active' : ''}`}
                  onClick={() => setBlackboardColor('#f59e0b')}
                  style={{ backgroundColor: '#f59e0b' }}
                  title={t('studySession.orange')}
                />
                <button 
                  className={`color-btn ${blackboardColor === '#ef4444' ? 'active' : ''}`}
                  onClick={() => setBlackboardColor('#ef4444')}
                  style={{ backgroundColor: '#ef4444' }}
                  title={t('studySession.red')}
                />
              </div>

              <button 
                className="toolbar-btn"
                onClick={undoDrawing}
                title={t('studySession.undo')}
              >
                ↶
              </button>
              <button 
                className="toolbar-btn"
                onClick={redoDrawing}
                title={t('studySession.redo') || 'Redo'}
              >
                ↷
              </button>
              <button 
                className="toolbar-btn clear-btn"
                onClick={clearBlackboard}
                title={t('studySession.clearBoard')}
              >
                🗑️
              </button>
            </div>

            <div className="blackboard-canvas-container">
              <canvas
                ref={blackboardCanvasRef}
                className="blackboard-canvas"
                data-tool={blackboardTool}
                onMouseDown={startDrawing}
                onMouseMove={draw}
                onMouseUp={stopDrawing}
                onMouseLeave={stopDrawing}
                onTouchStart={(e) => {
                  e.preventDefault();
                  startDrawing(e.touches[0]);
                }}
                onTouchMove={(e) => {
                  e.preventDefault();
                  draw(e.touches[0]);
                }}
                onTouchEnd={(e) => {
                  e.preventDefault();
                  stopDrawing();
                }}
              />
            </div>
          </div>
        </div>
      )}

      {/* Start New Session */}
      {(!activeSession || minimizedSession) && (
        <div className="start-session">
          <h3>{t('studySession.startNewSession')}</h3>
          
          <div className="session-setup">
            <DataInput
              type="text"
              label={t('studySession.subjectTopic')}
              value={localData.currentSubject || ''}
              onChange={(value) => handleDataChange('currentSubject', value)}
              placeholder={t('studySession.whatStudyingToday')}
            />

            <DataInput
              type="textarea"
              label={t('studySession.sessionNotes')}
              value={localData.sessionNotes || ''}
              onChange={(value) => handleDataChange('sessionNotes', value)}
              placeholder={t('studySession.sessionNotesPlaceholder')}
              rows={2}
            />

            <div className="technique-selection">
              <h4>{t('studySession.chooseTechnique')}</h4>
              <div className="technique-grid">
                {getStudyTechniques().map(technique => (
                  <div 
                    key={technique.id}
                    className={`technique-card ${sessionType === technique.id ? 'selected' : ''}`}
                    onClick={() => {
                      setSessionType(technique.id);
                      if (technique.id === 'custom') {
                        setCustomMinutes(technique.duration);
                      }
                    }}
                  >
                    <div className="technique-name">{technique.name}</div>
                    <div className="technique-duration">{technique.duration} min</div>
                    <div className="technique-description">{technique.description}</div>
                  </div>
                ))}
              </div>

              {sessionType === 'custom' && (
                <div className="custom-duration">
                  <DataInput
                    type="number"
                    label={t('studySession.customDuration')}
                    value={customMinutes}
                    onChange={(value) => {
                      // Allow empty while typing; clamp on commit so
                      // negative/huge values can't start a bad session.
                      if (value === '' || value === null) {
                        setCustomMinutes('');
                        return;
                      }
                      const parsed = parseInt(value, 10);
                      if (Number.isNaN(parsed)) return;
                      setCustomMinutes(Math.max(1, Math.min(180, parsed)));
                    }}
                    placeholder={t('studySession.enterDuration')}
                    min="1"
                    max="180"
                  />
                </div>
              )}

              <button 
                className="start-btn"
                onClick={() => {
                  const technique = getStudyTechniques().find(tech => tech.id === sessionType);
                  startSession(sessionType, technique.duration);
                }}
              >
                {(() => {
                  const technique = getStudyTechniques().find(tech => tech.id === sessionType);
                  return t('studySession.startSessionBtn').replace('{type}', technique ? technique.name : sessionType);
                })()}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Study History - Only show when no active session or when minimized */}
      {(!activeSession || minimizedSession) && (
        <>
          <div className="study-history">
            <div className="history-header">
              <h3>{t('studySession.studyHistory')}</h3>
              <div className="stats-summary">
                <div className="stat">
                  <span className="stat-number">{(localData.sessions || []).length}</span>
                  <span className="stat-label">{t('studySession.totalSessions')}</span>
                </div>
                <div className="stat">
                  <span className="stat-number">
                    {(localData.sessions || []).reduce((sum, s) => sum + (s.actualDuration || 0), 0)}
                  </span>
                  <span className="stat-label">{t('studySession.totalMinutes')}</span>
                </div>
                <div className="stat">
                  <span className="stat-number">
                    {(localData.sessions || []).length > 0 
                      ? Math.round((localData.sessions || []).reduce((sum, s) => sum + (s.actualDuration || 0), 0) / (localData.sessions || []).length)
                      : 0}
                  </span>
                  <span className="stat-label">{t('studySession.avgDuration')}</span>
                </div>
              </div>
            </div>

                 <div className="history-list">
                   {(() => {
                     // Deduplicate sessions by ID to prevent duplicate keys
                     const sessions = localData.sessions || [];
                     const uniqueSessions = sessions.reduce((acc, session) => {
                       const existingIndex = acc.findIndex(s => s.id === session.id);
                       if (existingIndex >= 0) {
                         // If duplicate found, keep the one with the most recent endTime or startTime
                         const existing = acc[existingIndex];
                         const currentEndTime = session.endTime ? new Date(session.endTime).getTime() : 0;
                         const existingEndTime = existing.endTime ? new Date(existing.endTime).getTime() : 0;
                         if (currentEndTime > existingEndTime || (!currentEndTime && !existingEndTime && new Date(session.startTime).getTime() > new Date(existing.startTime).getTime())) {
                           acc[existingIndex] = session;
                         }
                       } else {
                         acc.push(session);
                       }
                       return acc;
                     }, []);
                     
                     return uniqueSessions.length === 0 ? (
                       <div className="no-sessions">
                         <p>{t('studySession.noSessionsYet')}</p>
                       </div>
                     ) : (
                       uniqueSessions.map(session => (
                  <div key={session.id} className={`session-item ${session.status === 'completed' ? 'session-completed' : 'session-stopped'}`}>
                    {/* Status indicator in top right */}
                    <div className={`session-status ${session.status === 'completed' ? 'completed' : session.status === 'stopped' ? 'stopped' : 'active'}`}>
                      {session.status === 'completed' ? t('studySession.completed') : 
                       session.status === 'stopped' ? t('studySession.stopped') : t('studySession.active')}
                    </div>
                    
                    {/* Delete button in top right corner */}
                    <button 
                      className="delete-session-btn"
                      onClick={() => deleteSession(session.id)}
                      title={t('studySession.deleteSession')}
                    >
                      🗑️
                    </button>
                    
                    <div className="session-main">
                      <div className={`session-type-badge ${session.status === 'completed' ? 'badge-completed' : 'badge-stopped'}`}>
                        {session.type}
                      </div>
                      <div className="session-details">
                        <div className="session-subject">
                          {session.subject || t('studySession.generalStudy')}
                        </div>
                        <div className="session-time">
                          {new Date(session.startTime).toLocaleDateString()} at {new Date(session.startTime).toLocaleTimeString()}
                        </div>
                        {session.endTime && (
                          <div className="session-end-time">
                            {t('studySession.endedAt')} {new Date(session.endTime).toLocaleTimeString()}
                          </div>
                        )}
                      </div>
                    </div>
                    
                    <div className="session-meta">
                      <span className="duration">{session.actualDuration || session.duration || 0} {t('studySession.minutes')}</span>
                    </div>
                    
                    {session.notes && (
                      <div className="session-notes">
                        <strong>{t('studySession.notes')}</strong> {session.notes}
                      </div>
                    )}
                  </div>
                ))
              );
                   })()}
            </div>
          </div>

          {/* Notification Setup */}
          <div className="notification-setup">
            <button onClick={requestNotificationPermission} className="notification-btn">
              {t('studySession.enableNotifications')}
            </button>
            <p>{t('studySession.notificationPrompt')}</p>
          </div>
        </>
      )}

      {/* Settings Modal */}
      <SessionSettingsModal
        isOpen={showSettings}
        onClose={() => setShowSettings(false)}
        settings={localData.settings || { studyTime: 25, shortBreak: 5, longBreak: 15, gradientTheme: 'original' }}
        onSettingsChange={handleSettingsChange}
      />
    </div>
  );
});

export default StudySession;
