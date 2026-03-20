'use client';

import { ReactNode } from 'react';

interface EmptyStateProps {
  icon?: ReactNode;
  title: string;
  description?: string;
  action?: {
    label: string;
    onClick: () => void;
  };
  secondaryAction?: {
    label: string;
    onClick: () => void;
  };
  className?: string;
  children?: ReactNode;
}

const defaultIcon = (
  <svg
    className="w-16 h-16 text-gray-300"
    fill="none"
    stroke="currentColor"
    viewBox="0 0 24 24"
  >
    <path
      strokeLinecap="round"
      strokeLinejoin="round"
      strokeWidth={1.5}
      d="M20 13V6a2 2 0 00-2-2H6a2 2 0 00-2 2v7m16 0v5a2 2 0 01-2 2H6a2 2 0 01-2-2v-5m16 0h-2.586a1 1 0 00-.707.293l-2.414 2.414a1 1 0 01-.707.293h-3.172a1 1 0 01-.707-.293l-2.414-2.414A1 1 0 006.586 13H4"
    />
  </svg>
);

export function EmptyState({
  icon = defaultIcon,
  title,
  description,
  action,
  secondaryAction,
  className = '',
  children,
}: EmptyStateProps) {
  return (
    <div
      className={`flex flex-col items-center justify-center py-12 px-4 text-center ${className}`}
    >
      <div className="mb-4">{icon}</div>
      <h3 className="text-lg font-medium text-gray-900 mb-2">{title}</h3>
      {description && (
        <p className="text-sm text-gray-500 max-w-sm mb-6">{description}</p>
      )}
      {(action || secondaryAction) && (
        <div className="flex flex-col sm:flex-row items-center space-y-2 sm:space-y-0 sm:space-x-3">
          {action && (
            <button onClick={action.onClick} className="btn-primary">
              {action.label}
            </button>
          )}
          {secondaryAction && (
            <button onClick={secondaryAction.onClick} className="btn-secondary">
              {secondaryAction.label}
            </button>
          )}
        </div>
      )}
      {children}
    </div>
  );
}

export function NoResultsState({
  searchTerm,
  suggestions,
  onSuggestionClick,
  onClearSearch,
}: {
  searchTerm?: string;
  suggestions?: string[];
  onSuggestionClick?: (suggestion: string) => void;
  onClearSearch?: () => void;
}) {
  return (
    <EmptyState
      icon={
        <svg
          className="w-16 h-16 text-gray-300"
          fill="none"
          stroke="currentColor"
          viewBox="0 0 24 24"
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={1.5}
            d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"
          />
        </svg>
      }
      title={searchTerm ? `No results for "${searchTerm}"` : 'No results found'}
      description="Try adjusting your search or filters to find what you're looking for."
      action={onClearSearch ? { label: 'Clear search', onClick: onClearSearch } : undefined}
    >
      {suggestions && suggestions.length > 0 && (
        <div className="mt-4">
          <p className="text-sm text-gray-500 mb-2">Try searching for:</p>
          <div className="flex flex-wrap justify-center gap-2">
            {suggestions.map((suggestion) => (
              <button
                key={suggestion}
                onClick={() => onSuggestionClick?.(suggestion)}
                className="text-sm text-aws-orange hover:text-orange-600 bg-orange-50 hover:bg-orange-100 px-3 py-1 rounded-full transition-colors"
              >
                {suggestion}
              </button>
            ))}
          </div>
        </div>
      )}
    </EmptyState>
  );
}

export function ErrorState({
  title = 'Something went wrong',
  description,
  onRetry,
}: {
  title?: string;
  description?: string;
  onRetry?: () => void;
}) {
  return (
    <EmptyState
      icon={
        <svg
          className="w-16 h-16 text-red-300"
          fill="none"
          stroke="currentColor"
          viewBox="0 0 24 24"
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={1.5}
            d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"
          />
        </svg>
      }
      title={title}
      description={description || 'An error occurred while loading the content. Please try again.'}
      action={onRetry ? { label: 'Try again', onClick: onRetry } : undefined}
    />
  );
}

export function LoadingState({ message = 'Loading...' }: { message?: string }) {
  return (
    <div className="flex flex-col items-center justify-center py-12 px-4">
      <svg
        className="w-12 h-12 text-aws-orange animate-spin mb-4"
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
      <p className="text-sm text-gray-500">{message}</p>
    </div>
  );
}
