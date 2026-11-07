// Слежение за микрофоном во время записи: «Не слышу микрофон» и «Микрофон отключился».
//
// Ядро уровень звука во время записи не отдаёт (audio-levels шлёт синусоиду, только
// для проверки звука), а реплики приходят общим потоком микрофона и звука компьютера.
// Поэтому на macOS слушаем микрофон сами: WebView открывает тот же микрофон
// (getUserMedia, без шумодава и автоусиления, чтобы не прятать тишину) и раз в
// полсекунды меряет средний уровень. Запись ядра это не трогает: macOS даёт
// нескольким программам читать один микрофон.
//
// - Тишина: уровень ниже MIC_SILENT_DBFS дольше MIC_SILENT_MS. Это не «никто не
//   говорит»: собственный шум микрофона в тихой комнате −70…−50 dBFS, а ниже −80
//   бывает, когда микрофон выключен, заглушён или macOS не даёт доступ (нули).
//   Запись не обрывается, только подсказка; уровень вернулся — подсказка ушла.
// - Пропал: дорожка микрофона закончилась (отключили AirPods). Ядро в это время
//   переключается на другой микрофон и шлёт mic-device-switched (тост оригинала).
//   Подсказка «Микрофон отключился» появляется, только если переключения не было.
// На паузе ничего не считаем. Где слушать нельзя (не macOS, нет getUserMedia,
// звук в WebView не запустился), подсказок нет: лучше промолчать, чем соврать.
//
// Страховка первых секунд (probe), когда разрешение macOS проверить не удалось:
// - heard: с микрофона пришёл хоть один ненулевой отсчёт, микрофон пишет;
// - zeros: MIC_ZERO_GUARD_MS одни цифровые нули (так macOS пишет без доступа):
//   запись надо остановить без сохранения и показать карточку (recording.ts);
// - blind: слушать микрофон нельзя, проверить нечем.
//
// В браузере на заглушках вместо микрофона событие aid-mock-mic от mock-tauri.
'use client';

import { useEffect, useRef, useState } from 'react';
import { isMacTauri, isMock } from './mic-access';
import { subscribe } from './tauri-events';

/** Ниже этого среднего уровня микрофон считается молчащим, dBFS. */
export const MIC_SILENT_DBFS = -80;
/** Сколько тишины с микрофона до подсказки «Не слышу микрофон». */
export const MIC_SILENT_MS = 15_000;
/** Сколько первых секунд записи смотреть на цифровые нули. */
export const MIC_ZERO_GUARD_MS = 3_000;
/** Пик ниже этого считается цифровым нулём (настоящий микрофон шумит сильнее на порядки). */
const ZERO_PEAK = 1e-6;
/** Если за столько не пришло ни одного отсчёта, слушать микрофон нечем. */
const BLIND_AFTER_MS = 4_000;
/** Сколько ждать переключения ядра на другой микрофон, прежде чем сказать «Микрофон отключился». */
const SWITCH_GRACE_MS = 4_000;
const TICK_MS = 500;

export type MicWatchState =
  /** Слушаем, всё в порядке, или слушать нельзя. */
  | 'ok'
  /** MIC_SILENT_MS тишины с микрофона. */
  | 'silent'
  /** Микрофон отключили, ядро на другой не переключилось. */
  | 'lost';

/** Что показали первые секунды: pending, heard, zeros или blind (см. шапку файла). */
export type MicProbe = 'pending' | 'heard' | 'zeros' | 'blind';

export interface MicWatch {
  state: MicWatchState;
  probe: MicProbe;
}

interface Options {
  /** Идёт запись с микрофоном (не «только звук компьютера»). */
  active: boolean;
  paused: boolean;
  /** Микрофон из настроек записи: слушаем его, если WebView знает такой. */
  deviceName?: string | null;
}

interface MockMicLevel {
  /** Средний уровень 0…1 (он же пик). */
  rms?: number;
  /** Микрофон отключили. */
  lost?: boolean;
}

const toDb = (x: number) => 20 * Math.log10(Math.max(x, 1e-9));

type Source = { stop: () => void };

/** Микрофон через WebView: отдаёт уровень раз в TICK_MS и сообщает, что дорожка закончилась. */
async function openWebViewMic(deviceName: string | null | undefined, onLevel: (rms: number, peak: number) => void, onLost: () => void): Promise<Source | null> {
  const md = navigator.mediaDevices;
  if (!md?.getUserMedia) return null;
  const constraints: MediaTrackConstraints = { echoCancellation: false, noiseSuppression: false, autoGainControl: false };
  try {
    if (deviceName) {
      const devices = await md.enumerateDevices();
      const match = devices.find((d) => d.kind === 'audioinput' && d.label && (d.label === deviceName || d.label.includes(deviceName)));
      if (match) constraints.deviceId = { exact: match.deviceId };
    }
    const stream = await md.getUserMedia({ audio: constraints });
    const Ctx = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!Ctx) {
      stream.getTracks().forEach((t) => t.stop());
      return null;
    }
    const ctx = new Ctx();
    const analyser = ctx.createAnalyser();
    analyser.fftSize = 2048;
    ctx.createMediaStreamSource(stream).connect(analyser);
    void ctx.resume().catch(() => undefined);
    const buf = new Float32Array(analyser.fftSize);
    const track = stream.getAudioTracks()[0];
    const ended = () => onLost();
    track?.addEventListener('ended', ended);
    const timer = window.setInterval(() => {
      // Звук WebView не запущен: нули анализатора были бы ложной тишиной
      if (ctx.state !== 'running') return;
      analyser.getFloatTimeDomainData(buf);
      let sum = 0;
      let peak = 0;
      for (let i = 0; i < buf.length; i++) {
        const v = buf[i];
        sum += v * v;
        const a = v < 0 ? -v : v;
        if (a > peak) peak = a;
      }
      onLevel(Math.sqrt(sum / buf.length), peak);
    }, TICK_MS);
    return {
      stop: () => {
        window.clearInterval(timer);
        track?.removeEventListener('ended', ended);
        stream.getTracks().forEach((t) => t.stop());
        void ctx.close().catch(() => undefined);
      },
    };
  } catch (error) {
    console.info('[aid] mic: слежение за микрофоном недоступно', error);
    return null;
  }
}

export function useMicWatch({ active, paused, deviceName }: Options): MicWatch {
  const [state, setState] = useState<MicWatchState>('ok');
  const [probe, setProbe] = useState<MicProbe>('pending');
  const silentMs = useRef(0);
  const zeroMs = useRef(0);
  const pausedRef = useRef(paused);
  pausedRef.current = paused;

  useEffect(() => {
    setState('ok');
    setProbe('pending');
    silentMs.current = 0;
    zeroMs.current = 0;
    if (!active) return;
    let cancelled = false;
    let source: Source | null = null;
    let lostTimer: number | undefined;
    let switchedAt = 0;

    let heard = false;
    const blindTimer = window.setTimeout(() => {
      if (!cancelled && !heard && zeroMs.current === 0) setProbe('blind');
    }, BLIND_AFTER_MS);

    const onLevel = (rms: number, peak: number) => {
      if (cancelled || pausedRef.current) return;
      // Страховка первых секунд: один ненулевой отсчёт — микрофон пишет
      if (!heard) {
        if (peak > ZERO_PEAK) {
          heard = true;
          setProbe('heard');
        } else {
          zeroMs.current += TICK_MS;
          if (zeroMs.current >= MIC_ZERO_GUARD_MS) setProbe('zeros');
        }
      }
      if (toDb(rms) < MIC_SILENT_DBFS) {
        silentMs.current += TICK_MS;
        if (silentMs.current >= MIC_SILENT_MS) setState((s) => (s === 'lost' ? s : 'silent'));
      } else {
        silentMs.current = 0;
        // «Отключился» снимает только переключение ядра: новый микрофон по умолчанию
        // слышит WebView, но ядро на него само не перешло
        setState((s) => (s === 'lost' ? s : 'ok'));
      }
    };

    const onLost = () => {
      if (cancelled) return;
      console.info('[aid] mic: микрофон отключился, ждём переключения ядра');
      window.clearTimeout(lostTimer);
      lostTimer = window.setTimeout(() => {
        if (cancelled || Date.now() - switchedAt < SWITCH_GRACE_MS) return;
        setState('lost');
      }, SWITCH_GRACE_MS);
      // Слушаем снова микрофон по умолчанию, когда macOS его сменит
      source?.stop();
      source = null;
      if (!isMacTauri()) return;
      window.setTimeout(() => {
        if (cancelled) return;
        void openWebViewMic(null, onLevel, onLost).then((s) => {
          if (cancelled) s?.stop();
          else source = s;
        });
      }, 1_500);
    };

    // Ядро переключилось на другой микрофон: это не «пропал»
    const offSwitched = subscribe('mic-device-switched', () => {
      switchedAt = Date.now();
      silentMs.current = 0;
      setState('ok');
    });

    let offMock: (() => void) | undefined;
    if (isMock()) {
      offMock = subscribe<MockMicLevel>('aid-mock-mic', (event) => {
        if (event.payload?.lost) onLost();
        else if (typeof event.payload?.rms === 'number') onLevel(event.payload.rms, event.payload.rms);
      });
    } else if (isMacTauri()) {
      void openWebViewMic(deviceName, onLevel, onLost).then((s) => {
        if (cancelled) s?.stop();
        else if (!s) setProbe('blind');
        else source = s;
      });
    } else {
      // Не macOS: слушать микрофон нечем
      setProbe('blind');
    }

    return () => {
      cancelled = true;
      window.clearTimeout(blindTimer);
      window.clearTimeout(lostTimer);
      offSwitched();
      offMock?.();
      source?.stop();
    };
  }, [active, deviceName]);

  // Пауза: тишина не копится, после паузы отсчёт заново
  useEffect(() => {
    if (paused) silentMs.current = 0;
  }, [paused]);

  return { state, probe };
}
