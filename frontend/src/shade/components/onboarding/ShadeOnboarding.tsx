// Первый запуск Shade: до трёх шагов, около минуты, одна плитка по центру.
// 1. Живой показ работы (запись → текст → итоги) и «Начать». Загрузка моделей стартует уже здесь.
// 2. «Доступ к звуку» (только macOS): показ запроса macOS и две карточки, микрофон обязателен.
// 3. «Почти готово»: прогресс модели распознавания; пропускается, если она уже скачана.
//
// Логика и данные из OnboardingContext оригинала (useOnboarding): те же команды и события
// ядра с теми же аргументами. Отличия от мастера оригинала:
// - у каждого вызова ядра предел времени (SLOW_MS), после него «Продолжить всё равно»;
// - в конце нет window.location.reload(): перезагрузка в окне Tauri на macOS зависала.
//   Завершение через completeOnboarding() и onComplete, layout заново монтирует провайдеры
//   (key), чтобы они прочитали сохранённые настройки, а экран плавно уходит в приложение.
'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { listen } from '@tauri-apps/api/event';
import { toast } from 'sonner';
import { useOnboarding } from '@/contexts/OnboardingContext';
import type { ParakeetDownloadProgressEvent } from '@/lib/parakeet';
import { ShadeIcons } from '@/shade/components/ShadeIcons';
import { WindowBar } from '@/shade/components/WindowBar';
import { Button } from '@/shade/components/ui/button';
import { cn } from '@/shade/lib/utils';
import { SLOW_MS, SlowError, detectMac, obLog, withTimeout } from '@/shade/lib/onboarding';
import { t } from '@/shade/strings';
import { HelloStep } from './HelloStep';
import { AccessStep } from './AccessStep';
import { ReadyStep, type SpeechModelState } from './ReadyStep';

const PARAKEET_MODEL = 'parakeet-tdt-0.6b-v3-int8';
/** Уход шага (размытие и сдвиг) перед появлением следующего, мс; как .shade-ob-out в globals.css. */
const STEP_OUT_MS = 200;
/** Уход всего экрана в приложение, мс; как .shade-ob-exit. */
const EXIT_MS = 260;
/** Загрузка не начинается: ни одного события прогресса за это время. */
const STALL_MS = SLOW_MS * 2;
/**
 * Загрузка стартует, когда OnboardingContext прочитал состояние моделей с диска (иначе уже
 * скачанная модель пошла бы качаться заново). Признак: ядро назвало модель для итогов.
 * Если его нет, через это время всё равно стартуем.
 */
const START_FALLBACK_MS = 4000;
type StepId = 'hello' | 'access' | 'ready';
export type FinishState = 'idle' | 'saving' | 'slow' | 'failed';


const reducedMotion = () => typeof window !== 'undefined' && window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;

export function ShadeOnboarding({ onComplete }: { onComplete: () => void }) {
  const ob = useOnboarding();
  const { parakeetDownloaded, parakeetProgressInfo, selectedSummaryModel, summaryModelDownloaded, startBackgroundDownloads } = ob;

  const [isMac, setIsMac] = useState<boolean | null>(null);
  useEffect(() => {
    void detectMac().then((mac) => {
      setIsMac(mac);
      obLog(`платформа: ${mac ? 'macOS, нужен доступ к звуку' : 'не macOS, доступ к звуку не нужен'}`);
    });
  }, []);

  // ─── Загрузка моделей: как в DownloadProgressStep оригинала, но с первого экрана ───
  const downloadsStarted = useRef(false);
  const summaryStarted = useRef(false);
  const [downloadsOn, setDownloadsOn] = useState(false);
  const [speechError, setSpeechError] = useState(false);
  const [stalled, setStalled] = useState(false);
  const [retrying, setRetrying] = useState(false);
  const lastProgressAt = useRef(0);

  const startDownloads = useCallback(() => {
    if (downloadsStarted.current) return;
    downloadsStarted.current = true;
    lastProgressAt.current = Date.now();
    setDownloadsOn(true);
    obLog(parakeetDownloaded ? 'модель распознавания уже скачана' : 'загрузка модели распознавания: старт');
    startBackgroundDownloads({ includeParakeet: true, includeSummary: false }).catch((error) => {
      obLog('загрузка модели распознавания не началась', error);
      setSpeechError(true);
    });
  }, [parakeetDownloaded, startBackgroundDownloads]);

  // Старт на первом экране: как только контекст прочитал модели с диска, или по запасному таймеру
  useEffect(() => {
    if (selectedSummaryModel) startDownloads();
  }, [selectedSummaryModel, startDownloads]);
  const startRef = useRef(startDownloads);
  startRef.current = startDownloads;
  useEffect(() => {
    const timer = window.setTimeout(() => startRef.current(), START_FALLBACK_MS);
    return () => window.clearTimeout(timer);
  }, []);

  // Модель для итогов: как только ядро назвало рекомендованную (selectedSummaryModel)
  useEffect(() => {
    if (!downloadsOn || summaryStarted.current || !selectedSummaryModel || summaryModelDownloaded) return;
    summaryStarted.current = true;
    obLog(`загрузка модели для итогов: старт (${selectedSummaryModel})`);
    startBackgroundDownloads({ includeParakeet: false, includeSummary: true, summaryModel: selectedSummaryModel }).catch((error) =>
      obLog('загрузка модели для итогов не началась', error),
    );
  }, [downloadsOn, selectedSummaryModel, summaryModelDownloaded, startBackgroundDownloads]);

  // Ошибка и отмена загрузки: OnboardingContext только пишет их в консоль
  useEffect(() => {
    const offError = listen<{ modelName: string; error: string }>('parakeet-model-download-error', (event) => {
      if (event.payload.modelName !== PARAKEET_MODEL) return;
      obLog('загрузка модели распознавания: ошибка', event.payload.error);
      setSpeechError(true);
    });
    const offProgress = listen<ParakeetDownloadProgressEvent>('parakeet-model-download-progress', (event) => {
      if (event.payload.modelName !== PARAKEET_MODEL) return;
      lastProgressAt.current = Date.now();
      setStalled(false);
      setSpeechError(event.payload.status === 'cancelled');
    });
    return () => {
      void offError.then((off) => off());
      void offProgress.then((off) => off());
    };
  }, []);

  // Загрузка не начинается: через STALL_MS без событий предложить «Повторить»
  useEffect(() => {
    if (!downloadsOn || parakeetDownloaded) return;
    const timer = window.setInterval(() => {
      if (Date.now() - lastProgressAt.current > STALL_MS && parakeetProgressInfo.percent === 0) {
        setStalled((was) => {
          if (!was) obLog(`загрузка модели распознавания: нет событий ${STALL_MS} мс`);
          return true;
        });
      }
    }, 1000);
    return () => window.clearInterval(timer);
  }, [downloadsOn, parakeetDownloaded, parakeetProgressInfo.percent]);

  const retry = useCallback(() => {
    setRetrying(true);
    lastProgressAt.current = Date.now();
    withTimeout('parakeet_retry_download', () => ob.retryParakeetDownload())
      .then(() => setSpeechError(false))
      .catch((error) => {
        // Команда может ждать конца загрузки: долгий ответ значит, что загрузка идёт
        if (error instanceof SlowError) setSpeechError(false);
      })
      .finally(() => {
        setStalled(false);
        setRetrying(false);
      });
  }, [ob]);

  const speech: SpeechModelState = {
    ready: parakeetDownloaded,
    percent: parakeetDownloaded ? 100 : parakeetProgressInfo.percent,
    downloadedMb: parakeetProgressInfo.downloadedMb,
    totalMb: parakeetProgressInfo.totalMb,
    failed: !parakeetDownloaded && (speechError || stalled),
    retrying,
  };

  // ─── Завершение без перезагрузки ───
  const [finish, setFinish] = useState<FinishState>('idle');
  const [exiting, setExiting] = useState(false);
  const left = useRef(false);
  const saving = useRef(false);

  const leave = useCallback(
    (how: 'saved' | 'anyway') => {
      if (left.current) return;
      left.current = true;
      if (how === 'anyway') {
        obLog(
          'продолжили без сохранения: complete_onboarding не ответил или упал. Если он так и не сохранится, этот экран покажется при следующем запуске',
        );
      } else {
        obLog('готово, переходим в приложение');
      }
      // Тосты загрузки, скрытые на этом экране (.shade-onboarding), не всплывают в приложении задним
      // числом («Модель распознавания: загрузка завершена»); идущая загрузка итогов покажет свой тост заново
      toast.dismiss();
      setExiting(true);
      window.setTimeout(onComplete, reducedMotion() ? 0 : EXIT_MS);
    },
    [onComplete],
  );

  const complete = useCallback(() => {
    if (saving.current || left.current) return;
    saving.current = true;
    setFinish('saving');
    withTimeout(
      'completeOnboarding',
      () => ob.completeOnboarding(),
      () => {
        // Поздний ответ: настройки сохранились, человек ещё ждёт на экране
        obLog('complete_onboarding ответил поздно, настройки сохранены');
        leave('saved');
      },
    )
      .then(() => leave('saved'))
      .catch((error) => {
        if (error instanceof SlowError) {
          setFinish('slow'); // ждём дальше, поздний ответ уведёт в приложение сам
        } else {
          saving.current = false;
          setFinish('failed');
        }
      });
  }, [ob, leave]);

  // ─── Шаги и плавная смена ───
  const [step, setStep] = useState<StepId>('hello');
  const [leaving, setLeaving] = useState(false);
  const steps = useMemo<StepId[]>(() => {
    const list: StepId[] = ['hello'];
    if (isMac) list.push('access');
    // «Почти готово» не нужен, если модель распознавания уже есть (но не убираем экран из-под человека)
    if (!parakeetDownloaded || step === 'ready') list.push('ready');
    return list;
  }, [isMac, parakeetDownloaded, step]);

  const next = useCallback(() => {
    const following = steps[steps.indexOf(step) + 1];
    if (!following) {
      complete();
      return;
    }
    obLog(`шаг: ${following}`);
    setLeaving(true);
    window.setTimeout(
      () => {
        setStep(following);
        setLeaving(false);
      },
      reducedMotion() ? 0 : STEP_OUT_MS,
    );
  }, [steps, step, complete]);

  const busy = finish === 'saving' || finish === 'slow';

  return (
    <ShadeIcons>
      {/* .shade-onboarding: пока открыт этот экран, тосты загрузки моделей скрыты (globals.css) */}
      <div data-tauri-drag-region className="shade-onboarding fixed inset-0 flex flex-col bg-background">
        {/* Подложка кнопок окна на том же месте, что в приложении */}
        <div data-tauri-drag-region className="absolute left-2 top-2">
          <WindowBar />
        </div>
        <div data-tauri-drag-region className="flex min-h-0 flex-1 overflow-y-auto px-4 py-4">
          <div className={cn('m-auto w-full max-w-[600px]', exiting && 'shade-ob-exit')}>
            <StepDots count={steps.length} current={Math.max(0, steps.indexOf(step))} />
            <section className="mt-4 rounded-tile bg-card p-5">
              <div key={step} className={leaving ? 'shade-ob-out' : 'shade-ob-in'}>
                {step === 'hello' ? (
                  <HelloStep
                    ready={isMac !== null}
                    busy={busy}
                    onStart={() => {
                      startDownloads();
                      next();
                    }}
                  />
                ) : step === 'access' ? (
                  <AccessStep
                    busy={busy}
                    last={steps[steps.length - 1] === 'access'}
                    onContinue={next}
                    onLater={() => {
                      ob.setPermissionsSkipped(true);
                      next();
                    }}
                  />
                ) : (
                  <ReadyStep speech={speech} summaryReady={summaryModelDownloaded} busy={busy} onRetry={retry} onOpen={next} />
                )}
              </div>
              {(finish === 'slow' || finish === 'failed') && (
                <div className="shade-ob-in mt-6">
                  <FinishNote state={finish} onRetry={complete} onAnyway={() => leave('anyway')} />
                </div>
              )}
            </section>
          </div>
        </div>
      </div>
    </ShadeIcons>
  );
}

function StepDots({ count, current }: { count: number; current: number }) {
  if (count < 2) return null;
  const label = t('obStepOf').replace('{n}', String(current + 1)).replace('{total}', String(count));
  return (
    <div role="img" aria-label={label} className="flex items-center justify-center gap-2">
      {Array.from({ length: count }, (_, i) => (
        <span
          key={i}
          className={cn(
            'shade-ob-dot h-2 rounded-full',
            i === current ? 'w-6 bg-[hsl(var(--primary-edge))]' : i < current ? 'w-2 bg-foreground/40' : 'w-2 bg-foreground/15',
          )}
        />
      ))}
    </div>
  );
}

function FinishNote({ state, onRetry, onAnyway }: { state: 'slow' | 'failed'; onRetry: () => void; onAnyway: () => void }) {
  return (
    <div role="status" className="flex flex-col items-center gap-3 text-center">
      <p className="text-[13px] leading-5 text-muted-foreground">
        {state === 'slow' ? t('obSaveSlow') : t('obSaveFailed')} {t('obNextRunNote')}
      </p>
      <div className="flex flex-wrap justify-center gap-2">
        {state === 'failed' && (
          <Button variant="outline" onClick={onRetry}>
            {t('retry')}
          </Button>
        )}
        <Button variant="outline" onClick={onAnyway}>
          {t('obContinueAnyway')}
        </Button>
      </div>
    </div>
  );
}
