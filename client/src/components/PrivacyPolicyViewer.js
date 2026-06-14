import React, { useState, useEffect, useRef, useCallback } from 'react';
import { useTheme } from '../context/ThemeContext';
import './UserGuideViewer.css';

const PrivacyPolicyViewer = ({ isOpen, onClose }) => {
  const { isDarkMode } = useTheme();
  const [sections, setSections] = useState([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [filteredSections, setFilteredSections] = useState([]);
  const [activeSectionId, setActiveSectionId] = useState(null);
  const [highlightedText, setHighlightedText] = useState('');
  const contentRef = useRef(null);
  const sectionRefs = useRef({});
  const tocListRef = useRef(null);
  const tocItemRefs = useRef({});
  const scrollTimeoutRef = useRef(null);

  const lastUpdated = new Date().toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'long',
    day: 'numeric'
  });

  // Content in markdown format
  const content = `# Privacy Policy

Last updated: ${lastUpdated}

Your privacy matters. This policy explains what we collect and how we use it — simply and transparently.

## 1. Information We Collect

We collect only what's needed for StudyFocus to work:

- Account information (such as username or email)
- Study activity (sessions, goals, analytics)
- Messages you send within the app
- Basic presence data (online / away / offline status)

## 2. How We Use Your Information

We use your data to:

- Run and improve StudyFocus
- Show your study progress and analytics
- Enable messaging and collaboration
- Display presence and leaderboards (if enabled in settings)

We do not use your data for advertising.

## 3. Privacy Controls

You control visibility features like:

- Study stats
- Leaderboards
- Presence visibility

If you turn something off, it is respected across the app.

## 4. Sharing Your Data

We do not sell your data.

Your data is only shared with:

- Other users you interact with (e.g. friends, chats)
- Infrastructure providers needed to keep the app running

## 5. Data Storage

Your data is stored securely.

We keep data only as long as it's needed for the app to function.

## 6. Deleting Your Data

If you delete your account, your personal data will be removed or anonymized within a reasonable time.

Some data may remain temporarily in backups.

## 7. Changes to This Policy

This policy may be updated as StudyFocus evolves.

Significant changes will be communicated clearly.

## 8. Contact

If you have privacy questions or requests, contact us through StudyFocus.`;

  // Parse sections from content
  useEffect(() => {
    if (isOpen) {
      parseSections(content);
    }
  }, [isOpen]);

  // Parse sections from markdown
  const parseSections = (text) => {
    const lines = text.split('\n');
    const parsedSections = [];
    let sectionId = 0;

    lines.forEach((line, index) => {
      // Match headings (#, ##, ###)
      const headingMatch = line.match(/^(#{1,3})\s+(.+)$/);
      
      if (headingMatch) {
        const level = headingMatch[1].length;
        const title = headingMatch[2].trim();
        const id = `section-${sectionId++}`;
        
        parsedSections.push({
          id,
          title,
          level,
          lineIndex: index
        });
      }
    });

    setSections(parsedSections);
    setFilteredSections(parsedSections);
  };

  // Filter sections based on search
  useEffect(() => {
    if (!searchQuery.trim()) {
      setFilteredSections(sections);
      return;
    }

    const query = searchQuery.toLowerCase();
    const filtered = sections.filter(section => {
      const titleMatch = section.title.toLowerCase().includes(query);
      const contentMatch = content.toLowerCase().includes(query);
      return titleMatch || contentMatch;
    });

    setFilteredSections(filtered);
  }, [searchQuery, sections, content]);

  // Handle ESC key
  useEffect(() => {
    const handleEsc = (e) => {
      if (e.key === 'Escape' && isOpen) {
        onClose();
      }
    };

    if (isOpen) {
      document.addEventListener('keydown', handleEsc);
      document.body.style.overflow = 'hidden';
    }

    return () => {
      document.removeEventListener('keydown', handleEsc);
      document.body.style.overflow = 'unset';
    };
  }, [isOpen, onClose]);

  // Scroll tracking for active section
  useEffect(() => {
    if (!contentRef.current || sections.length === 0) return;

    const handleScroll = () => {
      if (scrollTimeoutRef.current) {
        clearTimeout(scrollTimeoutRef.current);
      }

      scrollTimeoutRef.current = setTimeout(() => {
        const scrollTop = contentRef.current.scrollTop;
        const containerTop = contentRef.current.offsetTop;

        let activeId = null;
        for (let i = sections.length - 1; i >= 0; i--) {
          const section = sections[i];
          const element = sectionRefs.current[section.id];
          if (element) {
            const elementTop = element.offsetTop - containerTop;
            if (elementTop <= scrollTop + 100) {
              activeId = section.id;
              break;
            }
          }
        }

        if (activeId) {
          setActiveSectionId(activeId);
        }
      }, 100);
    };

    const contentElement = contentRef.current;
    contentElement.addEventListener('scroll', handleScroll);
    handleScroll();

    return () => {
      contentElement.removeEventListener('scroll', handleScroll);
      if (scrollTimeoutRef.current) {
        clearTimeout(scrollTimeoutRef.current);
      }
    };
  }, [sections, content]);

  // Auto-scroll TOC to keep active section visible
  useEffect(() => {
    if (!activeSectionId || !tocListRef.current) return;

    const timeoutId = setTimeout(() => {
      const activeTocItem = tocItemRefs.current[activeSectionId];
      if (!activeTocItem) return;

      const tocContainer = tocListRef.current;
      if (!tocContainer) return;

      const containerRect = tocContainer.getBoundingClientRect();
      const itemRect = activeTocItem.getBoundingClientRect();

      const buffer = 10;
      const isAboveVisible = itemRect.top < (containerRect.top + buffer);
      const isBelowVisible = itemRect.bottom > (containerRect.bottom - buffer);

      if (isAboveVisible || isBelowVisible) {
        const containerHeight = containerRect.height;
        const itemHeight = itemRect.height;
        const itemOffsetTop = activeTocItem.offsetTop;
        const targetScrollTop = itemOffsetTop - (containerHeight / 2) + (itemHeight / 2);
        const maxScroll = tocContainer.scrollHeight - containerHeight;
        tocContainer.scrollTo({
          top: Math.max(0, Math.min(targetScrollTop, maxScroll)),
          behavior: 'smooth'
        });
      }
    }, 50);

    return () => clearTimeout(timeoutId);
  }, [activeSectionId]);

  // Convert anchor text to section ID
  const anchorToSectionId = useCallback((anchor) => {
    if (!anchor) return null;
    
    const cleanAnchor = anchor.replace(/^#/, '').toLowerCase();
    
    const section = sections.find(s => {
      const sectionAnchor = s.title
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/^-+|-+$/g, '');
      return sectionAnchor === cleanAnchor;
    });
    
    return section?.id || null;
  }, [sections]);

  // Scroll to section
  const scrollToSection = useCallback((sectionId, event) => {
    if (event) {
      event.preventDefault();
      event.stopPropagation();
    }

    const element = sectionRefs.current[sectionId];
    const scrollContainer = contentRef.current;
    
    if (element && scrollContainer) {
      const containerRect = scrollContainer.getBoundingClientRect();
      const elementRect = element.getBoundingClientRect();
      const currentScrollTop = scrollContainer.scrollTop;
      const scrollOffset = (elementRect.top - containerRect.top) + currentScrollTop - 20;
      
      scrollContainer.scrollTo({
        top: Math.max(0, scrollOffset),
        behavior: 'smooth'
      });

      setActiveSectionId(sectionId);
      
      if (searchQuery) {
        setHighlightedText(searchQuery);
        setTimeout(() => setHighlightedText(''), 2000);
      }
    }
  }, [searchQuery]);

  // Process bold, code, and links
  const processFormatting = useCallback((text, startKey = 0) => {
    const parts = [];
    let key = startKey;
    let lastIndex = 0;

    const boldRegex = /(\*\*|__)(.+?)\1/g;
    const codeRegex = /`([^`]+)`/g;
    const linkRegex = /\[([^\]]+)\]\(([^)]+)\)/g;

    const allMatches = [];
    let match;

    while ((match = boldRegex.exec(text)) !== null) {
      allMatches.push({
        start: match.index,
        end: match.index + match[0].length,
        type: 'bold',
        content: match[2]
      });
    }

    while ((match = codeRegex.exec(text)) !== null) {
      allMatches.push({
        start: match.index,
        end: match.index + match[0].length,
        type: 'code',
        content: match[1]
      });
    }

    while ((match = linkRegex.exec(text)) !== null) {
      allMatches.push({
        start: match.index,
        end: match.index + match[0].length,
        type: 'link',
        content: match[1],
        url: match[2]
      });
    }

    allMatches.sort((a, b) => a.start - b.start);

    const filteredMatches = [];
    allMatches.forEach(match => {
      const overlaps = filteredMatches.some(existing => 
        (match.start >= existing.start && match.start < existing.end) ||
        (match.end > existing.start && match.end <= existing.end)
      );
      if (!overlaps) {
        filteredMatches.push(match);
      }
    });

    filteredMatches.forEach(match => {
      if (match.start > lastIndex) {
        parts.push(<span key={`text-${key++}`}>{text.substring(lastIndex, match.start)}</span>);
      }

      if (match.type === 'bold') {
        parts.push(<strong key={`bold-${key++}`}>{match.content}</strong>);
      } else if (match.type === 'code') {
        parts.push(<code key={`code-${key++}`} className="guide-inline-code">{match.content}</code>);
      } else if (match.type === 'link') {
        const isInternalAnchor = match.url.startsWith('#');
        
        if (isInternalAnchor) {
          const sectionId = anchorToSectionId(match.url);
          
          if (sectionId) {
            parts.push(
              <a
                key={`link-${key++}`}
                href="#"
                className="guide-link guide-internal-link"
                onClick={(e) => {
                  e.preventDefault();
                  e.stopPropagation();
                  scrollToSection(sectionId, e);
                }}
              >
                {match.content}
              </a>
            );
          } else {
            parts.push(
              <a 
                key={`link-${key++}`} 
                href="#" 
                className="guide-link"
                onClick={(e) => {
                  e.preventDefault();
                  e.stopPropagation();
                }}
              >
                {match.content}
              </a>
            );
          }
        } else {
          parts.push(
            <a 
              key={`link-${key++}`} 
              href={match.url} 
              className="guide-link"
              target="_blank"
              rel="noopener noreferrer"
            >
              {match.content}
            </a>
          );
        }
      }

      lastIndex = match.end;
    });

    if (lastIndex < text.length) {
      parts.push(<span key={`text-${key++}`}>{text.substring(lastIndex)}</span>);
    }

    return parts.length > 0 ? parts : [<span key={key}>{text}</span>];
  }, [anchorToSectionId, scrollToSection]);

  // Process inline formatting
  const processInlineFormatting = useCallback((text, highlight = '') => {
    if (!text) return null;

    const parts = [];
    let lastIndex = 0;
    let partKey = 0;

    if (highlight) {
      const highlightRegex = new RegExp(`(${highlight.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')})`, 'gi');
      const matches = [];
      let match;
      while ((match = highlightRegex.exec(text)) !== null) {
        matches.push({
          start: match.index,
          end: match.index + match[0].length,
          text: match[0]
        });
      }

      if (matches.length > 0) {
        matches.forEach(match => {
          if (match.start > lastIndex) {
            const beforeText = text.substring(lastIndex, match.start);
            parts.push(...processFormatting(beforeText, partKey));
            partKey += 100;
          }
          parts.push(
            <mark key={`highlight-${partKey++}`} className="guide-highlight">
              {match.text}
            </mark>
          );
          lastIndex = match.end;
        });
      }
    }

    if (lastIndex < text.length) {
      const remainingText = text.substring(lastIndex);
      parts.push(...processFormatting(remainingText, partKey));
    }

    return parts.length > 0 ? parts : text;
  }, [processFormatting]);

  // Handle TOC item click
  const handleTocClick = useCallback((sectionId, event) => {
    if (event) {
      event.preventDefault();
      event.stopPropagation();
    }
    
    scrollToSection(sectionId, event);
  }, [scrollToSection]);

  // Render markdown content
  const renderMarkdown = useCallback((text) => {
    if (!text) return null;

    const lines = text.split('\n');
    const elements = [];
    let inList = false;
    let listItems = [];
    let listType = 'ul';
    let key = 0;
    let headingIndex = 0;

    lines.forEach((line, index) => {
      const trimmed = line.trim();

      // Headings
      const headingMatch = trimmed.match(/^(#{1,3})\s+(.+)$/);
      if (headingMatch) {
        if (inList) {
          elements.push(
            listType === 'ul' 
              ? <ul key={`list-${key++}`} className="guide-list">{listItems}</ul>
              : <ol key={`list-${key++}`} className="guide-list">{listItems}</ol>
          );
          listItems = [];
          inList = false;
        }

        const level = headingMatch[1].length;
        const title = headingMatch[2].trim();
        const section = sections[headingIndex];
        const id = section?.id || `heading-${key++}`;
        headingIndex++;
        const HeadingTag = `h${Math.min(level + 2, 6)}`;
        
        elements.push(
          React.createElement(
            HeadingTag,
            {
              key: id,
              id: id,
              ref: (el) => {
                if (el) sectionRefs.current[id] = el;
              },
              className: `guide-heading guide-h${level}`
            },
            title
          )
        );
        return;
      }

      // Horizontal rule
      if (trimmed === '---' || trimmed.match(/^-{3,}$/)) {
        if (inList) {
          elements.push(
            listType === 'ul' 
              ? <ul key={`list-${key++}`} className="guide-list">{listItems}</ul>
              : <ol key={`list-${key++}`} className="guide-list">{listItems}</ol>
          );
          listItems = [];
          inList = false;
        }
        elements.push(<hr key={`hr-${key++}`} className="guide-hr" />);
        return;
      }

      // Lists
      const listMatch = trimmed.match(/^(\d+\.|\*|-)\s+(.+)$/);
      if (listMatch) {
        const isOrdered = /^\d+\./.test(listMatch[1]);
        const itemText = listMatch[2];
        
        if (!inList || (isOrdered && listType !== 'ol') || (!isOrdered && listType !== 'ul')) {
          if (inList) {
            elements.push(
              listType === 'ul' 
                ? <ul key={`list-${key++}`} className="guide-list">{listItems}</ul>
                : <ol key={`list-${key++}`} className="guide-list">{listItems}</ol>
            );
            listItems = [];
          }
          inList = true;
          listType = isOrdered ? 'ol' : 'ul';
        }

        const processedText = processInlineFormatting(itemText, highlightedText);
        listItems.push(<li key={`item-${key++}`}>{processedText}</li>);
        return;
      }

      // End of list
      if (inList && trimmed === '') {
        elements.push(
          listType === 'ul' 
            ? <ul key={`list-${key++}`} className="guide-list">{listItems}</ul>
            : <ol key={`list-${key++}`} className="guide-list">{listItems}</ol>
        );
        listItems = [];
        inList = false;
        return;
      }

      // Paragraphs
      if (trimmed) {
        if (inList) {
          elements.push(
            listType === 'ul' 
              ? <ul key={`list-${key++}`} className="guide-list">{listItems}</ul>
              : <ol key={`list-${key++}`} className="guide-list">{listItems}</ol>
          );
          listItems = [];
          inList = false;
        }

        const processedText = processInlineFormatting(trimmed, highlightedText);
        elements.push(
          <p key={`p-${key++}`} className="guide-paragraph">
            {processedText}
          </p>
        );
      } else if (!inList) {
        elements.push(<div key={`spacer-${key++}`} className="guide-spacer" />);
      }
    });

    if (inList) {
      elements.push(
        listType === 'ul' 
          ? <ul key={`list-${key++}`} className="guide-list">{listItems}</ul>
          : <ol key={`list-${key++}`} className="guide-list">{listItems}</ol>
      );
    }

    return elements;
  }, [sections, processInlineFormatting, highlightedText]);

  if (!isOpen) return null;

  return (
    <div 
      className={`user-guide-overlay ${isDarkMode ? 'dark' : 'light'}`}
      onClick={(e) => {
        if (e.target === e.currentTarget) {
          onClose();
        }
      }}
    >
      <div className="user-guide-modal" onClick={(e) => e.stopPropagation()}>
        {/* Header */}
        <div className="user-guide-header">
          <h2 className="user-guide-title">Privacy Policy</h2>
          <button 
            className="user-guide-close" 
            onClick={onClose}
            aria-label="Close Privacy Policy"
          >
            ✕
          </button>
        </div>

        {/* Two-column layout */}
        <div className="user-guide-content">
          {/* Left Panel - TOC */}
          <div className="user-guide-toc">
            <div className="toc-header">
              <h3 className="toc-title">Table of Contents</h3>
            </div>
            
            {/* Search */}
            <div className="toc-search">
              <input
                type="text"
                placeholder="Search policy..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="toc-search-input"
              />
            </div>

            {/* TOC List */}
            <div className="toc-list" ref={tocListRef}>
              {filteredSections.length === 0 ? (
                <div className="toc-empty">No sections found</div>
              ) : (
                filteredSections.map((section) => (
                  <div
                    key={section.id}
                    ref={(el) => {
                      if (el) tocItemRefs.current[section.id] = el;
                    }}
                    className={`toc-item toc-level-${section.level} ${activeSectionId === section.id ? 'active' : ''}`}
                    onClick={(e) => handleTocClick(section.id, e)}
                    role="button"
                    tabIndex={0}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' || e.key === ' ') {
                        e.preventDefault();
                        handleTocClick(section.id, e);
                      }
                    }}
                  >
                    {section.title}
                  </div>
                ))
              )}
            </div>
          </div>

          {/* Divider */}
          <div className="user-guide-divider"></div>

          {/* Right Panel - Content */}
          <div className="user-guide-main" ref={contentRef}>
            <div className="user-guide-content-inner">
              {content ? (
                renderMarkdown(content)
              ) : (
                <div className="user-guide-loading">Loading...</div>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default PrivacyPolicyViewer;

