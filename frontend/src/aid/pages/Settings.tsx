// Страница настроек Aid Meetings — shadcn/ui + Solar Icons (fill).

'use client';

import { Suspense, useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Separator } from '@/components/ui/separator';
import { Skeleton } from '@/components/ui/skeleton';
import { toast } from 'sonner';

// Solar Icons (Bold/Fill variant)
import {
  AltArrowLeftBold,
  SettingsBold,
  MicrophoneBold,
  SpeakerBold,
  KeyBold,
  StarsLineBold
} from 'solar-icon-set';

interface AudioDevice {
  name: string;
  id: string;
}

interface ModelProvider {
  id: string;
  name: string;
  requiresApiKey: boolean;
}

const MODEL_PROVIDERS: ModelProvider[] = [
  { id: 'ollama', name: 'Ollama (локально)', requiresApiKey: false },
  { id: 'claude', name: 'Claude', requiresApiKey: true },
  { id: 'groq', name: 'Groq', requiresApiKey: true },
  { id: 'openrouter', name: 'OpenRouter', requiresApiKey: true },
];

function SettingsContent() {
  const router = useRouter();

  // Audio devices
  const [micDevices, setMicDevices] = useState<AudioDevice[]>([]);
  const [speakerDevices, setSpeakerDevices] = useState<AudioDevice[]>([]);
  const [selectedMic, setSelectedMic] = useState<string>('');
  const [selectedSpeaker, setSelectedSpeaker] = useState<string>('');

  // AI Settings
  const [transcriptProvider, setTranscriptProvider] = useState<string>('ollama');
  const [summaryProvider, setSummaryProvider] = useState<string>('ollama');
  const [transcriptApiKey, setTranscriptApiKey] = useState<string>('');
  const [summaryApiKey, setSummaryApiKey] = useState<string>('');

  // Advanced
  const [autoSummary, setAutoSummary] = useState<boolean>(true);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);

  useEffect(() => {
    loadSettings();
  }, []);

  const loadSettings = async () => {
    setIsLoading(true);
    try {
      // Mock devices для dev режима
      setMicDevices([
        { id: 'default', name: 'Встроенный микрофон' },
        { id: 'usb', name: 'USB микрофон' },
      ]);
      setSpeakerDevices([
        { id: 'default', name: 'Встроенные динамики' },
        { id: 'blackhole', name: 'BlackHole 2ch' },
      ]);
      setSelectedMic('default');
      setSelectedSpeaker('default');
    } catch (error) {
      console.error('Failed to load settings:', error);
    } finally {
      setIsLoading(false);
    }
  };

  const handleSave = async () => {
    setIsSaving(true);
    try {
      await new Promise((resolve) => setTimeout(resolve, 500));
      toast.success('Настройки сохранены');
    } catch (error: any) {
      console.error('Failed to save settings:', error);
      toast.error('Ошибка сохранения настроек');
    } finally {
      setIsSaving(false);
    }
  };

  const handleBack = () => {
    router.push('/');
  };

  const transcriptProviderData = MODEL_PROVIDERS.find((p) => p.id === transcriptProvider);
  const summaryProviderData = MODEL_PROVIDERS.find((p) => p.id === summaryProvider);

  if (isLoading) {
    return (
      <main className="flex-1 flex flex-col h-screen overflow-hidden bg-background">
        <div className="flex-1 overflow-y-auto px-8 py-6">
          <div className="max-w-[800px]">
            <Skeleton className="h-8 w-64 mb-6" />
            <Skeleton className="h-[400px] w-full" />
          </div>
        </div>
      </main>
    );
  }

  return (
    <main className="flex-1 flex flex-col h-screen overflow-hidden bg-background">
      {/* Header */}
      <header className="border-b px-8 py-5 shrink-0">
        <div className="max-w-[800px]">
          <Button variant="ghost" size="sm" onClick={handleBack} className="mb-3 gap-2">
            <AltArrowLeftBold size={16} />
            Назад
          </Button>
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-muted flex items-center justify-center">
              <SettingsBold size={20} className="text-muted-foreground" />
            </div>
            <h1 className="text-3xl font-semibold">Настройки</h1>
          </div>
        </div>
      </header>

      {/* Content */}
      <div className="flex-1 overflow-y-auto px-8 py-6">
        <div className="max-w-[800px] space-y-8">
          {/* Audio Section */}
          <section>
            <div className="mb-4">
              <h2 className="text-xl font-semibold mb-1">Аудиоустройства</h2>
              <p className="text-sm text-muted-foreground">
                Настройка микрофона и устройства записи системного звука
              </p>
            </div>

            <div className="space-y-6 rounded-xl border p-6 bg-card">
              {/* Microphone */}
              <div className="space-y-2">
                <Label htmlFor="microphone" className="flex items-center gap-2">
                  <MicrophoneBold size={16} />
                  Микрофон
                </Label>
                <Select value={selectedMic} onValueChange={setSelectedMic}>
                  <SelectTrigger id="microphone">
                    <SelectValue placeholder="Выберите микрофон" />
                  </SelectTrigger>
                  <SelectContent>
                    {micDevices.map((device) => (
                      <SelectItem key={device.id} value={device.id}>
                        {device.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <Separator />

              {/* System Audio */}
              <div className="space-y-2">
                <Label htmlFor="system-audio" className="flex items-center gap-2">
                  <SpeakerBold size={16} />
                  Системный звук
                </Label>
                <Select value={selectedSpeaker} onValueChange={setSelectedSpeaker}>
                  <SelectTrigger id="system-audio">
                    <SelectValue placeholder="Выберите устройство" />
                  </SelectTrigger>
                  <SelectContent>
                    {speakerDevices.map((device) => (
                      <SelectItem key={device.id} value={device.id}>
                        {device.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <p className="text-xs text-muted-foreground mt-1">
                  Для записи системного звука требуется виртуальное устройство (BlackHole на macOS)
                </p>
              </div>
            </div>
          </section>

          {/* AI Section */}
          <section>
            <div className="mb-4">
              <h2 className="text-xl font-semibold mb-1">Искусственный интеллект</h2>
              <p className="text-sm text-muted-foreground">
                Провайдеры для транскрипции и создания итогов
              </p>
            </div>

            <div className="space-y-6 rounded-xl border p-6 bg-card">
              {/* Transcript Provider */}
              <div className="space-y-2">
                <Label htmlFor="transcript-provider" className="flex items-center gap-2">
                  <StarsLineBold size={16} />
                  Транскрипция
                </Label>
                <Select value={transcriptProvider} onValueChange={setTranscriptProvider}>
                  <SelectTrigger id="transcript-provider">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {MODEL_PROVIDERS.map((provider) => (
                      <SelectItem key={provider.id} value={provider.id}>
                        {provider.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                {transcriptProviderData?.requiresApiKey && (
                  <div className="space-y-2 mt-3">
                    <Label htmlFor="transcript-api-key" className="flex items-center gap-2">
                      <KeyBold size={14} />
                      API ключ
                    </Label>
                    <Input
                      id="transcript-api-key"
                      type="password"
                      placeholder="Введите API ключ"
                      value={transcriptApiKey}
                      onChange={(e) => setTranscriptApiKey(e.target.value)}
                    />
                  </div>
                )}
              </div>

              <Separator />

              {/* Summary Provider */}
              <div className="space-y-2">
                <Label htmlFor="summary-provider" className="flex items-center gap-2">
                  <StarsLineBold size={16} />
                  Создание итогов
                </Label>
                <Select value={summaryProvider} onValueChange={setSummaryProvider}>
                  <SelectTrigger id="summary-provider">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {MODEL_PROVIDERS.map((provider) => (
                      <SelectItem key={provider.id} value={provider.id}>
                        {provider.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                {summaryProviderData?.requiresApiKey && (
                  <div className="space-y-2 mt-3">
                    <Label htmlFor="summary-api-key" className="flex items-center gap-2">
                      <KeyBold size={14} />
                      API ключ
                    </Label>
                    <Input
                      id="summary-api-key"
                      type="password"
                      placeholder="Введите API ключ"
                      value={summaryApiKey}
                      onChange={(e) => setSummaryApiKey(e.target.value)}
                    />
                  </div>
                )}
              </div>
            </div>
          </section>

          {/* Advanced Section */}
          <section>
            <div className="mb-4">
              <h2 className="text-xl font-semibold mb-1">Дополнительно</h2>
              <p className="text-sm text-muted-foreground">
                Автоматические действия и расширенные опции
              </p>
            </div>

            <div className="space-y-4 rounded-xl border p-6 bg-card">
              <div className="flex items-center justify-between">
                <div className="space-y-0.5 flex-1">
                  <Label htmlFor="auto-summary">Автоматические итоги</Label>
                  <p className="text-xs text-muted-foreground">
                    Создавать итоги сразу после остановки записи
                  </p>
                </div>
                <Switch
                  id="auto-summary"
                  checked={autoSummary}
                  onCheckedChange={setAutoSummary}
                />
              </div>
            </div>
          </section>

          {/* Save Button */}
          <div className="flex items-center justify-end gap-3 pb-8">
            <Button variant="outline" onClick={handleBack}>
              Отмена
            </Button>
            <Button onClick={handleSave} disabled={isSaving}>
              {isSaving ? (
                <>
                  <div className="h-4 w-4 animate-spin rounded-full border-2 border-current border-t-transparent mr-2" />
                  Сохранение...
                </>
              ) : (
                'Сохранить'
              )}
            </Button>
          </div>
        </div>
      </div>
    </main>
  );
}

export default function Settings() {
  return (
    <Suspense
      fallback={
        <div className="flex items-center justify-center h-screen bg-background">
          <p className="text-sm text-muted-foreground">Загрузка...</p>
        </div>
      }
    >
      <SettingsContent />
    </Suspense>
  );
}
