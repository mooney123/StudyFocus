import React, { useState, useMemo, useRef, useEffect } from 'react';
import { useLanguage } from './context/LanguageContext';
import { useDataContext } from './context/DataContext';
import { ToastProvider } from './context/ToastContext';
import Sidebar from './components/Sidebar';
import MainContent from './components/MainContent';
import FloatingTimer from './components/FloatingTimer';
import SettingsModal from './components/SettingsModal';
import SimpleMessageModal from './components/SimpleMessageModal';
import MessageNotifications from './components/MessageNotifications';
import WelcomeModal from './components/WelcomeModal';
import HelpBot from './components/HelpBot';
import { useUnreadCount } from './hooks/useUnreadCount';
import { usePresence } from './hooks/usePresence';
import './App.css';

function App({ user, onLogout, isNewSignup = false }) {
  const { t } = useLanguage();
  const { loadTabData, updateTabData, autoSave } = useDataContext();
  const [activeTab, setActiveTab] = useState('home');
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [minimizedSession, setMinimizedSession] = useState(null);
  const [settingsModalOpen, setSettingsModalOpen] = useState(false);
  const [settingsInitialSection, setSettingsInitialSection] = useState('account');
  const [shareAppModalOpen, setShareAppModalOpen] = useState(false);
  const [showWelcomeModal, setShowWelcomeModal] = useState(false);
  const [hasCheckedWelcome, setHasCheckedWelcome] = useState(false);
  const { unreadCount } = useUnreadCount();
  const studySessionRef = useRef(null);
  const studyTogetherRef = useRef(null);
  const [currentUserId, setCurrentUserId] = useState(null);

  // Initialize presence tracking
  usePresence(currentUserId);

  // Check if user has seen welcome modal (only for new signups)
  useEffect(() => {
    if (!user?.id || hasCheckedWelcome) return;
    
    // Only check welcome status if this is a new signup
    // Login users should never see this modal
    if (!isNewSignup) {
      setHasCheckedWelcome(true);
      return;
    }

    const checkWelcomeStatus = async () => {
      try {
        const token = localStorage.getItem('token');
        if (!token) return;

        const response = await fetch('/api/welcome/status', {
          headers: {
            'Authorization': `Bearer ${token}`,
            'Content-Type': 'application/json'
          }
        });

        if (response.ok) {
          const data = await response.json();
          setHasCheckedWelcome(true);
          
          // Show modal if user hasn't seen welcome (should be false for new signups)
          if (!data.hasSeenWelcome) {
            setShowWelcomeModal(true);
          }
        }
      } catch (error) {
        console.error('Error checking welcome status:', error);
        setHasCheckedWelcome(true);
        // Show welcome modal even if check fails for new signups
        if (isNewSignup) {
          setShowWelcomeModal(true);
        }
      }
    };

    checkWelcomeStatus();
  }, [user?.id, hasCheckedWelcome, isNewSignup]);

  // Mark welcome modal as seen when closed
  const handleWelcomeClose = async () => {
    setShowWelcomeModal(false);
    
    try {
      const token = localStorage.getItem('token');
      if (!token) return;

      await fetch('/api/welcome/status', {
        method: 'PUT',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ hasSeenWelcome: true })
      });
    } catch (error) {
      console.error('Error marking welcome as seen:', error);
    }
  };

  // Get current user ID from server
  useEffect(() => {
    const fetchCurrentUserId = async () => {
      const token = localStorage.getItem('token');
      if (!token) return;
      
      try {
        const response = await fetch('/api/auth/verify', {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${token}`,
            'Content-Type': 'application/json'
          }
        });
        
        if (response.ok) {
          const data = await response.json();
          if (data.valid && data.user?.id) {
            setCurrentUserId(String(data.user.id));
          }
        }
      } catch (error) {
        console.error('Error fetching current user ID:', error);
      }
    };
    
    fetchCurrentUserId();
  }, []);

  const studyTabs = [
    { id: 'study-session', name: t('tabs.studySession'), icon: '📚' },
    { id: 'analytics', name: t('tabs.analytics'), icon: '📊' },
    { id: 'schedule-planner', name: t('tabs.schedulePlanner'), icon: '📅' }
  ];

  const socialTabs = [
    { id: 'study-together', name: t('tabs.studyTogether'), icon: '🤝' },
    { id: 'friends', name: t('tabs.friends'), icon: '👥' },
    { id: 'leaderboard', name: t('tabs.leaderboard'), icon: '🏆' }
  ];

  // Messages tab for top navigation - using useMemo to prevent excessive re-renders
  const messagesTab = useMemo(() => ({
    id: 'messages',
    name: t('sidebar.messages'),
    icon: '💬',
    unreadCount
  }), [unreadCount, t]);

  return (
    <ToastProvider>
      <div className="App">
        {/* Global Message Notifications - always active */}
        <MessageNotifications 
          activeTab={activeTab}
          setActiveTab={setActiveTab}
          currentUserId={currentUserId}
        />
        
        <Sidebar 
          studyTabs={studyTabs}
          socialTabs={socialTabs}
          messagesTab={messagesTab}
          activeTab={activeTab}
          setActiveTab={setActiveTab}
          collapsed={sidebarCollapsed}
          setCollapsed={setSidebarCollapsed}
          user={user}
          onLogout={onLogout}
          onSettingsClick={() => {
            setSettingsInitialSection('account');
            setSettingsModalOpen(true);
          }}
          onShareAppClick={() => setShareAppModalOpen(true)}
          onHelpClick={() => {
            setSettingsInitialSection('about');
            setSettingsModalOpen(true);
          }}
        />
        <MainContent 
          activeTab={activeTab}
          sidebarCollapsed={sidebarCollapsed}
          user={user}
          setActiveTab={setActiveTab}
          minimizedSession={minimizedSession}
          setMinimizedSession={setMinimizedSession}
          studySessionRef={studySessionRef}
          studyTogetherRef={studyTogetherRef}
        />
        
        {/* Floating Timer */}
        {minimizedSession && (
          <FloatingTimer
            session={minimizedSession}
            onExpand={() => {
              const targetTab = minimizedSession.type === 'together' ? 'study-together' : 'study-session';
              const wasTogether = minimizedSession.type === 'together';
              const minimizedSnapshot = wasTogether ? { ...minimizedSession } : null;
              setActiveTab(targetTab);
              setTimeout(() => {
                if (wasTogether && minimizedSnapshot && studyTogetherRef.current?.restoreSessionTime) {
                  studyTogetherRef.current.restoreSessionTime(minimizedSnapshot);
                }
                setMinimizedSession(null);
              }, 100);
            }}
          onClose={async () => {
            // For solo sessions - end session globally (works from any tab)
            if (minimizedSession?.type === 'solo') {
              // If the StudySession component is mounted, delegate to its stop handler
              if (studySessionRef.current && typeof studySessionRef.current.stopEntireSession === 'function') {
                // Let StudySession handle confirmation, state reset, and persistence
                studySessionRef.current.stopEntireSession();
                return;
              }

              // Fallback: end session via persisted data (when StudySession is not mounted)
              const confirmed = window.confirm(t('studySession.stopEntireConfirm'));
              if (!confirmed) {
                return; // User cancelled
              }

              try {
                // Set guard so StudySession won't try to restore a just-ended session
                localStorage.setItem('ss_end_guard', '1');

                // Load the current session data
                const localData = await loadTabData('study-session');
                if (localData?.activeSession) {
                  const activeSession = localData.activeSession;
                  const duration = activeSession.duration || 25;
                  
                  // Calculate actual duration based on minimized session state
                  let actualDuration = 0;
                  if (minimizedSession.isBreakMode) {
                    // If in break mode, the study time was completed before the break started
                    // Use the full duration as the actual duration (study session completed)
                    actualDuration = duration;
                  } else {
                    // If in study mode, calculate based on time left
                    const remainingTime = minimizedSession.timeLeft || 0;
                    const totalSeconds = duration * 60;
                    const elapsedSeconds = totalSeconds - remainingTime;
                    actualDuration = Math.round(elapsedSeconds / 60);
                  }
                  
                  // Ensure minimum of 1 minute
                  if (actualDuration <= 0) {
                    actualDuration = 1;
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
                    await updateTabData('study-session', newData);
                    await autoSave('study-session', newData);
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
                    
                    await updateTabData('study-session', newData);
                    await autoSave('study-session', newData);
                  }
                }
                
                // Clear minimized session
                setMinimizedSession(null);
              } catch (error) {
                console.error('Error ending solo session:', error);
                // Even if there's an error, clear the minimized session to prevent stuck state
                setMinimizedSession(null);
              }
            } else if (minimizedSession?.type === 'together') {
              // When minimized, we show list view so SynchronizedStudySession is not mounted; use API to stop.
              const confirmed = window.confirm('Are you sure you want to stop the session for everyone?');
              if (!confirmed) {
                return; // User cancelled
              }

              try {
                const sessionId = minimizedSession?.sessionId;
                const token = localStorage.getItem('token');
                const response = await fetch('/api/study-together/stop', {
                  method: 'POST',
                  headers: {
                    'Authorization': `Bearer ${token}`,
                    'Content-Type': 'application/json'
                  },
                  body: JSON.stringify({
                    sessionId: sessionId
                  })
                });

                if (response.ok) {
                  const result = await response.json();
                  console.log('Session stopped:', result);
                  setMinimizedSession(null);
                  if (studyTogetherRef.current && typeof studyTogetherRef.current.clearSession === 'function') {
                    studyTogetherRef.current.clearSession();
                  }
                } else {
                  console.error('Failed to stop session');
                  setMinimizedSession(null);
                }
              } catch (error) {
                console.error('Error stopping together session:', error);
                setMinimizedSession(null);
              }
            }
          }}
          />
        )}

        {/* Settings Modal */}
        <SettingsModal
          isOpen={settingsModalOpen}
          onClose={() => setSettingsModalOpen(false)}
          user={user}
          onLogout={onLogout}
          initialSection={settingsInitialSection}
        />

        {/* Help Modal */}
        {/* Share App Modal */}
        <SimpleMessageModal
          isOpen={shareAppModalOpen}
          onClose={() => setShareAppModalOpen(false)}
          title="StudyFocus isn't public yet"
          message="This feature will be available once StudyFocus is deployed online."
        />

        {/* Welcome Modal - Only for new signups */}
        <WelcomeModal
          isOpen={showWelcomeModal}
          onClose={handleWelcomeClose}
        />

        {/* Help Bot Widget */}
        <HelpBot activeTab={activeTab} />

      </div>
    </ToastProvider>
  );
}

export default App;
