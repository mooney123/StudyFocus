import React, { useState, useRef, useEffect, useLayoutEffect } from 'react';
import ReactMarkdown from 'react-markdown';
import { useLanguage } from '../context/LanguageContext';
import { useFavorites } from '../context/FavoritesContext';
import './StudyFocusAI.css';

const StudyFocusAI = () => {
  const { t } = useLanguage();
  const { isFavorited, toggleFavorite } = useFavorites();
  const [messages, setMessages] = useState([]);
  const [inputValue, setInputValue] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [userData, setUserData] = useState(null);
  const [dataLoaded, setDataLoaded] = useState(false);
  const [userId, setUserId] = useState(null);
  const [chats, setChats] = useState([]);
  const [currentChatId, setCurrentChatId] = useState(null);
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [editingChatId, setEditingChatId] = useState(null);
  const [editingTitle, setEditingTitle] = useState('');
  const messagesEndRef = useRef(null);
  const chatScrollContainerRef = useRef(null);
  const inputRef = useRef(null);
  const prevMessagesLengthRef = useRef(0);

  const suggestedQuestions = [
    "What subject have I studied the least in the last 7 days?",
    "When am I most productive during the day?",
    "What should I focus on next based on my recent sessions?"
  ];

  const handleSuggestionClick = (question) => {
    setInputValue(question);
    setTimeout(() => {
      inputRef.current?.focus();
    }, 0);
  };

  const generateChatTitle = (firstMessage) => {
    if (!firstMessage || !firstMessage.content) return 'New Chat';
    const text = firstMessage.content.trim();
    return text.length > 50 ? text.substring(0, 50) + '...' : text;
  };

  // Generate a concise, topic-based title using OpenAI API
  const generateAITitle = async (userMessage, aiMessage) => {
    if (!userMessage || !aiMessage) return null;
    
    try {
      const token = localStorage.getItem('token');
      if (!token) return null;

      const response = await fetch('http://localhost:3001/api/ai/chat', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          model: 'gpt-4',
          messages: [
            {
              role: 'system',
              content: 'You are a helpful assistant that generates concise, descriptive chat titles. Generate a title that captures the main topic of the conversation. The title should be 3-6 words, clear and topic-based. Return ONLY the title text, nothing else.'
            },
            {
              role: 'user',
              content: `Generate a concise title (3-6 words) for this conversation:\n\nUser: ${userMessage.content}\n\nAI: ${aiMessage.content.substring(0, 200)}`
            }
          ],
          temperature: 0.7,
          max_tokens: 20
        })
      });

      if (response.ok) {
        const data = await response.json();
        const generatedTitle = data.choices[0]?.message?.content?.trim();
        // Clean up the title - remove quotes, extra whitespace, etc.
        if (generatedTitle) {
          return generatedTitle
            .replace(/^["']|["']$/g, '') // Remove surrounding quotes
            .replace(/\s+/g, ' ') // Normalize whitespace
            .trim()
            .substring(0, 60); // Max 60 chars for safety
        }
      }
    } catch (error) {
      console.error('Error generating chat title:', error);
    }
    return null;
  };

  const loadChatList = React.useCallback(() => {
    try {
      const storageKey = userId ? `studyfocus_ai_chats_${userId}` : 'studyfocus_ai_chats';
      const savedChats = localStorage.getItem(storageKey);
      if (savedChats) {
        const parsed = JSON.parse(savedChats);
        setChats(parsed);
        if (parsed.length > 0 && !currentChatId) {
          const mostRecent = parsed.sort((a, b) => new Date(b.updatedAt) - new Date(a.updatedAt))[0];
          setCurrentChatId(mostRecent.id);
        }
      }
    } catch (error) {
      console.error('Error loading chat list from localStorage:', error);
    }
  }, [userId, currentChatId]);

  const saveChatList = React.useCallback((chatList) => {
    try {
      const storageKey = userId ? `studyfocus_ai_chats_${userId}` : 'studyfocus_ai_chats';
      localStorage.setItem(storageKey, JSON.stringify(chatList));
      setChats(chatList);
    } catch (error) {
      console.error('Error saving chat list to localStorage:', error);
    }
  }, [userId]);

  const loadMessages = React.useCallback((chatId) => {
    if (!chatId) {
      setMessages([]);
      return;
    }
    try {
      const storageKey = userId 
        ? `studyfocus_ai_chat_${userId}_${chatId}` 
        : `studyfocus_ai_chat_${chatId}`;
      const savedMessages = localStorage.getItem(storageKey);
      if (savedMessages) {
        const parsed = JSON.parse(savedMessages);
        const messagesWithDates = parsed.map(msg => ({
          ...msg,
          timestamp: msg.timestamp ? new Date(msg.timestamp) : new Date()
        }));
        setMessages(messagesWithDates);
      } else {
        setMessages([]);
      }
    } catch (error) {
      console.error('Error loading messages from localStorage:', error);
      setMessages([]);
    }
  }, [userId]);

  const saveMessages = React.useCallback((chatId, newMessages) => {
    if (!chatId) return;
    try {
      const storageKey = userId 
        ? `studyfocus_ai_chat_${userId}_${chatId}` 
        : `studyfocus_ai_chat_${chatId}`;
      localStorage.setItem(storageKey, JSON.stringify(newMessages));
      
      if (newMessages.length > 0) {
        const firstUserMessage = newMessages.find(msg => msg.type === 'user');
        if (firstUserMessage) {
          const updatedChats = chats.map(chat => {
            if (chat.id === chatId) {
              // Only use simple title generation if title is still "New Chat"
              // Otherwise keep existing title (allows for manual edits)
              const newTitle = (chat.title === 'New Chat' || !chat.title) 
                ? generateChatTitle(firstUserMessage) 
                : chat.title;
              return {
                ...chat,
                title: newTitle,
                updatedAt: new Date().toISOString(),
                lastMessage: newMessages[newMessages.length - 1].content?.substring(0, 100) || ''
              };
            }
            return chat;
          });
          saveChatList(updatedChats);
        }
      }
    } catch (error) {
      console.error('Error saving messages to localStorage:', error);
    }
  }, [userId, chats, saveChatList]);

  const scrollToBottom = (instant = false) => {
    const doScroll = () => {
      const container = chatScrollContainerRef.current;
      if (!container) return;
      container.scrollTo({
        top: container.scrollHeight,
        behavior: instant ? 'auto' : 'smooth'
      });
    };
    // Defer until layout stabilizes (textarea shrinks when input clears, causing scroll jump)
    requestAnimationFrame(() => requestAnimationFrame(doScroll));
  };

  // Single scroll effect: run when messages grow or when typing indicator appears
  useLayoutEffect(() => {
    const prevLen = prevMessagesLengthRef.current;
    const messagesGrew = messages.length > prevLen;
    prevMessagesLengthRef.current = messages.length;

    if (messagesGrew || (isLoading && messages.length > 0)) {
      const instant = messages.length <= 1;
      scrollToBottom(instant);
    }
  }, [messages, isLoading]);

  useEffect(() => {
    const loadUserData = async () => {
      try {
        const token = localStorage.getItem('token');
        if (!token) {
          console.error('No authentication token found');
          return;
        }

        const verifyResponse = await fetch('http://localhost:3001/api/auth/verify', {
          headers: {
            'Authorization': `Bearer ${token}`,
            'Content-Type': 'application/json'
          }
        });

        if (verifyResponse.ok) {
          const verifyData = await verifyResponse.json();
          if (verifyData.valid && verifyData.user) {
            setUserId(verifyData.user.id);
          }
        }

        const response = await fetch('http://localhost:3001/api/ai/user-data', {
          headers: {
            'Authorization': `Bearer ${token}`,
            'Content-Type': 'application/json'
          }
        });

        if (!response.ok) {
          throw new Error('Failed to load user data');
        }

        const data = await response.json();
        setUserData(data);
        if (!userId && data.userId) {
          setUserId(data.userId);
        }
        setDataLoaded(true);
      } catch (error) {
        console.error('Error loading user data:', error);
        setDataLoaded(true);
      }
    };

    loadUserData();
  }, []);

  useEffect(() => {
    if (userId) {
      loadChatList();
    }
  }, [userId, loadChatList]);

  useEffect(() => {
    if (currentChatId) {
      loadMessages(currentChatId);
    } else {
      setMessages([]);
    }
    prevMessagesLengthRef.current = 0; // Reset so scroll works correctly when messages load
  }, [currentChatId, loadMessages]);

  const createNewChat = (baseChats = chats) => {
    const newChatId = Date.now().toString();
    const newChat = {
      id: newChatId,
      title: 'New Chat',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      lastMessage: ''
    };
    const updatedChats = [newChat, ...baseChats];
    saveChatList(updatedChats);
    setCurrentChatId(newChatId);
    setMessages([]);
    setInputValue('');
  };

  const switchToChat = (chatId) => {
    setCurrentChatId(chatId);
  };

  const deleteChat = (chatId, e) => {
    e.stopPropagation();
    if (window.confirm('Delete this chat?')) {
      const updatedChats = chats.filter(chat => chat.id !== chatId);
      saveChatList(updatedChats);
      
      try {
        const storageKey = userId 
          ? `studyfocus_ai_chat_${userId}_${chatId}` 
          : `studyfocus_ai_chat_${chatId}`;
        localStorage.removeItem(storageKey);
      } catch (error) {
        console.error('Error deleting chat messages:', error);
      }
      
      if (currentChatId === chatId) {
        if (updatedChats.length > 0) {
          const mostRecent = updatedChats.sort((a, b) => new Date(b.updatedAt) - new Date(a.updatedAt))[0];
          setCurrentChatId(mostRecent.id);
        } else {
          // Keep the user in a valid state by creating a fresh empty chat
          // after deleting the final remaining conversation.
          createNewChat([]);
        }
      }
    }
  };

  const startEditingTitle = (chat, e) => {
    e.stopPropagation();
    setEditingChatId(chat.id);
    setEditingTitle(chat.title);
  };

  const saveEditedTitle = (chatId) => {
    const updatedChats = chats.map(chat => {
      if (chat.id === chatId) {
        return {
          ...chat,
          title: editingTitle.trim() || 'New Chat',
          updatedAt: new Date().toISOString()
        };
      }
      return chat;
    });
    saveChatList(updatedChats);
    setEditingChatId(null);
    setEditingTitle('');
  };

  const cancelEditingTitle = () => {
    setEditingChatId(null);
    setEditingTitle('');
  };

  const formatChatDate = (dateString) => {
    const date = new Date(dateString);
    const now = new Date();
    const diffTime = Math.abs(now - date);
    const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
    
    if (diffDays === 0) return 'Today';
    if (diffDays === 1) return 'Yesterday';
    if (diffDays < 7) return `${diffDays} days ago`;
    return date.toLocaleDateString();
  };

  const formatUserDataForAI = (data) => {
    if (!data) return 'No user data available.';
    
    const sessions = data.studySessions || [];
    const now = new Date();
    const today = new Date(now);
    today.setHours(23, 59, 59, 999);
    const sevenDaysAgo = new Date(now);
    sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);
    sevenDaysAgo.setHours(0, 0, 0, 0);
    
    const recentSessions = sessions.filter(s => {
      if (!s.startTime) return false;
      const sessionDate = new Date(s.startTime);
      return sessionDate >= sevenDaysAgo && sessionDate <= today;
    });
    
    const totalMinutes = recentSessions.reduce((sum, s) => sum + (s.actualDuration || 0), 0);
    const averageDuration = recentSessions.length > 0 ? Math.round(totalMinutes / recentSessions.length) : 0;
    
    const subjectBreakdown = {};
    recentSessions.forEach(s => {
      const subject = s.subject || 'Unknown';
      const minutes = s.actualDuration || 0;
      subjectBreakdown[subject] = (subjectBreakdown[subject] || 0) + minutes;
    });
    
    const hourBreakdown = {};
    recentSessions.forEach(s => {
      if (s.startTime) {
        const hour = new Date(s.startTime).getHours();
        hourBreakdown[hour] = (hourBreakdown[hour] || 0) + 1;
      }
    });
    
    const schedulePlanner = data.schedulePlanner || {};
    const generatedSchedule = schedulePlanner.generatedSchedule || {};
    
    let scheduleText = 'No schedule available.';
    if (Object.keys(generatedSchedule).length > 0) {
      scheduleText = 'CURRENT TIMETABLE:\n';
      Object.entries(generatedSchedule).forEach(([day, classes]) => {
        if (classes && classes.length > 0) {
          scheduleText += `\n${day}:\n`;
          const classArray = Array.isArray(classes) ? classes : Object.values(classes);
          classArray.forEach(cls => {
            if (cls && typeof cls === 'object') {
              scheduleText += `  - ${cls.type || 'Class'}: ${cls.subject || 'N/A'}`;
              if (cls.time) scheduleText += ` at ${cls.time}`;
              if (cls.location) scheduleText += ` (${cls.location})`;
              if (cls.notes) scheduleText += ` - ${cls.notes}`;
              scheduleText += '\n';
            }
          });
        }
      });
    }
    
    return `USER DATA CONTEXT:
    
STUDY SESSIONS (Last 7 Days):
- Total sessions: ${recentSessions.length}
- Completed sessions: ${recentSessions.filter(s => s.completed).length}
- Completion rate: ${recentSessions.length > 0 ? Math.round((recentSessions.filter(s => s.completed).length / recentSessions.length) * 100) : 0}%
- Total study time: ${Math.round(totalMinutes / 60)} hours ${totalMinutes % 60} minutes
- Average session duration: ${averageDuration} minutes

SUBJECT BREAKDOWN (Last 7 Days):
${Object.entries(subjectBreakdown).map(([subject, minutes]) => `- ${subject}: ${Math.round(minutes / 60)}h ${minutes % 60}m`).join('\n') || 'No subjects studied.'}

RECENT SESSIONS (Last 7 Days):
${recentSessions.slice(0, 10).map(s => {
  const date = s.startTime ? new Date(s.startTime).toLocaleString() : 'Unknown date';
  const duration = s.actualDuration || 0;
  return `- ${s.subject || 'Unknown'} (${date}): ${duration} minutes${s.completed ? ' [COMPLETED]' : ' [NOT COMPLETED]'}`;
}).join('\n') || 'No recent sessions.'}

STUDY TIME BY HOUR OF DAY (Last 7 Days):
${Object.entries(hourBreakdown).sort((a, b) => parseInt(a[0]) - parseInt(b[0])).map(([hour, count]) => {
  const hour12 = parseInt(hour) % 12 || 12;
  const ampm = parseInt(hour) >= 12 ? 'PM' : 'AM';
  return `- ${hour12}:00 ${ampm}: ${count} session(s)`;
}).join('\n') || 'No time data available.'}

NOTES:
${data.notes && data.notes.length > 0 ? data.notes.map(n => `- ${n.subject}: ${n.notes.substring(0, 200)}${n.notes.length > 200 ? '...' : ''}`).join('\n') : 'No notes available.'}

${scheduleText}`;
  };

  const isReportQuery = (query) => {
    const reportKeywords = ['analyze', 'analysis', 'report', 'summary', 'overview', 'breakdown', 'review', 'assessment', 'evaluate', 'examine', 'study habits', 'study pattern'];
    const lowerQuery = query.toLowerCase();
    return reportKeywords.some(keyword => lowerQuery.includes(keyword));
  };

  const validateReportFormat = (text) => {
    const hasTitle = /^[^0-9•\-\*]/.test(text.trim());
    const sections = text.match(/^\d+\.\s+[^:]+:/gm) || [];
    const hasNumberedSections = sections.length >= 2;
    const noRepeatedNumbers = new Set(sections.map(s => s.match(/^\d+/)[0])).size === sections.length;
    const hasContent = text.split(/\n/).filter(line => line.trim().length > 0).length >= 5;
    return hasTitle && hasNumberedSections && noRepeatedNumbers && hasContent;
  };

  const repairReportFormat = (text) => {
    let repaired = text;
    
    repaired = repaired.replace(/^(\d+)([A-Z])/gm, '$1. $2');
    repaired = repaired.replace(/^(\d+)([a-z])/gm, (match, num, letter) => `${num}. ${letter.toUpperCase()}`);
    
    const sectionMatches = [...repaired.matchAll(/^(\d+)\.\s+/gm)];
    const seen = new Set();
    let currentNum = 1;
    
    sectionMatches.forEach(match => {
      const originalNum = match[1];
      if (seen.has(originalNum)) {
        repaired = repaired.replace(new RegExp(`^${originalNum}\\.\\s+`, 'm'), `${currentNum}. `);
      } else {
        seen.add(originalNum);
      }
      currentNum++;
    });
    
    repaired = repaired.replace(/^•\s+([^:]+):/gm, '1. $1:');
    
    const lines = repaired.split('\n');
    const cleaned = [];
    let lastWasEmpty = false;
    
    lines.forEach((line, i) => {
      const trimmed = line.trim();
      if (trimmed === '' && lastWasEmpty) return;
      if (trimmed === '' && /^\d+\.\s+[^:]+:$/.test(lines[i + 1]?.trim())) {
        lastWasEmpty = true;
        cleaned.push('');
      } else if (trimmed !== '') {
        lastWasEmpty = false;
        cleaned.push(line);
      }
    });
    
    return cleaned.join('\n');
  };

  const createSystemPrompt = (isReport = false) => {
    let prompt = `You are StudyFocus AI, a personal study assistant with access to the user's real study data. Your role is to help users understand their study patterns, improve their habits, and answer questions based on their actual data.

CRITICAL RULES:
1. ONLY use data provided in the user's context - NEVER invent or assume study sessions, dates, or statistics.
2. If you don't have data for something, explicitly say "I don't have data for [X] in your study history" rather than making assumptions.
3. Be transparent about time windows - always mention "in the last 7 days" or "recently" when referencing data.
4. Provide evidence-based insights - reference specific data points when making observations.
5. Never reveal or reference other users' data - this user's data is private to them.

DATA AVAILABILITY:
- Study sessions with timestamps (startTime), durations (actualDuration), subjects, and completion status
- Subject breakdown and time distribution
- Study time by hour of day
- Notes from study sessions
- Current timetable/schedule
- All timestamps are in ISO format and can be parsed for detailed analysis

RESPONSE FORMAT (scannability in chat):
- Start with a 1–2 sentence overview, then use structured sections
- Prefer bullet points over multi-sentence paragraphs
- Each bullet = one idea, max ~15 words when possible
- Use section headers (##) to break up content
- Add blank lines between sections
- Use **bold** for key terms and **code** (backticks) for data values
- Avoid rhetorical questions and filler (e.g., "It's worth noting that...", "Have you considered...")
- Keep insights complete but compressed; structure for quick scanning`;

    if (isReport) {
      prompt += `\n\nREPORT FORMATTING MODE (STRICT RULES):
You are generating a structured analysis report. Follow these EXACT formatting rules:

STRUCTURE REQUIREMENTS:
1. Start with a single-line Title (not numbered, not a bullet)
2. Use numbered sections: 1., 2., 3., etc. (sequential, no duplicates)
3. Each section must have:
   - A header in format: "N. Section Name:" (with colon)
   - At least one content sentence immediately after
   - Optional bullets (-) only for sub-items, never as headings
4. End with "Overall Summary:" section
5. Exactly one blank line between sections

HARD FORMATTING RULES:
- NO headings like "1Completion Rate" (must be "1. Completion Rate:")
- NO repeated numbering (e.g., multiple "1." sections)
- NO empty sections (if no data, write "Insufficient data available.")
- NO bullets used as headings (e.g., "• Structured Schedule:" is FORBIDDEN)
- NO "• Heading:" format - use numbered sections instead
- Exactly one blank line between sections
- Max 3 lines per paragraph (split if longer)

EXAMPLE CORRECT FORMAT:
Title: Study Habits Analysis

1. Completion Rate:
You've completed 18 out of 21 study sessions, giving you an 86% completion rate.

2. Subject Focus:
- Statistics: 6 hours
- Physics: 4 hours
- Mathematics: 2 hours

3. Study Timing:
Your most active study hours are between 8 PM and 10 PM.

Overall Summary:
You demonstrate strong discipline with consistent evening study sessions.`;
    }

    return prompt;
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!inputValue.trim() || isLoading) return;

    const userMessage = {
      id: Date.now(),
      type: 'user',
      content: inputValue,
      timestamp: new Date()
    };

    let activeChatId = currentChatId;
    let isNewChat = false;
    if (!activeChatId) {
      activeChatId = Date.now().toString();
      isNewChat = true;
      const newChat = {
        id: activeChatId,
        title: 'New Chat',
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        lastMessage: ''
      };
      const updatedChats = [newChat, ...chats];
      saveChatList(updatedChats);
      setCurrentChatId(activeChatId);
    }

    const updatedMessagesWithUser = [...messages, userMessage];
    setMessages(updatedMessagesWithUser);
    saveMessages(activeChatId, updatedMessagesWithUser);
    const currentInput = inputValue;
    const isReport = isReportQuery(currentInput);
    setInputValue('');
    setIsLoading(true);

    try {
      const token = localStorage.getItem('token');
      
      const latestUserDataResponse = await fetch('http://localhost:3001/api/ai/user-data', {
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        }
      });
      const latestUserData = latestUserDataResponse.ok ? await latestUserDataResponse.json() : userData;
      
      const systemPrompt = createSystemPrompt(isReport);
      const userDataContext = formatUserDataForAI(latestUserData);
      
      // Call backend proxy endpoint instead of OpenAI directly
      const response = await fetch('http://localhost:3001/api/ai/chat', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          model: 'gpt-4',
          messages: [
            { role: 'system', content: systemPrompt },
            { role: 'user', content: `${userDataContext}\n\nUSER QUESTION: ${currentInput}` }
          ],
          temperature: 0.7,
          max_tokens: 2000
        })
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        console.error('OpenAI API Error:', response.status, errorData);
        throw new Error(errorData.error || `OpenAI API error: ${response.status} - ${errorData.error?.message || 'Unknown error'}`);
      }

      const data = await response.json();
      let aiContent = data.choices[0].message.content;
      
      if (isReport) {
        let isValid = validateReportFormat(aiContent);
        if (!isValid) {
          aiContent = repairReportFormat(aiContent);
          isValid = validateReportFormat(aiContent);
        }
        
        if (!isValid) {
          // Use backend proxy for repair request as well
          const repairResponse = await fetch('http://localhost:3001/api/ai/chat', {
            method: 'POST',
            headers: {
              'Authorization': `Bearer ${token}`,
              'Content-Type': 'application/json'
            },
            body: JSON.stringify({
              model: 'gpt-4',
              messages: [
                { role: 'system', content: createSystemPrompt(true) },
                { role: 'user', content: `Please reformat this analysis report to follow the strict formatting rules:\n\n${aiContent}` }
              ],
              temperature: 0.3,
              max_tokens: 2000
            })
          });
          
          if (repairResponse.ok) {
            const repairData = await repairResponse.json();
            aiContent = repairData.choices[0].message.content;
          } else {
            const repairError = await repairResponse.json().catch(() => ({}));
            console.error('Failed to repair report format:', repairError);
          }
        }
      }

      const aiMessage = {
        id: Date.now() + 1,
        type: 'ai',
        content: aiContent,
        timestamp: new Date()
      };

      const updatedMessages = [...updatedMessagesWithUser, aiMessage];
      setMessages(updatedMessages);
      saveMessages(activeChatId, updatedMessages);

      // Generate AI title after first meaningful exchange (user + AI)
      // Only if title is still "New Chat" and this is the first exchange
      const isFirstExchange = updatedMessages.filter(msg => msg.type === 'user' || msg.type === 'ai').length === 2;
      
      if (isFirstExchange) {
        // Generate title asynchronously without blocking UI
        // Use a small delay to ensure state is updated
        setTimeout(() => {
          // Load fresh chats from localStorage to check current title
          const storageKey = userId ? `studyfocus_ai_chats_${userId}` : 'studyfocus_ai_chats';
          try {
            const savedChats = localStorage.getItem(storageKey);
            if (savedChats) {
              const parsed = JSON.parse(savedChats);
              const currentChat = parsed.find(chat => chat.id === activeChatId);
              const needsTitleGeneration = currentChat && (currentChat.title === 'New Chat' || !currentChat.title);
              
              if (needsTitleGeneration) {
                // Generate title asynchronously
                generateAITitle(userMessage, aiMessage).then(generatedTitle => {
                  if (generatedTitle && generatedTitle !== 'New Chat') {
                    // Load fresh chats again to ensure we have latest state
                    const freshChats = localStorage.getItem(storageKey);
                    if (freshChats) {
                      const freshParsed = JSON.parse(freshChats);
                      const updatedChats = freshParsed.map(chat => {
                        if (chat.id === activeChatId && (chat.title === 'New Chat' || !chat.title)) {
                          return {
                            ...chat,
                            title: generatedTitle,
                            updatedAt: new Date().toISOString()
                          };
                        }
                        return chat;
                      });
                      saveChatList(updatedChats);
                    }
                  }
                }).catch(error => {
                  console.error('Error generating chat title:', error);
                  // Silently fail - don't interrupt user experience
                });
              }
            }
          } catch (error) {
            console.error('Error checking chat title:', error);
          }
        }, 200);
      }
    } catch (error) {
      console.error('Error calling OpenAI API:', error);
      const errorDetails = error.message || 'Unknown error occurred';
      const errorMessage = {
        id: Date.now() + 1,
        type: 'ai',
        content: `Sorry, I encountered an error: ${errorDetails}. Please check the console for more details.`,
        timestamp: new Date()
      };

      const updatedMessages = [...updatedMessagesWithUser, errorMessage];
      setMessages(updatedMessages);
      saveMessages(activeChatId, updatedMessages);
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className={`study-focus-ai ${sidebarCollapsed ? 'sidebar-collapsed' : ''}`}>
      <div className={`ai-sidebar ${sidebarCollapsed ? 'collapsed' : ''}`}>
        {/* SF Logo - Always visible at top */}
        <div className="ai-sidebar-header">
          <button
            className={`sf-logo-btn ${sidebarCollapsed ? 'collapsed' : ''}`}
            onClick={() => {
              if (sidebarCollapsed) {
                setSidebarCollapsed(false);
              }
            }}
            title={sidebarCollapsed ? 'Expand sidebar' : 'StudyFocus AI'}
          >
            <span className="sf-logo">SF</span>
          </button>
          {!sidebarCollapsed && (
            <button
              className="sidebar-toggle"
              onClick={() => setSidebarCollapsed(true)}
              title="Collapse sidebar"
            >
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <polyline points="15,18 9,12 15,6"/>
              </svg>
            </button>
          )}
        </div>

        {/* New Chat Button - Below SF when expanded, icon when collapsed */}
        {sidebarCollapsed ? (
          <div className="ai-sidebar-collapsed-content">
            <button
              className="new-chat-icon-btn"
              onClick={() => createNewChat()}
              disabled={isLoading}
              title="New Chat"
            >
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <line x1="12" y1="5" x2="12" y2="19"/>
                <line x1="5" y1="12" x2="19" y2="12"/>
              </svg>
            </button>
          </div>
        ) : (
          <div className="ai-sidebar-new-chat">
            <button 
              className="new-chat-btn"
              onClick={() => createNewChat()}
              disabled={isLoading}
            >
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <line x1="12" y1="5" x2="12" y2="19"/>
                <line x1="5" y1="12" x2="19" y2="12"/>
              </svg>
              <span>New Chat</span>
            </button>
          </div>
        )}
        
        {/* Chat List - Only visible when expanded */}
        {!sidebarCollapsed && (
          <div className="ai-sidebar-chats">
            {chats.map((chat) => (
              <div
                key={chat.id}
                className={`chat-item ${currentChatId === chat.id ? 'active' : ''}`}
                onClick={() => switchToChat(chat.id)}
              >
                {editingChatId === chat.id ? (
                  <div className="chat-item-edit" onClick={(e) => e.stopPropagation()}>
                    <input
                      type="text"
                      value={editingTitle}
                      onChange={(e) => setEditingTitle(e.target.value)}
                      onBlur={() => saveEditedTitle(chat.id)}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') {
                          saveEditedTitle(chat.id);
                        } else if (e.key === 'Escape') {
                          cancelEditingTitle();
                        }
                      }}
                      autoFocus
                      className="chat-title-input"
                    />
                  </div>
                ) : (
                  <>
                    <div className="chat-item-content">
                      <div className="chat-item-title">{chat.title}</div>
                      {chat.lastMessage && (
                        <div className="chat-item-preview">{chat.lastMessage}</div>
                      )}
                      <div className="chat-item-date">{formatChatDate(chat.updatedAt)}</div>
                    </div>
                    <div className="chat-item-actions">
                      <button
                        className="chat-item-edit-btn"
                        onClick={(e) => startEditingTitle(chat, e)}
                        title="Rename chat"
                      >
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                          <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/>
                          <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/>
                        </svg>
                      </button>
                      <button
                        className="chat-item-delete-btn"
                        onClick={(e) => deleteChat(chat.id, e)}
                        title="Delete chat"
                      >
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                          <polyline points="3,6 5,6 21,6"/>
                          <path d="M19,6v14a2,2 0,0,1 -2,2H7a2,2 0,0,1 -2,-2V6m3,0V4a2,2 0,0,1 2,-2h4a2,2 0,0,1 2,2v2"/>
                        </svg>
                      </button>
                    </div>
                  </>
                )}
              </div>
            ))}
          </div>
        )}
      </div>

      <div className="ai-main-wrapper">
        <div className="ai-top-bar">
          <div className="top-left">
            <button 
              className="history-btn"
              onClick={() => {
                if (sidebarCollapsed) {
                  setSidebarCollapsed(false);
                }
              }}
              title={sidebarCollapsed ? 'Show chat history' : 'Chat history'}
            >
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <circle cx="12" cy="12" r="10"/>
                <polyline points="12,6 12,12 16,14"/>
              </svg>
            </button>
          </div>
          <div className="top-right">
            <button 
              className={`header-btn star-btn ${isFavorited('study-ai') ? 'starred' : ''}`}
              onClick={() => toggleFavorite('study-ai')}
              title={isFavorited('study-ai') ? 'Remove from favorites' : 'Add to favorites'}
            >
              {isFavorited('study-ai') ? '⭐' : '☆'}
            </button>
          </div>
        </div>

        <div className="ai-main-content">
          <div ref={chatScrollContainerRef} className="chat-scroll-container">
            <div className="ai-avatar-section">
              <div className="ai-avatar">
                <svg width="40" height="40" viewBox="0 0 24 24" fill="currentColor">
                  <path d="M12 2C13.1 2 14 2.9 14 4C14 5.1 13.1 6 12 6C10.9 6 10 5.1 10 4C10 2.9 10.9 2 12 2ZM21 9V7L15 1H5C3.89 1 3 1.89 3 3V21C3 22.1 3.89 23 5 23H19C20.1 23 21 22.1 21 21V9M19 9H14V4H19V9Z"/>
                </svg>
              </div>
              <h1 className="ai-greeting">
                {dataLoaded 
                  ? (userData ? t('studyFocusAI.greetingWithData') : t('studyFocusAI.greetingWithoutData'))
                  : t('studyFocusAI.loadingData')}
              </h1>
            </div>

            {messages.length > 0 && (
              <div className="chat-messages">
                {messages.map((message) => (
                  <div key={message.id} className={`message ${message.type}`}>
                    <div className="message-content">
                      {message.type === 'ai' ? (
                        <div className="ai-markdown">
                          <ReactMarkdown>{message.content}</ReactMarkdown>
                        </div>
                      ) : (
                        message.content
                      )}
                    </div>
                  </div>
                ))}
                {isLoading && (
                  <div className="message ai loading">
                    <div className="message-content">
                      <div className="typing-indicator">
                        <span></span>
                        <span></span>
                        <span></span>
                      </div>
                    </div>
                  </div>
                )}
                <div ref={messagesEndRef} className="chat-scroll-anchor" aria-hidden="true" />
              </div>
            )}

            {messages.length === 0 && (
              <div className="suggested-questions">
                {suggestedQuestions.map((question, index) => (
                  <button
                    key={index}
                    className="suggestion-chip"
                    onClick={() => handleSuggestionClick(question)}
                    disabled={isLoading}
                  >
                    {question}
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>

        <form className="ai-input-form" onSubmit={handleSubmit}>
          <div className="input-container">
              <div className="input-middle">
                <textarea
                  ref={inputRef}
                  className="ai-input"
                  value={inputValue}
                  onChange={(e) => setInputValue(e.target.value)}
                  placeholder={t('studyFocusAI.placeholder')}
                  rows="1"
                  disabled={isLoading}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' && !e.shiftKey) {
                      e.preventDefault();
                      handleSubmit(e);
                    }
                  }}
                  style={{
                    resize: 'none',
                    minHeight: '24px',
                    maxHeight: '200px',
                    overflowY: 'auto'
                  }}
                />
              </div>
              <div className="input-bottom">
                <div className="input-options"></div>
                <button
                  type="submit"
                  className="send-button"
                  disabled={!inputValue.trim() || isLoading}
                >
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <line x1="22" y1="2" x2="11" y2="13"/>
                    <polygon points="22 2 15 22 11 13 2 9 22 2"/>
                  </svg>
                </button>
              </div>
          </div>
        </form>
      </div>
    </div>
  );
};

export default StudyFocusAI;