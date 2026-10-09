'use client'

// Dev-only: заглушки Tauri для запуска в обычном браузере (docs/case/mock.md)
import '@/dev/mock-tauri/bootstrap'

// Переключение CSS через импорт в head
import { Inter } from 'next/font/google'
import Sidebar from '@/components/Sidebar'
import { SidebarProvider } from '@/components/Sidebar/SidebarProvider'
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

// Импорт CSS в зависимости от UI
const ui = process.env.NEXT_PUBLIC_UI || 'aid'
if (ui === 'aid') {
  require('@/aid/styles/globals.css')
} else {
  require('./globals.css')
}

const inter = Inter({
  subsets: ['latin', 'cyrillic'],
  weight: ['400', '500', '600'],
  variable: '--font-inter',
  display: 'swap',
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

  // Toggle request-recording-toggle event handler (tray -> start or stop recording)
  useEffect(() => {
    let unlistenFn: UnlistenFn | null = null;

    const setupListener = async () => {
      unlistenFn = await listen<void>(
        'request-recording-toggle',
        () => {
          window.dispatchEvent(new CustomEvent('tray-recording-toggle'))
        }
      );
    };

    setupListener();

    return () => {
      if (unlistenFn) unlistenFn();
    };
  }, []);

  // === Import audio drag-and-drop handlers ===
  const handleDragEnter = useCallback((e: React.DragEvent) => {
    e.preventDefault()
    e.stopPropagation()

    const features = loadBetaFeatures()
    if (!features.importAndRetranscribe) return

    if (e.dataTransfer.items && e.dataTransfer.items.length > 0) {
      const item = e.dataTransfer.items[0]
      if (item.kind === 'file') {
        const file = item.getAsFile()
        if (file) {
          const extension = `.${file.name.split('.').pop()?.toLowerCase() || ''}`
          if (isAudioExtension(extension)) {
            setShowDropOverlay(true)
          }
        }
      }
    }
  }, [])

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault()
    e.stopPropagation()
  }, [])

  const handleDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault()
    e.stopPropagation()

    if (e.currentTarget === e.target) {
      setShowDropOverlay(false)
    }
  }, [])

  const handleDrop = useCallback(async (e: React.DragEvent) => {
    e.preventDefault()
    e.stopPropagation()
    setShowDropOverlay(false)

    const features = loadBetaFeatures()
    if (!features.importAndRetranscribe) {
      toast.error('Import audio feature is not enabled', {
        description: 'Enable it in Settings > Beta Features'
      })
      return
    }

    if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
      const file = e.dataTransfer.files[0]
      const extension = `.${file.name.split('.').pop()?.toLowerCase() || ''}`

      if (!isAudioExtension(extension)) {
        toast.error('Unsupported audio format', {
          description: `Supported formats: ${getAudioFormatsDisplayList()}`
        })
        return
      }

      try {
        const filePath = await invoke<string>('select_and_validate_audio_command', {
          filePath: (file as any).path
        })

        setImportFilePath(filePath)
        setShowImportDialog(true)
      } catch (error) {
        console.error('Error handling dropped audio:', error)
        toast.error('Failed to process audio file', {
          description: error instanceof Error ? error.message : 'Unknown error'
        })
      }
    }
  }, [])

  const handleImportDialogClose = useCallback((open: boolean) => {
    setShowImportDialog(open)
    if (!open) {
      setImportFilePath(null)
    }
  }, [])

  // Aid UI: скрипт темы и переключатель сайдбара
  const isAidUI = ui === 'aid'

  return (
    <html lang="ru" suppressHydrationWarning>
      <head>
        {isAidUI && <script dangerouslySetInnerHTML={{ __html: themeScript }} />}
      </head>
      <body
        className={inter.variable}
        onDragEnter={handleDragEnter}
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onDrop={handleDrop}
      >
        <AnalyticsProvider>
          <UpdateCheckProvider>
            <DownloadProgressToastProvider />
            <OnboardingProvider>
                <TooltipProvider>
                  <ConfigProvider>
                    <RecordingStateProvider>
                      <TranscriptProvider>
                        <OllamaDownloadProvider>
                          <SidebarProvider>
                            <RecordingPostProcessingProvider>
                              <ImportDialogProvider onOpen={(filePath) => {
                                setImportFilePath(filePath || null);
                                setShowImportDialog(true);
                              }}>
                                {showOnboarding && !onboardingCompleted ? (
                                  <OnboardingFlow
                                    onComplete={() => {
                                      setShowOnboarding(false)
                                      setOnboardingCompleted(true)
                                    }}
                                  />
                                ) : (
                                  <>
                                    {isAidUI ? (
                                      <div className="flex h-screen overflow-hidden">
                                        <AidSidebar />
                                        {children}
                                      </div>
                                    ) : (
                                      <>
                                        <Sidebar />
                                        {children}
                                      </>
                                    )}
                                  </>
                                )}

                                <ConditionalImportDialog
                                  showImportDialog={showImportDialog}
                                  handleImportDialogClose={handleImportDialogClose}
                                  importFilePath={importFilePath}
                                />

                                <ImportDropOverlay visible={showDropOverlay} />

                                <Toaster
                                  richColors
                                  position="bottom-center"
                                  toastOptions={{
                                    style: {
                                      background: 'hsl(var(--background))',
                                      color: 'hsl(var(--foreground))',
                                      border: '1px solid hsl(var(--border))',
                                    },
                                  }}
                                />
                              </ImportDialogProvider>
                            </RecordingPostProcessingProvider>
                          </SidebarProvider>
                        </OllamaDownloadProvider>
                      </TranscriptProvider>
                    </RecordingStateProvider>
                  </ConfigProvider>
                </TooltipProvider>
              </OnboardingProvider>
          </UpdateCheckProvider>
        </AnalyticsProvider>
      </body>
    </html>
  )
}
