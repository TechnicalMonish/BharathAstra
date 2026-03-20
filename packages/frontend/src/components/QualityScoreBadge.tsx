'use client';

interface QualityScoreBadgeProps {
  score: number;
  showLabel?: boolean;
  size?: 'sm' | 'md' | 'lg';
  className?: string;
}

function getScoreColor(score: number): { bg: string; text: string; border: string } {
  if (score >= 8) {
    return { bg: 'bg-green-100', text: 'text-green-800', border: 'border-green-300' };
  } else if (score >= 6) {
    return { bg: 'bg-blue-100', text: 'text-blue-800', border: 'border-blue-300' };
  } else if (score >= 4) {
    return { bg: 'bg-yellow-100', text: 'text-yellow-800', border: 'border-yellow-300' };
  } else if (score >= 2) {
    return { bg: 'bg-orange-100', text: 'text-orange-800', border: 'border-orange-300' };
  } else {
    return { bg: 'bg-red-100', text: 'text-red-800', border: 'border-red-300' };
  }
}

function getScoreLabel(score: number): string {
  if (score >= 8) return 'Excellent';
  if (score >= 6) return 'Good';
  if (score >= 4) return 'Fair';
  if (score >= 2) return 'Poor';
  return 'Very Poor';
}

const sizeClasses = {
  sm: 'text-xs px-1.5 py-0.5',
  md: 'text-sm px-2 py-1',
  lg: 'text-base px-3 py-1.5',
};

export function QualityScoreBadge({
  score,
  showLabel = false,
  size = 'md',
  className = '',
}: QualityScoreBadgeProps) {
  const clampedScore = Math.max(0, Math.min(10, score));
  const displayScore = clampedScore.toFixed(1);
  const colors = getScoreColor(clampedScore);
  const label = getScoreLabel(clampedScore);

  return (
    <span
      className={`inline-flex items-center font-medium rounded-full border ${colors.bg} ${colors.text} ${colors.border} ${sizeClasses[size]} ${className}`}
      title={`Quality Score: ${displayScore}/10 - ${label}`}
      aria-label={`Quality score ${displayScore} out of 10, rated ${label}`}
    >
      <svg
        className={`mr-1 ${size === 'sm' ? 'w-3 h-3' : size === 'md' ? 'w-4 h-4' : 'w-5 h-5'}`}
        fill="currentColor"
        viewBox="0 0 20 20"
      >
        <path d="M9.049 2.927c.3-.921 1.603-.921 1.902 0l1.07 3.292a1 1 0 00.95.69h3.462c.969 0 1.371 1.24.588 1.81l-2.8 2.034a1 1 0 00-.364 1.118l1.07 3.292c.3.921-.755 1.688-1.54 1.118l-2.8-2.034a1 1 0 00-1.175 0l-2.8 2.034c-.784.57-1.838-.197-1.539-1.118l1.07-3.292a1 1 0 00-.364-1.118L2.98 8.72c-.783-.57-.38-1.81.588-1.81h3.461a1 1 0 00.951-.69l1.07-3.292z" />
      </svg>
      <span>{displayScore}</span>
      {showLabel && <span className="ml-1">({label})</span>}
    </span>
  );
}
