import React, { useState, useEffect, useRef } from 'react';
import { useDataContext } from '../context/DataContext';
import DataInput from './DataInput';
import jsPDF from 'jspdf';
import html2canvas from 'html2canvas';
import './SchedulePlanner.css';

const SchedulePlanner = ({ user }) => {
  const { loadTabData, updateTabData, autoSave } = useDataContext();
  
  // Step tracking
  const [step, setStep] = useState('input'); // 'input', 'confirm', 'constraints', 'schedule'
  
  // Timetable input
  const [timetableText, setTimetableText] = useState('');
  const [extracting, setExtracting] = useState(false);
  const [uploadedFile, setUploadedFile] = useState(null);
  const [filePreview, setFilePreview] = useState(null);
  const fileInputRef = useRef(null);
  
  // Extracted classes
  const [extractedClasses, setExtractedClasses] = useState([]);
  const [editingClass, setEditingClass] = useState(null);
  
  // Constraints
  const [commuteTime, setCommuteTime] = useState(30);
  const [extracurriculars, setExtracurriculars] = useState([]);
  const [wakeTime, setWakeTime] = useState('07:00');
  const [sleepTime, setSleepTime] = useState('23:00');
  const [studyHoursPerDay, setStudyHoursPerDay] = useState(3);
  const [allowLateStudy, setAllowLateStudy] = useState(false);
  
  // Generated schedule
  const [generatedSchedule, setGeneratedSchedule] = useState(null);
  const [generating, setGenerating] = useState(false);
  const [intensity, setIntensity] = useState('balanced'); // 'light', 'balanced', 'intense'
  
  // Drag and drop state
  const [draggedBlock, setDraggedBlock] = useState(null);
  const [dragOverDay, setDragOverDay] = useState(null);
  const [dragOverIndex, setDragOverIndex] = useState(null);
  const [invalidDrop, setInvalidDrop] = useState(false);
  
  // Edit/Add activity state
  const [editingBlock, setEditingBlock] = useState(null);
  const [showAddActivity, setShowAddActivity] = useState(false);
  const [newActivity, setNewActivity] = useState({
    day: 'Monday',
    startTime: '09:00',
    endTime: '10:00',
    type: 'study',
    subject: '',
    location: '',
    notes: ''
  });
  
  // Load saved data
  useEffect(() => {
    const loadData = async () => {
      try {
        const data = await loadTabData('schedule-planner');
        if (data.timetableText) setTimetableText(data.timetableText);
        if (data.extractedClasses) setExtractedClasses(data.extractedClasses);
        if (data.constraints) {
          setCommuteTime(data.constraints.commuteTime || 30);
          setExtracurriculars(data.constraints.extracurriculars || []);
          setWakeTime(data.constraints.wakeTime || '07:00');
          setSleepTime(data.constraints.sleepTime || '23:00');
          setStudyHoursPerDay(data.constraints.studyHoursPerDay || 3);
          setAllowLateStudy(data.constraints.allowLateStudy || false);
        }
        if (data.generatedSchedule) {
          // Ensure all blocks have IDs for drag-and-drop
          const scheduleWithIds = {
            ...data.generatedSchedule,
            schedule: data.generatedSchedule.schedule?.map(daySchedule => ({
              ...daySchedule,
              blocks: daySchedule.blocks?.map((block, idx) => ({
                ...block,
                id: block.id || `block-${daySchedule.day}-${idx}-${Date.now()}`
              })) || []
            })) || []
          };
          setGeneratedSchedule(scheduleWithIds);
          setStep('schedule');
        } else if (data.extractedClasses && data.extractedClasses.length > 0) {
          setStep('constraints');
        }
      } catch (error) {
        console.error('Error loading schedule planner data:', error);
      }
    };
    loadData();
  }, [loadTabData]);

  // Handle file upload
  const handleFileUpload = async (event) => {
    const file = event.target.files[0];
    if (!file) return;

    setUploadedFile(file);
    setFilePreview(URL.createObjectURL(file));

    // If it's a text file, read it directly
    if (file.type === 'text/plain' || file.name.endsWith('.txt')) {
      const reader = new FileReader();
      reader.onload = (e) => {
        setTimetableText(e.target.result);
      };
      reader.readAsText(file);
      return;
    }

    // For PDFs, show a message
    if (file.name.endsWith('.pdf')) {
      alert('PDF files are not directly supported. Please convert your PDF to an image (PNG/JPG) or paste the timetable text instead.');
      setUploadedFile(null);
      setFilePreview(null);
      if (fileInputRef.current) {
        fileInputRef.current.value = '';
      }
      return;
    }

    // For images, extract text using GPT Vision
    if (file.type.startsWith('image/')) {
      const reader = new FileReader();
      reader.onload = async (e) => {
        const base64 = e.target.result.split(',')[1];
        await extractFromImage(base64, file.type);
      };
      reader.readAsDataURL(file);
    }
  };

  // Extract text from image using GPT Vision
  const extractFromImage = async (base64Image, mimeType) => {
    setExtracting(true);
    try {
      const response = await fetch('https://api.openai.com/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${process.env.REACT_APP_OPENAI_API_KEY}`
        },
        body: JSON.stringify({
          model: 'gpt-4o',
          messages: [
            {
              role: 'user',
              content: [
                {
                  type: 'text',
                  text: `You are NOT interpreting a timetable.
You are mapping visual blocks to columns.

This is a University of Limerick timetable, presented as a fixed 6-column grid.

🚨 OVERRIDE ALL PREVIOUS LOGIC

PHASE 0 — LOCK THE DAY MAPPING (DO THIS FIRST)

Before extracting ANY class data, create this immutable map:

COLUMN_DAY_MAP = {
  1: "Monday",
  2: "Tuesday",
  3: "Wednesday",
  4: "Thursday",
  5: "Friday",
  6: "Saturday"
}

Once a block is assigned a column number, its day is permanently fixed.

PHASE 1 — DETECT BLOCKS (NO SEMANTICS)

Scan the timetable grid. Identify rectangular class blocks.

For each block, record ONLY:
- columnIndex (1–6, counted left → right)
- rawText inside the block

❌ Do NOT interpret text
❌ Do NOT read times
❌ Do NOT infer day
❌ Do NOT compare to other blocks

PHASE 2 — ASSIGN DAY (IRREVERSIBLE)

For EACH block: day = COLUMN_DAY_MAP[columnIndex]

This assignment is FINAL. Never change it.

PHASE 3 — PARSE CONTENT (DAY IS LOCKED)

Extract from rawText: startTime, endTime, subject, type, location, weeks.

⚠️ The day must NEVER change because of parsing.

Return structured text with: day (from column), time range, subject, location, type, weeks. Format clearly for parsing.`
                },
                {
                  type: 'image_url',
                  image_url: {
                    url: `data:${mimeType};base64,${base64Image}`
                  }
                }
              ]
            }
          ],
          max_tokens: 2000
        })
      });

      if (!response.ok) {
        throw new Error('Failed to extract text from image');
      }

      const data = await response.json();
      const extractedText = data.choices[0].message.content;
      setTimetableText(extractedText);

      // Pass text directly to avoid state race condition
      await extractTimetable(extractedText);
    } catch (error) {
      console.error('Error extracting from image:', error);
      alert('Failed to extract text from image. Please try pasting the timetable text instead.');
      setExtracting(false);
    }
  };

  // Extract timetable using GPT — accepts optional text to avoid state race condition
  const extractTimetable = async (textOverride) => {
    const text = textOverride ?? timetableText;
    if (!text.trim()) {
      alert('Please enter your timetable first or upload a file');
      return;
    }

    setExtracting(true);
    try {
      const response = await fetch('https://api.openai.com/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${process.env.REACT_APP_OPENAI_API_KEY}`
        },
        body: JSON.stringify({
          model: 'gpt-4o',
          messages: [
            {
              role: 'system',
              content: `You are NOT interpreting a timetable.
You are mapping visual blocks to columns.

This is a University of Limerick timetable, presented as a fixed 6-column grid.

🚨 OVERRIDE ALL PREVIOUS LOGIC

If any instruction conflicts, this prompt wins.

PHASE 0 — LOCK THE DAY MAPPING (DO THIS FIRST)

Before extracting ANY class data, you must create this immutable map:

COLUMN_DAY_MAP = {
  1: "Monday",
  2: "Tuesday",
  3: "Wednesday",
  4: "Thursday",
  5: "Friday",
  6: "Saturday"
}

Once a block is assigned a column number,
its day is permanently fixed and may NEVER be changed.

PHASE 1 — DETECT BLOCKS (NO SEMANTICS)

Scan the timetable image/grid

Identify rectangular class blocks

For each block, record ONLY:

columnIndex (1–6, counted left → right)

rawText inside the block

❌ Do NOT interpret text
❌ Do NOT read times
❌ Do NOT infer day
❌ Do NOT compare to other blocks

At this stage you are ONLY collecting:

{ columnIndex, rawText }

PHASE 2 — ASSIGN DAY (IRREVERSIBLE)

For EACH block:

day = COLUMN_DAY_MAP[columnIndex]

This assignment is FINAL.

You are now forbidden from:

Changing the day

Re-evaluating the column

Using time alignment

Using text hints

Using nearby blocks

If later steps contradict this day,
the later steps are wrong.

PHASE 3 — PARSE CONTENT (DAY IS LOCKED)

Now, and ONLY now, extract from rawText:

startTime / endTime

subject code

type (LEC / LAB / TUT)

location

weeks

⚠️ These fields may fail or be missing.
⚠️ The day must NEVER change because of this.

HARD FAIL CONDITIONS (IMPORTANT)

If ANY of the following happens, STOP and ask for user confirmation instead of guessing:

A block overlaps visually across two columns

A block's columnIndex is unclear

A block appears outside all 6 columns

Do NOT auto-correct. Do NOT guess.

ABSOLUTE PROHIBITIONS (YOU MUST NOT DO THESE)

❌ Do NOT group blocks by time
❌ Do NOT align blocks vertically
❌ Do NOT assume same-time = same day
❌ Do NOT infer day from text
❌ Do NOT "fix" the timetable
❌ Do NOT move classes between days

If a class is wrong, it is better to be wrong consistently than "clever".

OUTPUT REQUIREMENT (STRICT)

Return ONLY a JSON array.

Each object MUST include:

{
  "day": "Monday | Tuesday | Wednesday | Thursday | Friday | Saturday",
  "startTime": "HH:MM",
  "endTime": "HH:MM",
  "subject": "CSxxxx",
  "type": "LEC | LAB | TUT | null",
  "location": "RoomCode | null",
  "weeks": "x-y | null"
}

No explanations.
No notes.
No reasoning.
No confidence scores.`
            },
            {
              role: 'user',
              content: `Extract all classes from this timetable. Pay careful attention to column positions to determine the correct day for each class:\n\n${text}`
            }
          ],
          max_tokens: 4000,
          temperature: 0.1
        })
      });

      if (!response.ok) {
        throw new Error('Failed to extract timetable');
      }

      const data = await response.json();
      const extractedText = data.choices[0].message.content.trim();
      
      // Log raw response for debugging
      console.log('Raw GPT response:', extractedText);
      
      // Parse JSON from response
      let classes = [];
      try {
        // Try multiple parsing strategies
        const codeBlockMatch = extractedText.match(/```(?:json)?\s*(\[[\s\S]*?\])\s*```/);
        if (codeBlockMatch) {
          classes = JSON.parse(codeBlockMatch[1]);
          console.log('Parsed from code block');
        } else {
          const jsonMatch = extractedText.match(/(\[[\s\S]*\])/);
          if (jsonMatch) {
            classes = JSON.parse(jsonMatch[1]);
            console.log('Parsed from JSON match');
          } else {
            classes = JSON.parse(extractedText);
            console.log('Parsed entire text');
          }
        }
        
        if (!Array.isArray(classes)) {
          throw new Error('Response is not an array');
        }
        
        console.log('Successfully parsed classes:', classes.length, 'classes found');
      } catch (parseError) {
        console.error('Error parsing extracted classes:', parseError);
        console.error('Raw response that failed to parse:', extractedText);
        
        const errorMsg = `Failed to parse extracted timetable.\n\n` +
          `Error: ${parseError.message}\n\n` +
          `The AI response was:\n${extractedText.substring(0, 500)}...\n\n` +
          `Please try again or enter classes manually.`;
        alert(errorMsg);
        setExtracting(false);
        return;
      }

      // Validate and format classes
      const formattedClasses = classes.map((cls, index) => {
        let day = cls.day || '';
        if (day) {
          day = day.trim();
          const dayMap = {
            'Mon': 'Monday', 'Tue': 'Tuesday', 'Wed': 'Wednesday',
            'Thu': 'Thursday', 'Fri': 'Friday', 'Sat': 'Saturday', 'Sun': 'Sunday'
          };
          day = dayMap[day] || day;
        }
        
        let startTime = (cls.startTime || '').trim().replace(/[^\d:]/g, '');
        let endTime = (cls.endTime || '').trim().replace(/[^\d:]/g, '');
        
        if (startTime && !startTime.includes(':')) {
          if (startTime.length === 3) startTime = `0${startTime}`;
          if (startTime.length === 4) startTime = `${startTime.substring(0, 2)}:${startTime.substring(2)}`;
        }
        if (endTime && !endTime.includes(':')) {
          if (endTime.length === 3) endTime = `0${endTime}`;
          if (endTime.length === 4) endTime = `${endTime.substring(0, 2)}:${endTime.substring(2)}`;
        }
        
        return {
          id: `class-${Date.now()}-${index}`,
          day: day,
          startTime: startTime,
          endTime: endTime,
          subject: (cls.subject || cls.module || cls.course || cls.moduleCode || '').trim(),
          location: (cls.location || cls.room || cls.roomCode || '').trim(),
          type: (cls.type || cls.classType || '').trim(),
          weeks: (cls.weeks || cls.week || '').trim()
        };
      }).filter(cls => {
        const hasRequiredFields = cls.day && cls.startTime && cls.endTime && cls.subject;
        if (!hasRequiredFields) {
          console.warn('Filtered out incomplete class:', cls);
        }
        return hasRequiredFields;
      });

      // Validate day assignments
      const dayCounts = {};
      const dayNames = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];
      formattedClasses.forEach(cls => {
        dayCounts[cls.day] = (dayCounts[cls.day] || 0) + 1;
        
        if (!dayNames.includes(cls.day)) {
          console.warn(`⚠️ Invalid day name found: "${cls.day}" for class ${cls.subject}`);
        }
      });
      
      console.log('📊 Extracted classes by day:', dayCounts);
      console.log('📋 All formatted classes:', formattedClasses);
      
      const totalClasses = formattedClasses.length;
      const daysWithClasses = Object.keys(dayCounts).length;
      console.log(`✅ Total classes extracted: ${totalClasses}`);
      console.log(`📅 Days with classes: ${daysWithClasses}`);
      
      Object.entries(dayCounts).forEach(([day, count]) => {
        const avgPerDay = totalClasses / Math.max(daysWithClasses, 1);
        if (count > avgPerDay * 3) {
          console.warn(`⚠️ Day "${day}" has ${count} classes - might be misassigned?`);
        }
      });

      if (formattedClasses.length === 0) {
        const errorMsg = `No classes could be extracted from the timetable.\n\n` +
          `Found ${classes.length} raw entries, but none had all required fields (day, time, subject).\n\n` +
          `Raw data preview:\n${JSON.stringify(classes.slice(0, 3), null, 2)}\n\n` +
          `Please check your timetable format or enter classes manually.`;
        alert(errorMsg);
        setExtracting(false);
        return;
      }
      
      console.log(`✅ Successfully extracted ${formattedClasses.length} classes`);

      setExtractedClasses(formattedClasses);
      setStep('confirm');
      
      // Save extracted classes
      const saveData = {
        timetableText: text,
        extractedClasses: formattedClasses
      };
      updateTabData('schedule-planner', saveData);
      autoSave('schedule-planner', saveData);
      
    } catch (error) {
      console.error('Error extracting timetable:', error);
      alert('Failed to extract timetable. Please try again.');
    } finally {
      setExtracting(false);
    }
  };

  // Add new class manually
  const addClass = () => {
    const newClass = {
      id: `class-${Date.now()}`,
      day: 'Monday',
      startTime: '09:00',
      endTime: '10:00',
      subject: '',
      location: '',
      type: '',
      weeks: ''
    };
    setExtractedClasses([...extractedClasses, newClass]);
    setEditingClass(newClass.id);
  };

  // Update class
  const updateClass = (classId, field, value) => {
    setExtractedClasses(extractedClasses.map(cls => 
      cls.id === classId ? { ...cls, [field]: value } : cls
    ));
  };

  // Delete class
  const deleteClass = (classId) => {
    if (window.confirm('Delete this class?')) {
      setExtractedClasses(extractedClasses.filter(cls => cls.id !== classId));
    }
  };

  // Add extracurricular
  const addExtracurricular = () => {
    const newActivity = {
      id: `activity-${Date.now()}`,
      day: 'Monday',
      startTime: '18:00',
      endTime: '19:00',
      name: '',
      location: ''
    };
    setExtracurriculars([...extracurriculars, newActivity]);
  };

  // Update extracurricular
  const updateExtracurricular = (activityId, field, value) => {
    setExtracurriculars(extracurriculars.map(act => 
      act.id === activityId ? { ...act, [field]: value } : act
    ));
  };

  // Delete extracurricular
  const deleteExtracurricular = (activityId) => {
    setExtracurriculars(extracurriculars.filter(act => act.id !== activityId));
  };

  // Generate schedule using GPT
  const generateSchedule = async () => {
    if (extractedClasses.length === 0) {
      alert('Please extract and confirm your classes first');
      return;
    }

    setGenerating(true);
    try {
      const response = await fetch('https://api.openai.com/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${process.env.REACT_APP_OPENAI_API_KEY}`
        },
        body: JSON.stringify({
          model: 'gpt-4o',
          messages: [
            {
              role: 'system',
              content: `You are a study schedule generator. Create a realistic weekly study schedule based on classes, constraints, and preferences. Return ONLY a valid JSON object with this structure: {"schedule": [{"day": "Monday", "blocks": [{"type": "class"|"study"|"extracurricular"|"break"|"commute", "startTime": "HH:MM", "endTime": "HH:MM", "subject": "subject name (for study blocks)", "location": "location (for classes)", "notes": "optional notes"}]}]}. Include all classes and extracurriculars as fixed blocks. Add study sessions in free gaps, after classes, with buffer time for transitions. Be realistic - don't fill every minute. For ${intensity} intensity: ${intensity === 'light' ? 'fewer study blocks, more breaks' : intensity === 'intense' ? 'more study blocks, maximize study time' : 'balanced study blocks with reasonable breaks'}.`
            },
            {
              role: 'user',
              content: `Generate a weekly schedule:\n\nClasses: ${JSON.stringify(extractedClasses)}\n\nConstraints: Commute time: ${commuteTime} minutes, Wake time: ${wakeTime}, Sleep time: ${sleepTime}, Study hours per day: ${studyHoursPerDay}, Allow late study: ${allowLateStudy}, Extracurriculars: ${JSON.stringify(extracurriculars)}`
            }
          ],
          max_tokens: 3000,
          temperature: 0.5
        })
      });

      if (!response.ok) {
        throw new Error('Failed to generate schedule');
      }

      const data = await response.json();
      const scheduleText = data.choices[0].message.content.trim();
      
      let schedule = null;
      try {
        const jsonMatch = scheduleText.match(/\{[\s\S]*\}/);
        if (jsonMatch) {
          schedule = JSON.parse(jsonMatch[0]);
        } else {
          schedule = JSON.parse(scheduleText);
        }
      } catch (parseError) {
        console.error('Error parsing schedule:', parseError);
        alert('Failed to parse generated schedule. Please try again.');
        setGenerating(false);
        return;
      }

      // Add unique IDs to blocks for drag-and-drop tracking
      const scheduleWithIds = {
        ...schedule,
        schedule: schedule.schedule?.map(daySchedule => ({
          ...daySchedule,
          blocks: daySchedule.blocks?.map((block, idx) => ({
            ...block,
            id: block.id || `block-${daySchedule.day}-${idx}-${Date.now()}`
          })) || []
        })) || []
      };
      
      setGeneratedSchedule(scheduleWithIds);
      setStep('schedule');
      
      const saveData = {
        timetableText,
        extractedClasses,
        constraints: {
          commuteTime,
          extracurriculars,
          wakeTime,
          sleepTime,
          studyHoursPerDay,
          allowLateStudy
        },
        generatedSchedule: scheduleWithIds,
        intensity
      };
      updateTabData('schedule-planner', saveData);
      autoSave('schedule-planner', saveData);
      
    } catch (error) {
      console.error('Error generating schedule:', error);
      alert('Failed to generate schedule. Please try again.');
    } finally {
      setGenerating(false);
    }
  };

  // Regenerate with different intensity
  const regenerateSchedule = async (newIntensity) => {
    if (extractedClasses.length === 0) {
      alert('Please extract and confirm your classes first');
      return;
    }

    setGenerating(true);
    setIntensity(newIntensity);
    
    try {
      const response = await fetch('https://api.openai.com/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${process.env.REACT_APP_OPENAI_API_KEY}`
        },
        body: JSON.stringify({
          model: 'gpt-4o',
          messages: [
            {
              role: 'system',
              content: `You are a study schedule generator. Create a realistic weekly study schedule based on classes, constraints, and preferences. Return ONLY a valid JSON object with this structure: {"schedule": [{"day": "Monday", "blocks": [{"type": "class"|"study"|"extracurricular"|"break"|"commute", "startTime": "HH:MM", "endTime": "HH:MM", "subject": "subject name (for study blocks)", "location": "location (for classes)", "notes": "optional notes"}]}]}. Include all classes and extracurriculars as fixed blocks. Add study sessions in free gaps, after classes, with buffer time for transitions. Be realistic - don't fill every minute. For ${newIntensity} intensity: ${newIntensity === 'light' ? 'fewer study blocks, more breaks' : newIntensity === 'intense' ? 'more study blocks, maximize study time' : 'balanced study blocks with reasonable breaks'}.`
            },
            {
              role: 'user',
              content: `Generate a weekly schedule:\n\nClasses: ${JSON.stringify(extractedClasses)}\n\nConstraints: Commute time: ${commuteTime} minutes, Wake time: ${wakeTime}, Sleep time: ${sleepTime}, Study hours per day: ${studyHoursPerDay}, Allow late study: ${allowLateStudy}, Extracurriculars: ${JSON.stringify(extracurriculars)}`
            }
          ],
          max_tokens: 3000,
          temperature: 0.5
        })
      });

      if (!response.ok) {
        throw new Error('Failed to generate schedule');
      }

      const data = await response.json();
      const scheduleText = data.choices[0].message.content.trim();
      
      let schedule = null;
      try {
        const jsonMatch = scheduleText.match(/\{[\s\S]*\}/);
        if (jsonMatch) {
          schedule = JSON.parse(jsonMatch[0]);
        } else {
          schedule = JSON.parse(scheduleText);
        }
      } catch (parseError) {
        console.error('Error parsing schedule:', parseError);
        alert('Failed to parse generated schedule. Please try again.');
        setGenerating(false);
        return;
      }

      // Add unique IDs to blocks for drag-and-drop tracking
      const scheduleWithIds = {
        ...schedule,
        schedule: schedule.schedule?.map(daySchedule => ({
          ...daySchedule,
          blocks: daySchedule.blocks?.map((block, idx) => ({
            ...block,
            id: block.id || `block-${daySchedule.day}-${idx}-${Date.now()}`
          })) || []
        })) || []
      };
      
      setGeneratedSchedule(scheduleWithIds);
      
      const saveData = {
        timetableText,
        extractedClasses,
        constraints: {
          commuteTime,
          extracurriculars,
          wakeTime,
          sleepTime,
          studyHoursPerDay,
          allowLateStudy
        },
        generatedSchedule: scheduleWithIds,
        intensity: newIntensity
      };
      updateTabData('schedule-planner', saveData);
      autoSave('schedule-planner', saveData);
      
    } catch (error) {
      console.error('Error generating schedule:', error);
      alert('Failed to generate schedule. Please try again.');
    } finally {
      setGenerating(false);
    }
  };

  const daysOfWeek = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];

  // Convert time string (HH:MM) to minutes for comparison
  const timeToMinutes = (timeStr) => {
    if (!timeStr) return 0;
    const [hours, minutes] = timeStr.split(':').map(Number);
    return (hours || 0) * 60 + (minutes || 0);
  };

  // Check if two time ranges overlap
  const timesOverlap = (start1, end1, start2, end2) => {
    const s1 = timeToMinutes(start1);
    const e1 = timeToMinutes(end1);
    const s2 = timeToMinutes(start2);
    const e2 = timeToMinutes(end2);
    return (s1 < e2 && e1 > s2);
  };

  // Validate activity placement (reusable for add/edit/drag)
  const validateActivityPlacement = (activity, targetDay, excludeBlock = null) => {
    if (!generatedSchedule || !generatedSchedule.schedule) {
      return { valid: false, reason: 'No schedule data available' };
    }
    
    const activityStart = timeToMinutes(activity.startTime);
    const activityEnd = timeToMinutes(activity.endTime);
    
    if (!activity.startTime || !activity.endTime) {
      return { valid: false, reason: 'Start time and end time are required' };
    }
    
    if (activityStart >= activityEnd) {
      return { valid: false, reason: 'End time must be after start time' };
    }
    
    // Get all blocks for the target day (excluding the block being edited/moved)
    const daySchedule = generatedSchedule.schedule.find(s => s.day === targetDay);
    const dayBlocks = (daySchedule?.blocks || [])
      .filter(b => {
        if (excludeBlock && b === excludeBlock) return false;
        if (editingBlock && b.id === editingBlock.id) return false;
        return true;
      });

    // Check for overlaps with existing blocks
    for (const existing of dayBlocks) {
      if (timesOverlap(activity.startTime, activity.endTime, existing.startTime, existing.endTime)) {
        return { 
          valid: false, 
          reason: `Time overlaps with existing ${existing.type || 'activity'} (${existing.startTime} - ${existing.endTime})` 
        };
      }
    }
    
    return { valid: true };
  };

  // Validate if a block can be placed at a specific position (for drag-and-drop with index)
  const validateBlockPlacement = (block, targetDay, targetIndex) => {
    if (!generatedSchedule || !generatedSchedule.schedule) {
      return { valid: false, reason: 'No schedule data available' };
    }
    
    const blockStart = timeToMinutes(block.startTime);
    const blockEnd = timeToMinutes(block.endTime);
    
    if (!block.startTime || !block.endTime) {
      return { valid: false, reason: 'Block missing time information' };
    }
    
    // Get all blocks for the target day (excluding the dragged block if it's from the same day)
    const daySchedule = generatedSchedule.schedule.find(s => s.day === targetDay);
    const dayBlocks = (daySchedule?.blocks || [])
      .filter(b => {
        // Exclude the dragged block if it's from the same day
        if (draggedBlock && draggedBlock.day === targetDay && draggedBlock.block === block) {
          return false;
        }
        if (editingBlock && b.id === editingBlock.id) return false;
        return true;
      });

    // Sort blocks by time to get correct order
    const sortedBlocks = sortBlocksByTime(dayBlocks);

    // If inserting at a specific index
    if (targetIndex !== null && targetIndex !== undefined && targetIndex >= 0) {
      // Check blocks before insertion point
      for (let i = 0; i < targetIndex && i < sortedBlocks.length; i++) {
        const existing = sortedBlocks[i];
        const existingEnd = timeToMinutes(existing.endTime);
        
        // Must be after all previous blocks (allow touching but not overlapping)
        if (blockStart < existingEnd) {
          return { valid: false, reason: 'Invalid time position: must be after earlier activities' };
        }
        
        // Check for overlap
        if (timesOverlap(block.startTime, block.endTime, existing.startTime, existing.endTime)) {
          return { valid: false, reason: 'Time overlap detected' };
        }
      }
      
      // Check blocks at and after insertion point
      for (let i = targetIndex; i < sortedBlocks.length; i++) {
        const existing = sortedBlocks[i];
        const existingStart = timeToMinutes(existing.startTime);
        
        // Must be before all later blocks (allow touching but not overlapping)
        if (blockEnd > existingStart) {
          return { valid: false, reason: 'Invalid time position: must be before later activities' };
        }
        
        // Check for overlap
        if (timesOverlap(block.startTime, block.endTime, existing.startTime, existing.endTime)) {
          return { valid: false, reason: 'Time overlap detected' };
        }
      }
    } else {
      // Appending to end - check against all existing blocks
      for (const existing of sortedBlocks) {
        const existingEnd = timeToMinutes(existing.endTime);
        
        // Must be after all existing blocks
        if (blockStart < existingEnd) {
          return { valid: false, reason: 'Invalid time position: must be after earlier activities' };
        }
        
        // Check for overlap
        if (timesOverlap(block.startTime, block.endTime, existing.startTime, existing.endTime)) {
          return { valid: false, reason: 'Time overlap detected' };
        }
      }
    }
    
    return { valid: true };
  };

  // Sort blocks by start time
  const sortBlocksByTime = (blocks) => {
    return [...blocks].sort((a, b) => {
      const timeA = timeToMinutes(a.startTime);
      const timeB = timeToMinutes(b.startTime);
      return timeA - timeB;
    });
  };

  // Save updated schedule (shared function for all modifications)
  const saveSchedule = (updatedSchedule) => {
    // Sort all blocks by time to maintain chronological order
    updatedSchedule.schedule.forEach(daySchedule => {
      daySchedule.blocks = sortBlocksByTime(daySchedule.blocks);
    });
    
    setGeneratedSchedule(updatedSchedule);
    
    const saveData = {
      timetableText,
      extractedClasses,
      constraints: {
        commuteTime,
        extracurriculars,
        wakeTime,
        sleepTime,
        studyHoursPerDay,
        allowLateStudy
      },
      generatedSchedule: updatedSchedule,
      intensity
    };
    updateTabData('schedule-planner', saveData);
    autoSave('schedule-planner', saveData);
  };

  // Edit activity
  const handleEditActivity = (block, day, blockIndex) => {
    setEditingBlock({ ...block, originalDay: day, originalIndex: blockIndex });
  };

  // Save edited activity
  const handleSaveEdit = () => {
    if (!editingBlock) return;
    
    // Get the original block for exclusion during validation
    const originalDaySchedule = generatedSchedule.schedule.find(s => s.day === editingBlock.originalDay);
    const originalBlock = originalDaySchedule?.blocks[editingBlock.originalIndex];
    
    const validation = validateActivityPlacement(editingBlock, editingBlock.day, originalBlock);
    
    if (!validation.valid) {
      alert(`Cannot save changes: ${validation.reason}`);
      return;
    }
    
    const updatedSchedule = { ...generatedSchedule };
    
    // Remove from original position
    if (originalDaySchedule) {
      originalDaySchedule.blocks = originalDaySchedule.blocks.filter(
        (_, idx) => idx !== editingBlock.originalIndex
      );
      
      // Remove day if no blocks left
      if (originalDaySchedule.blocks.length === 0) {
        updatedSchedule.schedule = updatedSchedule.schedule.filter(s => s.day !== editingBlock.originalDay);
      }
    }
    
    // Add to new position (or same day if day didn't change)
    let targetDaySchedule = updatedSchedule.schedule.find(s => s.day === editingBlock.day);
    if (!targetDaySchedule) {
      targetDaySchedule = { day: editingBlock.day, blocks: [] };
      updatedSchedule.schedule.push(targetDaySchedule);
    }
    
    // Create updated block (remove helper fields, preserve ID)
    const { originalDay, originalIndex, ...blockData } = editingBlock;
    if (!blockData.id && originalBlock?.id) {
      blockData.id = originalBlock.id;
    }
    if (!blockData.id) {
      blockData.id = `block-${editingBlock.day}-${Date.now()}`;
    }
    
    targetDaySchedule.blocks.push(blockData);
    
    saveSchedule(updatedSchedule);
    setEditingBlock(null);
  };

  // Cancel edit
  const handleCancelEdit = () => {
    setEditingBlock(null);
  };

  // Delete activity
  const handleDeleteActivity = (block, day, blockIndex) => {
    if (!window.confirm(`Delete this ${block.type || 'activity'}?`)) {
      return;
    }
    
    const updatedSchedule = { ...generatedSchedule };
    const daySchedule = updatedSchedule.schedule.find(s => s.day === day);
    
    if (daySchedule) {
      daySchedule.blocks = daySchedule.blocks.filter((_, idx) => idx !== blockIndex);
      
      // Remove day if no blocks left
      if (daySchedule.blocks.length === 0) {
        updatedSchedule.schedule = updatedSchedule.schedule.filter(s => s.day !== day);
      }
    }
    
    saveSchedule(updatedSchedule);
  };

  // Export timetable as PDF
  const handleExportPDF = async () => {
    // Check if timetable has any activities
    const hasActivities = generatedSchedule?.schedule?.some(daySchedule => 
      daySchedule.blocks && daySchedule.blocks.length > 0
    );
    
    if (!hasActivities) {
      if (!window.confirm('Your timetable is empty. Do you want to export it anyway?')) {
        return;
      }
    }
    
    try {
      // Show loading state
      const originalCursor = document.body.style.cursor;
      document.body.style.cursor = 'wait';
      
      // Get current date for header and filename
      const date = new Date();
      
      // Create a temporary export container
      const exportContainer = document.createElement('div');
      exportContainer.className = 'pdf-export-container';
      exportContainer.style.position = 'absolute';
      exportContainer.style.left = '-9999px';
      exportContainer.style.top = '0';
      exportContainer.style.width = '2100px'; // A4 landscape width in pixels at 96 DPI
      exportContainer.style.backgroundColor = '#191919';
      exportContainer.style.padding = '30px 40px';
      exportContainer.style.display = 'flex';
      exportContainer.style.flexDirection = 'column';
      exportContainer.style.minHeight = '100vh';
      exportContainer.style.justifyContent = 'space-between';
      document.body.appendChild(exportContainer);
      
      // Create header
      const header = document.createElement('div');
      header.className = 'pdf-header';
      header.style.marginBottom = '24px';
      header.style.paddingBottom = '20px';
      header.style.borderBottom = '1px solid #374151';
      
      const title = document.createElement('h1');
      title.style.color = '#ffffff';
      title.style.fontSize = '2rem';
      title.style.fontWeight = '700';
      title.style.margin = '0 0 8px 0';
      title.textContent = 'StudyFocus – Weekly Schedule';
      header.appendChild(title);
      
      const subtitle = document.createElement('p');
      subtitle.style.color = '#9ca3af';
      subtitle.style.fontSize = '0.95rem';
      subtitle.style.margin = '0';
      const dateStr = date.toLocaleDateString('en-US', { 
        weekday: 'long', 
        year: 'numeric', 
        month: 'long', 
        day: 'numeric' 
      });
      subtitle.textContent = `Generated on ${dateStr}`;
      header.appendChild(subtitle);
      
      exportContainer.appendChild(header);
      
      // Create clean export view
      const exportSchedule = document.createElement('div');
      exportSchedule.className = 'weekly-schedule pdf-export-view';
      exportSchedule.style.display = 'flex';
      exportSchedule.style.flexDirection = 'row';
      exportSchedule.style.gap = '16px';
      exportSchedule.style.width = '100%';
      exportSchedule.style.flex = '1';
      
      // Add all days to export view
      daysOfWeek.forEach(day => {
        const daySchedule = generatedSchedule.schedule?.find(s => s.day === day);
        const blocks = daySchedule?.blocks || [];
        
        const dayColumn = document.createElement('div');
        dayColumn.className = 'schedule-day pdf-day';
        dayColumn.style.background = '#2f3437';
        dayColumn.style.border = '1px solid #374151';
        dayColumn.style.borderRadius = '8px';
        dayColumn.style.padding = '16px';
        dayColumn.style.flex = '1';
        dayColumn.style.minWidth = '280px';
        dayColumn.style.display = 'flex';
        dayColumn.style.flexDirection = 'column';
        
        // Day header
        const dayHeader = document.createElement('h3');
        dayHeader.className = 'day-header';
        dayHeader.style.color = '#ffffff';
        dayHeader.style.fontSize = '1.2rem';
        dayHeader.style.fontWeight = '600';
        dayHeader.style.margin = '0 0 16px 0';
        dayHeader.style.paddingBottom = '12px';
        dayHeader.style.borderBottom = '2px solid #374151';
        dayHeader.textContent = day;
        dayColumn.appendChild(dayHeader);
        
        // Day blocks container
        const dayBlocks = document.createElement('div');
        dayBlocks.className = 'day-blocks';
        dayBlocks.style.display = 'flex';
        dayBlocks.style.flexDirection = 'column';
        dayBlocks.style.gap = '12px';
        dayBlocks.style.minHeight = '500px';
        
        if (blocks.length === 0) {
          const emptyDay = document.createElement('div');
          emptyDay.className = 'empty-day';
          emptyDay.style.color = '#6b7280';
          emptyDay.style.fontSize = '0.9rem';
          emptyDay.style.textAlign = 'center';
          emptyDay.style.padding = '20px';
          emptyDay.style.fontStyle = 'italic';
          emptyDay.textContent = 'No scheduled activities';
          dayBlocks.appendChild(emptyDay);
        } else {
          // Sort blocks by time
          const sortedBlocks = [...blocks].sort((a, b) => {
            const timeA = timeToMinutes(a.startTime);
            const timeB = timeToMinutes(b.startTime);
            return timeA - timeB;
          });
          
          sortedBlocks.forEach(block => {
            const blockElement = document.createElement('div');
            blockElement.className = `schedule-block ${block.type} pdf-block`;
            blockElement.style.background = '#1f2937';
            blockElement.style.border = '1px solid #374151';
            blockElement.style.borderLeft = block.type === 'class' ? '4px solid #3b82f6' :
                                           block.type === 'study' ? '4px solid #10b981' :
                                           block.type === 'extracurricular' ? '4px solid #f59e0b' :
                                           block.type === 'break' ? '4px solid #6b7280' :
                                           '4px solid #8b5cf6';
            blockElement.style.borderRadius = '6px';
            blockElement.style.padding = '12px';
            blockElement.style.position = 'relative';
            
            // Time
            const timeDiv = document.createElement('div');
            timeDiv.className = 'block-time';
            timeDiv.style.color = '#9ca3af';
            timeDiv.style.fontSize = '0.85rem';
            timeDiv.style.fontWeight = '600';
            timeDiv.style.marginBottom = '8px';
            timeDiv.textContent = `${block.startTime} - ${block.endTime}`;
            blockElement.appendChild(timeDiv);
            
            // Content
            const contentDiv = document.createElement('div');
            contentDiv.className = 'block-content';
            contentDiv.style.display = 'flex';
            contentDiv.style.flexDirection = 'column';
            contentDiv.style.gap = '4px';
            
            // Type badge
            const typeBadge = document.createElement('div');
            typeBadge.className = 'block-type-badge';
            typeBadge.style.display = 'inline-block';
            typeBadge.style.background = '#374151';
            typeBadge.style.color = '#e5e7eb';
            typeBadge.style.padding = '2px 8px';
            typeBadge.style.borderRadius = '4px';
            typeBadge.style.fontSize = '0.75rem';
            typeBadge.style.fontWeight = '600';
            typeBadge.style.textTransform = 'uppercase';
            typeBadge.style.width = 'fit-content';
            typeBadge.style.marginBottom = '4px';
            typeBadge.textContent = block.type || 'activity';
            contentDiv.appendChild(typeBadge);
            
            // Subject
            if (block.subject) {
              const subjectDiv = document.createElement('div');
              subjectDiv.className = 'block-subject';
              subjectDiv.style.color = '#ffffff';
              subjectDiv.style.fontWeight = '600';
              subjectDiv.style.fontSize = '0.95rem';
              subjectDiv.textContent = block.subject;
              contentDiv.appendChild(subjectDiv);
            }
            
            // Location
            if (block.location) {
              const locationDiv = document.createElement('div');
              locationDiv.className = 'block-location';
              locationDiv.style.color = '#9ca3af';
              locationDiv.style.fontSize = '0.85rem';
              locationDiv.textContent = block.location;
              contentDiv.appendChild(locationDiv);
            }
            
            // Notes
            if (block.notes) {
              const notesDiv = document.createElement('div');
              notesDiv.className = 'block-notes';
              notesDiv.style.color = '#6b7280';
              notesDiv.style.fontSize = '0.8rem';
              notesDiv.style.fontStyle = 'italic';
              notesDiv.style.marginTop = '4px';
              notesDiv.textContent = block.notes;
              contentDiv.appendChild(notesDiv);
            }
            
            blockElement.appendChild(contentDiv);
            dayBlocks.appendChild(blockElement);
          });
        }
        
        dayColumn.appendChild(dayBlocks);
        exportSchedule.appendChild(dayColumn);
      });
      
      exportContainer.appendChild(exportSchedule);
      
      // Create footer
      const footer = document.createElement('div');
      footer.className = 'pdf-footer';
      footer.style.marginTop = '24px';
      footer.style.paddingTop = '20px';
      footer.style.borderTop = '1px solid #374151';
      footer.style.display = 'flex';
      footer.style.justifyContent = 'space-between';
      footer.style.alignItems = 'center';
      
      const footerText = document.createElement('p');
      footerText.style.color = '#6b7280';
      footerText.style.fontSize = '0.85rem';
      footerText.style.margin = '0';
      footerText.textContent = 'Generated by StudyFocus';
      footer.appendChild(footerText);
      
      const footerDate = document.createElement('p');
      footerDate.style.color = '#6b7280';
      footerDate.style.fontSize = '0.85rem';
      footerDate.style.margin = '0';
      const timeStr = date.toLocaleTimeString('en-US', { 
        hour: '2-digit', 
        minute: '2-digit' 
      });
      footerDate.textContent = `${dateStr} at ${timeStr}`;
      footer.appendChild(footerDate);
      
      exportContainer.appendChild(footer);
      
      // Wait for rendering
      await new Promise(resolve => setTimeout(resolve, 100));
      
      // Capture as canvas
      const canvas = await html2canvas(exportContainer, {
        backgroundColor: '#191919',
        scale: 2,
        logging: false,
        useCORS: true,
        allowTaint: true,
        width: exportContainer.scrollWidth,
        height: exportContainer.scrollHeight
      });
      
      // Calculate PDF dimensions (A4 landscape: 297mm x 210mm)
      const pdfWidth = 297; // mm
      const pdfHeight = 210; // mm
      const imgWidth = canvas.width;
      const imgHeight = canvas.height;
      
      // Calculate scaling to fit A4 landscape with margins
      const margin = 10; // 10mm margins on all sides
      const availableWidth = pdfWidth - (margin * 2);
      const availableHeight = pdfHeight - (margin * 2);
      
      const scaleX = availableWidth / (imgWidth * 0.264583); // Convert pixels to mm
      const scaleY = availableHeight / (imgHeight * 0.264583);
      const scale = Math.min(scaleX, scaleY, 1); // Don't scale up, only down
      
      const finalWidth = imgWidth * 0.264583 * scale;
      const finalHeight = imgHeight * 0.264583 * scale;
      
      // Create PDF in landscape
      const pdf = new jsPDF('l', 'mm', [pdfWidth, pdfHeight]);
      
      // Center the image with margins
      const xOffset = margin + (availableWidth - finalWidth) / 2;
      const yOffset = margin + (availableHeight - finalHeight) / 2;
      
      // Add the image to PDF
      const imgData = canvas.toDataURL('image/png');
      pdf.addImage(imgData, 'PNG', xOffset, yOffset, finalWidth, finalHeight);
      
      // Generate filename with current date
      const filenameDateStr = date.toISOString().split('T')[0];
      const filename = `StudyFocus-Schedule-${filenameDateStr}.pdf`;
      
      // Save the PDF
      pdf.save(filename);
      
      // Clean up
      document.body.removeChild(exportContainer);
      document.body.style.cursor = originalCursor;
      
    } catch (error) {
      console.error('Error exporting PDF:', error);
      alert('Failed to export PDF. Please try again.');
      document.body.style.cursor = '';
    }
  };

  // Add new activity
  const handleAddActivity = () => {
    // Validate required fields
    if (!newActivity.startTime || !newActivity.endTime) {
      alert('Start time and end time are required');
      return;
    }
    
    const validation = validateActivityPlacement(newActivity, newActivity.day);
    
    if (!validation.valid) {
      alert(`Cannot add activity: ${validation.reason}`);
      return;
    }
    
    const updatedSchedule = { ...generatedSchedule };
    let daySchedule = updatedSchedule.schedule.find(s => s.day === newActivity.day);
    
    if (!daySchedule) {
      daySchedule = { day: newActivity.day, blocks: [] };
      updatedSchedule.schedule.push(daySchedule);
    }
    
    // Create new block with ID
    const newBlock = {
      ...newActivity,
      id: `block-${newActivity.day}-${Date.now()}`,
      subject: newActivity.subject || (newActivity.type === 'class' ? 'New Class' : newActivity.type === 'study' ? 'Study Session' : 'Activity')
    };
    
    daySchedule.blocks.push(newBlock);
    
    saveSchedule(updatedSchedule);
    
    // Reset form
    setNewActivity({
      day: 'Monday',
      startTime: '09:00',
      endTime: '10:00',
      type: 'study',
      subject: '',
      location: '',
      notes: ''
    });
    setShowAddActivity(false);
  };

  // Handle drag start
  const handleDragStart = (e, block, day, blockIndex) => {
    setDraggedBlock({ block, day, blockIndex });
    e.dataTransfer.effectAllowed = 'move';
    e.dataTransfer.setData('text/plain', ''); // Required for Firefox
    e.currentTarget.style.opacity = '0.5';
  };

  // Handle drag end
  const handleDragEnd = (e) => {
    e.currentTarget.style.opacity = '1';
    setDraggedBlock(null);
    setDragOverDay(null);
    setDragOverIndex(null);
    setInvalidDrop(false);
  };

  // Handle drag over
  const handleDragOver = (e, day, blockIndex) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
    
    if (!draggedBlock) return;
    
    setDragOverDay(day);
    setDragOverIndex(blockIndex);
    
    // Validate the drop
    const validation = validateBlockPlacement(
      draggedBlock.block,
      day,
      blockIndex
    );
    
    setInvalidDrop(!validation.valid);
    
    if (!validation.valid) {
      e.dataTransfer.dropEffect = 'none';
    }
  };

  // Handle drop
  const handleDrop = (e, targetDay, targetIndex) => {
    e.preventDefault();
    
    if (!draggedBlock) return;
    
    const validation = validateBlockPlacement(
      draggedBlock.block,
      targetDay,
      targetIndex
    );
    
    if (!validation.valid) {
      alert(`Cannot move activity: ${validation.reason}`);
      setDraggedBlock(null);
      setDragOverDay(null);
      setDragOverIndex(null);
      setInvalidDrop(false);
      return;
    }
    
    // Update the schedule
    const updatedSchedule = { ...generatedSchedule };
    
    // Remove block from original day
    const originalDaySchedule = updatedSchedule.schedule.find(s => s.day === draggedBlock.day);
    if (originalDaySchedule) {
      originalDaySchedule.blocks = originalDaySchedule.blocks.filter(
        (_, idx) => idx !== draggedBlock.blockIndex
      );
    }
    
    // Add block to target day
    let targetDaySchedule = updatedSchedule.schedule.find(s => s.day === targetDay);
    if (!targetDaySchedule) {
      targetDaySchedule = { day: targetDay, blocks: [] };
      updatedSchedule.schedule.push(targetDaySchedule);
    }
    
    // Update block's day
    const updatedBlock = { ...draggedBlock.block, day: targetDay };
    
    // Insert at target index or append
    if (targetIndex !== null && targetIndex !== undefined && targetIndex < targetDaySchedule.blocks.length) {
      targetDaySchedule.blocks.splice(targetIndex, 0, updatedBlock);
    } else {
      targetDaySchedule.blocks.push(updatedBlock);
    }
    
    // Save using shared function (auto-sorts and saves)
    saveSchedule(updatedSchedule);
    
    // Reset drag state
    setDraggedBlock(null);
    setDragOverDay(null);
    setDragOverIndex(null);
    setInvalidDrop(false);
  };

  // Handle drag leave
  const handleDragLeave = (e) => {
    // Only clear if we're leaving the drop zone entirely
    if (!e.currentTarget.contains(e.relatedTarget)) {
      setDragOverDay(null);
      setDragOverIndex(null);
      setInvalidDrop(false);
    }
  };

  return (
    <div className="schedule-planner-container">
      <div className="schedule-planner-header">
        <h1>📅 Schedule Planner</h1>
        <p>Upload your timetable and generate an optimized study schedule</p>
      </div>

      {/* Step 1: Timetable Input */}
      {step === 'input' && (
        <div className="planner-step">
          <h2>Step 1: Enter Your Timetable</h2>
          <p className="step-description">
            Upload your timetable file (image or text) or paste the timetable text below. 
            Include day, time, subject, and location if available.
          </p>

          {/* File Upload Section */}
          <div className="file-upload-section">
            <div className="upload-area">
              <input
                ref={fileInputRef}
                type="file"
                accept="image/*,.txt"
                onChange={handleFileUpload}
                className="file-input"
                id="timetable-upload"
              />
              <label htmlFor="timetable-upload" className="upload-label">
                <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path>
                  <polyline points="17 8 12 3 7 8"></polyline>
                  <line x1="12" y1="3" x2="12" y2="15"></line>
                </svg>
                <span>Upload Timetable (Image or Text File)</span>
                <span className="upload-hint">PNG, JPG, or TXT files supported</span>
              </label>
              {uploadedFile && (
                <div className="uploaded-file-info">
                  <span className="file-name">📄 {uploadedFile.name}</span>
                  <button 
                    className="remove-file-btn"
                    onClick={() => {
                      setUploadedFile(null);
                      setFilePreview(null);
                      setTimetableText('');
                      if (fileInputRef.current) {
                        fileInputRef.current.value = '';
                      }
                    }}
                  >
                    Remove
                  </button>
                </div>
              )}
            </div>
            {filePreview && uploadedFile?.type.startsWith('image/') && (
              <div className="file-preview">
                <img src={filePreview} alt="Timetable preview" />
              </div>
            )}
          </div>

          <div className="divider">
            <span>OR</span>
          </div>
          
          <DataInput
            type="textarea"
            label="Paste Timetable Text"
            value={timetableText}
            onChange={setTimetableText}
            placeholder="Example:&#10;Monday 9:00-10:00 CS4297 Room 101&#10;Monday 14:00-16:00 Math Library&#10;Tuesday 10:00-11:00 Physics Lab 2"
            rows={10}
          />

          <div className="step-actions">
            <button
              className="secondary-btn"
              onClick={() => {
                setExtractedClasses([]);
                setStep('confirm');
              }}
            >
              Enter Manually
            </button>
          </div>
        </div>
      )}

      {/* Step 2: Confirm/Edit Classes */}
      {step === 'confirm' && (
        <div className="planner-step">
          <h2>Step 2: Confirm Your Classes</h2>
          <p className="step-description">
            Review and edit the extracted classes. Add any missing classes or remove incorrect ones.
          </p>

          <div className="classes-list">
            {extractedClasses.map((cls) => (
              <div key={cls.id} className="class-item">
                {editingClass === cls.id ? (
                  <div className="class-edit-form">
                    <DataInput
                      type="select"
                      label="Day"
                      value={cls.day}
                      onChange={(value) => updateClass(cls.id, 'day', value)}
                      options={daysOfWeek.map(d => ({ value: d, label: d }))}
                    />
                    <DataInput
                      type="text"
                      label="Start Time"
                      value={cls.startTime}
                      onChange={(value) => updateClass(cls.id, 'startTime', value)}
                      placeholder="09:00"
                    />
                    <DataInput
                      type="text"
                      label="End Time"
                      value={cls.endTime}
                      onChange={(value) => updateClass(cls.id, 'endTime', value)}
                      placeholder="10:00"
                    />
                    <DataInput
                      type="text"
                      label="Subject"
                      value={cls.subject}
                      onChange={(value) => updateClass(cls.id, 'subject', value)}
                      placeholder="CS4297"
                    />
                    <DataInput
                      type="text"
                      label="Location"
                      value={cls.location || ''}
                      onChange={(value) => updateClass(cls.id, 'location', value)}
                      placeholder="Room 101"
                    />
                    <DataInput
                      type="text"
                      label="Type (LEC/LAB/TUT)"
                      value={cls.type || ''}
                      onChange={(value) => updateClass(cls.id, 'type', value)}
                      placeholder="LEC/LAB/TUT"
                    />
                    <DataInput
                      type="text"
                      label="Weeks"
                      value={cls.weeks || ''}
                      onChange={(value) => updateClass(cls.id, 'weeks', value)}
                      placeholder="1-12"
                    />
                    <div className="class-actions">
                      <button 
                        className="save-btn"
                        onClick={() => setEditingClass(null)}
                      >
                        Save
                      </button>
                      <button 
                        className="delete-btn"
                        onClick={() => deleteClass(cls.id)}
                      >
                        Delete
                      </button>
                    </div>
                  </div>
                ) : (
                  <div className="class-display">
                    <div className="class-info">
                      <span className="class-day">{cls.day}</span>
                      <span className="class-time">{cls.startTime} - {cls.endTime}</span>
                      <span className="class-subject">{cls.subject}</span>
                      {cls.type && <span className="class-type">{cls.type}</span>}
                      {cls.location && <span className="class-location">{cls.location}</span>}
                      {cls.weeks && <span className="class-weeks">Wks: {cls.weeks}</span>}
                    </div>
                    <button 
                      className="edit-btn"
                      onClick={() => setEditingClass(cls.id)}
                    >
                      Edit
                    </button>
                  </div>
                )}
              </div>
            ))}
          </div>

          <button className="add-btn" onClick={addClass}>
            + Add Class
          </button>

          <div className="step-actions">
            <button 
              className="secondary-btn"
              onClick={() => setStep('input')}
            >
              Back
            </button>
            <button 
              className="primary-btn"
              onClick={() => {
                const saveData = {
                  timetableText,
                  extractedClasses
                };
                updateTabData('schedule-planner', saveData);
                autoSave('schedule-planner', saveData);
                setStep('constraints');
              }}
              disabled={extractedClasses.length === 0}
            >
              Continue to Constraints
            </button>
          </div>
        </div>
      )}

      {/* Step 3: Constraints */}
      {step === 'constraints' && (
        <div className="planner-step">
          <h2>Step 3: Set Your Constraints</h2>
          <p className="step-description">
            Tell us about your preferences and constraints to generate the perfect schedule.
          </p>

          <div className="constraints-section">
            <h3>Basic Settings</h3>
            <div className="constraints-grid">
              <DataInput
                type="number"
                label="Commute Time to Campus (minutes)"
                value={commuteTime}
                onChange={(value) => setCommuteTime(parseInt(value) || 0)}
                min="0"
                max="120"
              />
              <DataInput
                type="text"
                label="Preferred Wake Time"
                value={wakeTime}
                onChange={setWakeTime}
                placeholder="07:00"
              />
              <DataInput
                type="text"
                label="Preferred Sleep Time"
                value={sleepTime}
                onChange={setSleepTime}
                placeholder="23:00"
              />
              <DataInput
                type="number"
                label="Study Hours Per Day"
                value={studyHoursPerDay}
                onChange={(value) => setStudyHoursPerDay(parseFloat(value) || 0)}
                min="0"
                max="12"
                step="0.5"
              />
              <DataInput
                type="checkbox"
                label="Allow late-night study sessions"
                value={allowLateStudy}
                onChange={setAllowLateStudy}
              />
            </div>
          </div>

          <div className="constraints-section">
            <h3>Extracurricular Activities</h3>
            <div className="extracurriculars-list">
              {extracurriculars.map((act) => (
                <div key={act.id} className="activity-item">
                  <DataInput
                    type="select"
                    label="Day"
                    value={act.day}
                    onChange={(value) => updateExtracurricular(act.id, 'day', value)}
                    options={daysOfWeek.map(d => ({ value: d, label: d }))}
                  />
                  <DataInput
                    type="text"
                    label="Start Time"
                    value={act.startTime}
                    onChange={(value) => updateExtracurricular(act.id, 'startTime', value)}
                    placeholder="18:00"
                  />
                  <DataInput
                    type="text"
                    label="End Time"
                    value={act.endTime}
                    onChange={(value) => updateExtracurricular(act.id, 'endTime', value)}
                    placeholder="19:00"
                  />
                  <DataInput
                    type="text"
                    label="Activity Name"
                    value={act.name}
                    onChange={(value) => updateExtracurricular(act.id, 'name', value)}
                    placeholder="Gym, Club, etc."
                  />
                  <DataInput
                    type="text"
                    label="Location"
                    value={act.location}
                    onChange={(value) => updateExtracurricular(act.id, 'location', value)}
                    placeholder="Optional"
                  />
                  <button 
                    className="delete-btn"
                    onClick={() => deleteExtracurricular(act.id)}
                  >
                    Remove
                  </button>
                </div>
              ))}
            </div>
            <button className="add-btn" onClick={addExtracurricular}>
              + Add Extracurricular Activity
            </button>
          </div>

          <div className="step-actions">
            <button 
              className="secondary-btn"
              onClick={() => setStep('confirm')}
            >
              Back
            </button>
            <button 
              className="primary-btn"
              onClick={() => {
                const saveData = {
                  timetableText,
                  extractedClasses,
                  constraints: {
                    commuteTime,
                    extracurriculars,
                    wakeTime,
                    sleepTime,
                    studyHoursPerDay,
                    allowLateStudy
                  }
                };
                updateTabData('schedule-planner', saveData);
                autoSave('schedule-planner', saveData);
                generateSchedule();
              }}
              disabled={generating}
            >
              {generating ? 'Generating Schedule...' : 'Generate Schedule'}
            </button>
          </div>
        </div>
      )}

      {/* Step 4: Generated Schedule */}
      {step === 'schedule' && generatedSchedule && (
        <div className="planner-step">
          <div className="schedule-header">
            <div>
              <h2>Your Weekly Schedule</h2>
              <p className="drag-hint">💡 Drag and drop to rearrange • Click ✏️ to edit • Click 🗑️ to delete • Use "+ Add New Activity" to add manually</p>
            </div>
            <div className="schedule-actions">
              <button 
                className="download-pdf-btn"
                onClick={handleExportPDF}
                title="Download timetable as PDF"
              >
                📥 Download as PDF
              </button>
              <div className="intensity-selector">
                <label>Schedule Intensity:</label>
                <button 
                  className={intensity === 'light' ? 'active' : ''}
                  onClick={() => regenerateSchedule('light')}
                  disabled={generating}
                >
                  Light
                </button>
                <button 
                  className={intensity === 'balanced' ? 'active' : ''}
                  onClick={() => regenerateSchedule('balanced')}
                  disabled={generating}
                >
                  Intense
                </button>
                <button 
                  className={intensity === 'intense' ? 'active' : ''}
                  onClick={() => regenerateSchedule('intense')}
                  disabled={generating}
                >
                Intense
              </button>
              </div>
            </div>
          </div>

          {generating && (
            <div className="generating-indicator">
              <p>Generating new schedule...</p>
            </div>
          )}

          {/* Add Activity Button */}
          <div className="add-activity-section">
            <button 
              className="add-activity-btn"
              onClick={() => setShowAddActivity(!showAddActivity)}
            >
              {showAddActivity ? '−' : '+'} Add New Activity
            </button>
            
            {showAddActivity && (
              <div className="add-activity-form">
                <h3>Add New Activity</h3>
                <div className="activity-form-grid">
                  <DataInput
                    type="select"
                    label="Day"
                    value={newActivity.day}
                    onChange={(value) => setNewActivity({ ...newActivity, day: value })}
                    options={daysOfWeek.map(d => ({ value: d, label: d }))}
                  />
                  <DataInput
                    type="text"
                    label="Start Time"
                    value={newActivity.startTime}
                    onChange={(value) => setNewActivity({ ...newActivity, startTime: value })}
                    placeholder="09:00"
                  />
                  <DataInput
                    type="text"
                    label="End Time"
                    value={newActivity.endTime}
                    onChange={(value) => setNewActivity({ ...newActivity, endTime: value })}
                    placeholder="10:00"
                  />
                  <DataInput
                    type="select"
                    label="Type"
                    value={newActivity.type}
                    onChange={(value) => setNewActivity({ ...newActivity, type: value })}
                    options={[
                      { value: 'class', label: 'Class' },
                      { value: 'study', label: 'Study' },
                      { value: 'extracurricular', label: 'Extracurricular' },
                      { value: 'break', label: 'Break' },
                      { value: 'commute', label: 'Commute' }
                    ]}
                  />
                  <DataInput
                    type="text"
                    label="Subject/Title"
                    value={newActivity.subject}
                    onChange={(value) => setNewActivity({ ...newActivity, subject: value })}
                    placeholder="CS4297 or Study Session"
                  />
                  <DataInput
                    type="text"
                    label="Location"
                    value={newActivity.location}
                    onChange={(value) => setNewActivity({ ...newActivity, location: value })}
                    placeholder="Room 101 (optional)"
                  />
                  <DataInput
                    type="textarea"
                    label="Notes"
                    value={newActivity.notes}
                    onChange={(value) => setNewActivity({ ...newActivity, notes: value })}
                    placeholder="Optional notes"
                    rows={2}
                  />
                </div>
                <div className="activity-form-actions">
                  <button 
                    className="primary-btn"
                    onClick={handleAddActivity}
                  >
                    Add Activity
                  </button>
                  <button 
                    className="secondary-btn"
                    onClick={() => setShowAddActivity(false)}
                  >
                    Cancel
                  </button>
                </div>
              </div>
            )}
          </div>

          <div className="weekly-schedule">
            {daysOfWeek.map(day => {
              const daySchedule = generatedSchedule.schedule?.find(s => s.day === day);
              const blocks = daySchedule?.blocks || [];
              const isDragOver = dragOverDay === day;
              const isInvalidDropZone = isDragOver && invalidDrop;
              
              return (
                <div 
                  key={day} 
                  className={`schedule-day ${isDragOver ? 'drag-over' : ''} ${isInvalidDropZone ? 'invalid-drop' : ''}`}
                  onDragOver={(e) => handleDragOver(e, day, null)}
                  onDragLeave={handleDragLeave}
                  onDrop={(e) => handleDrop(e, day, null)}
                >
                  <h3 className="day-header">{day}</h3>
                  <div className="day-blocks">
                    {blocks.length === 0 ? (
                      <div 
                        className={`empty-day drop-zone ${isDragOver && dragOverIndex === null ? 'drop-target' : ''}`}
                        onDragOver={(e) => {
                          e.preventDefault();
                          e.stopPropagation();
                          handleDragOver(e, day, 0);
                        }}
                        onDrop={(e) => {
                          e.preventDefault();
                          e.stopPropagation();
                          handleDrop(e, day, 0);
                        }}
                      >
                        {isDragOver && dragOverIndex === null && !invalidDrop ? (
                          <span className="drop-hint">Drop here</span>
                        ) : isDragOver && invalidDrop ? (
                          <span className="drop-hint invalid">Invalid position</span>
                        ) : (
                          'No scheduled activities'
                        )}
                      </div>
                    ) : (
                      <>
                        {blocks.map((block, index) => {
                          const blockId = block.id || `block-${day}-${index}`;
                          const isDragging = draggedBlock?.block === block && draggedBlock?.day === day && draggedBlock?.blockIndex === index;
                          const isDropTarget = isDragOver && dragOverIndex === index;
                          
                          return (
                            <React.Fragment key={blockId}>
                              {/* Drop zone before this block */}
                              <div
                                className={`drop-zone ${isDropTarget && !invalidDrop ? 'drop-target' : ''} ${isDropTarget && invalidDrop ? 'drop-invalid' : ''}`}
                                onDragOver={(e) => {
                                  e.preventDefault();
                                  e.stopPropagation();
                                  handleDragOver(e, day, index);
                                }}
                                onDrop={(e) => {
                                  e.preventDefault();
                                  e.stopPropagation();
                                  handleDrop(e, day, index);
                                }}
                              >
                                {isDropTarget && !invalidDrop && (
                                  <span className="drop-hint">Drop here</span>
                                )}
                                {isDropTarget && invalidDrop && (
                                  <span className="drop-hint invalid">Invalid time position</span>
                                )}
                              </div>
                              
                              {/* The actual block */}
                              {editingBlock && editingBlock.originalDay === day && editingBlock.originalIndex === index ? (
                                <div className="schedule-block-edit">
                                  <div className="block-edit-form">
                                    <DataInput
                                      type="select"
                                      label="Day"
                                      value={editingBlock.day}
                                      onChange={(value) => setEditingBlock({ ...editingBlock, day: value })}
                                      options={daysOfWeek.map(d => ({ value: d, label: d }))}
                                    />
                                    <DataInput
                                      type="text"
                                      label="Start Time"
                                      value={editingBlock.startTime}
                                      onChange={(value) => setEditingBlock({ ...editingBlock, startTime: value })}
                                      placeholder="09:00"
                                    />
                                    <DataInput
                                      type="text"
                                      label="End Time"
                                      value={editingBlock.endTime}
                                      onChange={(value) => setEditingBlock({ ...editingBlock, endTime: value })}
                                      placeholder="10:00"
                                    />
                                    <DataInput
                                      type="select"
                                      label="Type"
                                      value={editingBlock.type}
                                      onChange={(value) => setEditingBlock({ ...editingBlock, type: value })}
                                      options={[
                                        { value: 'class', label: 'Class' },
                                        { value: 'study', label: 'Study' },
                                        { value: 'extracurricular', label: 'Extracurricular' },
                                        { value: 'break', label: 'Break' },
                                        { value: 'commute', label: 'Commute' }
                                      ]}
                                    />
                                    <DataInput
                                      type="text"
                                      label="Subject/Title"
                                      value={editingBlock.subject || ''}
                                      onChange={(value) => setEditingBlock({ ...editingBlock, subject: value })}
                                      placeholder="CS4297 or Study Session"
                                    />
                                    <DataInput
                                      type="text"
                                      label="Location"
                                      value={editingBlock.location || ''}
                                      onChange={(value) => setEditingBlock({ ...editingBlock, location: value })}
                                      placeholder="Room 101"
                                    />
                                    <DataInput
                                      type="textarea"
                                      label="Notes"
                                      value={editingBlock.notes || ''}
                                      onChange={(value) => setEditingBlock({ ...editingBlock, notes: value })}
                                      placeholder="Optional notes"
                                      rows={2}
                                    />
                                    <div className="block-edit-actions">
                                      <button 
                                        className="save-btn"
                                        onClick={handleSaveEdit}
                                      >
                                        Save
                                      </button>
                                      <button 
                                        className="secondary-btn"
                                        onClick={handleCancelEdit}
                                      >
                                        Cancel
                                      </button>
                                    </div>
                                  </div>
                                </div>
                              ) : (
                                <div 
                                  draggable
                                  onDragStart={(e) => handleDragStart(e, block, day, index)}
                                  onDragEnd={handleDragEnd}
                                  className={`schedule-block ${block.type} ${isDragging ? 'dragging' : ''}`}
                                  title={block.notes || ''}
                                >
                                  <div className="block-drag-handle">⋮⋮</div>
                                  <div className="block-actions">
                                    <button 
                                      className="block-edit-btn"
                                      onClick={() => handleEditActivity(block, day, index)}
                                      title="Edit"
                                    >
                                      ✏️
                                    </button>
                                    <button 
                                      className="block-delete-btn"
                                      onClick={() => handleDeleteActivity(block, day, index)}
                                      title="Delete"
                                    >
                                      🗑️
                                    </button>
                                  </div>
                                  <div className="block-time">
                                    {block.startTime} - {block.endTime}
                                  </div>
                                  <div className="block-content">
                                    <div className="block-type-badge">{block.type}</div>
                                    {block.subject && (
                                      <div className="block-subject">{block.subject}</div>
                                    )}
                                    {block.location && (
                                      <div className="block-location">{block.location}</div>
                                    )}
                                    {block.notes && (
                                      <div className="block-notes">{block.notes}</div>
                                    )}
                                  </div>
                                </div>
                              )}
                            </React.Fragment>
                          );
                        })}
                        
                        {/* Drop zone at the end */}
                        <div
                          className={`drop-zone ${isDragOver && dragOverIndex === blocks.length ? 'drop-target' : ''} ${isDragOver && dragOverIndex === blocks.length && invalidDrop ? 'drop-invalid' : ''}`}
                          onDragOver={(e) => {
                            e.preventDefault();
                            e.stopPropagation();
                            handleDragOver(e, day, blocks.length);
                          }}
                          onDrop={(e) => {
                            e.preventDefault();
                            e.stopPropagation();
                            handleDrop(e, day, blocks.length);
                          }}
                        >
                          {isDragOver && dragOverIndex === blocks.length && !invalidDrop && (
                            <span className="drop-hint">Drop here</span>
                          )}
                          {isDragOver && dragOverIndex === blocks.length && invalidDrop && (
                            <span className="drop-hint invalid">Invalid time position</span>
                          )}
                        </div>
                      </>
                    )}
                  </div>
                </div>
              );
            })}
          </div>

          <div className="step-actions">
            <button 
              className="secondary-btn"
              onClick={() => setStep('constraints')}
            >
              Edit Constraints
            </button>
            <button 
              className="primary-btn"
              onClick={() => {
                setStep('input');
                setTimetableText('');
                setExtractedClasses([]);
                setGeneratedSchedule(null);
                setUploadedFile(null);
                setFilePreview(null);
                if (fileInputRef.current) {
                  fileInputRef.current.value = '';
                }
              }}
            >
              Create New Schedule
            </button>
          </div>
        </div>
      )}
      {/* Processing Modal — shown during image extraction and schedule generation */}
      {(extracting || generating) && (
        <div className="processing-modal-overlay">
          <div className="processing-modal">
            <div className="processing-spinner" />
            <h3>{extracting ? 'Extracting Your Timetable' : 'Generating Your Schedule'}</h3>
            <p>
              {extracting
                ? 'Analysing your timetable image and identifying classes…'
                : 'Building your personalised weekly schedule…'}
            </p>
          </div>
        </div>
      )}
    </div>
  );
};

export default SchedulePlanner;

