// Кнопка копирования: текст и markdown, состояние «Скопировано» без шума.

import { useState } from 'react';
import { Copy, Check } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { t } from '../strings';

interface CopyButtonProps {
  text: string;
  markdown?: string;
  label?: string;
  variant?: 'default' | 'outline' | 'ghost';
  size?: 'default' | 'sm' | 'lg' | 'icon';
  className?: string;
}

export function CopyButton({
  text,
  markdown,
  label,
  variant = 'outline',
  size = 'sm',
  className = '',
}: CopyButtonProps) {
  const [copied, setCopied] = useState(false);
  const [format, setFormat] = useState<'text' | 'markdown'>('text');

  const handleCopy = async (asMarkdown: boolean) => {
    const content = asMarkdown && markdown ? markdown : text;
    setFormat(asMarkdown ? 'markdown' : 'text');

    try {
      await navigator.clipboard.writeText(content);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch (error) {
      console.error('Failed to copy:', error);
    }
  };

  if (!markdown) {
    // Простая кнопка без выбора формата
    return (
      <TooltipProvider>
        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              variant={variant}
              size={size}
              onClick={() => handleCopy(false)}
              className={className}
            >
              {copied ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
              {label && <span className="ml-2">{copied ? t('copiedAll') : label}</span>}
            </Button>
          </TooltipTrigger>
          <TooltipContent>
            <p>{copied ? t('copiedAll') : t('copySegment')}</p>
          </TooltipContent>
        </Tooltip>
      </TooltipProvider>
    );
  }

  // Кнопка с выбором формата
  return (
    <div className={`flex items-center gap-1 ${className}`}>
      <TooltipProvider>
        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              variant={variant}
              size={size}
              onClick={() => handleCopy(false)}
            >
              {copied && format === 'text' ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
              {label && <span className="ml-2">{copied && format === 'text' ? t('copiedAll') : label}</span>}
            </Button>
          </TooltipTrigger>
          <TooltipContent>
            <p>{copied && format === 'text' ? t('copiedAll') : t('copySegment')}</p>
          </TooltipContent>
        </Tooltip>
      </TooltipProvider>

      <TooltipProvider>
        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              variant="ghost"
              size={size}
              onClick={() => handleCopy(true)}
              className="text-muted-foreground hover:text-foreground"
            >
              {copied && format === 'markdown' ? <Check className="h-4 w-4" /> : null}
              <span className="text-xs">{copied && format === 'markdown' ? t('copiedAll') : 'MD'}</span>
            </Button>
          </TooltipTrigger>
          <TooltipContent>
            <p>{copied && format === 'markdown' ? t('copiedAll') : t('copyAsMarkdown')}</p>
          </TooltipContent>
        </Tooltip>
      </TooltipProvider>
    </div>
  );
}
