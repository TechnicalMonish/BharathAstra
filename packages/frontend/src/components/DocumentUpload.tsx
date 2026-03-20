'use client';

import { useState, useCallback, useRef, DragEvent, ChangeEvent } from 'react';
import { LoadingSpinner } from './LoadingSpinner';

// Accepted file extensions
const ACCEPTED_EXTENSIONS = ['.pdf', '.html', '.md', '.txt'];

// AWS service categories for categorization
const CATEGORIES = [
  'Compute',
  'Storage',
  'Database',
  'Networking',
  'Security',
  'Analytics',
  'Machine Learning',
  'Developer Tools',
  'Management',
  'Other',
] as const;

type UploadStatus = 'idle' | 'uploading' | 'indexing' | 'complete' | 'error';

interface DocumentUploadProps {
  onUpload: (file: File, name: string, category: string, onProgress: (progress: number) => void) => Promise<void>;
  onClose: () => void;
  isOpen: boolean;
}

export function DocumentUpload({ onUpload, onClose, isOpen }: DocumentUploadProps) {
  const [dragActive, setDragActive] = useState(false);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [documentName, setDocumentName] = useState('');
  const [category, setCategory] = useState<string>(CATEGORIES[CATEGORIES.length - 1]);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [status, setStatus] = useState<UploadStatus>('idle');
  const [errorMessage, setErrorMessage] = useState('');
  const fileInputRef = useRef<HTMLInputElement>(null);

  const validateFile = useCallback((file: File): boolean => {
    const extension = '.' + file.name.split('.').pop()?.toLowerCase();
    if (!ACCEPTED_EXTENSIONS.includes(extension)) {
      setErrorMessage(`Invalid file type. Accepted: ${ACCEPTED_EXTENSIONS.join(', ')}`);
      return false;
    }
    // Max 50MB
    if (file.size > 50 * 1024 * 1024) {
      setErrorMessage('File size must be less than 50MB');
      return false;
    }
    return true;
  }, []);

  const handleDrag = useCallback((e: DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.stopPropagation();
    if (e.type === 'dragenter' || e.type === 'dragover') {
      setDragActive(true);
    } else if (e.type === 'dragleave') {
      setDragActive(false);
    }
  }, []);

  const handleDrop = useCallback((e: DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.stopPropagation();
    setDragActive(false);
    setErrorMessage('');

    const files = e.dataTransfer.files;
    if (files && files.length > 0) {
      const file = files[0];
      if (validateFile(file)) {
        setSelectedFile(file);
        setDocumentName(file.name.replace(/\.[^/.]+$/, ''));
      }
    }
  }, [validateFile]);

  const handleFileSelect = useCallback((e: ChangeEvent<HTMLInputElement>) => {
    setErrorMessage('');
    const files = e.target.files;
    if (files && files.length > 0) {
      const file = files[0];
      if (validateFile(file)) {
        setSelectedFile(file);
        setDocumentName(file.name.replace(/\.[^/.]+$/, ''));
      }
    }
  }, [validateFile]);

  const handleUpload = useCallback(async () => {
    if (!selectedFile || !documentName.trim()) return;

    try {
      setStatus('uploading');
      setUploadProgress(0);
      
      await onUpload(selectedFile, documentName.trim(), category, (progress) => {
        setUploadProgress(progress);
        if (progress === 100) {
          setStatus('indexing');
        }
      });

      setStatus('complete');
      setTimeout(() => {
        resetForm();
        onClose();
      }, 1500);
    } catch (error) {
      setStatus('error');
      setErrorMessage(error instanceof Error ? error.message : 'Upload failed');
    }
  }, [selectedFile, documentName, category, onUpload, onClose]);

  const resetForm = useCallback(() => {
    setSelectedFile(null);
    setDocumentName('');
    setCategory(CATEGORIES[CATEGORIES.length - 1]);
    setUploadProgress(0);
    setStatus('idle');
    setErrorMessage('');
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  }, []);

  const handleClose = useCallback(() => {
    resetForm();
    onClose();
  }, [resetForm, onClose]);

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm">
      <div className="bg-white rounded-lg shadow-xl w-full max-w-md mx-4 overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-200 bg-gray-50">
          <h2 className="text-lg font-semibold text-aws-dark flex items-center gap-2">
            <svg className="w-5 h-5 text-aws-orange" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12" />
            </svg>
            Upload Document
          </h2>
          <button
            onClick={handleClose}
            className="text-gray-400 hover:text-gray-600 transition-colors"
            aria-label="Close"
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* Content */}
        <div className="p-6">
          {status === 'complete' ? (
            <div className="text-center py-8">
              <div className="w-16 h-16 mx-auto mb-4 rounded-full bg-green-100 flex items-center justify-center">
                <svg className="w-8 h-8 text-green-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                </svg>
              </div>
              <h3 className="text-lg font-medium text-gray-900">Upload Complete!</h3>
              <p className="text-sm text-gray-500 mt-1">Your document has been indexed and is ready to query.</p>
            </div>
          ) : (
            <>
              {/* Dropzone */}
              <div
                onDragEnter={handleDrag}
                onDragLeave={handleDrag}
                onDragOver={handleDrag}
                onDrop={handleDrop}
                onClick={() => fileInputRef.current?.click()}
                className={`
                  relative border-2 border-dashed rounded-lg p-8 text-center cursor-pointer transition-colors
                  ${dragActive ? 'border-aws-orange bg-orange-50' : 'border-gray-300 hover:border-aws-orange hover:bg-gray-50'}
                  ${selectedFile ? 'bg-green-50 border-green-300' : ''}
                `}
              >
                <input
                  ref={fileInputRef}
                  type="file"
                  accept={ACCEPTED_EXTENSIONS.join(',')}
                  onChange={handleFileSelect}
                  className="hidden"
                />
                
                {selectedFile ? (
                  <div className="flex items-center justify-center gap-3">
                    <div className="w-10 h-10 rounded-lg bg-green-100 flex items-center justify-center">
                      <svg className="w-5 h-5 text-green-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                      </svg>
                    </div>
                    <div className="text-left">
                      <p className="text-sm font-medium text-gray-900">{selectedFile.name}</p>
                      <p className="text-xs text-gray-500">{(selectedFile.size / 1024).toFixed(1)} KB</p>
                    </div>
                    <button
                      onClick={(e) => { e.stopPropagation(); setSelectedFile(null); setDocumentName(''); }}
                      className="ml-2 text-gray-400 hover:text-red-500 transition-colors"
                    >
                      <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                      </svg>
                    </button>
                  </div>
                ) : (
                  <>
                    <svg className="w-12 h-12 mx-auto text-gray-400 mb-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12" />
                    </svg>
                    <p className="text-sm text-gray-600 mb-1">
                      <span className="text-aws-orange font-medium">Click to upload</span> or drag and drop
                    </p>
                    <p className="text-xs text-gray-400">PDF, HTML, MD, TXT (max 50MB)</p>
                  </>
                )}
              </div>

              {/* Document Name */}
              {selectedFile && (
                <div className="mt-4">
                  <label htmlFor="doc-name" className="block text-sm font-medium text-gray-700 mb-1">
                    Document Name
                  </label>
                  <input
                    id="doc-name"
                    type="text"
                    value={documentName}
                    onChange={(e) => setDocumentName(e.target.value)}
                    placeholder="Enter document name"
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-aws-orange focus:border-transparent"
                  />
                </div>
              )}

              {/* Category Selection */}
              {selectedFile && (
                <div className="mt-4">
                  <label htmlFor="doc-category" className="block text-sm font-medium text-gray-700 mb-1">
                    Category
                  </label>
                  <select
                    id="doc-category"
                    value={category}
                    onChange={(e) => setCategory(e.target.value)}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-aws-orange focus:border-transparent bg-white"
                  >
                    {CATEGORIES.map((cat) => (
                      <option key={cat} value={cat}>{cat}</option>
                    ))}
                  </select>
                </div>
              )}

              {/* Upload Progress */}
              {(status === 'uploading' || status === 'indexing') && (
                <div className="mt-4">
                  <div className="flex items-center justify-between mb-1">
                    <span className="text-sm text-gray-600">
                      {status === 'uploading' ? 'Uploading...' : 'Indexing document...'}
                    </span>
                    <span className="text-sm text-aws-orange font-medium">
                      {status === 'uploading' ? `${uploadProgress}%` : ''}
                    </span>
                  </div>
                  <div className="w-full bg-gray-200 rounded-full h-2 overflow-hidden">
                    {status === 'uploading' ? (
                      <div
                        className="bg-aws-orange h-full rounded-full transition-all duration-300"
                        style={{ width: `${uploadProgress}%` }}
                      />
                    ) : (
                      <div className="bg-aws-orange h-full rounded-full animate-pulse w-full" />
                    )}
                  </div>
                  {status === 'indexing' && (
                    <div className="flex items-center gap-2 mt-2 text-sm text-gray-500">
                      <LoadingSpinner size="sm" />
                      <span>Processing and indexing content...</span>
                    </div>
                  )}
                </div>
              )}

              {/* Error Message */}
              {errorMessage && (
                <div className="mt-4 p-3 bg-red-50 border border-red-200 rounded-lg">
                  <p className="text-sm text-red-600 flex items-center gap-2">
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                    </svg>
                    {errorMessage}
                  </p>
                </div>
              )}
            </>
          )}
        </div>

        {/* Footer */}
        {status !== 'complete' && (
          <div className="flex items-center justify-end gap-3 px-6 py-4 border-t border-gray-200 bg-gray-50">
            <button
              onClick={handleClose}
              className="px-4 py-2 text-sm font-medium text-gray-700 hover:text-gray-900 transition-colors"
              disabled={status === 'uploading' || status === 'indexing'}
            >
              Cancel
            </button>
            <button
              onClick={handleUpload}
              disabled={!selectedFile || !documentName.trim() || status === 'uploading' || status === 'indexing'}
              className="px-4 py-2 text-sm font-medium text-white bg-aws-orange hover:bg-orange-600 rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
            >
              {(status === 'uploading' || status === 'indexing') && <LoadingSpinner size="sm" color="white" />}
              {status === 'uploading' ? 'Uploading...' : status === 'indexing' ? 'Indexing...' : 'Upload Document'}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

// Delete confirmation dialog for custom uploads
interface DeleteConfirmDialogProps {
  isOpen: boolean;
  documentName: string;
  onConfirm: () => void;
  onCancel: () => void;
  isDeleting?: boolean;
}

export function DeleteConfirmDialog({ isOpen, documentName, onConfirm, onCancel, isDeleting }: DeleteConfirmDialogProps) {
  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm">
      <div className="bg-white rounded-lg shadow-xl w-full max-w-sm mx-4 overflow-hidden">
        <div className="p-6">
          <div className="w-12 h-12 mx-auto mb-4 rounded-full bg-red-100 flex items-center justify-center">
            <svg className="w-6 h-6 text-red-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
            </svg>
          </div>
          <h3 className="text-lg font-medium text-gray-900 text-center mb-2">Delete Document</h3>
          <p className="text-sm text-gray-500 text-center">
            Are you sure you want to delete &quot;{documentName}&quot;? This action cannot be undone.
          </p>
        </div>
        <div className="flex items-center justify-end gap-3 px-6 py-4 border-t border-gray-200 bg-gray-50">
          <button
            onClick={onCancel}
            className="px-4 py-2 text-sm font-medium text-gray-700 hover:text-gray-900 transition-colors"
            disabled={isDeleting}
          >
            Cancel
          </button>
          <button
            onClick={onConfirm}
            disabled={isDeleting}
            className="px-4 py-2 text-sm font-medium text-white bg-red-600 hover:bg-red-700 rounded-lg transition-colors disabled:opacity-50 flex items-center gap-2"
          >
            {isDeleting && <LoadingSpinner size="sm" color="white" />}
            {isDeleting ? 'Deleting...' : 'Delete'}
          </button>
        </div>
      </div>
    </div>
  );
}