'use client';

// Выбор языка распознавания для живой записи: язык системы по умолчанию
// (lib/system-language.ts), «Определять автоматически» остаётся выбором.
// Пишет через setSelectedLanguage оригинала: localStorage `primaryLanguage`
// и команда ядра `set_language_preference`, ядро не меняется.
//
// Готов к вставке в Настройки, вкладка «Распознавание» (pages/Settings.tsx),
// строкой раздела: <Row title={t('settingsLanguageTitle')} hint={<LanguageHint />}><LanguageSelect /></Row>

import { useConfig } from '@/contexts/ConfigContext';
import { LANGUAGES } from '@/constants/languages';
import { t } from '@/shade/strings';

const SELECT =
  'h-12 w-full appearance-none rounded-full bg-muted px-5 text-[15px] text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-50';

function label(code: string, name: string) {
  return code === 'auto' ? t('languageAuto') : code === 'auto-translate' ? t('languageAutoTranslate') : name;
}

/** Parakeet язык не принимает (ядро пишет предупреждение и распознаёт как есть). */
function useParakeet() {
  const { transcriptModelConfig } = useConfig();
  return transcriptModelConfig?.provider === 'parakeet';
}

export function LanguageSelect() {
  const { selectedLanguage, setSelectedLanguage } = useConfig();
  const parakeet = useParakeet();
  return (
    <select
      className={SELECT}
      aria-label={t('settingsLanguageTitle')}
      value={selectedLanguage || 'auto'}
      onChange={(e) => setSelectedLanguage(e.target.value)}
      disabled={parakeet}
    >
      {LANGUAGES.map((l) => (
        <option key={l.code} value={l.code}>
          {label(l.code, l.name)}
        </option>
      ))}
    </select>
  );
}

/** Подсказка строки: для Parakeet честно говорит, что язык не учитывается. */
export function LanguageHint() {
  return <>{useParakeet() ? t('settingsLanguageParakeet') : t('settingsLanguageHint')}</>;
}
