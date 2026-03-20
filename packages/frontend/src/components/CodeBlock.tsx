'use client';

import { useState, useCallback } from 'react';
import { Highlight, themes } from 'prism-react-renderer';

interface CodeBlockProps {
  code: string;
  language?: string;
  title?: string;
  showLineNumbers?: boolean;
  highlightLines?: number[];
  className?: string;
}

const languageMap: Record<string, string> = {
  js: 'javascript',
  ts: 'typescript',
  py: 'python',
  rb: 'ruby',
  yml: 'yaml',
  sh: 'bash',
  shell: 'bash',
  tf: 'hcl',
  terraform: 'hcl',
};

function normalizeLanguage(lang: string): string {
  const lower = lang.toLowerCase();
  return languageMap[lower] || lower;
}

export function CodeBlock({
  code,
  language = 'text',
  title,
  showLineNumbers = true,
  highlightLines = [],
  className = '',
}: CodeBlockProps) {
  const [copied, setCopied] = useState(false);
  const normalizedLanguage = normalizeLanguage(language);
  const trimmedCode = code.trim();

  const handleCopy = useCallback(async () => {
    try {
      await navigator.clipboard.writeText(trimmedCode);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch (err) {
      console.error('Failed to copy code:', err);
    }
  }, [trimmedCode]);

  return (
    <div className={`rounded-lg overflow-hidden border border-gray-200 ${className}`}>
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-2 bg-gray-800 border-b border-gray-700">
        <div className="flex items-center space-x-2">
          <div className="flex space-x-1.5">
            <div className="w-3 h-3 rounded-full bg-red-500" />
            <div className="w-3 h-3 rounded-full bg-yellow-500" />
            <div className="w-3 h-3 rounded-full bg-green-500" />
          </div>
          {title && <span className="text-sm text-gray-400 ml-2">{title}</span>}
          <span className="text-xs text-gray-500 bg-gray-700 px-2 py-0.5 rounded">
            {normalizedLanguage}
          </span>
        </div>
        <button
          onClick={handleCopy}
          className="flex items-center space-x-1 text-gray-400 hover:text-white transition-colors text-sm"
          aria-label={copied ? 'Copied!' : 'Copy code'}
        >
          {copied ? (
            <>
              <svg className="w-4 h-4 text-green-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
              </svg>
              <span className="text-green-400">Copied!</span>
            </>
          ) : (
            <>
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" />
              </svg>
              <span>Copy</span>
            </>
          )}
        </button>
      </div>

      {/* Code content */}
      <Highlight theme={themes.nightOwl} code={trimmedCode} language={normalizedLanguage as any}>
        {({ className: highlightClassName, style, tokens, getLineProps, getTokenProps }) => (
          <pre
            className={`${highlightClassName} overflow-x-auto p-4 text-sm`}
            style={{ ...style, margin: 0 }}
          >
            {tokens.map((line, lineIndex) => {
              const lineNumber = lineIndex + 1;
              const isHighlighted = highlightLines.includes(lineNumber);
              const lineProps = getLineProps({ line, key: lineIndex });

              return (
                <div
                  key={lineIndex}
                  {...lineProps}
                  className={`${lineProps.className || ''} ${
                    isHighlighted ? 'bg-yellow-500/20 -mx-4 px-4' : ''
                  }`}
                >
                  {showLineNumbers && (
                    <span className="inline-block w-8 text-gray-500 text-right mr-4 select-none">
                      {lineNumber}
                    </span>
                  )}
                  {line.map((token, tokenIndex) => (
                    <span key={tokenIndex} {...getTokenProps({ token, key: tokenIndex })} />
                  ))}
                </div>
              );
            })}
          </pre>
        )}
      </Highlight>
    </div>
  );
}
