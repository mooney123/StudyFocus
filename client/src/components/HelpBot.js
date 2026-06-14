import React, { useState, useEffect, useRef } from 'react';
import ReactMarkdown from 'react-markdown';
import './HelpBot.css';

const HELPBOT_STORAGE_PREFIX = 'studyfocus_helpbot_history';
const MAX_HISTORY_MESSAGES = 10; // Limit context to last 10 messages

// Mapping keywords to section titles for context selection
const SECTION_KEYWORDS = {
  'messages': ['messages', 'message', 'chat', 'conversation', 'messaging', 'inbox'],
  'study session (solo)': ['study session', 'study sessions', 'solo', 'pomodoro', 'timer', 'blackboard', 'break', 'session'],
  'study together': ['study together', 'collaborative', 'group study', 'synchronized', 'together', 'group'],
  'friends & social features': ['friends', 'friend', 'friend request', 'connections', 'add friend', 'social'],
  'analytics & statistics': ['analytics', 'statistics', 'stats', 'charts', 'data', 'progress', 'stat'],
  'schedule planner': ['schedule', 'planner', 'timetable', 'calendar', 'plan', 'schedule'],
  'studyfocus ai': ['studyfocus ai', 'ai', 'assistant', 'chatbot', 'studyfocus'],
  'leaderboard': ['leaderboard', 'rankings', 'rank', 'compete', 'competition'],
  'settings & customization': ['settings', 'setting', 'preferences', 'privacy', 'theme', 'language', 'account', 'customization'],
  'getting started': ['getting started', 'sign up', 'signup', 'login', 'account', 'create account', 'register'],
  'understanding the interface': ['interface', 'sidebar', 'navigation', 'home', 'dashboard', 'ui']
};

const HelpBot = ({ activeTab }) => {
  // Hide HelpBot on messages or study-ai tabs (those tabs have their own chat interfaces)
  // Check both possible tab ID formats
  const shouldHide = activeTab === 'messages' || 
                     activeTab === 'study-ai' || 
                     activeTab === 'studyFocusAI';
  
  const [isOpen, setIsOpen] = useState(false);
  const [messages, setMessages] = useState([]);
  const [inputValue, setInputValue] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [onboardingContent, setOnboardingContent] = useState('');
  const [onboardingSections, setOnboardingSections] = useState([]);
  const [userId, setUserId] = useState(null);
  const messagesEndRef = useRef(null);
  const messagesContainerRef = useRef(null);

  const getStorageKey = (currentUserId) => {
    if (!currentUserId) return null;
    return `${HELPBOT_STORAGE_PREFIX}_${currentUserId}`;
  };

  // Initialize userId from localStorage (AuthWrapper stores user there)
  useEffect(() => {
    try {
      const storedUser = localStorage.getItem('user');
      if (storedUser) {
        const parsed = JSON.parse(storedUser);
        if (parsed && parsed.id) {
          setUserId(String(parsed.id));
        }
      }
    } catch (e) {
      console.error('Error loading user from localStorage in HelpBot:', e);
    }
  }, []);

  // Load chat history from localStorage
  useEffect(() => {
    if (!userId) return;

    try {
      const perUserKey = getStorageKey(userId);
      const savedPerUserHistory = perUserKey ? localStorage.getItem(perUserKey) : null;

      if (savedPerUserHistory) {
        const parsed = JSON.parse(savedPerUserHistory);
        setMessages(parsed);
      }
    } catch (e) {
      console.error('Error loading chat history:', e);
    }
  }, [userId]);

  // Parse onboarding content into sections
  const parseOnboardingSections = (text) => {
    const sections = [];
    const lines = text.split('\n');
    let currentSection = null;
    
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      // Match main sections (## 1. Title, ## 2. Title, etc.)
      const sectionMatch = line.match(/^##\s+\d+\.\s+(.+)$/);
      if (sectionMatch) {
        // Save previous section
        if (currentSection) {
          sections.push({
            title: currentSection.title,
            content: currentSection.content.trim()
          });
        }
        // Start new section
        currentSection = {
          title: sectionMatch[1].trim(),
          content: line + '\n'
        };
      } else if (currentSection) {
        // Continue current section content
        currentSection.content += line + '\n';
      }
    }
    
    // Add last section
    if (currentSection) {
      sections.push({
        title: currentSection.title,
        content: currentSection.content.trim()
      });
    }
    
    return sections;
  };

  // Load onboarding content
  useEffect(() => {
    fetch('/ONBOARDING.md')
      .then(response => {
        if (!response.ok) throw new Error('Failed to load onboarding');
        return response.text();
      })
      .then(text => {
        setOnboardingContent(text);
        const sections = parseOnboardingSections(text);
        setOnboardingSections(sections);
      })
      .catch(error => {
        console.error('Error loading onboarding file:', error);
        setOnboardingContent('');
        setOnboardingSections([]);
      });
  }, []);

  // Save chat history to localStorage
  useEffect(() => {
    if (!userId || messages.length === 0) return;

    try {
      const perUserKey = getStorageKey(userId);
      if (!perUserKey) return;
      localStorage.setItem(perUserKey, JSON.stringify(messages));
    } catch (e) {
      console.error('Error saving chat history:', e);
    }
  }, [messages, userId]);

  // Scroll to bottom when new messages arrive
  useEffect(() => {
    if (isOpen && messagesContainerRef.current) {
      messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    }
  }, [messages, isOpen]);

  // Find relevant sections based on user question
  const findRelevantSections = (userQuestion) => {
    if (!userQuestion || !onboardingSections.length) {
      return [];
    }

    const questionLower = userQuestion.toLowerCase();
    const matchedSectionTitles = new Set();
    
    // Check for keyword matches against section keywords
    for (const [sectionKey, keywords] of Object.entries(SECTION_KEYWORDS)) {
      const hasMatch = keywords.some(keyword => questionLower.includes(keyword));
      if (hasMatch) {
        // Find matching section in onboarding by comparing normalized titles
        const section = onboardingSections.find(s => {
          const sectionTitleLower = s.title.toLowerCase();
          const sectionKeyLower = sectionKey.toLowerCase();
          
          // Check if section title contains key words or vice versa
          const keyWords = sectionKeyLower.split(/\s+/).filter(w => w.length > 2);
          const titleMatches = keyWords.some(word => sectionTitleLower.includes(word));
          const keyMatches = sectionTitleLower.split(/\s+/).some(word => 
            word.length > 2 && sectionKeyLower.includes(word)
          );
          
          return titleMatches || keyMatches;
        });
        if (section) {
          matchedSectionTitles.add(section.title);
        }
      }
    }
    
    // Also check for direct title word matches
    onboardingSections.forEach(section => {
      const titleWords = section.title.toLowerCase().split(/\s+/).filter(w => w.length > 3);
      const hasDirectMatch = titleWords.some(word => questionLower.includes(word));
      if (hasDirectMatch) {
        matchedSectionTitles.add(section.title);
      }
    });
    
    // Return matched sections
    return Array.from(matchedSectionTitles).map(title => 
      onboardingSections.find(s => s.title === title)
    ).filter(Boolean);
  };

  // Create short summary of all sections (first 150 chars of each)
  const createSummary = () => {
    if (!onboardingSections.length) {
      return 'Onboarding documentation not available.';
    }
    
    return onboardingSections.map(section => {
      // Extract first meaningful content (skip heading)
      const lines = section.content.split('\n').filter(l => l.trim() && !l.startsWith('#'));
      const summary = lines.slice(0, 3).join(' ').substring(0, 150);
      return `## ${section.title}\n${summary}${summary.length >= 150 ? '...' : ''}`;
    }).join('\n\n');
  };

  const createSystemPrompt = (userQuestion = '') => {
    const appOverview = `StudyFocus is a study management app with: Messages, Study Session (Solo) with Pomodoro timers and blackboard, Study Together (group sessions), Analytics, Schedule Planner, StudyFocus AI, Friends, Leaderboard, Settings.`;

    // Find relevant sections based on user question
    const relevantSections = findRelevantSections(userQuestion);
    let contextContent = '';
    
    if (relevantSections.length > 0) {
      contextContent = relevantSections.map(s => s.content).join('\n\n---\n\n');
    } else {
      contextContent = createSummary();
    }

    return `You are the StudyFocus in-app assistant (HelpBot). Your responses must be:

## Tone
- Friendly
- Concise
- App-native (not academic or documentation-like)
- Helpful without over-explaining

## Structure Rules
- Start with a short 1–2 sentence overview
- Use section headers when listing features or steps
- Prefer bullet points over numbered lists
- Each bullet = one short idea (max ~15 words)
- Use spacing between sections
- Avoid dense paragraphs
- Avoid long explanations unless explicitly requested
- Keep responses visually scannable

## Goal
Every response should be readable within seconds inside a chat UI.

## App Context
${appOverview}

${relevantSections.length > 0 ? 'RELEVANT ONBOARDING SECTIONS:' : 'ONBOARDING SUMMARY:'}
${contextContent}

## Answer Rules
- If onboarding docs don't have the answer, say so briefly, then give best guidance from the app overview
- Don't invent features that aren't mentioned
- Don't be overly validating; help directly`;
  };

  const getRecentMessages = () => {
    // Get last N messages for context (excluding system message)
    const recent = messages.slice(-MAX_HISTORY_MESSAGES);
    return recent;
  };

  const handleSend = async (e) => {
    e.preventDefault();
    if (!inputValue.trim() || isLoading) return;

    const userMessage = inputValue.trim();
    setInputValue('');

    // Add user message immediately
    const newUserMessage = {
      role: 'user',
      content: userMessage,
      timestamp: new Date().toISOString()
    };
    setMessages(prev => [...prev, newUserMessage]);
    setIsLoading(true);

    try {
      const token = localStorage.getItem('token');
      if (!token) {
        throw new Error('Not authenticated');
      }

      const systemPrompt = createSystemPrompt(userMessage);
      const recentMessages = getRecentMessages();

      // Build messages array for API
      const apiMessages = [
        { role: 'system', content: systemPrompt },
        ...recentMessages.map(msg => ({
          role: msg.role,
          content: msg.content
        })),
        { role: 'user', content: userMessage }
      ];

      const response = await fetch('http://localhost:3001/api/ai/chat', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          model: 'gpt-4',
          messages: apiMessages,
          temperature: 0.7,
          max_tokens: 1000
        })
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(errorData.error || `API error: ${response.status}`);
      }

      const data = await response.json();
      const botResponse = data.choices[0]?.message?.content || 'Sorry, I couldn\'t generate a response.';

      // Add bot response
      const newBotMessage = {
        role: 'assistant',
        content: botResponse,
        timestamp: new Date().toISOString()
      };
      setMessages(prev => [...prev, newBotMessage]);
    } catch (error) {
      console.error('Error calling OpenAI API:', error);
      
      // Add error message as a bot message
      const errorMessage = {
        role: 'assistant',
        content: `Sorry, I encountered an error: ${error.message}. Please check your API key configuration or try again later.`,
        timestamp: new Date().toISOString(),
        isError: true
      };
      setMessages(prev => [...prev, errorMessage]);
    } finally {
      setIsLoading(false);
    }
  };

  const handleToggle = () => {
    setIsOpen(!isOpen);
  };

  const formatTime = (timestamp) => {
    try {
      const date = new Date(timestamp);
      return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    } catch {
      return '';
    }
  };

  // Don't render if shouldHide is true (on messages or study-ai tabs)
  if (shouldHide) {
    return null;
  }

  return (
    <>
      {/* Floating Help Button */}
      <button
        className={`helpbot-button ${isOpen ? 'open' : ''}`}
        onClick={handleToggle}
        aria-label="AI Help"
        title="AI Help"
      >
        <img src="/helpbot-icon.png" alt="AI Help Bot" className="helpbot-icon-only" />
      </button>

      {/* Chat Panel */}
      {isOpen && (
        <div className="helpbot-panel">
          <div className="helpbot-header">
            <h3>StudyFocus Help</h3>
            <button
              className="helpbot-close"
              onClick={handleToggle}
              aria-label="Close"
              title="Close"
            >
              ✕
            </button>
          </div>

          <div className="helpbot-messages" ref={messagesContainerRef}>
            {messages.length === 0 && !isLoading && (
              <div className="helpbot-empty">
                <div className="helpbot-empty-icon">💬</div>
                <div className="helpbot-empty-text">
                  Ask me anything about StudyFocus!
                </div>
              </div>
            )}

            {messages.map((msg, index) => (
              <div
                key={index}
                className={`helpbot-message-wrapper ${msg.role === 'user' ? 'user' : 'bot'}`}
              >
                <div className={`helpbot-message ${msg.isError ? 'error' : ''}`}>
                  <div className="helpbot-message-content helpbot-markdown">
                    {msg.role === 'user' ? (
                      msg.content.split('\n').map((line, i) => (
                        <React.Fragment key={i}>
                          {line}
                          {i < msg.content.split('\n').length - 1 && <br />}
                        </React.Fragment>
                      ))
                    ) : (
                      <ReactMarkdown>{msg.content}</ReactMarkdown>
                    )}
                  </div>
                  {msg.timestamp && (
                    <div className="helpbot-message-time">
                      {formatTime(msg.timestamp)}
                    </div>
                  )}
                </div>
              </div>
            ))}

            {isLoading && (
              <div className="helpbot-message-wrapper bot">
                <div className="helpbot-message loading">
                  <div className="helpbot-typing-indicator">
                    <span></span>
                    <span></span>
                    <span></span>
                  </div>
                </div>
              </div>
            )}

            <div ref={messagesEndRef} />
          </div>

          <form className="helpbot-input-form" onSubmit={handleSend}>
            <input
              type="text"
              className="helpbot-input"
              value={inputValue}
              onChange={(e) => setInputValue(e.target.value)}
              placeholder="Ask a question..."
              disabled={isLoading}
            />
            <button
              type="submit"
              className="helpbot-send"
              disabled={!inputValue.trim() || isLoading}
              aria-label="Send"
            >
              ➤
            </button>
          </form>
        </div>
      )}
    </>
  );
};

export default HelpBot;

