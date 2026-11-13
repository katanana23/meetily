// Окно «Импорт аудио» в стиле Aid (бенто). Логика целиком из оригинала: хуки
// useImportAudio (выбор и проверка файла, импорт, ход, отмена) и
// useTranscriptionModels (модели распознавания), как в ImportAudioDialog.
// Здесь только вид: плитка файла, поля, ход импорта полосой, тексты по-русски.
// Подключается вместо оригинального окна в app/layout.tsx, когда интерфейс Aid.
'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { ArrowClockwise, FileAudio, UploadSimple, Warning } from '@phosphor-icons/react';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogTitle } from '@/aid/components/ui/dialog';
import { Button } from '@/aid/components/ui/button';
import { Input } from '@/aid/components/ui/input';
import { Spinner } from '@/aid/components/ui/spinner';
import { aidToast } from '@/aid/lib/toasts';
import { formatDuration, formatNumber, plural } from '@/aid/lib/format';
import { cn } from '@/aid/lib/utils';
import { t } from '@/aid/strings';
import { useConfig } from '@/contexts/ConfigContext';
import { useSidebar } from '@/components/Sidebar/SidebarProvider';
import { useImportAudio, type ImportResult } from '@/hooks/useImportAudio';
import { useTranscriptionModels, type ModelOption } from '@/hooks/useTranscriptionModels';
import { LANGUAGES } from '@/constants/languages';

const FORMATS = 'MP4, WAV, MP3, FLAC, OGG, MKV, WebM, WMA';

function fileSize(bytes: number): string {
  if (bytes < 1024 * 1024) return `${Math.max(1, Math.round(bytes / 1024))} КБ`;
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1).replace('.', ',')} МБ`;
  return `${(bytes / (1024 * 1024 * 1024)).toFixed(1).replace('.', ',')} ГБ`;
}

function modelLabel(m: ModelOption): string {
  const engine = m.provider === 'parakeet' ? 'Parakeet' : 'Whisper';
  return `${engine} · ${m.name} · ${formatNumber(Math.round(m.size_mb))} МБ`;
}

/** Поле-список в стиле Aid: колодец со скруглением плитки, как поле поиска. */
function Field({ label, children, hint }: { label: string; children: React.ReactNode; hint?: string }) {
  return (
    <label className="block">
      <span className="mb-1.5 block text-sm font-medium">{label}</span>
      {children}
      {hint && <span className="mt-1.5 block text-xs text-muted-foreground">{hint}</span>}
    </label>
  );
}

const SELECT =
  'h-12 w-full appearance-none rounded-full bg-muted px-5 text-[15px] text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-50';

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  preselectedFile?: string | null;
}

export function ImportDialog({ open, onOpenChange, preselectedFile }: Props) {
  const router = useRouter();
  const { refetchMeetings } = useSidebar();
  const { selectedLanguage, transcriptModelConfig } = useConfig();
  const [title, setTitle] = useState('');
  const [titleTouched, setTitleTouched] = useState(false);
  const [lang, setLang] = useState(selectedLanguage || 'auto');
  const prevOpen = useRef(false);

  const { availableModels, selectedModelKey, setSelectedModelKey, loadingModels, fetchModels, resetSelection } =
    useTranscriptionModels(transcriptModelConfig);

  const onComplete = useCallback(
    (result: ImportResult) => {
      aidToast.success(t('importDone'), {
        description: `${formatNumber(result.segments_count)} ${plural(result.segments_count, 'реплика', 'реплики', 'реплик')}`,
      });
      void refetchMeetings();
      onOpenChange(false);
      router.push(`/meeting-details?id=${encodeURIComponent(result.meeting_id)}`);
    },
    [refetchMeetings, onOpenChange, router],
  );
  const onError = useCallback((message: string) => aidToast.error(t('importFailed'), { description: message }), []);

  const { status, fileInfo, progress, error, isProcessing, selectFile, validateFile, startImport, cancelImport, reset } = useImportAudio({
    onComplete,
    onError,
  });

  // Как в оригинале: сброс только при открытии окна, не при смене настроек
  useEffect(() => {
    const was = prevOpen.current;
    prevOpen.current = open;
    if (!open || was) return;
    reset();
    resetSelection();
    setTitle('');
    setTitleTouched(false);
    setLang(selectedLanguage || 'auto');
    if (preselectedFile) void validateFile(preselectedFile).then((info) => info && setTitle(info.filename));
    void fetchModels();
  }, [open, preselectedFile, selectedLanguage, reset, resetSelection, validateFile, fetchModels]);

  useEffect(() => {
    if (fileInfo && !title && !titleTouched) setTitle(fileInfo.filename);
  }, [fileInfo, title, titleTouched]);

  const model = useMemo((): ModelOption | undefined => {
    const i = selectedModelKey?.indexOf(':') ?? -1;
    if (!selectedModelKey || i < 0) return undefined;
    return availableModels.find((m) => m.provider === selectedModelKey.slice(0, i) && m.name === selectedModelKey.slice(i + 1));
  }, [selectedModelKey, availableModels]);
  const parakeet = model?.provider === 'parakeet';
  useEffect(() => {
    if (parakeet && lang !== 'auto') setLang('auto');
  }, [parakeet, lang]);

  const choose = async () => {
    const info = await selectFile();
    if (info) {
      setTitle(info.filename);
      setTitleTouched(false);
    }
  };

  const start = async () => {
    if (!fileInfo) return;
    await startImport(fileInfo.path, title.trim() || fileInfo.filename, parakeet || lang === 'auto' ? null : lang, model?.name ?? null, model?.provider ?? null);
  };

  const cancel = async () => {
    if (isProcessing) {
      await cancelImport();
      aidToast.message(t('importCancelled'));
    }
    onOpenChange(false);
  };

  // Во время импорта окно не закрывается случайно (Esc, клик мимо)
  const guard = (e: Event) => isProcessing && e.preventDefault();

  const heading = isProcessing ? t('importRunning') : error ? t('importFailed') : t('importAudio');
  const description = isProcessing ? progress?.message || t('importRunningHint') : error ? t('importFailedHint') : t('importHint');

  return (
    <Dialog open={open} onOpenChange={(v) => (!v && isProcessing ? undefined : onOpenChange(v))}>
      <DialogContent className="max-w-lg" onEscapeKeyDown={guard} onInteractOutside={guard}>
        <DialogTitle>{heading}</DialogTitle>
        <DialogDescription>{description}</DialogDescription>

        <div className="mt-5 space-y-4">
          {!isProcessing && !error && !fileInfo && (
            // Плитка выбора файла: вся плитка кнопка
            <button
              type="button"
              onClick={() => void choose()}
              disabled={status === 'validating'}
              className="flex w-full flex-col items-center gap-3 rounded-nested bg-muted px-6 py-8 text-center transition-colors hover:bg-input focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-60"
            >
              <span className="flex size-12 items-center justify-center rounded-full bg-primary/15 text-primary-ink" aria-hidden>
                {status === 'validating' ? <Spinner /> : <UploadSimple className="size-5" />}
              </span>
              <span className="text-[15px] font-semibold">{status === 'validating' ? t('importChecking') : t('importChoose')}</span>
              <span className="text-xs text-muted-foreground">{FORMATS}</span>
            </button>
          )}

          {!isProcessing && !error && fileInfo && (
            <>
              <div className="flex items-center gap-3 rounded-nested bg-muted p-3">
                <span className="flex size-11 shrink-0 items-center justify-center rounded-nested bg-primary/15 text-primary-ink" aria-hidden>
                  <FileAudio className="size-5" />
                </span>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-[15px] font-medium" title={fileInfo.filename}>
                    {fileInfo.filename}
                  </p>
                  <p className="tabular mt-0.5 text-sm text-muted-foreground">
                    {[formatDuration(fileInfo.duration_seconds), fileSize(fileInfo.size_bytes), fileInfo.format?.toUpperCase()].filter(Boolean).join(' · ')}
                  </p>
                </div>
                <Button variant="ghost" className="h-10 shrink-0 px-4 text-muted-foreground" onClick={() => void choose()}>
                  {t('importOtherFile')}
                </Button>
              </div>

              <Field label={t('importTitle')}>
                <Input
                  value={title}
                  onChange={(e) => {
                    setTitle(e.target.value);
                    setTitleTouched(true);
                  }}
                  placeholder={fileInfo.filename}
                  className="bg-muted"
                />
              </Field>

              <div className="grid gap-4 sm:grid-cols-2">
                <Field label={t('recognitionLanguage')} hint={parakeet ? t('importParakeetLanguage') : undefined}>
                  <select className={SELECT} value={lang} onChange={(e) => setLang(e.target.value)} disabled={parakeet}>
                    {LANGUAGES.map((l) => (
                      <option key={l.code} value={l.code}>
                        {l.code === 'auto' ? t('languageAuto') : l.code === 'auto-translate' ? t('languageAutoTranslate') : l.name}
                      </option>
                    ))}
                  </select>
                </Field>
                <Field label={t('recognitionModel')}>
                  <select
                    className={SELECT}
                    value={selectedModelKey ?? ''}
                    onChange={(e) => setSelectedModelKey(e.target.value)}
                    disabled={loadingModels || availableModels.length === 0}
                  >
                    {availableModels.length === 0 && <option value="">{loadingModels ? t('loading') : t('importNoModels')}</option>}
                    {availableModels.map((m) => (
                      <option key={`${m.provider}:${m.name}`} value={`${m.provider}:${m.name}`}>
                        {modelLabel(m)}
                      </option>
                    ))}
                  </select>
                </Field>
              </div>
            </>
          )}

          {isProcessing && (
            <div className="rounded-nested bg-muted p-4" role="status" aria-live="polite">
              <div className="flex items-baseline justify-between gap-3 text-sm">
                <span className="font-medium">{progress?.stage || t('importRunning')}</span>
                <span className="tabular text-muted-foreground">{Math.round(progress?.progress_percentage ?? 0)}%</span>
              </div>
              <div className="mt-3 h-2 overflow-hidden rounded-full bg-muted">
                <div
                  className="h-full origin-left rounded-full bg-primary transition-transform duration-300 ease-out"
                  style={{ transform: `scaleX(${Math.min(progress?.progress_percentage ?? 0, 100) / 100})` }}
                />
              </div>
            </div>
          )}

          {error && (
            <div className="flex gap-3 rounded-nested bg-muted p-4" role="alert">
              <Warning className="mt-0.5 size-5 shrink-0 text-destructive-ink" aria-hidden />
              <p className="min-w-0 break-words text-sm">{error}</p>
            </div>
          )}
        </div>

        <DialogFooter className={cn(isProcessing && 'justify-center')}>
          {!isProcessing && !error && (
            <>
              <Button variant="outline" size="main" onClick={() => onOpenChange(false)}>
                {t('cancel')}
              </Button>
              <Button size="main" onClick={() => void start()} disabled={!fileInfo}>
                <UploadSimple />
                {t('importStart')}
              </Button>
            </>
          )}
          {isProcessing && (
            <Button variant="outline" size="main" onClick={() => void cancel()}>
              {t('importCancel')}
            </Button>
          )}
          {error && (
            <>
              <Button variant="outline" size="main" onClick={() => onOpenChange(false)}>
                {t('close')}
              </Button>
              <Button size="main" onClick={reset}>
                <ArrowClockwise />
                {t('retry')}
              </Button>
            </>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
