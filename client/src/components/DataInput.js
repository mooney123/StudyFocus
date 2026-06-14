import React, { useState, useEffect } from 'react';
import './DataInput.css';

const DataInput = ({ 
  type = 'text', 
  value, 
  onChange, 
  placeholder = '', 
  label = '', 
  className = '',
  autoSave = true,
  rows = 1,
  options = [],
  ...props 
}) => {
  const [localValue, setLocalValue] = useState(value || '');
  const [isFocused, setIsFocused] = useState(false);

  useEffect(() => {
    setLocalValue(value || '');
  }, [value]);

  const handleChange = (e) => {
    const newValue = e.target.value;
    setLocalValue(newValue);
    
    if (onChange) {
      onChange(newValue);
    }
  };

  const handleFocus = () => {
    setIsFocused(true);
  };

  const handleBlur = () => {
    setIsFocused(false);
  };

  const renderInput = () => {
    switch (type) {
      case 'textarea':
        return (
          <textarea
            value={localValue}
            onChange={handleChange}
            onFocus={handleFocus}
            onBlur={handleBlur}
            placeholder={placeholder}
            rows={rows}
            className={`data-input ${isFocused ? 'focused' : ''} ${className}`}
            {...props}
          />
        );
      
      case 'select':
        return (
          <select
            value={localValue}
            onChange={handleChange}
            onFocus={handleFocus}
            onBlur={handleBlur}
            className={`data-input ${isFocused ? 'focused' : ''} ${className}`}
            {...props}
          >
            <option value="">{placeholder}</option>
            {options.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
        );
      
      case 'checkbox':
        return (
          <label className="checkbox-container">
            <input
              type="checkbox"
              checked={!!localValue}
              onChange={(e) => handleChange({ target: { value: e.target.checked } })}
              onFocus={handleFocus}
              onBlur={handleBlur}
              className={`data-input ${className}`}
              {...props}
            />
            <span className="checkmark"></span>
            {label && <span className="checkbox-label">{label}</span>}
          </label>
        );

      case 'number': {
        // Clamp to [min, max] on commit so values like "-5" (which parseInt
        // accepts as truthy) or "99999" cannot start a timer at a negative
        // or absurd duration. Allow the user to type freely between keys,
        // but coerce to a safe integer on blur.
        const min = props.min !== undefined ? Number(props.min) : undefined;
        const max = props.max !== undefined ? Number(props.max) : undefined;

        const clampToRange = (raw) => {
          if (raw === '' || raw === null || raw === undefined) return raw;
          const n = Number.parseInt(raw, 10);
          if (Number.isNaN(n)) return min !== undefined ? String(min) : '';
          let clamped = n;
          if (min !== undefined && clamped < min) clamped = min;
          if (max !== undefined && clamped > max) clamped = max;
          return String(clamped);
        };

        return (
          <input
            type="number"
            value={localValue}
            onChange={handleChange}
            onFocus={handleFocus}
            onBlur={(e) => {
              const next = clampToRange(e.target.value);
              if (next !== localValue) {
                setLocalValue(next);
                if (onChange) onChange(next);
              }
              handleBlur();
            }}
            placeholder={placeholder}
            className={`data-input ${isFocused ? 'focused' : ''} ${className}`}
            {...props}
          />
        );
      }
      
      default:
        return (
          <input
            type={type}
            value={localValue}
            onChange={handleChange}
            onFocus={handleFocus}
            onBlur={handleBlur}
            placeholder={placeholder}
            className={`data-input ${isFocused ? 'focused' : ''} ${className}`}
            {...props}
          />
        );
    }
  };

  if (type === 'checkbox') {
    return renderInput();
  }

  return (
    <div className="data-input-wrapper">
      {label && <label className="data-input-label">{label}</label>}
      {renderInput()}
    </div>
  );
};

export default DataInput;







