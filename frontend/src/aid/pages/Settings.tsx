// Настройки Aid. Свой экран: наши токены, вкладки и тексты, без «Назад»
// (в сайдбаре уже есть навигация). Раздел «Общие» и «О программе» свои,
// на данных ConfigContext. Сложные секции оригинала (устройства, модели
// распознавания и итогов, бета) подключены как есть: их логику не дублируем,
// а цвета и тексты приводит к Aid временный мост (.aid-legacy, LegacyBridge).

'use client';

import { Suspense, useEffect, useState, type ReactNode } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { invoke } from '@tauri-apps/api/core';
import { getVersion } from '@tauri-apps/api/app';
import { ExternalLink, FolderOpen } from 'lucide-react';
import { Button } from '@/aid/components/ui/button';
import { Card } from '@/aid/components/ui/card';
import { Skeleton } from '@/aid/components/ui/skeleton';
import { Switch } from '@/aid/components/ui/switch';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/aid/components/ui/tabs';
import { aidToast } from '@/aid/lib/toasts';
import { t } from '@/aid/strings';
import { useConfig, type NotificationSettings } from '@/contexts/ConfigContext';
import { RecordingSettings } from '@/components/RecordingSettings';
import { TranscriptSettings } from '@/components/TranscriptSettings';
import { SummaryModelSettings } from '@/components/SummaryModelSettings';
import { BetaSettings } from '@/components/BetaSettings';
import AnalyticsConsentSwitch from '@/components/AnalyticsConsentSwitch';

const TABS = [
  { value: 'general', label: t('settingsGeneral') },
  { value: 'recording', label: t('settingsRecording') },
  { value: 'transcription', label: t('settingsTranscription') },
  { value: 'summary', label: t('settingsSummary') },
  { value: 'beta', label: t('settingsBeta') },
  { value: 'about', label: t('settingsAbout') },
] as const;
type TabValue = (typeof TABS)[number]['value'];

const UPSTREAM_URL = 'https://github.com/Zackriya-Solutions/meeting-minutes';
const LICENSE_URL = `${UPSTREAM_URL}/blob/main/LICENSE.md`;

function Row({ title, hint, children }: { title: string; hint?: ReactNode; children: ReactNode }) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-x-6 gap-y-3 px-6 py-5">
      <div className="min-w-0 flex-1">
        <p className="text-[15px] font-medium">{title}</p>
        {hint && <div className="mt-1 text-sm text-muted-foreground">{hint}</div>}
      </div>
      {children}
    </div>
  );
}

/** Переключатель показывает то же, что проверяет ядро перед уведомлением: show_recording_started и _stopped. */
function NotificationsRow() {
  const { notificationSettings, isLoadingPreferences, loadPreferences, updateNotificationSettings } = useConfig();
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    void loadPreferences();
  }, [loadPreferences]);

  const prefs = notificationSettings?.notification_preferences;
  const enabled = Boolean(prefs?.show_recording_started && prefs?.show_recording_stopped);

  const toggle = async (next: boolean) => {
    if (!notificationSettings) return;
    const updated: NotificationSettings = {
      ...notificationSettings,
      notification_preferences: {
        ...notificationSettings.notification_preferences,
        show_recording_started: next,
        show_recording_stopped: next,
      },
    };
    setSaving(true);
    try {
      await updateNotificationSettings(updated);
    } catch (error) {
      aidToast.error(t('saveFailed'), { description: String(error) });
    } finally {
      setSaving(false);
    }
  };

  const noPermission = enabled && notificationSettings && !notificationSettings.system_permission_granted;

  return (
    <Row
      title={t('notificationsTitle')}
      hint={noPermission ? t('notificationsNoPermission') : t('notificationsHint')}
    >
      {isLoadingPreferences && !notificationSettings ? (
        <Skeleton className="h-6 w-11 rounded-full" />
      ) : (
        <Switch
          checked={enabled}
          onCheckedChange={(v) => void toggle(v)}
          disabled={!notificationSettings || saving}
          aria-label={t('notificationsTitle')}
        />
      )}
    </Row>
  );
}

function StorageRow() {
  const { storageLocations, loadPreferences } = useConfig();

  useEffect(() => {
    void loadPreferences();
  }, [loadPreferences]);

  const open = async () => {
    try {
      await invoke('open_recordings_folder');
    } catch (error) {
      aidToast.error(t('openFolderFailed'), { description: String(error) });
    }
  };

  return (
    <Row
      title={t('recordingsFolder')}
      hint={
        storageLocations?.recordings ? (
          <span className="break-all font-mono text-[13px]">{storageLocations.recordings}</span>
        ) : (
          <Skeleton className="mt-1 h-4 w-64 rounded-lg" />
        )
      }
    >
      <Button variant="outline" onClick={() => void open()}>
        <FolderOpen />
        {t('openFolder')}
      </Button>
    </Row>
  );
}

function GeneralTab() {
  return (
    <div className="space-y-6">
      <Card className="divide-y divide-border">
        <NotificationsRow />
        <StorageRow />
      </Card>
      <Card className="px-6 py-5">
        <Legacy className="aid-legacy-flat">
          <AnalyticsConsentSwitch />
        </Legacy>
      </Card>
    </div>
  );
}

function AboutTab() {
  const [version, setVersion] = useState<string | null>(null);

  useEffect(() => {
    getVersion().then(setVersion).catch(() => setVersion(null));
  }, []);

  const openUrl = (url: string) =>
    invoke('open_external_url', { url }).catch((error) => aidToast.error(t('openLinkFailed'), { description: String(error) }));

  return (
    <Card className="divide-y divide-border">
      <Row title={t('appName')} hint={version ? `${t('version')} ${version}` : undefined}>
        {null}
      </Row>
      <Row title={t('licenseTitle')} hint={t('licenseHint')}>
        <Button variant="outline" onClick={() => void openUrl(LICENSE_URL)}>
          <ExternalLink />
          {t('license')}
        </Button>
      </Row>
    </Card>
  );
}

/**
 * Секция оригинала в мосте: наши цвета и тексты поверх оригинальной разметки.
 * Монтируется только на клиенте: мост переводит текст после гидратации.
 */
function Legacy({ children, className }: { children: ReactNode; className?: string }) {
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);
  return <div className={`aid-legacy ${className ?? ''}`}>{mounted ? children : <Skeleton className="h-40 w-full rounded-3xl" />}</div>;
}

function SettingsContent() {
  const params = useSearchParams();
  const router = useRouter();
  const { transcriptModelConfig, setTranscriptModelConfig } = useConfig();
  const fromUrl = params.get('tab');
  const initial = TABS.some((tab) => tab.value === fromUrl) ? (fromUrl as TabValue) : 'general';
  const [tab, setTab] = useState<TabValue>(initial);

  useEffect(() => {
    if (TABS.some((x) => x.value === fromUrl)) setTab(fromUrl as TabValue);
  }, [fromUrl]);

  const change = (value: string) => {
    setTab(value as TabValue);
    // вкладка в адресе: ссылка «Скачать модель» ведёт сразу на нужную
    router.replace(`/settings?tab=${value}`, { scroll: false });
  };

  return (
    <Tabs value={tab} onValueChange={change} className="mt-6">
      <div className="-mx-1 overflow-x-auto px-1 pb-1">
        <TabsList aria-label={t('navSettings')}>
          {TABS.map((x) => (
            <TabsTrigger key={x.value} value={x.value} className="px-4">
              {x.label}
            </TabsTrigger>
          ))}
        </TabsList>
      </div>

      <TabsContent value="general">
        <GeneralTab />
      </TabsContent>
      <TabsContent value="recording">
        <Legacy>
          <RecordingSettings />
        </Legacy>
      </TabsContent>
      <TabsContent value="transcription">
        <Legacy>
          <TranscriptSettings
            transcriptModelConfig={transcriptModelConfig}
            setTranscriptModelConfig={setTranscriptModelConfig}
          />
        </Legacy>
      </TabsContent>
      <TabsContent value="summary">
        <Legacy>
          <SummaryModelSettings />
        </Legacy>
      </TabsContent>
      <TabsContent value="beta">
        <Legacy>
          <BetaSettings />
        </Legacy>
      </TabsContent>
      <TabsContent value="about">
        <AboutTab />
      </TabsContent>
    </Tabs>
  );
}

export default function Settings() {
  return (
    <main className="h-screen flex-1 overflow-y-auto bg-background">
      <div className="mx-auto w-full max-w-[880px] px-8 pb-16 pt-10">
        <h1 className="text-3xl font-semibold tracking-tight">{t('navSettings')}</h1>
        <Suspense fallback={<Skeleton className="mt-6 h-12 w-[520px] max-w-full rounded-2xl" />}>
          <SettingsContent />
        </Suspense>
      </div>
    </main>
  );
}
