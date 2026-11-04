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
import { themeScript } from '@/aid/lib/theme'
import { AidSidebar } from '@/aid/components/AidSidebar'
import { TooltipProvider as AidTooltipProvider } from '@/aid/components/ui/tooltip'
import { AidToaster } from '@/aid/components/AidToaster'
import { RecordDock } from '@/aid/components/RecordDock'
import { TitleBar } from '@/aid/components/TitleBar'
import { LaunchScreen } from '@/aid/components/LaunchScreen'
import { ImportDialog as AidImportDialog } from '@/aid/components/ImportDialog'
import { AidRecordingControls } from '@/aid/lib/recording-controls'
import { LegacyBridge } from '@/aid/components/LegacyBridge'
import { AidRecordingProvider } from '@/aid/lib/recording-outcome'
import { AidIcons } from '@/aid/components/AidIcons'
import { installTauriEventGuard } from '@/aid/lib/tauri-events'
import { markTitlebarOverlay, syncWindowTheme } from '@/aid/lib/window-theme'
import { installNavDebug } from '@/aid/lib/nav-debug'

// Интерфейс: aid (новый, по умолчанию) или original (оригинальный Meetily).
// Условие записано прямо в if: webpack вычисляет его при сборке и не тянет
// в бандл стили второго интерфейса.
if (process.env.NEXT_PUBLIC_UI === 'original') {
  require('./globals.css')
} else {
  require('@/aid/styles/globals.css')
  // мост: зашитые цвета оригинальных компонентов → токены Aid
  require('@/aid/styles/legacy.css')
}
const isAidUI = process.env.NEXT_PUBLIC_UI !== 'original'
const PostProcessing = isAidUI ? AidRecordingProvider : RecordingPostProcessingProvider
// Aid: страховка от падения unregisterListener при ранней отписке в оригинальных хуках
// и окно в цвет темы с самого старта
if (isAidUI) {
  installTauriEventGuard()
  if (typeof window !== 'undefined') markTitlebarOverlay()
  // ВРЕМЕННО: журнал кликов по списку встреч для проверки на Mac (nav-debug.ts)
  if (typeof window !== 'undefined') installNavDebug()
  void syncWindowTheme()
}

// Aid: SF Pro (системный шрифт macOS) через стек -apple-system в .aid-font
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

  // Aid: своё окно импорта в бенто на тех же хуках оригинала (aid/components/ImportDialog)
  if (isAidUI) {
    return <AidImportDialog open={showImportDialog} onOpenChange={handleImportDialogClose} preselectedFile={importFilePath} />;
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

  // Import audio state
  const [showDropOverlay, setShowDropOverlay] = useState(false)
  const [showImportDialog, setShowImportDialog] = useState(false)
  const [importFilePath, setImportFilePath] = useState<string | null>(null)

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
      })
      .catch((error) => {
        console.error('[Layout] Failed to check onboarding status:', error)
        // Default to showing onboarding if we can't check
        setShowOnboarding(true)
        setOnboardingCompleted(false)
      })
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
    console.log('[Layout] Onboarding completed, reloading app')
    setShowOnboarding(false)
    setOnboardingCompleted(true)
    // Optionally reload the window to ensure all state is fresh
    window.location.reload()
  }

  return (
    <html lang={isAidUI ? 'ru' : 'en'} suppressHydrationWarning>
      <head>
        {isAidUI && <title>ShadeNotes</title>}
        {isAidUI && <script dangerouslySetInnerHTML={{ __html: themeScript }} />}
      </head>
      <body className={`${isAidUI ? `${inter.variable} aid-font` : sourceSans3.variable} font-sans antialiased`}>
        {/* Aid: заставка запуска прямо в HTML, пока скрипты страницы грузятся */}
        {isAidUI && <LaunchScreen />}
        <AnalyticsProvider>
          <RecordingStateProvider>
            <TranscriptProvider>
              <ConfigProvider>
                <OllamaDownloadProvider>
                  <OnboardingProvider>
                    <UpdateCheckProvider>
                      <SidebarProvider>
                        <TooltipProvider>
                          {/* Aid: свой провайдер остановки (решение по содержанию записи, тот же путь для трея) */}
                          <PostProcessing>
                            <ImportDialogProvider onOpen={handleOpenImportDialog}>
                              {/* Download progress toast provider - listens for background downloads */}
                              <DownloadProgressToastProvider />

                              {/* Show onboarding or main app */}
                              {showOnboarding ? (
                                isAidUI ? (
                                  // мастер оригинала в токенах Aid и на русском (LegacyBridge)
                                  <div className="aid-legacy aid-onboarding">
                                    <OnboardingFlow onComplete={handleOnboardingComplete} />
                                  </div>
                                ) : (
                                  <OnboardingFlow onComplete={handleOnboardingComplete} />
                                )
                              ) : isAidUI ? (
                                <AidIcons>
                                  <AidTooltipProvider delayDuration={300}>
                                    {/* Бенто: чёрный (светлая тема: белый) фон, плитки с отступом 8 px; кнопка записи над областью контента */}
                                    <AidRecordingControls>
                                      {/* Сверху полоса окна (кнопки окна, знак, название), ниже две плитки.
                                          data-tauri-drag-region: промежутки между плитками тоже перетаскивают окно */}
                                      <div className="aid-app flex h-screen flex-col overflow-hidden bg-background">
                                      <TitleBar />
                                      <div data-tauri-drag-region className="flex min-h-0 flex-1 gap-2 px-2 pb-2">
                                        <AidSidebar />
                                        {/* Правая часть одной серой плиткой, как сайдбар (.aid-main в globals.css) */}
                                        <div className="aid-main relative flex min-w-0 flex-1 overflow-hidden rounded-tile">
                                          {children}
                                          <RecordDock />
                                        </div>
                                      </div>
                                      </div>
                                    </AidRecordingControls>
                                  </AidTooltipProvider>
                                </AidIcons>
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

        {isAidUI ? (
          <>
            <AidToaster />
            <LegacyBridge />
          </>
        ) : (
          <Toaster position="bottom-center" richColors closeButton />
        )}
      </body>
    </html>
  )
}
