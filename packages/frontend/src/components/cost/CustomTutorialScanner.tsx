'use client';

import { useState, useCallback } from 'react';

interface CustomTutorialScannerProps {
  onScan: (url: string) => Promise<void>;
  onClose: () => void;
  loading?: boolean;
}

export function CustomTutorialScanner({
  onScan,
  onClose,
  loading = false,
}: CustomTutorialScannerProps) {
  const [url, setUrl] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [showManualInput, setShowManualInput] = useState(false);
  const [manualResources, setManualResources] = useState<string[]>([]);
  const [newResource, setNewResource] = useState('');

  const validateUrl = (input: string): boolean => {
    try {
      new URL(input);
      return true;
    } catch {
      return false;
    }
  };

  const handleSubmit = useCallback(async () => {
    setError(null);

    if (!url.trim()) {
      setError('Please enter a tutorial URL');
      return;
    }

    if (!validateUrl(url)) {
      setError('Please enter a valid URL');
      return;
    }

    try {
      await onScan(url);
    } catch {
      setError('Failed to scan tutorial. Try manual resource input.');
      setShowManualInput(true);
    }
  }, [url, onScan]);

  const handleAddResource = useCallback(() => {
    if (newResource.trim() && !manualResources.includes(newResource.trim())) {
      setManualResources((prev) => [...prev, newResource.trim()]);
      setNewResource('');
    }
  }, [newResource, manualResources]);

  const handleRemoveResource = useCallback((resource: string) => {
    setManualResources((prev) => prev.filter((r) => r !== resource));
  }, []);

  const handleManualSubmit = useCallback(async () => {
    if (manualResources.length === 0) {
      setError('Please add at least one AWS resource');
      return;
    }

    // For manual input, we'll pass the resources as content
    // The backend will handle this appropriately
    try {
      await onScan(`manual://${manualResources.join(',')}`);
    } catch {
      setError('Failed to analyze resources');
    }
  }, [manualResources, onScan]);

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
      <div className="bg-white rounded-lg shadow-xl w-full max-w-lg mx-4">
        {/* Header */}
        <div className="flex items-center justify-between p-4 border-b border-gray-200">
          <h2 className="text-lg font-semibold text-aws-dark">
            Scan Custom Tutorial
          </h2>
          <button
            onClick={onClose}
            className="p-1 text-gray-400 hover:text-gray-600 transition-colors"
            aria-label="Close"
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* Content */}
        <div className="p-4">
          {!showManualInput ? (
            <>
              <p className="text-sm text-gray-600 mb-4">
                Enter the URL of an AWS tutorial, blog post, or workshop to scan for potential costs.
              </p>

              {/* URL Input */}
              <div className="mb-4">
                <label htmlFor="tutorial-url" className="block text-sm font-medium text-gray-700 mb-1">
                  Tutorial URL
                </label>
                <input
                  id="tutorial-url"
                  type="url"
                  value={url}
                  onChange={(e) => setUrl(e.target.value)}
                  placeholder="https://aws.amazon.com/tutorials/..."
                  className="input-field"
                  disabled={loading}
                />
              </div>

              {/* Supported Sources */}
              <div className="mb-4 p-3 bg-gray-50 rounded-lg">
                <p className="text-xs font-medium text-gray-700 mb-2">Supported sources:</p>
                <div className="flex flex-wrap gap-2">
                  {['AWS Blogs', 'Medium', 'Dev.to', 'GitHub', 'Personal Blogs'].map((source) => (
                    <span
                      key={source}
                      className="text-xs px-2 py-1 bg-white border border-gray-200 rounded"
                    >
                      {source}
                    </span>
                  ))}
                </div>
              </div>

              {/* Error Message */}
              {error && (
                <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded-lg">
                  <p className="text-sm text-red-700">{error}</p>
                  {!showManualInput && (
                    <button
                      onClick={() => setShowManualInput(true)}
                      className="mt-2 text-sm text-red-600 hover:text-red-800 underline"
                    >
                      Try manual resource input instead
                    </button>
                  )}
                </div>
              )}

              {/* Progress Indicator */}
              {loading && (
                <div className="mb-4">
                  <div className="flex items-center gap-3 p-3 bg-blue-50 border border-blue-200 rounded-lg">
                    <svg className="w-5 h-5 text-blue-600 animate-spin" fill="none" viewBox="0 0 24 24">
                      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                    </svg>
                    <div>
                      <p className="text-sm font-medium text-blue-800">Scanning tutorial...</p>
                      <p className="text-xs text-blue-600">Analyzing CloudFormation, Terraform, and CLI commands</p>
                    </div>
                  </div>
                </div>
              )}
            </>
          ) : (
            <>
              <p className="text-sm text-gray-600 mb-4">
                Unable to parse the tutorial automatically. Please manually enter the AWS resources used.
              </p>

              {/* Manual Resource Input */}
              <div className="mb-4">
                <label htmlFor="resource-input" className="block text-sm font-medium text-gray-700 mb-1">
                  Add AWS Resource
                </label>
                <div className="flex gap-2">
                  <input
                    id="resource-input"
                    type="text"
                    value={newResource}
                    onChange={(e) => setNewResource(e.target.value)}
                    onKeyDown={(e) => e.key === 'Enter' && handleAddResource()}
                    placeholder="e.g., EC2 t3.micro, NAT Gateway, RDS db.t3.small"
                    className="input-field flex-1"
                  />
                  <button
                    onClick={handleAddResource}
                    className="btn-secondary"
                    disabled={!newResource.trim()}
                  >
                    Add
                  </button>
                </div>
              </div>

              {/* Resource List */}
              {manualResources.length > 0 && (
                <div className="mb-4">
                  <p className="text-sm font-medium text-gray-700 mb-2">
                    Resources ({manualResources.length})
                  </p>
                  <div className="flex flex-wrap gap-2">
                    {manualResources.map((resource) => (
                      <span
                        key={resource}
                        className="inline-flex items-center gap-1 px-2 py-1 bg-gray-100 text-gray-700 rounded text-sm"
                      >
                        {resource}
                        <button
                          onClick={() => handleRemoveResource(resource)}
                          className="text-gray-400 hover:text-gray-600"
                          aria-label={`Remove ${resource}`}
                        >
                          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                          </svg>
                        </button>
                      </span>
                    ))}
                  </div>
                </div>
              )}

              {/* Common Resources Quick Add */}
              <div className="mb-4 p-3 bg-gray-50 rounded-lg">
                <p className="text-xs font-medium text-gray-700 mb-2">Quick add common resources:</p>
                <div className="flex flex-wrap gap-2">
                  {[
                    'EC2 t3.micro',
                    'NAT Gateway',
                    'ALB',
                    'RDS db.t3.micro',
                    'Lambda',
                    'DynamoDB',
                    'S3',
                    'ECS Fargate',
                  ].map((resource) => (
                    <button
                      key={resource}
                      onClick={() => {
                        if (!manualResources.includes(resource)) {
                          setManualResources((prev) => [...prev, resource]);
                        }
                      }}
                      disabled={manualResources.includes(resource)}
                      className={`text-xs px-2 py-1 rounded border transition-colors ${
                        manualResources.includes(resource)
                          ? 'bg-gray-200 text-gray-400 border-gray-200 cursor-not-allowed'
                          : 'bg-white border-gray-200 hover:border-aws-orange hover:text-aws-orange'
                      }`}
                    >
                      + {resource}
                    </button>
                  ))}
                </div>
              </div>

              {/* Error Message */}
              {error && (
                <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded-lg">
                  <p className="text-sm text-red-700">{error}</p>
                </div>
              )}

              {/* Back to URL Input */}
              <button
                onClick={() => {
                  setShowManualInput(false);
                  setError(null);
                }}
                className="text-sm text-gray-500 hover:text-gray-700 mb-4"
              >
                ← Back to URL input
              </button>
            </>
          )}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-end gap-3 p-4 border-t border-gray-200 bg-gray-50">
          <button onClick={onClose} className="btn-secondary" disabled={loading}>
            Cancel
          </button>
          {!showManualInput ? (
            <button
              onClick={handleSubmit}
              className="btn-primary"
              disabled={loading || !url.trim()}
            >
              {loading ? 'Scanning...' : 'Scan Tutorial'}
            </button>
          ) : (
            <button
              onClick={handleManualSubmit}
              className="btn-primary"
              disabled={loading || manualResources.length === 0}
            >
              {loading ? 'Analyzing...' : 'Analyze Resources'}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
