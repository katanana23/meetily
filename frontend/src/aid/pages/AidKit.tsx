// Страница /aid-kit: демонстрация токенов, компонентов и стекла в двух темах.
// Только для dev.

'use client';

import { useState } from 'react';
import { Copy, Check, Sparkles, Cloud, Shield, Mic, Upload, Search } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { BentoCard } from '@/aid/components/BentoCard';
import { PrivacyChip } from '@/aid/components/PrivacyChip';
import { CopyButton } from '@/aid/components/CopyButton';
import { Badge } from '@/components/ui/badge';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Switch } from '@/components/ui/switch';
import { Skeleton } from '@/components/ui/skeleton';

export default function AidKit() {
  const [theme, setTheme] = useState<'light' | 'dark'>('light');

  const toggleTheme = () => {
    const next = theme === 'light' ? 'dark' : 'light';
    setTheme(next);
    document.documentElement.classList.toggle('dark', next === 'dark');
  };

  return (
    <div className="min-h-screen p-8 space-y-12">
      <div className="max-w-7xl mx-auto">
        {/* Заголовок */}
        <div className="flex items-center justify-between mb-8">
          <div>
            <h1 className="text-4xl font-bold tracking-tight">Aid Kit</h1>
            <p className="text-muted-foreground mt-2">
              Токены, компоненты и стекло в двух темах
            </p>
          </div>
          <div className="flex items-center gap-3">
            <span className="text-sm text-muted-foreground">Светлая</span>
            <Switch checked={theme === 'dark'} onCheckedChange={toggleTheme} />
            <span className="text-sm text-muted-foreground">Тёмная</span>
          </div>
        </div>

        {/* Токены цвета */}
        <section className="space-y-4">
          <h2 className="text-2xl font-semibold">Токены цвета</h2>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            {[
              { name: 'background', var: '--background' },
              { name: 'foreground', var: '--foreground' },
              { name: 'card', var: '--card' },
              { name: 'primary', var: '--primary' },
              { name: 'secondary', var: '--secondary' },
              { name: 'muted', var: '--muted' },
              { name: 'accent', var: '--accent' },
              { name: 'destructive', var: '--destructive' },
              { name: 'border', var: '--border' },
            ].map((token) => (
              <div
                key={token.name}
                className="space-y-2 p-4 rounded-lg border"
              >
                <div
                  className="h-16 rounded-md border"
                  style={{ background: `hsl(var(${token.var}))` }}
                />
                <p className="text-sm font-mono">{token.name}</p>
              </div>
            ))}
          </div>
        </section>

        {/* Кнопки */}
        <section className="space-y-4">
          <h2 className="text-2xl font-semibold">Кнопки</h2>
          <div className="flex flex-wrap gap-4">
            <Button size="lg">Большая кнопка</Button>
            <Button>Обычная</Button>
            <Button size="sm">Маленькая</Button>
            <Button variant="outline">Outline</Button>
            <Button variant="ghost">Ghost</Button>
            <Button variant="destructive">Destructive</Button>
            <Button disabled>Disabled</Button>
            <Button size="icon">
              <Copy className="h-4 w-4" />
            </Button>
          </div>
        </section>

        {/* CopyButton */}
        <section className="space-y-4">
          <h2 className="text-2xl font-semibold">CopyButton</h2>
          <div className="flex flex-wrap gap-4">
            <CopyButton text="Пример текста для копирования" label="Копировать" />
            <CopyButton
              text="Пример текста"
              markdown="**Пример** в *Markdown*"
              label="Копировать"
              variant="outline"
            />
            <CopyButton text="Маленькая" label="Копировать" size="sm" />
          </div>
        </section>

        {/* PrivacyChip */}
        <section className="space-y-4">
          <h2 className="text-2xl font-semibold">PrivacyChip</h2>
          <div className="flex flex-wrap gap-4">
            <PrivacyChip level="local" />
            <PrivacyChip level="cloud" />
            <PrivacyChip level="unknown" />
          </div>
        </section>

        {/* Badge */}
        <section className="space-y-4">
          <h2 className="text-2xl font-semibold">Badge</h2>
          <div className="flex flex-wrap gap-2">
            <Badge>Default</Badge>
            <Badge variant="secondary">Secondary</Badge>
            <Badge variant="destructive">Destructive</Badge>
            <Badge variant="outline">Outline</Badge>
          </div>
        </section>

        {/* BentoCard */}
        <section className="space-y-4">
          <h2 className="text-2xl font-semibold">BentoCard</h2>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            <BentoCard title="Простая карточка">
              <p className="text-muted-foreground">Содержимое карточки</p>
            </BentoCard>

            <BentoCard
              title="С действием"
              action={<Button variant="ghost" size="sm">Действие</Button>}
            >
              <p className="text-muted-foreground">Действие в шапке</p>
            </BentoCard>

            <BentoCard interactive onClick={() => alert('Клик!')}>
              <div className="flex flex-col items-center justify-center h-32 space-y-2">
                <Mic className="w-8 h-8 text-accent" />
                <p className="font-medium">Интерактивная</p>
              </div>
            </BentoCard>

            <BentoCard
              className="md:col-span-2 bg-gradient-to-br from-accent/10 to-accent/5 border-accent/20"
              interactive
            >
              <div className="flex flex-col items-center justify-center h-48 space-y-4">
                <div className="w-16 h-16 rounded-full bg-accent/10 flex items-center justify-center">
                  <Sparkles className="w-8 h-8 text-accent" />
                </div>
                <p className="text-xl font-semibold">Большая с градиентом</p>
              </div>
            </BentoCard>
          </div>
        </section>

        {/* Tabs */}
        <section className="space-y-4">
          <h2 className="text-2xl font-semibold">Tabs</h2>
          <Tabs defaultValue="tab1" className="w-full">
            <TabsList>
              <TabsTrigger value="tab1">Вкладка 1</TabsTrigger>
              <TabsTrigger value="tab2">Вкладка 2</TabsTrigger>
              <TabsTrigger value="tab3">Вкладка 3</TabsTrigger>
            </TabsList>
            <TabsContent value="tab1" className="mt-4">
              <Card>
                <CardContent className="pt-6">
                  <p>Содержимое первой вкладки</p>
                </CardContent>
              </Card>
            </TabsContent>
            <TabsContent value="tab2" className="mt-4">
              <Card>
                <CardContent className="pt-6">
                  <p>Содержимое второй вкладки</p>
                </CardContent>
              </Card>
            </TabsContent>
            <TabsContent value="tab3" className="mt-4">
              <Card>
                <CardContent className="pt-6">
                  <p>Содержимое третьей вкладки</p>
                </CardContent>
              </Card>
            </TabsContent>
          </Tabs>
        </section>

        {/* Alert */}
        <section className="space-y-4">
          <h2 className="text-2xl font-semibold">Alert</h2>
          <div className="space-y-4">
            <Alert>
              <AlertDescription>
                <p className="font-medium">Информация</p>
                <p className="text-sm mt-1">Обычное уведомление</p>
              </AlertDescription>
            </Alert>
            <Alert variant="destructive">
              <AlertDescription>
                <p className="font-medium">Ошибка</p>
                <p className="text-sm mt-1">Что-то пошло не так</p>
              </AlertDescription>
            </Alert>
          </div>
        </section>

        {/* Skeleton */}
        <section className="space-y-4">
          <h2 className="text-2xl font-semibold">Skeleton</h2>
          <div className="space-y-4">
            <Skeleton className="h-12 w-1/2" />
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <Skeleton className="h-32" />
              <Skeleton className="h-32" />
              <Skeleton className="h-32" />
            </div>
          </div>
        </section>

        {/* Стекло */}
        <section className="space-y-4">
          <h2 className="text-2xl font-semibold">Стекло (backdrop-filter)</h2>
          <div className="relative h-64 rounded-2xl overflow-hidden">
            {/* Фон с градиентом */}
            <div className="absolute inset-0 bg-gradient-to-br from-accent/30 via-chart-1/20 to-chart-3/20" />

            {/* Стеклянная панель */}
            <div className="absolute inset-x-8 top-8 glass rounded-2xl p-6 space-y-2">
              <p className="font-semibold">Стеклянная панель</p>
              <p className="text-sm text-muted-foreground">
                backdrop-filter: blur(12px) saturate(180%)
              </p>
              <p className="text-xs text-muted-foreground">
                С запасным видом при отсутствии backdrop-filter
              </p>
            </div>
          </div>
        </section>

        {/* Радиусы */}
        <section className="space-y-4">
          <h2 className="text-2xl font-semibold">Радиусы</h2>
          <div className="flex flex-wrap gap-4">
            <div className="w-24 h-24 bg-accent rounded-lg flex items-center justify-center text-white text-sm">
              lg
            </div>
            <div className="w-24 h-24 bg-accent rounded-[1.25rem] flex items-center justify-center text-white text-sm">
              1.25rem
            </div>
            <div className="w-24 h-24 bg-accent rounded-[2rem] flex items-center justify-center text-white text-sm">
              2rem
            </div>
            <div className="w-24 h-24 bg-accent rounded-full flex items-center justify-center text-white text-sm">
              full
            </div>
          </div>
        </section>
      </div>
    </div>
  );
}
