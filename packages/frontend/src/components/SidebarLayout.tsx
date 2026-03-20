'use client';

import { useState, ReactNode } from 'react';

interface SidebarLayoutProps {
  sidebar: ReactNode;
  children: ReactNode;
  sidebarTitle?: string;
  defaultOpen?: boolean;
}

export function SidebarLayout({
  sidebar,
  children,
  sidebarTitle = 'Sidebar',
  defaultOpen = true,
}: SidebarLayoutProps) {
  const [isSidebarOpen, setIsSidebarOpen] = useState(defaultOpen);

  return (
    <div className="flex h-[calc(100vh-4rem)]">
      {/* Mobile sidebar toggle */}
      <button
        onClick={() => setIsSidebarOpen(!isSidebarOpen)}
        className="lg:hidden fixed bottom-4 left-4 z-50 bg-aws-orange text-white p-3 rounded-full shadow-lg hover:bg-orange-600 transition-colors"
        aria-label={isSidebarOpen ? 'Close sidebar' : 'Open sidebar'}
      >
        {isSidebarOpen ? (
          <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
          </svg>
        ) : (
          <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" />
          </svg>
        )}
      </button>

      {/* Sidebar */}
      <aside
        className={`${
          isSidebarOpen ? 'translate-x-0' : '-translate-x-full'
        } fixed lg:relative lg:translate-x-0 z-40 w-80 h-full bg-white border-r border-gray-200 transition-transform duration-300 ease-in-out overflow-hidden flex flex-col`}
      >
        <div className="flex items-center justify-between p-4 border-b border-gray-200 bg-gray-50">
          <h2 className="font-semibold text-aws-dark">{sidebarTitle}</h2>
          <button
            onClick={() => setIsSidebarOpen(false)}
            className="lg:hidden text-gray-500 hover:text-gray-700"
            aria-label="Close sidebar"
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>
        <div className="flex-1 overflow-y-auto p-4">{sidebar}</div>
      </aside>

      {/* Overlay for mobile */}
      {isSidebarOpen && (
        <div
          className="fixed inset-0 bg-black bg-opacity-50 z-30 lg:hidden"
          onClick={() => setIsSidebarOpen(false)}
        />
      )}

      {/* Main content */}
      <main className="flex-1 overflow-y-auto bg-gray-50">{children}</main>
    </div>
  );
}
