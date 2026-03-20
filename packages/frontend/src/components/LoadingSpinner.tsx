'use client';

interface LoadingSpinnerProps {
  size?: 'sm' | 'md' | 'lg' | 'xl';
  color?: 'primary' | 'white' | 'gray';
  label?: string;
  className?: string;
}

const sizeClasses = {
  sm: 'w-4 h-4',
  md: 'w-6 h-6',
  lg: 'w-8 h-8',
  xl: 'w-12 h-12',
};

const colorClasses = {
  primary: 'text-aws-orange',
  white: 'text-white',
  gray: 'text-gray-400',
};

export function LoadingSpinner({
  size = 'md',
  color = 'primary',
  label,
  className = '',
}: LoadingSpinnerProps) {
  return (
    <div
      className={`flex flex-col items-center justify-center ${className}`}
      role="status"
      aria-label={label || 'Loading'}
    >
      <svg
        className={`animate-spin ${sizeClasses[size]} ${colorClasses[color]}`}
        xmlns="http://www.w3.org/2000/svg"
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
      {label && (
        <span className={`mt-2 text-sm ${colorClasses[color]}`}>{label}</span>
      )}
    </div>
  );
}

interface LoadingOverlayProps {
  visible: boolean;
  label?: string;
  blur?: boolean;
}

export function LoadingOverlay({ visible, label, blur = true }: LoadingOverlayProps) {
  if (!visible) return null;

  return (
    <div
      className={`absolute inset-0 flex items-center justify-center bg-white/80 z-50 ${
        blur ? 'backdrop-blur-sm' : ''
      }`}
    >
      <LoadingSpinner size="lg" label={label} />
    </div>
  );
}

interface SkeletonProps {
  className?: string;
  variant?: 'text' | 'circular' | 'rectangular';
  width?: string | number;
  height?: string | number;
}

export function Skeleton({
  className = '',
  variant = 'text',
  width,
  height,
}: SkeletonProps) {
  const baseClasses = 'animate-pulse bg-gray-200';
  
  const variantClasses = {
    text: 'rounded',
    circular: 'rounded-full',
    rectangular: 'rounded-md',
  };

  const style: React.CSSProperties = {};
  if (width) style.width = typeof width === 'number' ? `${width}px` : width;
  if (height) style.height = typeof height === 'number' ? `${height}px` : height;

  return (
    <div
      className={`${baseClasses} ${variantClasses[variant]} ${className}`}
      style={style}
      aria-hidden="true"
    />
  );
}

export function CardSkeleton() {
  return (
    <div className="card animate-pulse">
      <div className="flex items-start space-x-4">
        <Skeleton variant="circular" width={48} height={48} />
        <div className="flex-1 space-y-2">
          <Skeleton variant="text" height={20} className="w-3/4" />
          <Skeleton variant="text" height={16} className="w-1/2" />
        </div>
      </div>
      <div className="mt-4 space-y-2">
        <Skeleton variant="text" height={14} />
        <Skeleton variant="text" height={14} />
        <Skeleton variant="text" height={14} className="w-2/3" />
      </div>
    </div>
  );
}
