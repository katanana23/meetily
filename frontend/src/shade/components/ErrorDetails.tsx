// Сворачиваемый исходный текст ошибки ядра: пригодится в отчёте об ошибке.
import { t } from '@/shade/strings';

export function ErrorDetails({ raw }: { raw: string }) {
  if (!raw) return null;
  return (
    <details className="group text-sm">
      <summary className="inline-flex h-11 cursor-pointer select-none items-center rounded-full px-3 text-muted-foreground hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
        {t('details')}
      </summary>
      <pre className="mt-2 max-w-full whitespace-pre-wrap break-words rounded-nested bg-muted p-4 font-mono text-xs text-muted-foreground">
        {raw}
      </pre>
    </details>
  );
}
