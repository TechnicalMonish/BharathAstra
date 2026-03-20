import type { Metadata } from 'next';
import { Navigation } from '@/components/Navigation';
import { ToastProvider } from '@/components/Toast';
import './globals.css';

export const metadata: Metadata = {
  title: 'AWS Developer Intelligence Platform',
  description: 'Documentation Navigator, Blog Aggregator, and Cost Predictor',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className="min-h-screen bg-gray-50">
        <ToastProvider>
          <Navigation />
          {children}
        </ToastProvider>
      </body>
    </html>
  );
}
