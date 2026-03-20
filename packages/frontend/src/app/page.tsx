'use client';

import Link from 'next/link';
import { useState, useEffect } from 'react';

// Tool card data
const tools = [
  {
    id: 'docs',
    name: 'Documentation Navigator',
    description: 'Smart, surgical documentation guidance with pre-integrated AWS official docs, custom doc uploads, and highlighted answer extraction.',
    icon: (
      <svg className="w-12 h-12" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
      </svg>
    ),
    href: '/docs',
    color: 'from-blue-500 to-blue-600',
    bgColor: 'bg-blue-50',
    borderColor: 'border-blue-200',
    features: [
      'Pre-integrated AWS documentation',
      'Natural language questions',
      'Highlighted answer extraction',
      'Code example extraction',
    ],
    stats: { label: 'Docs indexed', value: '200+' },
  },
  {
    id: 'blog',
    name: 'Blog Aggregator',
    description: 'Find signal in the noise by searching across all AWS content sources and intelligently ranking by impact, applicability, and freshness.',
    icon: (
      <svg className="w-12 h-12" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M19 20H5a2 2 0 01-2-2V6a2 2 0 012-2h10a2 2 0 012 2v1m2 13a2 2 0 01-2-2V7m2 13a2 2 0 002-2V9a2 2 0 00-2-2h-2m-4-3H9M7 16h6M7 8h6v4H7V8z" />
      </svg>
    ),
    href: '/blog',
    color: 'from-purple-500 to-purple-600',
    bgColor: 'bg-purple-50',
    borderColor: 'border-purple-200',
    features: [
      '11+ content sources',
      'Quality-based ranking',
      'Conflict detection',
      'Trend analysis',
    ],
    stats: { label: 'Sources', value: '11+' },
  },
  {
    id: 'cost',
    name: 'Cost Predictor',
    description: 'Prevent surprise AWS bills with pre-integrated workshops, detailed cost reports, resource tracking, and cleanup script generation.',
    icon: (
      <svg className="w-12 h-12" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
      </svg>
    ),
    href: '/cost',
    color: 'from-green-500 to-green-600',
    bgColor: 'bg-green-50',
    borderColor: 'border-green-200',
    features: [
      '500+ AWS workshops',
      'Hidden cost detection',
      'Resource tracking',
      'Cleanup scripts',
    ],
    stats: { label: 'Workshops', value: '500+' },
  },
];

// Quick stats for the platform
const platformStats = [
  { label: 'Research time saved', value: '2hrs → 15min', icon: '⏱️' },
  { label: 'Content sources', value: '11+', icon: '📚' },
  { label: 'Typical savings', value: '$50-200/mo', icon: '💰' },
];

export default function Home() {
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  return (
    <main className="min-h-screen bg-gradient-to-b from-gray-50 to-white">
      {/* Hero Section */}
      <section className="relative overflow-hidden">
        <div className="absolute inset-0 bg-gradient-to-br from-aws-dark/5 via-transparent to-aws-orange/5" />
        <div className="absolute top-0 right-0 w-1/2 h-1/2 bg-gradient-to-bl from-aws-orange/10 to-transparent rounded-full blur-3xl" />
        
        <div className="relative max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 pt-16 pb-12">
          <div className="text-center">
            <div className="flex justify-center mb-6">
              <div className="p-4 bg-aws-dark rounded-2xl shadow-lg">
                <svg className="w-16 h-16 text-aws-orange" fill="currentColor" viewBox="0 0 24 24">
                  <path d="M12 2L2 7l10 5 10-5-10-5zM2 17l10 5 10-5M2 12l10 5 10-5" />
                </svg>
              </div>
            </div>

            <h1 className="text-4xl sm:text-5xl lg:text-6xl font-bold text-aws-dark mb-4">
              AWS Developer Intelligence
              <span className="block text-aws-orange">Platform</span>
            </h1>

            <p className="text-lg sm:text-xl text-gray-600 max-w-3xl mx-auto mb-8">
              Cut documentation research from 2 hours to 15 minutes. Find proven solutions in minutes.
              Prevent surprise bills that cost $50-200/month.
            </p>

            <div className="flex flex-wrap justify-center gap-6 mb-12">
              {platformStats.map((stat) => (
                <div
                  key={stat.label}
                  className={`flex items-center gap-3 px-6 py-3 bg-white rounded-full shadow-md border border-gray-100 transition-all duration-300 ${
                    mounted ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-4'
                  }`}
                >
                  <span className="text-2xl">{stat.icon}</span>
                  <div className="text-left">
                    <div className="text-sm text-gray-500">{stat.label}</div>
                    <div className="font-bold text-aws-dark">{stat.value}</div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </section>

      {/* Tools Section */}
      <section className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 pb-16">
        <div className="text-center mb-12">
          <h2 className="text-2xl sm:text-3xl font-bold text-aws-dark mb-4">
            Three Intelligent Tools
          </h2>
          <p className="text-gray-600 max-w-2xl mx-auto">
            Each tool is designed to solve a specific pain point in AWS development.
            Use them together for maximum productivity.
          </p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-6 lg:gap-8">
          {tools.map((tool, index) => (
            <Link
              key={tool.id}
              href={tool.href}
              className={`group relative bg-white rounded-2xl shadow-lg border-2 ${tool.borderColor} overflow-hidden transition-all duration-300 hover:shadow-xl hover:-translate-y-1 ${
                mounted ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-8'
              }`}
              style={{ transitionDelay: `${index * 100}ms` }}
            >
              <div className={`h-2 bg-gradient-to-r ${tool.color}`} />

              <div className="p-6">
                <div className="flex items-start justify-between mb-4">
                  <div className={`p-3 ${tool.bgColor} rounded-xl text-gray-700 group-hover:scale-110 transition-transform`}>
                    {tool.icon}
                  </div>
                  <div className="text-right">
                    <div className="text-2xl font-bold text-aws-dark">{tool.stats.value}</div>
                    <div className="text-xs text-gray-500">{tool.stats.label}</div>
                  </div>
                </div>

                <h3 className="text-xl font-bold text-aws-dark mb-2 group-hover:text-aws-orange transition-colors">
                  {tool.name}
                </h3>
                <p className="text-gray-600 text-sm mb-4 line-clamp-2">
                  {tool.description}
                </p>

                <ul className="space-y-2 mb-4">
                  {tool.features.map((feature) => (
                    <li key={feature} className="flex items-center gap-2 text-sm text-gray-600">
                      <svg className="w-4 h-4 text-green-500 flex-shrink-0" fill="currentColor" viewBox="0 0 20 20">
                        <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                      </svg>
                      {feature}
                    </li>
                  ))}
                </ul>

                <div className="flex items-center text-aws-orange font-medium group-hover:gap-3 gap-2 transition-all">
                  <span>Get started</span>
                  <svg className="w-5 h-5 group-hover:translate-x-1 transition-transform" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 8l4 4m0 0l-4 4m4-4H3" />
                  </svg>
                </div>
              </div>
            </Link>
          ))}
        </div>
      </section>

      {/* Cross-Tool Integration Section */}
      <section className="bg-aws-dark text-white py-16">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center mb-12">
            <h2 className="text-2xl sm:text-3xl font-bold mb-4">
              Seamless Integration
            </h2>
            <p className="text-gray-300 max-w-2xl mx-auto">
              Our tools work together to provide a complete AWS development experience.
              Jump between tools with context preserved.
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            <IntegrationCard
              from="Blog Aggregator"
              to="Documentation Navigator"
              description="Found an interesting article about Lambda? Jump to the official docs for the mentioned AWS service."
              icon="📚"
            />
            <IntegrationCard
              from="Cost Predictor"
              to="Blog Aggregator"
              description="Scanning a workshop? Find related tutorials and best practices from the community."
              icon="🔍"
            />
            <IntegrationCard
              from="Documentation Navigator"
              to="Cost Predictor"
              description="Reading about a new service? Check the cost implications before you deploy."
              icon="💰"
            />
          </div>
        </div>
      </section>

      {/* Quick Start Section */}
      <section className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-16">
        <div className="bg-gradient-to-r from-aws-orange/10 to-orange-100 rounded-2xl p-8 md:p-12">
          <div className="flex flex-col md:flex-row items-center justify-between gap-6">
            <div>
              <h2 className="text-2xl sm:text-3xl font-bold text-aws-dark mb-2">
                Ready to get started?
              </h2>
              <p className="text-gray-600">
                Choose a tool above or try our most popular features below.
              </p>
            </div>
            <div className="flex flex-wrap gap-3">
              <QuickStartButton href="/docs" label="Ask a Question" icon="❓" />
              <QuickStartButton href="/blog" label="Search Blogs" icon="🔍" />
              <QuickStartButton href="/cost" label="Scan Costs" icon="💰" />
            </div>
          </div>
        </div>
      </section>

      {/* Footer */}
      <footer className="border-t border-gray-200 py-8">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex flex-col md:flex-row items-center justify-between gap-4">
            <div className="flex items-center gap-2 text-gray-600">
              <svg className="w-6 h-6 text-aws-orange" fill="currentColor" viewBox="0 0 24 24">
                <path d="M12 2L2 7l10 5 10-5-10-5zM2 17l10 5 10-5M2 12l10 5 10-5" />
              </svg>
              <span className="font-medium">AWS Developer Intelligence Platform</span>
            </div>
            <div className="flex items-center gap-6 text-sm text-gray-500">
              <Link href="/docs" className="hover:text-aws-orange transition-colors">Documentation</Link>
              <Link href="/blog" className="hover:text-aws-orange transition-colors">Blog Search</Link>
              <Link href="/cost" className="hover:text-aws-orange transition-colors">Cost Predictor</Link>
            </div>
          </div>
        </div>
      </footer>
    </main>
  );
}

function IntegrationCard({ from, to, description, icon }: { from: string; to: string; description: string; icon: string }) {
  return (
    <div className="bg-white/10 backdrop-blur rounded-xl p-6 border border-white/20">
      <div className="text-3xl mb-4">{icon}</div>
      <div className="flex items-center gap-2 text-sm text-gray-300 mb-2">
        <span>{from}</span>
        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 8l4 4m0 0l-4 4m4-4H3" />
        </svg>
        <span>{to}</span>
      </div>
      <p className="text-white/80 text-sm">{description}</p>
    </div>
  );
}

function QuickStartButton({ href, label, icon }: { href: string; label: string; icon: string }) {
  return (
    <Link href={href} className="flex items-center gap-2 px-4 py-2 bg-aws-dark text-white rounded-lg hover:bg-gray-800 transition-colors">
      <span>{icon}</span>
      <span>{label}</span>
    </Link>
  );
}
