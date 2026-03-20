'use client';

import { useState, useCallback } from 'react';

export interface BlogFilters {
  freeTierOnly: boolean;
  recencyRange: string | null;
  difficultyLevels: string[];
  techStacks: string[];
  implementationTimeRange: { min: number; max: number };
  focusAreas: string[];
  sources: string[];
}

export function getDefaultFilters(): BlogFilters {
  return {
    freeTierOnly: false,
    recencyRange: null,
    difficultyLevels: [],
    techStacks: [],
    implementationTimeRange: { min: 0, max: 480 },
    focusAreas: [],
    sources: [],
  };
}

interface BlogFilterSidebarProps {
  filters: BlogFilters;
  onChange: (filters: BlogFilters) => void;
  onReset: () => void;
  activeCount: number;
}

const RECENCY_OPTIONS = [
  { value: 'last_week', label: 'Last week' },
  { value: 'last_month', label: 'Last month' },
  { value: 'last_3_months', label: 'Last 3 months' },
  { value: 'last_6_months', label: 'Last 6 months' },
  { value: 'last_year', label: 'Last year' },
];

const DIFFICULTY_OPTIONS = [
  { value: 'beginner', label: 'Beginner' },
  { value: 'intermediate', label: 'Intermediate' },
  { value: 'advanced', label: 'Advanced' },
];

const TECH_STACK_OPTIONS = [
  { value: 'python', label: 'Python' },
  { value: 'javascript', label: 'JavaScript' },
  { value: 'typescript', label: 'TypeScript' },
  { value: 'java', label: 'Java' },
  { value: 'go', label: 'Go' },
  { value: 'rust', label: 'Rust' },
  { value: 'csharp', label: 'C#' },
  { value: 'terraform', label: 'Terraform' },
  { value: 'cloudformation', label: 'CloudFormation' },
  { value: 'cdk', label: 'AWS CDK' },
];

const FOCUS_AREA_OPTIONS = [
  { value: 'serverless', label: 'Serverless' },
  { value: 'containers', label: 'Containers' },
  { value: 'machine-learning', label: 'Machine Learning' },
  { value: 'security', label: 'Security' },
  { value: 'networking', label: 'Networking' },
  { value: 'database', label: 'Database' },
  { value: 'devops', label: 'DevOps' },
  { value: 'cost-optimization', label: 'Cost Optimization' },
  { value: 'architecture', label: 'Architecture' },
  { value: 'migration', label: 'Migration' },
];

const SOURCE_OPTIONS = [
  { value: 'aws_blog', label: 'AWS Blog', icon: '🔶' },
  { value: 'aws_docs', label: 'AWS Docs', icon: '📄' },
  { value: 'aws_whitepapers', label: 'Whitepapers', icon: '📋' },
  { value: 'reddit', label: 'Reddit', icon: '🔴' },
  { value: 'hackernews', label: 'HackerNews', icon: '🟠' },
  { value: 'medium', label: 'Medium', icon: '🟢' },
  { value: 'devto', label: 'Dev.to', icon: '🟣' },
  { value: 'github', label: 'GitHub', icon: '⚫' },
  { value: 'youtube', label: 'YouTube', icon: '▶️' },
  { value: 'twitter', label: 'StackOverflow', icon: '🟡' },
];

export function BlogFilterSidebar({
  filters,
  onChange,
  onReset,
  activeCount,
}: BlogFilterSidebarProps) {
  const [expandedSections, setExpandedSections] = useState<Set<string>>(
    new Set(['freeTier', 'recency', 'difficulty', 'techStack', 'time', 'focusArea', 'sources'])
  );

  const toggleSection = useCallback((section: string) => {
    setExpandedSections((prev) => {
      const next = new Set(prev);
      if (next.has(section)) {
        next.delete(section);
      } else {
        next.add(section);
      }
      return next;
    });
  }, []);

  const handleFreeTierChange = useCallback(
    (checked: boolean) => {
      onChange({ ...filters, freeTierOnly: checked });
    },
    [filters, onChange]
  );

  const handleRecencyChange = useCallback(
    (value: string) => {
      onChange({
        ...filters,
        recencyRange: value === filters.recencyRange ? null : value,
      });
    },
    [filters, onChange]
  );

  const handleDifficultyChange = useCallback(
    (value: string, checked: boolean) => {
      const newLevels = checked
        ? [...filters.difficultyLevels, value]
        : filters.difficultyLevels.filter((l) => l !== value);
      onChange({ ...filters, difficultyLevels: newLevels });
    },
    [filters, onChange]
  );

  const handleTechStackChange = useCallback(
    (value: string, checked: boolean) => {
      const newStacks = checked
        ? [...filters.techStacks, value]
        : filters.techStacks.filter((s) => s !== value);
      onChange({ ...filters, techStacks: newStacks });
    },
    [filters, onChange]
  );

  const handleTimeRangeChange = useCallback(
    (type: 'min' | 'max', value: number) => {
      const newRange = { ...filters.implementationTimeRange, [type]: value };
      if (type === 'min' && value > newRange.max) return;
      if (type === 'max' && value < newRange.min) return;
      onChange({ ...filters, implementationTimeRange: newRange });
    },
    [filters, onChange]
  );

  const handleFocusAreaToggle = useCallback(
    (value: string) => {
      const newAreas = filters.focusAreas.includes(value)
        ? filters.focusAreas.filter((a) => a !== value)
        : [...filters.focusAreas, value];
      onChange({ ...filters, focusAreas: newAreas });
    },
    [filters, onChange]
  );

  const handleSourceToggle = useCallback(
    (value: string) => {
      const newSources = filters.sources.includes(value)
        ? filters.sources.filter((s) => s !== value)
        : [...filters.sources, value];
      onChange({ ...filters, sources: newSources });
    },
    [filters, onChange]
  );

  return (
    <div className="h-full flex flex-col">
      {/* Header */}
      <div className="p-4 border-b border-gray-200 bg-gray-50">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <svg className="w-5 h-5 text-gray-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 4a1 1 0 011-1h16a1 1 0 011 1v2.586a1 1 0 01-.293.707l-6.414 6.414a1 1 0 00-.293.707V17l-4 4v-6.586a1 1 0 00-.293-.707L3.293 7.293A1 1 0 013 6.586V4z" />
            </svg>
            <h2 className="font-semibold text-aws-dark">Filters</h2>
            {activeCount > 0 && (
              <span className="bg-aws-orange text-white text-xs px-2 py-0.5 rounded-full">
                {activeCount}
              </span>
            )}
          </div>
          {activeCount > 0 && (
            <button
              onClick={onReset}
              className="text-sm text-aws-orange hover:text-orange-600 transition-colors"
            >
              Clear all
            </button>
          )}
        </div>
      </div>

      {/* Filter Sections */}
      <div className="flex-1 overflow-y-auto divide-y divide-gray-100">
        {/* Free Tier Toggle */}
        <FilterSection
          title="Free Tier"
          expanded={expandedSections.has('freeTier')}
          onToggle={() => toggleSection('freeTier')}
        >
          <label className="flex items-center gap-3 cursor-pointer">
            <div className="relative">
              <input
                type="checkbox"
                checked={filters.freeTierOnly}
                onChange={(e) => handleFreeTierChange(e.target.checked)}
                className="sr-only"
              />
              <div
                className={`w-10 h-6 rounded-full transition-colors ${
                  filters.freeTierOnly ? 'bg-aws-orange' : 'bg-gray-300'
                }`}
              >
                <div
                  className={`absolute top-1 w-4 h-4 bg-white rounded-full transition-transform ${
                    filters.freeTierOnly ? 'translate-x-5' : 'translate-x-1'
                  }`}
                />
              </div>
            </div>
            <span className="text-sm text-gray-700">Free tier compatible only</span>
          </label>
        </FilterSection>

        {/* Sources / Blog Categories */}
        <FilterSection
          title="Sources"
          expanded={expandedSections.has('sources')}
          onToggle={() => toggleSection('sources')}
          badge={filters.sources.length > 0 ? filters.sources.length : undefined}
        >
          <div className="space-y-2 max-h-64 overflow-y-auto">
            {SOURCE_OPTIONS.map((option) => (
              <label key={option.value} className="flex items-center gap-2 cursor-pointer">
                <input
                  type="checkbox"
                  checked={filters.sources.includes(option.value)}
                  onChange={() => handleSourceToggle(option.value)}
                  className="w-4 h-4 text-aws-orange border-gray-300 rounded focus:ring-aws-orange"
                />
                <span className="text-sm">{option.icon}</span>
                <span className="text-sm text-gray-700">{option.label}</span>
              </label>
            ))}
          </div>
        </FilterSection>

        {/* Recency Range */}
        <FilterSection
          title="Recency"
          expanded={expandedSections.has('recency')}
          onToggle={() => toggleSection('recency')}
        >
          <div className="space-y-1">
            {RECENCY_OPTIONS.map((option) => (
              <button
                key={option.value}
                onClick={() => handleRecencyChange(option.value)}
                className={`w-full text-left px-3 py-2 text-sm rounded transition-colors ${
                  filters.recencyRange === option.value
                    ? 'bg-aws-orange text-white'
                    : 'text-gray-700 hover:bg-gray-100'
                }`}
              >
                {option.label}
              </button>
            ))}
          </div>
        </FilterSection>

        {/* Difficulty Level */}
        <FilterSection
          title="Difficulty"
          expanded={expandedSections.has('difficulty')}
          onToggle={() => toggleSection('difficulty')}
        >
          <div className="space-y-2">
            {DIFFICULTY_OPTIONS.map((option) => (
              <label key={option.value} className="flex items-center gap-2 cursor-pointer">
                <input
                  type="checkbox"
                  checked={filters.difficultyLevels.includes(option.value)}
                  onChange={(e) => handleDifficultyChange(option.value, e.target.checked)}
                  className="w-4 h-4 text-aws-orange border-gray-300 rounded focus:ring-aws-orange"
                />
                <span className="text-sm text-gray-700">{option.label}</span>
              </label>
            ))}
          </div>
        </FilterSection>

        {/* Tech Stack Multi-Select */}
        <FilterSection
          title="Tech Stack"
          expanded={expandedSections.has('techStack')}
          onToggle={() => toggleSection('techStack')}
          badge={filters.techStacks.length > 0 ? filters.techStacks.length : undefined}
        >
          <div className="space-y-2 max-h-48 overflow-y-auto">
            {TECH_STACK_OPTIONS.map((option) => (
              <label key={option.value} className="flex items-center gap-2 cursor-pointer">
                <input
                  type="checkbox"
                  checked={filters.techStacks.includes(option.value)}
                  onChange={(e) => handleTechStackChange(option.value, e.target.checked)}
                  className="w-4 h-4 text-aws-orange border-gray-300 rounded focus:ring-aws-orange"
                />
                <span className="text-sm text-gray-700">{option.label}</span>
              </label>
            ))}
          </div>
        </FilterSection>

        {/* Implementation Time Range */}
        <FilterSection
          title="Implementation Time"
          expanded={expandedSections.has('time')}
          onToggle={() => toggleSection('time')}
        >
          <div className="space-y-4">
            <div className="flex items-center justify-between text-sm text-gray-600">
              <span>{formatTime(filters.implementationTimeRange.min)}</span>
              <span>{formatTime(filters.implementationTimeRange.max)}</span>
            </div>
            <div className="space-y-3">
              <div className="flex items-center gap-2">
                <span className="text-xs text-gray-500 w-8">Min</span>
                <input
                  type="range"
                  min={0}
                  max={480}
                  step={15}
                  value={filters.implementationTimeRange.min}
                  onChange={(e) => handleTimeRangeChange('min', Number(e.target.value))}
                  className="flex-1 h-2 bg-gray-200 rounded-lg appearance-none cursor-pointer accent-aws-orange"
                />
              </div>
              <div className="flex items-center gap-2">
                <span className="text-xs text-gray-500 w-8">Max</span>
                <input
                  type="range"
                  min={0}
                  max={480}
                  step={15}
                  value={filters.implementationTimeRange.max}
                  onChange={(e) => handleTimeRangeChange('max', Number(e.target.value))}
                  className="flex-1 h-2 bg-gray-200 rounded-lg appearance-none cursor-pointer accent-aws-orange"
                />
              </div>
            </div>
          </div>
        </FilterSection>

        {/* Focus Area Tags */}
        <FilterSection
          title="Focus Area"
          expanded={expandedSections.has('focusArea')}
          onToggle={() => toggleSection('focusArea')}
          badge={filters.focusAreas.length > 0 ? filters.focusAreas.length : undefined}
        >
          <div className="flex flex-wrap gap-2">
            {FOCUS_AREA_OPTIONS.map((option) => (
              <button
                key={option.value}
                onClick={() => handleFocusAreaToggle(option.value)}
                className={`px-3 py-1 text-xs rounded-full transition-colors ${
                  filters.focusAreas.includes(option.value)
                    ? 'bg-aws-orange text-white'
                    : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                }`}
              >
                {option.label}
              </button>
            ))}
          </div>
        </FilterSection>
      </div>
    </div>
  );
}

// Filter Section Component
interface FilterSectionProps {
  title: string;
  expanded: boolean;
  onToggle: () => void;
  badge?: number;
  children: React.ReactNode;
}

function FilterSection({ title, expanded, onToggle, badge, children }: FilterSectionProps) {
  return (
    <div className="p-4">
      <button
        onClick={onToggle}
        className="flex items-center justify-between w-full text-left"
      >
        <div className="flex items-center gap-2">
          <span className="font-medium text-gray-700">{title}</span>
          {badge !== undefined && (
            <span className="bg-aws-orange text-white text-xs px-1.5 py-0.5 rounded-full">
              {badge}
            </span>
          )}
        </div>
        <svg
          className={`w-4 h-4 text-gray-500 transition-transform ${expanded ? 'rotate-180' : ''}`}
          fill="none"
          stroke="currentColor"
          viewBox="0 0 24 24"
        >
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
        </svg>
      </button>
      {expanded && <div className="mt-3">{children}</div>}
    </div>
  );
}

// Helper function to format time
function formatTime(minutes: number): string {
  if (minutes === 0) return '0 min';
  if (minutes < 60) return `${minutes} min`;
  const hours = Math.floor(minutes / 60);
  const mins = minutes % 60;
  if (mins === 0) return `${hours}h`;
  return `${hours}h ${mins}m`;
}
