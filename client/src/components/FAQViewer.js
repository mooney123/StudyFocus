import React, { useState, useEffect, useRef, useCallback } from 'react';
import { useTheme } from '../context/ThemeContext';
import './UserGuideViewer.css';

const FAQViewer = ({ isOpen, onClose }) => {
  const { isDarkMode } = useTheme();
  const [content, setContent] = useState('');
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

  // Load markdown content
  useEffect(() => {
    if (isOpen) {
      fetch('/FAQ.md')
        .then(response => {
          if (!response.ok) throw new Error('Failed to load FAQ');
          return response.text();
        })
        .then(text => {
          setContent(text);
          parseSections(text);
        })
        .catch(error => {
          console.error('Error loading FAQ:', error);
          setContent('# Unable to load FAQ\n\nPlease try again later.');
        });
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
      // Also search in full content if available
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

        // Find the section currently in view
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
    handleScroll(); // Initial check

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

    // Small delay to ensure DOM has updated after activeSectionId change
    const timeoutId = setTimeout(() => {
      const activeTocItem = tocItemRefs.current[activeSectionId];
      if (!activeTocItem) return;

      const tocContainer = tocListRef.current;
      if (!tocContainer) return;

      const containerRect = tocContainer.getBoundingClientRect();
      const itemRect = activeTocItem.getBoundingClientRect();

      // Check if item is outside visible area (with small buffer)
      const buffer = 10; // Small buffer in pixels
      const isAboveVisible = itemRect.top < (containerRect.top + buffer);
      const isBelowVisible = itemRect.bottom > (containerRect.bottom - buffer);

      if (isAboveVisible || isBelowVisible) {
        // Calculate scroll position to center the item in the container
        const containerHeight = containerRect.height;
        const itemHeight = itemRect.height;
        const currentScrollTop = tocContainer.scrollTop;
        
        // Calculate item position relative to container's scrollable content
        // offsetTop is relative to offsetParent (toc-list), which includes padding
        const itemOffsetTop = activeTocItem.offsetTop;
        
        // Calculate target scroll: center item vertically in viewport
        // Subtract half container height, add half item height to center it
        const targetScrollTop = itemOffsetTop - (containerHeight / 2) + (itemHeight / 2);
        
        // Smooth scroll, ensuring we don't scroll to negative values
        // Also ensure we don't scroll past the maximum scroll
        const maxScroll = tocContainer.scrollHeight - containerHeight;
        tocContainer.scrollTo({
          top: Math.max(0, Math.min(targetScrollTop, maxScroll)),
          behavior: 'smooth'
        });
      }
    }, 50); // Small delay to allow DOM updates

    return () => clearTimeout(timeoutId);
  }, [activeSectionId]);

  // Convert anchor text to section ID (e.g., "getting-started" -> "section-0")
  const anchorToSectionId = useCallback((anchor) => {
    if (!anchor) return null;
    
    // Remove leading # if present
    const cleanAnchor = anchor.replace(/^#/, '').toLowerCase();
    
    // Find section by matching title (convert to anchor format)
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
    // Prevent any default behavior or navigation
    if (event) {
      event.preventDefault();
      event.stopPropagation();
    }

    const element = sectionRefs.current[sectionId];
    const scrollContainer = contentRef.current;
    
    if (element && scrollContainer) {
      // Calculate the position of the element relative to the scroll container
      const containerRect = scrollContainer.getBoundingClientRect();
      const elementRect = element.getBoundingClientRect();
      
      // Current scroll position
      const currentScrollTop = scrollContainer.scrollTop;
      
      // Calculate how much we need to scroll
      // elementRect.top is relative to viewport, containerRect.top is container's position
      // We want to scroll so element is 20px from top of container
      const scrollOffset = (elementRect.top - containerRect.top) + currentScrollTop - 20;
      
      // Scroll smoothly to the section
      scrollContainer.scrollTo({
        top: Math.max(0, scrollOffset),
        behavior: 'smooth'
      });

      // Update active section immediately
      setActiveSectionId(sectionId);
      
      // Highlight search match briefly
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

    // Match bold (**text** or __text__)
    const boldRegex = /(\*\*|__)(.+?)\1/g;
    // Match code (`code`)
    const codeRegex = /`([^`]+)`/g;
    // Match links ([text](url))
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

    // Sort matches by position
    allMatches.sort((a, b) => a.start - b.start);

    // Remove overlapping matches (prefer first)
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
        // Check if it's an internal anchor link (starts with #)
        const isInternalAnchor = match.url.startsWith('#');
        
        if (isInternalAnchor) {
          // Convert anchor to section ID
          const sectionId = anchorToSectionId(match.url);
          
          if (sectionId) {
            // Create a link that scrolls to section instead of navigating
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
            // Fallback: prevent navigation if section not found
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
          // External link - open in new tab
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

  // Process inline formatting (bold, code, links)
  const processInlineFormatting = useCallback((text, highlight = '') => {
    if (!text) return null;

    const parts = [];
    let lastIndex = 0;
    let partKey = 0;

    // Highlight search matches
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

    // Process remaining text
    if (lastIndex < text.length) {
      const remainingText = text.substring(lastIndex);
      parts.push(...processFormatting(remainingText, partKey));
    }

    return parts.length > 0 ? parts : text;
  }, [processFormatting]);

  // Handle TOC item click
  const handleTocClick = useCallback((sectionId, event) => {
    // Prevent any navigation or default behavior
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
    let headingIndex = 0; // Track heading order

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
        // Match section by order (more reliable than line index)
        const section = sections[headingIndex];
        const id = section?.id || `heading-${key++}`;
        headingIndex++;
        const HeadingTag = `h${Math.min(level + 2, 6)}`; // Cap at h6
        
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
        // Empty line (spacing)
        elements.push(<div key={`spacer-${key++}`} className="guide-spacer" />);
      }
    });

    // Close any remaining list
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
          <h2 className="user-guide-title">FAQ</h2>
          <button 
            className="user-guide-close" 
            onClick={onClose}
            aria-label="Close FAQ"
          >
            ✕
          </button>
        </div>

        {/* Two-column layout */}
        <div className="user-guide-content">
          {/* Left Panel - TOC */}
          <div className="user-guide-toc">
            <div className="toc-header">
              <h3 className="toc-title">FAQ</h3>
            </div>
            
            {/* Search */}
            <div className="toc-search">
              <input
                type="text"
                placeholder="Search FAQ..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="toc-search-input"
              />
            </div>

            {/* TOC List */}
            <div className="toc-list" ref={tocListRef}>
              {filteredSections.length === 0 ? (
                <div className="toc-empty">No questions found</div>
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
                <div className="user-guide-loading">Loading FAQ...</div>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default FAQViewer;

