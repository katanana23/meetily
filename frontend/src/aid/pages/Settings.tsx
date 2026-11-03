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
import { ArrowUpRight, BookOpen, Flask, FolderOpen, Microphone, SlidersHorizontal, Sparkle, Waveform } from '@phosphor-icons/react';
import { Button } from '@/aid/components/ui/button';
import { Page } from '@/aid/components/Page';
import { BackButton } from '@/aid/components/BackButton';
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
  { value: 'general', label: t('settingsGeneral'), icon: SlidersHorizontal },
  { value: 'recording', label: t('settingsRecording'), icon: Microphone },
  { value: 'transcription', label: t('settingsTranscription'), icon: Waveform },
  { value: 'summary', label: t('settingsSummary'), icon: Sparkle },
  { value: 'beta', label: t('settingsBeta'), icon: Flask },
  { value: 'about', label: t('settingsAbout'), icon: BookOpen },
] as const;
type TabValue = (typeof TABS)[number]['value'];

const UPSTREAM_URL = 'https://github.com/Zackriya-Solutions/meeting-minutes';
const LICENSE_URL = `${UPSTREAM_URL}/blob/main/LICENSE.md`;

function Row({ title, hint, children }: { title: string; hint?: ReactNode; children: ReactNode }) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-x-6 gap-y-3 p-4">
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
    // Бенто: каждая настройка отдельной плиткой, 8 px между плитками
    <div className="space-y-2">
      <Card>
        <NotificationsRow />
      </Card>
      <Card>
        <StorageRow />
      </Card>
      <Card className="p-4">
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
    <div className="space-y-2">
      <Card>
        <Row title={t('appName')} hint={version ? `${t('version')} ${version}` : undefined}>
          {null}
        </Row>
      </Card>
      <Card>
      <Row title={t('licenseTitle')} hint={t('licenseHint')}>
        <Button variant="outline" onClick={() => void openUrl(LICENSE_URL)}>
          <ArrowUpRight />
          {t('license')}
        </Button>
      </Row>
      </Card>
    </div>
  );
}

/**
 * Секция оригинала в мосте: наши цвета и тексты поверх оригинальной разметки.
 * Монтируется только на клиенте: мост переводит текст после гидратации.
 */
function Legacy({ children, className }: { children: ReactNode; className?: string }) {
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);
  return <div className={`aid-legacy ${className ?? ''}`}>{mounted ? children : <Skeleton className="h-40 w-full rounded-tile" />}</div>;
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

  const header = (
    <>
      <div className="flex items-center gap-3">
        <BackButton label={t('backToMeetings')} href="/" />
        <h1 className="text-3xl font-semibold tracking-tight">{t('navSettings')}</h1>
      </div>
      <div className="-mx-1 mt-4 overflow-x-auto px-1 pb-1">
        <TabsList aria-label={t('navSettings')}>
          {TABS.map((x) => {
            const Icon = x.icon;
            return (
              <TabsTrigger key={x.value} value={x.value} className="gap-1.5 px-3">
                <Icon aria-hidden />
                {x.label}
              </TabsTrigger>
            );
          })}
        </TabsList>
      </div>
    </>
  );

  return (
    // Tabs снаружи: вкладки в неподвижной шапке, содержимое в прокручиваемой области
    <Tabs value={tab} onValueChange={change} className="flex h-full min-w-0 flex-1">
      <Page header={header}>
      <TabsContent value="general" className="mt-0">
        <GeneralTab />
      </TabsContent>
      <TabsContent value="recording" className="mt-0">
        <Legacy>
          <RecordingSettings />
        </Legacy>
      </TabsContent>
      <TabsContent value="transcription" className="mt-0">
        <Legacy>
          <TranscriptSettings
            transcriptModelConfig={transcriptModelConfig}
            setTranscriptModelConfig={setTranscriptModelConfig}
          />
        </Legacy>
      </TabsContent>
      <TabsContent value="summary" className="mt-0">
        {/* aid-no-autosummary: переключатель «Итоги автоматически» скрыт, Aid делает итоги только по кнопке */}
        <Legacy className="aid-no-autosummary">
          <SummaryModelSettings />
        </Legacy>
      </TabsContent>
      <TabsContent value="beta" className="mt-0">
        <Legacy>
          <BetaSettings />
        </Legacy>
      </TabsContent>
      <TabsContent value="about" className="mt-0">
        <AboutTab />
      </TabsContent>
      </Page>
    </Tabs>
  );
}

export default function Settings() {
  return (
    <Suspense
      fallback={
        <Page header={<h1 className="text-3xl font-semibold tracking-tight">{t('navSettings')}</h1>}>
          <Skeleton className="h-40 w-full rounded-tile" />
        </Page>
      }
    >
      <SettingsContent />
    </Suspense>
  );
}
