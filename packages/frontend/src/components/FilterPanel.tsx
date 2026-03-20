'use client';

import { useState, useCallback } from 'react';

export interface CheckboxOption {
  id: string;
  label: string;
  checked: boolean;
}

export interface DropdownOption {
  value: string;
  label: string;
}

export interface RangeValue {
  min: number;
  max: number;
}

export interface FilterGroup {
  id: string;
  label: string;
  type: 'checkbox' | 'dropdown' | 'range';
  options?: CheckboxOption[] | DropdownOption[];
  value?: string | RangeValue;
  range?: { min: number; max: number; step?: number };
}

interface FilterPanelProps {
  groups: FilterGroup[];
  onChange: (groupId: string, value: CheckboxOption[] | string | RangeValue) => void;
  onReset?: () => void;
  title?: string;
  className?: string;
  collapsible?: boolean;
}

export function FilterPanel({
  groups,
  onChange,
  onReset,
  title = 'Filters',
  className = '',
  collapsible = true,
}: FilterPanelProps) {
  const [expandedGroups, setExpandedGroups] = useState<Set<string>>(
    new Set(groups.map((g) => g.id))
  );

  const toggleGroup = useCallback((groupId: string) => {
    setExpandedGroups((prev) => {
      const next = new Set(prev);
      if (next.has(groupId)) {
        next.delete(groupId);
      } else {
        next.add(groupId);
      }
      return next;
    });
  }, []);

  const handleCheckboxChange = useCallback(
    (groupId: string, optionId: string, checked: boolean) => {
      const group = groups.find((g) => g.id === groupId);
      if (group && group.type === 'checkbox' && Array.isArray(group.options)) {
        const updatedOptions = (group.options as CheckboxOption[]).map((opt) =>
          opt.id === optionId ? { ...opt, checked } : opt
        );
        onChange(groupId, updatedOptions);
      }
    },
    [groups, onChange]
  );

  const handleDropdownChange = useCallback(
    (groupId: string, value: string) => {
      onChange(groupId, value);
    },
    [onChange]
  );

  const handleRangeChange = useCallback(
    (groupId: string, type: 'min' | 'max', value: number) => {
      const group = groups.find((g) => g.id === groupId);
      if (group && group.type === 'range') {
        const currentValue = group.value as RangeValue;
        const newValue: RangeValue = {
          ...currentValue,
          [type]: value,
        };
        onChange(groupId, newValue);
      }
    },
    [groups, onChange]
  );

  const activeFilterCount = groups.reduce((count, group) => {
    if (group.type === 'checkbox' && Array.isArray(group.options)) {
      return count + (group.options as CheckboxOption[]).filter((o) => o.checked).length;
    }
    if (group.type === 'dropdown' && group.value) {
      return count + 1;
    }
    return count;
  }, 0);

  return (
    <div className={`bg-white rounded-lg border border-gray-200 ${className}`}>
      <div className="flex items-center justify-between p-4 border-b border-gray-200">
        <div className="flex items-center space-x-2">
          <svg className="w-5 h-5 text-gray-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 4a1 1 0 011-1h16a1 1 0 011 1v2.586a1 1 0 01-.293.707l-6.414 6.414a1 1 0 00-.293.707V17l-4 4v-6.586a1 1 0 00-.293-.707L3.293 7.293A1 1 0 013 6.586V4z" />
          </svg>
          <h3 className="font-semibold text-gray-900">{title}</h3>
          {activeFilterCount > 0 && (
            <span className="bg-aws-orange text-white text-xs px-2 py-0.5 rounded-full">
              {activeFilterCount}
            </span>
          )}
        </div>
        {onReset && activeFilterCount > 0 && (
          <button
            onClick={onReset}
            className="text-sm text-aws-orange hover:text-orange-600 transition-colors"
          >
            Reset
          </button>
        )}
      </div>

      <div className="divide-y divide-gray-100">
        {groups.map((group) => (
          <FilterGroupComponent
            key={group.id}
            group={group}
            expanded={expandedGroups.has(group.id)}
            onToggle={() => collapsible && toggleGroup(group.id)}
            onCheckboxChange={handleCheckboxChange}
            onDropdownChange={handleDropdownChange}
            onRangeChange={handleRangeChange}
            collapsible={collapsible}
          />
        ))}
      </div>
    </div>
  );
}

interface FilterGroupComponentProps {
  group: FilterGroup;
  expanded: boolean;
  onToggle: () => void;
  onCheckboxChange: (groupId: string, optionId: string, checked: boolean) => void;
  onDropdownChange: (groupId: string, value: string) => void;
  onRangeChange: (groupId: string, type: 'min' | 'max', value: number) => void;
  collapsible: boolean;
}

function FilterGroupComponent({
  group,
  expanded,
  onToggle,
  onCheckboxChange,
  onDropdownChange,
  onRangeChange,
  collapsible,
}: FilterGroupComponentProps) {
  return (
    <div className="p-4">
      <button
        onClick={onToggle}
        className={`flex items-center justify-between w-full text-left ${
          collapsible ? 'cursor-pointer' : 'cursor-default'
        }`}
        disabled={!collapsible}
        aria-expanded={expanded}
      >
        <span className="font-medium text-gray-700">{group.label}</span>
        {collapsible && (
          <svg
            className={`w-4 h-4 text-gray-500 transition-transform ${
              expanded ? 'rotate-180' : ''
            }`}
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
          </svg>
        )}
      </button>

      {expanded && (
        <div className="mt-3">
          {group.type === 'checkbox' && (
            <CheckboxGroup
              groupId={group.id}
              options={group.options as CheckboxOption[]}
              onChange={onCheckboxChange}
            />
          )}
          {group.type === 'dropdown' && (
            <DropdownSelect
              groupId={group.id}
              options={group.options as DropdownOption[]}
              value={group.value as string}
              onChange={onDropdownChange}
            />
          )}
          {group.type === 'range' && group.range && (
            <RangeSlider
              groupId={group.id}
              value={group.value as RangeValue}
              range={group.range}
              onChange={onRangeChange}
            />
          )}
        </div>
      )}
    </div>
  );
}

interface CheckboxGroupProps {
  groupId: string;
  options: CheckboxOption[];
  onChange: (groupId: string, optionId: string, checked: boolean) => void;
}

function CheckboxGroup({ groupId, options, onChange }: CheckboxGroupProps) {
  return (
    <div className="space-y-2">
      {options.map((option) => (
        <label
          key={option.id}
          className="flex items-center space-x-2 cursor-pointer group"
        >
          <input
            type="checkbox"
            checked={option.checked}
            onChange={(e) => onChange(groupId, option.id, e.target.checked)}
            className="w-4 h-4 text-aws-orange border-gray-300 rounded focus:ring-aws-orange focus:ring-2"
          />
          <span className="text-sm text-gray-600 group-hover:text-gray-900">
            {option.label}
          </span>
        </label>
      ))}
    </div>
  );
}

interface DropdownSelectProps {
  groupId: string;
  options: DropdownOption[];
  value: string;
  onChange: (groupId: string, value: string) => void;
}

function DropdownSelect({ groupId, options, value, onChange }: DropdownSelectProps) {
  return (
    <select
      value={value || ''}
      onChange={(e) => onChange(groupId, e.target.value)}
      className="w-full px-3 py-2 text-sm border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-aws-orange focus:border-transparent"
    >
      <option value="">Select...</option>
      {options.map((option) => (
        <option key={option.value} value={option.value}>
          {option.label}
        </option>
      ))}
    </select>
  );
}

interface RangeSliderProps {
  groupId: string;
  value: RangeValue;
  range: { min: number; max: number; step?: number };
  onChange: (groupId: string, type: 'min' | 'max', value: number) => void;
}

function RangeSlider({ groupId, value, range, onChange }: RangeSliderProps) {
  const step = range.step || 1;

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between text-sm text-gray-600">
        <span>Min: {value.min}</span>
        <span>Max: {value.max}</span>
      </div>
      <div className="space-y-2">
        <div className="flex items-center space-x-2">
          <span className="text-xs text-gray-500 w-8">Min</span>
          <input
            type="range"
            min={range.min}
            max={range.max}
            step={step}
            value={value.min}
            onChange={(e) => {
              const newMin = Number(e.target.value);
              if (newMin <= value.max) {
                onChange(groupId, 'min', newMin);
              }
            }}
            className="flex-1 h-2 bg-gray-200 rounded-lg appearance-none cursor-pointer accent-aws-orange"
          />
        </div>
        <div className="flex items-center space-x-2">
          <span className="text-xs text-gray-500 w-8">Max</span>
          <input
            type="range"
            min={range.min}
            max={range.max}
            step={step}
            value={value.max}
            onChange={(e) => {
              const newMax = Number(e.target.value);
              if (newMax >= value.min) {
                onChange(groupId, 'max', newMax);
              }
            }}
            className="flex-1 h-2 bg-gray-200 rounded-lg appearance-none cursor-pointer accent-aws-orange"
          />
        </div>
      </div>
    </div>
  );
}
