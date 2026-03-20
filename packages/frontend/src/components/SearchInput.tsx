'use client';

import { useState, useRef, useEffect, KeyboardEvent, ChangeEvent } from 'react';

export interface SearchSuggestion {
  id: string;
  text: string;
  category?: string;
}

interface SearchInputProps {
  value: string;
  onChange: (value: string) => void;
  onSubmit: (value: string) => void;
  suggestions?: SearchSuggestion[];
  onSuggestionSelect?: (suggestion: SearchSuggestion) => void;
  placeholder?: string;
  loading?: boolean;
  disabled?: boolean;
  className?: string;
}

export function SearchInput({
  value,
  onChange,
  onSubmit,
  suggestions = [],
  onSuggestionSelect,
  placeholder = 'Search...',
  loading = false,
  disabled = false,
  className = '',
}: SearchInputProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [highlightedIndex, setHighlightedIndex] = useState(-1);
  const inputRef = useRef<HTMLInputElement>(null);
  const dropdownRef = useRef<HTMLDivElement>(null);

  const filteredSuggestions = suggestions.filter((s) =>
    s.text.toLowerCase().includes(value.toLowerCase())
  );

  useEffect(() => {
    setIsOpen(value.length > 0 && filteredSuggestions.length > 0);
    setHighlightedIndex(-1);
  }, [value, filteredSuggestions.length]);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (
        dropdownRef.current &&
        !dropdownRef.current.contains(event.target as Node) &&
        inputRef.current &&
        !inputRef.current.contains(event.target as Node)
      ) {
        setIsOpen(false);
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const handleKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
    if (!isOpen) {
      if (e.key === 'Enter') {
        e.preventDefault();
        onSubmit(value);
      }
      return;
    }

    switch (e.key) {
      case 'ArrowDown':
        e.preventDefault();
        setHighlightedIndex((prev) =>
          prev < filteredSuggestions.length - 1 ? prev + 1 : prev
        );
        break;
      case 'ArrowUp':
        e.preventDefault();
        setHighlightedIndex((prev) => (prev > 0 ? prev - 1 : -1));
        break;
      case 'Enter':
        e.preventDefault();
        if (highlightedIndex >= 0 && highlightedIndex < filteredSuggestions.length) {
          const selected = filteredSuggestions[highlightedIndex];
          onChange(selected.text);
          onSuggestionSelect?.(selected);
          setIsOpen(false);
        } else {
          onSubmit(value);
        }
        break;
      case 'Escape':
        setIsOpen(false);
        setHighlightedIndex(-1);
        break;
    }
  };

  const handleSuggestionClick = (suggestion: SearchSuggestion) => {
    onChange(suggestion.text);
    onSuggestionSelect?.(suggestion);
    setIsOpen(false);
    inputRef.current?.focus();
  };

  const handleInputChange = (e: ChangeEvent<HTMLInputElement>) => {
    onChange(e.target.value);
  };

  const handleSubmit = () => {
    onSubmit(value);
    setIsOpen(false);
  };

  return (
    <div className={`relative ${className}`}>
      <div className="relative">
        <input
          ref={inputRef}
          type="text"
          value={value}
          onChange={handleInputChange}
          onKeyDown={handleKeyDown}
          onFocus={() => value.length > 0 && filteredSuggestions.length > 0 && setIsOpen(true)}
          placeholder={placeholder}
          disabled={disabled}
          className="input-field pr-20"
          aria-label="Search input"
          aria-expanded={isOpen}
          aria-autocomplete="list"
          aria-controls="search-suggestions"
          role="combobox"
        />
        <div className="absolute right-2 top-1/2 -translate-y-1/2 flex items-center space-x-1">
          {loading && (
            <svg
              className="w-5 h-5 text-gray-400 animate-spin"
              fill="none"
              viewBox="0 0 24 24"
            >
              <circle
                className="opacity-25"
                cx="12"
                cy="12"
                r="10"
                stroke="currentColor"
                strokeWidth="4"
              />
              <path
                className="opacity-75"
                fill="currentColor"
                d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
              />
            </svg>
          )}
          <button
            onClick={handleSubmit}
            disabled={disabled || !value.trim()}
            className="p-1 text-gray-500 hover:text-aws-orange disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
            aria-label="Submit search"
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"
              />
            </svg>
          </button>
        </div>
      </div>

      {isOpen && filteredSuggestions.length > 0 && (
        <div
          ref={dropdownRef}
          id="search-suggestions"
          className="absolute z-50 w-full mt-1 bg-white border border-gray-200 rounded-md shadow-lg max-h-60 overflow-y-auto"
          role="listbox"
        >
          {filteredSuggestions.map((suggestion, index) => (
            <button
              key={suggestion.id}
              onClick={() => handleSuggestionClick(suggestion)}
              className={`w-full px-4 py-2 text-left text-sm hover:bg-gray-100 flex items-center justify-between ${
                index === highlightedIndex ? 'bg-gray-100' : ''
              }`}
              role="option"
              aria-selected={index === highlightedIndex}
            >
              <span>{suggestion.text}</span>
              {suggestion.category && (
                <span className="text-xs text-gray-500 bg-gray-100 px-2 py-0.5 rounded">
                  {suggestion.category}
                </span>
              )}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
