'use client'

// Dev-only: заглушки Tauri для запуска в обычном браузере (docs/case/mock.md)
import '@/dev/mock-tauri/bootstrap'

import { Inter, Source_Sans_3 } from 'next/font/google'
import Sidebar from '@/components/Sidebar'
import { SidebarProvider } from '@/components/Sidebar/SidebarProvider'
import MainContent from '@/components/MainContent'
import AnalyticsProvider from '@/components/AnalyticsProvider'
import { Toaster, toast } from 'sonner'
import "sonner/dist/styles.css"
import { useState, useEffect, useCallback } from 'react'
import { listen, UnlistenFn } from '@tauri-apps/api/event'
import { invoke } from '@tauri-apps/api/core'
import { TooltipProvider } from '@/components/ui/tooltip'
import { RecordingStateProvider } from '@/contexts/RecordingStateContext'
import { OllamaDownloadProvider } from '@/contexts/OllamaDownloadContext'
import { TranscriptProvider } from '@/contexts/TranscriptContext'
import { ConfigProvider, useConfig } from '@/contexts/ConfigContext'
import { OnboardingProvider } from '@/contexts/OnboardingContext'
import { OnboardingFlow } from '@/components/onboarding'
import { loadBetaFeatures } from '@/types/betaFeatures'
import { DownloadProgressToastProvider } from '@/components/shared/DownloadProgressToast'
import { UpdateCheckProvider } from '@/components/UpdateCheckProvider'
import { RecordingPostProcessingProvider } from '@/contexts/RecordingPostProcessingProvider'
import { ImportAudioDialog, ImportDropOverlay } from '@/components/ImportAudio'
import { ImportDialogProvider } from '@/contexts/ImportDialogContext'
import { isAudioExtension, getAudioFormatsDisplayList } from '@/constants/audioFormats'
import { themeScript } from '@/shade/lib/theme'
import { ShadeSidebar } from '@/shade/components/ShadeSidebar'
import { TooltipProvider as ShadeTooltipProvider } from '@/shade/components/ui/tooltip'
import { ShadeToaster } from '@/shade/components/ShadeToaster'
import { RecordDock } from '@/shade/components/RecordDock'
import { WindowBar } from '@/shade/components/WindowBar'
import { LaunchScreen } from '@/shade/components/LaunchScreen'
import { ImportDialog as ShadeImportDialog } from '@/shade/components/ImportDialog'
import { ShadeRecordingControls } from '@/shade/lib/recording-controls'
import { InPlaceMeetingRouter } from '@/shade/lib/in-place-router'
import { LegacyBridge } from '@/shade/components/LegacyBridge'
import { ShadeOnboarding } from '@/shade/components/onboarding/ShadeOnboarding'
import { ShadeRecordingProvider } from '@/shade/lib/recording-outcome'
import { ShadeIcons } from '@/shade/components/ShadeIcons'
import { installTauriEventGuard } from '@/shade/lib/tauri-events'
import { markTitlebarOverlay, syncWindowTheme } from '@/shade/lib/window-theme'
import { installNavDebug } from '@/shade/lib/nav-debug'
import { showWindow, windowBootScript, windowShowScript } from '@/shade/lib/window-boot'
import { applySystemLanguageDefault } from '@/shade/lib/system-language'

// Интерфейс: shade (новый, по умолчанию) или original (оригинальный Meetily).
// Условие записано прямо в if: webpack вычисляет его при сборке и не тянет
// в бандл стили второго интерфейса.
if (process.env.NEXT_PUBLIC_UI === 'original') {
  require('./globals.css')
} else {
  require('@/shade/styles/globals.css')
  // мост: зашитые цвета оригинальных компонентов → токены Shade
  require('@/shade/styles/legacy.css')
}
const isShadeUI = process.env.NEXT_PUBLIC_UI !== 'original'
const PostProcessing = isShadeUI ? ShadeRecordingProvider : RecordingPostProcessingProvider
// Shade: страховка от падения unregisterListener при ранней отписке в оригинальных хуках
// и окно в цвет темы с самого старта
if (isShadeUI) {
  installTauriEventGuard()
  if (typeof window !== 'undefined') markTitlebarOverlay()
  // ВРЕМЕННО: журнал кликов по списку встреч для проверки на Mac (nav-debug.ts)
  if (typeof window !== 'undefined') installNavDebug()
  void syncWindowTheme()
  // Язык распознавания по умолчанию из системы, если человек его не выбирал.
  // До монтирования ConfigProvider: он прочитает ключ и сам отправит язык в ядро
  applySystemLanguageDefault()
}

// Shade: SF Pro (системный шрифт macOS) через стек -apple-system в .shade-font
// (globals.css); Inter запасной для Windows и Linux, в переменной --font-inter.
// Оригинал: Source Sans 3 в --font-ui
const inter = Inter({
  subsets: ['latin', 'cyrillic'],
  weight: ['400', '500', '600'],
  variable: '--font-inter',
  display: 'swap',
})

const sourceSans3 = Source_Sans_3({
  subsets: ['latin'],
  weight: ['400', '500', '600', '700'],
  variable: '--font-ui',
})

// Module-level component — stable reference across RootLayout re-renders.
// Defined here (not inside RootLayout) so React never sees a new function type
// on re-render, which would cause unmount/remount and break initialization logic.
function ConditionalImportDialog({
  showImportDialog,
  handleImportDialogClose,
  importFilePath,
}: {
  showImportDialog: boolean;
  handleImportDialogClose: (open: boolean) => void;
  importFilePath: string | null;
}) {
  const { betaFeatures } = useConfig();

  // Only mount ImportAudioDialog (and its hooks/listeners) when feature is enabled
  if (!betaFeatures.importAndRetranscribe) {
    return null;
  }

  // Shade: своё окно импорта в бенто на тех же хуках оригинала (shade/components/ImportDialog)
  if (isShadeUI) {
    return <ShadeImportDialog open={showImportDialog} onOpenChange={handleImportDialogClose} preselectedFile={importFilePath} />;
  }
  return (
    <ImportAudioDialog
      open={showImportDialog}
      onOpenChange={handleImportDialogClose}
      preselectedFile={importFilePath}
    />
  );
}

// export { metadata } from './metadata'

export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  const [showOnboarding, setShowOnboarding] = useState(false)
  const [onboardingCompleted, setOnboardingCompleted] = useState(false)
  // Shade: приложение рисуется, только когда известно, нужен ли первый запуск (до этого видна
  // заставка LaunchScreen), иначе на мгновение мелькал бы список встреч. Оригинал как был.
  const [onboardingChecked, setOnboardingChecked] = useState(!isShadeUI)
  // Shade: после первого запуска провайдеры монтируются заново (вместо window.location.reload),
  // чтобы прочитать сохранённые настройки; appKey > 0 значит «пришли из первого запуска»
  const [appKey, setAppKey] = useState(0)

  // Import audio state
  const [showDropOverlay, setShowDropOverlay] = useState(false)
  const [showImportDialog, setShowImportDialog] = useState(false)
  const [importFilePath, setImportFilePath] = useState<string | null>(null)

  // Страховка: окно стартует скрытым, показать его, даже если скрипт в разметке не сработал
  useEffect(() => {
    void showWindow()
  }, [])

  useEffect(() => {
    // Check onboarding status first
    invoke<{ completed: boolean } | null>('get_onboarding_status')
      .then((status) => {
        const isComplete = status?.completed ?? false
        setOnboardingCompleted(isComplete)

        if (!isComplete) {
          console.log('[Layout] Onboarding not completed, showing onboarding flow')
          setShowOnboarding(true)
        } else {
          console.log('[Layout] Onboarding completed, showing main app')
        }
        setOnboardingChecked(true)
      })
      .catch((error) => {
        console.error('[Layout] Failed to check onboarding status:', error)
        // Default to showing onboarding if we can't check
        setShowOnboarding(true)
        setOnboardingCompleted(false)
        setOnboardingChecked(true)
      })
    // Shade: страховка, если ядро не ответит: через 3 с показать приложение как есть
    const fallback = isShadeUI ? setTimeout(() => setOnboardingChecked(true), 3000) : undefined
    return () => clearTimeout(fallback)
  }, [])

  // Disable context menu in production
  useEffect(() => {
    if (process.env.NODE_ENV === 'production') {
      const handleContextMenu = (e: MouseEvent) => e.preventDefault();
      document.addEventListener('contextmenu', handleContextMenu);
      return () => document.removeEventListener('contextmenu', handleContextMenu);
    }
  }, []);
  useEffect(() => {
    // Listen for tray recording toggle request
    const unlisten = listen('request-recording-toggle', () => {
      console.log('[Layout] Received request-recording-toggle from tray');

      if (showOnboarding) {
        toast.error("Please complete setup first", {
          description: "You need to finish onboarding before you can start recording."
        });
      } else {
        // If in main app, forward to useRecordingStart via window event
        console.log('[Layout] Forwarding to start-recording-from-sidebar');
        window.dispatchEvent(new CustomEvent('start-recording-from-sidebar'));
      }
    });

    return () => {
      unlisten.then(fn => fn());
    };
  }, [showOnboarding]);

  // Handle file drop for audio import
  const handleFileDrop = useCallback((paths: string[]) => {
    // Check if beta features are enabled (read from localStorage directly since we're outside ConfigProvider)
    const betaFeatures = loadBetaFeatures();

    if (!betaFeatures.importAndRetranscribe) {
      toast.error('Beta feature disabled', {
        description: 'Enable "Import Audio & Retranscribe" in Settings > Beta to use this feature.'
      });
      return;
    }

    // Find the first audio file
    const audioFile = paths.find(p => {
      const ext = p.split('.').pop()?.toLowerCase();
      return !!ext && isAudioExtension(ext);
    });

    if (audioFile) {
      console.log('[Layout] Audio file dropped:', audioFile);
      setImportFilePath(audioFile);
      setShowImportDialog(true);
    } else if (paths.length > 0) {
      toast.error('Please drop an audio file', {
        description: `Supported formats: ${getAudioFormatsDisplayList()}`
      });
    }
  }, []);

  // Listen for drag-drop events
  useEffect(() => {
    if (showOnboarding) return; // Don't handle drops during onboarding

    const unlisteners: UnlistenFn[] = [];
    const cleanedUpRef = { current: false };

    const setupListeners = async () => {
      // Drag enter/over - show overlay only if beta feature is enabled
      const unlistenDragEnter = await listen('tauri://drag-enter', () => {
        if (loadBetaFeatures().importAndRetranscribe) {
          setShowDropOverlay(true);
        }
      });
      if (cleanedUpRef.current) {
        unlistenDragEnter();
        return;
      }
      unlisteners.push(unlistenDragEnter);

      // Drag leave - hide overlay
      const unlistenDragLeave = await listen('tauri://drag-leave', () => {
        setShowDropOverlay(false);
      });
      if (cleanedUpRef.current) {
        unlistenDragLeave();
        unlisteners.forEach(u => u());
        return;
      }
      unlisteners.push(unlistenDragLeave);

      // Drop - process files
      const unlistenDrop = await listen<{ paths: string[] }>('tauri://drag-drop', (event) => {
        setShowDropOverlay(false);
        handleFileDrop(event.payload.paths);
      });
      if (cleanedUpRef.current) {
        unlistenDrop();
        unlisteners.forEach(u => u());
        return;
      }
      unlisteners.push(unlistenDrop);
    };

    setupListeners();

    return () => {
      cleanedUpRef.current = true;
      unlisteners.forEach((unlisten) => unlisten());
    };
  }, [showOnboarding, handleFileDrop]);

  // Handle import dialog close
  const handleImportDialogClose = useCallback((open: boolean) => {
    setShowImportDialog(open);
    if (!open) {
      setImportFilePath(null);
    }
  }, []);

  // Handler for ImportDialogProvider - opens import dialog from any child component
  const handleOpenImportDialog = useCallback((filePath?: string | null) => {
    setImportFilePath(filePath ?? null);
    setShowImportDialog(true);
  }, []);

  const handleOnboardingComplete = () => {
    if (isShadeUI) {
      // Без перезагрузки: в окне Tauri на macOS window.location.reload() зависал.
      // Новый key заново монтирует провайдеры (настройки, модели, запись), заставка
      // LaunchScreen вне этого дерева и второй раз не появляется.
      console.info('[shade] onboarding завершён, провайдеры монтируются заново без перезагрузки')
      setShowOnboarding(false)
      setOnboardingCompleted(true)
      setAppKey((key) => key + 1)
      return
    }
    console.log('[Layout] Onboarding completed, reloading app')
    setShowOnboarding(false)
    setOnboardingCompleted(true)
    // Optionally reload the window to ensure all state is fresh
    window.location.reload()
  }

  return (
    <html lang={isShadeUI ? 'ru' : 'en'} suppressHydrationWarning>
      <head>
        {isShadeUI && <title>Shade</title>}
        {isShadeUI && <script dangerouslySetInnerHTML={{ __html: themeScript }} />}
        {/* Окно Tauri стартует скрытым (tauri.conf.json): фон по теме, затем показ (window-boot.ts) */}
        <script dangerouslySetInnerHTML={{ __html: windowBootScript }} />
      </head>
      <body className={`${isShadeUI ? `${inter.variable} shade-font` : sourceSans3.variable} font-sans antialiased`}>
        {/* Shade: заставка запуска прямо в HTML, пока скрипты страницы грузятся */}
        {isShadeUI && <LaunchScreen />}
        <script dangerouslySetInnerHTML={{ __html: windowShowScript }} />
        {/* Shade: встреча открывается на главной, без перехода между страницами */}
        <InPlaceMeetingRouter enabled={isShadeUI}>
        <AnalyticsProvider>
          <RecordingStateProvider key={appKey}>
            <TranscriptProvider>
              <ConfigProvider>
                <OllamaDownloadProvider>
                  <OnboardingProvider>
                    <UpdateCheckProvider>
                      <SidebarProvider>
                        <TooltipProvider>
                          {/* Shade: свой провайдер остановки (решение по содержанию записи, тот же путь для трея) */}
                          <PostProcessing>
                            <ImportDialogProvider onOpen={handleOpenImportDialog}>
                              {/* Download progress toast provider - listens for background downloads */}
                              <DownloadProgressToastProvider />

                              {/* Show onboarding or main app */}
                              {showOnboarding ? (
                                isShadeUI ? (
                                  // свой первый запуск на логике оригинала (useOnboarding)
                                  <ShadeOnboarding onComplete={handleOnboardingComplete} />
                                ) : (
                                  <OnboardingFlow onComplete={handleOnboardingComplete} />
                                )
                              ) : isShadeUI ? (
                                !onboardingChecked ? null : (
                                <ShadeIcons>
                                  <ShadeTooltipProvider delayDuration={300}>
                                    {/* Бенто с ролями цвета: слева колонка 72 px (на macOS сверху подложка
                                        с кнопками окна, WindowBar, ниже сайдбар), справа колонка страницы во всю
                                        высоту (её плитки рисует сама страница) с плавающей капсулой записи. 8 px
                                        между плитками и от краёв окна. data-tauri-drag-region: подложка и промежутки
                                        между плитками перетаскивают окно */}
                                    <ShadeRecordingControls>
                                      <div className={`shade-app flex h-screen flex-col overflow-hidden bg-background ${appKey > 0 ? 'shade-app-enter' : ''}`}>
                                        <div data-tauri-drag-region className="flex min-h-0 flex-1 gap-2 p-2">
                                          {/* Колонка сайдбара: на macOS сверху подложка с кнопками окна (WindowBar), ниже сайдбар */}
                                          <div data-tauri-drag-region className="flex min-h-0 shrink-0 flex-col gap-2">
                                            <WindowBar />
                                            <div className="min-h-0 flex-1">
                                              <ShadeSidebar />
                                            </div>
                                          </div>
                                          {/* Капсула записи плавает внизу по центру поверх контента */}
                                          <div data-tauri-drag-region className="relative flex min-h-0 min-w-0 flex-1">
                                            {children}
                                            <RecordDock />
                                          </div>
                                        </div>
                                      </div>
                                    </ShadeRecordingControls>
                                  </ShadeTooltipProvider>
                                </ShadeIcons>
                                )
                              ) : (
                                <div className="flex">
                                  <Sidebar />
                                  <MainContent>{children}</MainContent>
                                </div>
                              )}
                              {/* Import audio overlay and dialog */}
                              <ImportDropOverlay visible={showDropOverlay} />
                              <ConditionalImportDialog
                                showImportDialog={showImportDialog}
                                handleImportDialogClose={handleImportDialogClose}
                                importFilePath={importFilePath}
                              />
                            </ImportDialogProvider>
                          </PostProcessing>
                        </TooltipProvider>
                      </SidebarProvider>
                    </UpdateCheckProvider>
                  </OnboardingProvider>

                </OllamaDownloadProvider>
              </ConfigProvider>
            </TranscriptProvider>
          </RecordingStateProvider>
        </AnalyticsProvider>
        </InPlaceMeetingRouter>

        {isShadeUI ? (
          <>
            <ShadeToaster />
            <LegacyBridge />
          </>
        ) : (
          <Toaster position="bottom-center" richColors closeButton />
        )}
      </body>
    </html>
  )
}
