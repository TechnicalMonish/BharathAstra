'use client';

import Link from 'next/link';

export type ToolType = 'docs' | 'blog' | 'cost';

interface CrossToolLinkProps {
  /** Target tool to link to */
  tool: ToolType;
  /** AWS service name to search/query for */
  service?: string;
  /** Search query or question */
  query?: string;
  /** Workshop ID for cost predictor */
  workshopId?: string;
  /** Custom label (defaults to tool name) */
  label?: string;
  /** Additional CSS classes */
  className?: string;
  /** Render as inline link or button */
  variant?: 'link' | 'button' | 'chip';
  /** Children to render (overrides label) */
  children?: React.ReactNode;
}

// Tool configurations
const toolConfig: Record<ToolType, { name: string; basePath: string; icon: React.ReactNode; color: string }> = {
  docs: {
    name: 'Documentation',
    basePath: '/docs',
    icon: (
      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
      </svg>
    ),
    color: 'blue',
  },
  blog: {
    name: 'Blog Search',
    basePath: '/blog',
    icon: (
      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
      </svg>
    ),
    color: 'purple',
  },
  cost: {
    name: 'Cost Predictor',
    basePath: '/cost',
    icon: (
      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
      </svg>
    ),
    color: 'green',
  },
};

/**
 * CrossToolLink - Navigate between platform tools with context
 * 
 * Examples:
 * - From blog result to docs: <CrossToolLink tool="docs" service="Lambda" />
 * - From docs to blog search: <CrossToolLink tool="blog" query="Lambda best practices" />
 * - From blog to cost predictor: <CrossToolLink tool="cost" workshopId="serverless-web-app" />
 */
export function CrossToolLink({
  tool,
  service,
  query,
  workshopId,
  label,
  className = '',
  variant = 'link',
  children,
}: CrossToolLinkProps) {
  const config = toolConfig[tool];
  
  // Build the URL with query parameters
  const buildUrl = (): string => {
    const params = new URLSearchParams();
    
    if (service) {
      params.set('service', service);
    }
    if (query) {
      params.set('q', query);
    }
    if (workshopId) {
      params.set('workshop', workshopId);
    }
    
    const queryString = params.toString();
    return queryString ? `${config.basePath}?${queryString}` : config.basePath;
  };

  const url = buildUrl();
  const displayLabel = label || (service ? `View ${service} ${config.name}` : config.name);

  // Use Tailwind-safe classes (dynamic class names don't work with Tailwind purge)
  const getVariantClass = () => {
    switch (variant) {
      case 'button':
        return `inline-flex items-center gap-2 px-3 py-1.5 rounded-lg transition-colors border ${
          config.color === 'blue' ? 'bg-blue-50 text-blue-700 border-blue-200 hover:bg-blue-100' :
          config.color === 'purple' ? 'bg-purple-50 text-purple-700 border-purple-200 hover:bg-purple-100' :
          'bg-green-50 text-green-700 border-green-200 hover:bg-green-100'
        }`;
      case 'chip':
        return `inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium transition-colors ${
          config.color === 'blue' ? 'bg-blue-100 text-blue-700 hover:bg-blue-200' :
          config.color === 'purple' ? 'bg-purple-100 text-purple-700 hover:bg-purple-200' :
          'bg-green-100 text-green-700 hover:bg-green-200'
        }`;
      default:
        return `inline-flex items-center gap-1 hover:underline ${
          config.color === 'blue' ? 'text-blue-600 hover:text-blue-800' :
          config.color === 'purple' ? 'text-purple-600 hover:text-purple-800' :
          'text-green-600 hover:text-green-800'
        }`;
    }
  };

  return (
    <Link
      href={url}
      className={`${getVariantClass()} ${className}`}
      title={`Go to ${config.name}${service ? ` for ${service}` : ''}`}
    >
      {config.icon}
      {children || <span>{displayLabel}</span>}
    </Link>
  );
}

/**
 * ServiceLink - Quick link to view documentation for an AWS service
 */
export function ServiceLink({
  service,
  className = '',
}: {
  service: string;
  className?: string;
}) {
  return (
    <CrossToolLink
      tool="docs"
      service={service}
      variant="chip"
      className={className}
    >
      {service}
    </CrossToolLink>
  );
}

/**
 * RelatedToolsPanel - Show links to related tools for a given context
 */
export function RelatedToolsPanel({
  service,
  query,
  workshopId,
  currentTool,
  className = '',
}: {
  service?: string;
  query?: string;
  workshopId?: string;
  currentTool: ToolType;
  className?: string;
}) {
  const otherTools = (['docs', 'blog', 'cost'] as ToolType[]).filter(t => t !== currentTool);

  return (
    <div className={`flex flex-wrap gap-2 ${className}`}>
      <span className="text-xs text-gray-500 mr-1">Related:</span>
      {otherTools.map((tool) => (
        <CrossToolLink
          key={tool}
          tool={tool}
          service={service}
          query={query}
          workshopId={workshopId}
          variant="chip"
        />
      ))}
    </div>
  );
}

export default CrossToolLink;
