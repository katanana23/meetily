// Настройки Aid. Свой экран: наши токены, вкладки и тексты, без «Назад»
// (в сайдбаре уже есть навигация). Раздел «Общие» и «О программе» свои,
// на данных ConfigContext. Сложные секции оригинала (устройства, модели
// распознавания и итогов, бета) подключены как есть: их логику не дублируем,
// а цвета и тексты приводит к Aid временный мост (.aid-legacy, LegacyBridge).
//
// Как главная: вся страница одной плиткой (Page, раскладка tile), плоская шапка с
// вкладками липкая, при прокрутке стекло и мягкое затухание под ней (.aid-edge-fade).
// Разделы открытыми группами внутри плитки (без своих подложек, как строки списка на
// главной): заголовок 22/28, строки разделены отступом, переключатели и кнопки справа
// в одной колонке фиксированной ширины. Вкладки как фильтры главной (.aid-chip-on).

'use client';

import { Suspense, useEffect, useState, type ReactNode } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { invoke } from '@tauri-apps/api/core';
import { getVersion } from '@tauri-apps/api/app';
import { ArrowUpRight, BookOpen, Flask, FolderOpen, Microphone, SlidersHorizontal, Sparkle, Trash, Waveform } from '@phosphor-icons/react';
import { openTrash } from '@/aid/lib/recording-trash';
import { Button } from '@/aid/components/ui/button';
import { Page } from '@/aid/components/Page';
import { BackButton } from '@/aid/components/BackButton';
import { Skeleton } from '@/aid/components/ui/skeleton';
import { Switch } from '@/aid/components/ui/switch';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/aid/components/ui/tabs';
import { aidToast } from '@/aid/lib/toasts';
import { cn } from '@/aid/lib/utils';
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

// Разделы вкладки один под другим: 32 px между группами
const TAB = 'mt-0 flex-col gap-8 data-[state=active]:flex';

const UPSTREAM_URL = 'https://github.com/Zackriya-Solutions/meeting-minutes';
const LICENSE_URL = `${UPSTREAM_URL}/blob/main/LICENSE.md`;

/** Раздел настроек: открытая группа внутри плитки страницы, заголовок 22/28. */
function Section({ title, children, className }: { title?: string; children: ReactNode; className?: string }) {
  return (
    <section className={className} aria-label={title}>
      {title && <h2 className="text-[22px] font-bold leading-7 tracking-tight">{title}</h2>}
      <div className={cn('flex flex-col gap-1', title && 'mt-3')}>{children}</div>
    </section>
  );
}

/** Строка: подпись слева, управление справа в колонке 200 px (переключатели на одной линии). */
function Row({ title, hint, children }: { title: string; hint?: ReactNode; children: ReactNode }) {
  return (
    <div className="flex flex-wrap items-center gap-x-6 gap-y-3 py-3">
      <div className="min-w-0 flex-1 basis-64">
        <p className="text-base font-medium">{title}</p>
        {hint && <div className="mt-1 text-sm text-muted-foreground">{hint}</div>}
      </div>
      {/* Кнопки на всю ширину колонки, переключатель у её правого края */}
      {children !== null && <div className="flex w-[200px] shrink-0 justify-end [&>button:not([role=switch])]:w-full">{children}</div>}
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

/** Корзина: пустые записи без звука лежат здесь 7 дней (recording-trash.ts). */
function TrashRow() {
  const { storageLocations } = useConfig();
  const root = storageLocations?.recordings ?? null;
  const open = async () => {
    if (!root) return;
    try {
      await openTrash(root);
    } catch (error) {
      aidToast.error(t('openFolderFailed'), { description: String(error) });
    }
  };
  return (
    <Row title={t('trashTitle')} hint={t('trashHint')}>
      <Button variant="outline" onClick={() => void open()} disabled={!root}>
        <Trash />
        {t('openTrash')}
      </Button>
    </Row>
  );
}

function GeneralTab() {
  return (
    // Бенто: разделы отдельными плитками, 8 px между плитками
    <div className="flex flex-col gap-8">
      <Section title={t('settingsSectionNotifications')}>
        <NotificationsRow />
      </Section>
      <Section title={t('settingsSectionStorage')}>
        <StorageRow />
        <TrashRow />
      </Section>
      <Section title={t('settingsSectionPrivacy')}>
        <Legacy className="aid-legacy-flat">
          <AnalyticsConsentSwitch />
        </Legacy>
      </Section>
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
    <Section title={t('settingsAbout')}>
      <Row title={t('appName')} hint={version ? `${t('version')} ${version}` : undefined}>
        {null}
      </Row>
      <Row title={t('licenseTitle')} hint={t('licenseHint')}>
        <Button variant="outline" onClick={() => void openUrl(LICENSE_URL)}>
          <ArrowUpRight />
          {t('license')}
        </Button>
      </Row>
    </Section>
  );
}

/**
 * Секция оригинала в мосте: наши цвета и тексты поверх оригинальной разметки.
 * Монтируется только на клиенте: мост переводит текст после гидратации.
 */
function Legacy({ children, className }: { children: ReactNode; className?: string }) {
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);
  return <div className={`aid-legacy ${className ?? ''}`}>{mounted ? children : <Skeleton className="h-40 w-full rounded-nested" />}</div>;
}

/** Вкладка из секций оригинала: одна плитка, внутри вложенная ступень тона (.aid-nest). */
function LegacyTile({ title, children, className }: { title: string; children: ReactNode; className?: string }) {
  return (
    <Section title={title}>
      <div className="aid-nest">
        <Legacy className={className}>{children}</Legacy>
      </div>
    </Section>
  );
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
      <div className="flex items-center gap-4">
        <BackButton label={t('backToMeetings')} href="/" />
        <h1 className="text-[36px] font-bold leading-10 tracking-tight">{t('navSettings')}</h1>
      </div>
      <TabsList aria-label={t('navSettings')} className="mt-5">
        {TABS.map((x) => {
          const Icon = x.icon;
          return (
            <TabsTrigger key={x.value} value={x.value}>
              <Icon aria-hidden />
              {/* Ширина по полужирному варианту: выбранная вкладка font-medium, соседи не сдвигаются */}
              <span className="grid">
                <span className="col-start-1 row-start-1">{x.label}</span>
                <span aria-hidden className="invisible col-start-1 row-start-1 font-medium">
                  {x.label}
                </span>
              </span>
            </TabsTrigger>
          );
        })}
      </TabsList>
    </>
  );

  return (
    // Tabs снаружи: вкладки в неподвижной шапке, содержимое в прокручиваемой области
    <Tabs value={tab} onValueChange={change} className="flex h-full min-w-0 flex-1">
      <Page header={header}>
      <TabsContent value="general" className={TAB}>
        <GeneralTab />
      </TabsContent>
      <TabsContent value="recording" className={TAB}>
        <LegacyTile title={t('settingsRecording')}>
          <RecordingSettings />
        </LegacyTile>
      </TabsContent>
      <TabsContent value="transcription" className={TAB}>
        <LegacyTile title={t('settingsTranscription')}>
          <TranscriptSettings
            transcriptModelConfig={transcriptModelConfig}
            setTranscriptModelConfig={setTranscriptModelConfig}
          />
        </LegacyTile>
      </TabsContent>
      <TabsContent value="summary" className={TAB}>
        {/* aid-no-autosummary: переключатель «Итоги автоматически» скрыт, Aid делает итоги только по кнопке */}
        <LegacyTile title={t('settingsSummary')} className="aid-no-autosummary">
          <SummaryModelSettings />
        </LegacyTile>
      </TabsContent>
      <TabsContent value="beta" className={TAB}>
        <LegacyTile title={t('settingsBeta')}>
          <BetaSettings />
        </LegacyTile>
      </TabsContent>
      <TabsContent value="about" className={TAB}>
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
        <Page header={<h1 className="text-[36px] font-bold leading-10 tracking-tight">{t('navSettings')}</h1>}>
          <Skeleton className="h-40 w-full rounded-nested" />
        </Page>
      }
    >
      <SettingsContent />
    </Suspense>
  );
}
