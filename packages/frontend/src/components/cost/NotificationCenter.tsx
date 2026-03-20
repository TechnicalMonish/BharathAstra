'use client';

import { useState, useCallback } from 'react';
import { costApi } from '@/lib/api';
import type { CostNotification, NotificationConfig } from '@shared/types/cost-predictor';
import { NotificationType, NotificationChannel } from '@shared/types/enums';

interface NotificationCenterProps {
  notifications: CostNotification[];
  loading?: boolean;
  onDismiss: (notificationId: string) => void;
  onRefresh: () => void;
}

export function NotificationCenter({
  notifications,
  loading = false,
  onDismiss,
  onRefresh,
}: NotificationCenterProps) {
  const [showSettings, setShowSettings] = useState(false);
  const [config, setConfig] = useState<NotificationConfig>({
    costThreshold: 5,
    timeThreshold: 7,
    enabled: true,
    channels: [NotificationChannel.IN_APP],
  });
  const [savingConfig, setSavingConfig] = useState(false);

  const handleSaveConfig = useCallback(async () => {
    setSavingConfig(true);
    try {
      await costApi.configureNotifications({
        costThreshold: config.costThreshold,
        timeThreshold: config.timeThreshold,
        enabled: config.enabled,
        channels: config.channels,
      });
      setShowSettings(false);
    } catch (error) {
      console.error('Failed to save notification config:', error);
    } finally {
      setSavingConfig(false);
    }
  }, [config]);

  if (loading) {
    return (
      <div className="space-y-4">
        {[1, 2, 3].map((i) => (
          <NotificationSkeleton key={i} />
        ))}
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between mb-4">
        <div>
          <h2 className="text-lg font-semibold text-aws-dark">Cost Alerts</h2>
          <p className="text-sm text-gray-500">
            {notifications.length} notification(s)
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button onClick={onRefresh} className="btn-secondary text-sm">
            <svg className="w-4 h-4 mr-1" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
            </svg>
            Refresh
          </button>
          <button
            onClick={() => setShowSettings(true)}
            className="btn-secondary text-sm"
          >
            <svg className="w-4 h-4 mr-1" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
            </svg>
            Settings
          </button>
        </div>
      </div>

      {/* Notifications List */}
      {notifications.length === 0 ? (
        <div className="text-center py-12">
          <svg className="w-16 h-16 text-gray-300 mx-auto mb-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6.002 6.002 0 00-4-5.659V5a2 2 0 10-4 0v.341C7.67 6.165 6 8.388 6 11v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9" />
          </svg>
          <h3 className="text-lg font-medium text-gray-900 mb-1">No notifications</h3>
          <p className="text-gray-500">You're all caught up! No cost alerts at this time.</p>
        </div>
      ) : (
        <div className="space-y-3">
          {notifications.map((notification) => (
            <NotificationCard
              key={notification.notificationId}
              notification={notification}
              onDismiss={() => onDismiss(notification.notificationId)}
            />
          ))}
        </div>
      )}

      {/* Settings Modal */}
      {showSettings && (
        <NotificationSettingsModal
          config={config}
          onChange={setConfig}
          onSave={handleSaveConfig}
          onClose={() => setShowSettings(false)}
          saving={savingConfig}
        />
      )}
    </div>
  );
}

// Notification Card Component
function NotificationCard({
  notification,
  onDismiss,
}: {
  notification: CostNotification;
  onDismiss: () => void;
}) {
  const severityConfig = {
    critical: {
      bg: 'bg-red-50',
      border: 'border-red-200',
      icon: 'text-red-600',
      title: 'text-red-800',
    },
    warning: {
      bg: 'bg-yellow-50',
      border: 'border-yellow-200',
      icon: 'text-yellow-600',
      title: 'text-yellow-800',
    },
    info: {
      bg: 'bg-blue-50',
      border: 'border-blue-200',
      icon: 'text-blue-600',
      title: 'text-blue-800',
    },
  };

  const config = severityConfig[notification.severity] || severityConfig.info;

  return (
    <div className={`p-4 rounded-lg border ${config.bg} ${config.border}`}>
      <div className="flex items-start gap-3">
        {/* Icon */}
        <div className={`flex-shrink-0 ${config.icon}`}>
          {notification.type === NotificationType.COST_THRESHOLD ? (
            <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
          ) : (
            <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
          )}
        </div>

        {/* Content */}
        <div className="flex-1 min-w-0">
          <div className="flex items-start justify-between">
            <div>
              <p className={`font-medium ${config.title}`}>
                {notification.type === NotificationType.COST_THRESHOLD
                  ? 'Cost Threshold Exceeded'
                  : 'Time Threshold Exceeded'}
              </p>
              <p className="text-sm text-gray-600 mt-1">{notification.message}</p>
            </div>
            <button
              onClick={onDismiss}
              className="ml-2 p-1 text-gray-400 hover:text-gray-600 transition-colors"
              aria-label="Dismiss notification"
            >
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>

          {/* Action Link */}
          {notification.actionUrl && (
            <a
              href={notification.actionUrl}
              className="inline-flex items-center gap-1 mt-3 text-sm font-medium text-aws-orange hover:text-orange-600"
            >
              View Cleanup Script
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
              </svg>
            </a>
          )}

          {/* Timestamp */}
          <p className="text-xs text-gray-500 mt-2">
            {formatDate(notification.sentAt)}
          </p>
        </div>
      </div>
    </div>
  );
}

// Notification Settings Modal
function NotificationSettingsModal({
  config,
  onChange,
  onSave,
  onClose,
  saving,
}: {
  config: NotificationConfig;
  onChange: (config: NotificationConfig) => void;
  onSave: () => void;
  onClose: () => void;
  saving: boolean;
}) {
  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
      <div className="bg-white rounded-lg shadow-xl w-full max-w-md mx-4">
        {/* Header */}
        <div className="flex items-center justify-between p-4 border-b border-gray-200">
          <h2 className="text-lg font-semibold text-aws-dark">Notification Settings</h2>
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
        <div className="p-4 space-y-4">
          {/* Enable/Disable */}
          <div className="flex items-center justify-between">
            <div>
              <p className="font-medium text-aws-dark">Enable Notifications</p>
              <p className="text-sm text-gray-500">Receive alerts about your resources</p>
            </div>
            <button
              onClick={() => onChange({ ...config, enabled: !config.enabled })}
              className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${
                config.enabled ? 'bg-aws-orange' : 'bg-gray-200'
              }`}
            >
              <span
                className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
                  config.enabled ? 'translate-x-6' : 'translate-x-1'
                }`}
              />
            </button>
          </div>

          {/* Cost Threshold */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Cost Threshold ($)
            </label>
            <p className="text-xs text-gray-500 mb-2">
              Alert when accumulated cost exceeds this amount
            </p>
            <input
              type="number"
              min="1"
              max="1000"
              value={config.costThreshold}
              onChange={(e) =>
                onChange({ ...config, costThreshold: parseInt(e.target.value) || 5 })
              }
              className="input-field"
              disabled={!config.enabled}
            />
          </div>

          {/* Time Threshold */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Time Threshold (days)
            </label>
            <p className="text-xs text-gray-500 mb-2">
              Alert when resources have been running for this many days
            </p>
            <input
              type="number"
              min="1"
              max="30"
              value={config.timeThreshold}
              onChange={(e) =>
                onChange({ ...config, timeThreshold: parseInt(e.target.value) || 7 })
              }
              className="input-field"
              disabled={!config.enabled}
            />
          </div>

          {/* Notification Channels */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Notification Channels
            </label>
            <div className="space-y-2">
              <label className="flex items-center gap-2">
                <input
                  type="checkbox"
                  checked={config.channels.includes(NotificationChannel.IN_APP)}
                  onChange={(e) => {
                    const channels = e.target.checked
                      ? [...config.channels, NotificationChannel.IN_APP]
                      : config.channels.filter((c) => c !== NotificationChannel.IN_APP);
                    onChange({ ...config, channels });
                  }}
                  className="rounded border-gray-300 text-aws-orange focus:ring-aws-orange"
                  disabled={!config.enabled}
                />
                <span className="text-sm text-gray-700">In-App Notifications</span>
              </label>
              <label className="flex items-center gap-2">
                <input
                  type="checkbox"
                  checked={config.channels.includes(NotificationChannel.EMAIL)}
                  onChange={(e) => {
                    const channels = e.target.checked
                      ? [...config.channels, NotificationChannel.EMAIL]
                      : config.channels.filter((c) => c !== NotificationChannel.EMAIL);
                    onChange({ ...config, channels });
                  }}
                  className="rounded border-gray-300 text-aws-orange focus:ring-aws-orange"
                  disabled={!config.enabled}
                />
                <span className="text-sm text-gray-700">Email Notifications</span>
              </label>
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="flex items-center justify-end gap-3 p-4 border-t border-gray-200 bg-gray-50">
          <button onClick={onClose} className="btn-secondary" disabled={saving}>
            Cancel
          </button>
          <button onClick={onSave} className="btn-primary" disabled={saving}>
            {saving ? 'Saving...' : 'Save Settings'}
          </button>
        </div>
      </div>
    </div>
  );
}

// Skeleton Loader
function NotificationSkeleton() {
  return (
    <div className="p-4 bg-gray-100 rounded-lg animate-pulse">
      <div className="flex items-start gap-3">
        <div className="w-6 h-6 bg-gray-200 rounded" />
        <div className="flex-1">
          <div className="h-5 bg-gray-200 rounded w-48 mb-2" />
          <div className="h-4 bg-gray-200 rounded w-full mb-2" />
          <div className="h-4 bg-gray-200 rounded w-24" />
        </div>
      </div>
    </div>
  );
}

// Helper function
function formatDate(date: Date | string): string {
  const d = new Date(date);
  return d.toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}
