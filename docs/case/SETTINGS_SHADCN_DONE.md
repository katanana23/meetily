# ✅ SETTINGS АДАПТИРОВАНЫ ПОД SHADCN/UI

## 🎯 Что сделано

Создана новая страница настроек `src/aid/pages/Settings.tsx` с полной поддержкой shadcn/ui компонентов.

---

## 📦 Структура

### Header:
- Кнопка "Назад" (ArrowLeft иконка)
- Иконка Settings в квадрате с rounded углами
- Заголовок "Настройки" (text-3xl font-semibold)

### Секции:

#### 1. **Аудиоустройства**
- Select: Микрофон (Mic иконка)
- Select: Системный звук (Speaker иконка)
- Hint: "Для записи системного звука требуется виртуальное устройство"

#### 2. **Искусственный интеллект**
- Select: Провайдер транскрипции (Sparkles иконка)
  - Ollama (локально)
  - Claude
  - Groq
  - OpenRouter
- Input: API ключ (показывается только если провайдер требует, Key иконка)
- Separator
- Select: Провайдер итогов (Sparkles иконка)
- Input: API ключ (если требуется)

#### 3. **Дополнительно**
- Switch: Автоматические итоги
- Label + description: "Создавать итоги сразу после остановки записи"

### Footer:
- Button "Отмена" (outline variant)
- Button "Сохранить" (default variant, с loading state)

---

## 🎨 Используемые компоненты

### shadcn/ui:
```tsx
✅ Button (default/outline, loading state)
✅ Input (type="password" для API ключей)
✅ Label (с description)
✅ Select (SelectTrigger + SelectContent + SelectItem)
✅ Switch (для toggle опций)
✅ Separator (разделители между секциями)
✅ Skeleton (для loading states)
```

### Lucide иконки:
```tsx
✅ ArrowLeft — кнопка "Назад"
✅ Settings — иконка настроек в header
✅ Mic — микрофон
✅ Speaker — системный звук
✅ Key — API ключ
✅ Sparkles — ИИ провайдеры
```

---

## 🎨 Дизайн

### Композиция:
- **Header:** border-b, px-8 py-5
- **Content:** max-w-[800px], space-y-8
- **Секции:** rounded-xl border p-6 bg-card
- **Поля:** space-y-2 (Label + Input/Select)

### Состояния:
- **Loading:** Skeleton на всю страницу
- **Saving:** Button с spinner + "Сохранение..."
- **API Key:** Input type="password", появляется условно

---

## 📝 Роутинг

Обновлён `src/app/settings/page.tsx`:
```tsx
if (ui === 'original') {
  return <OriginalSettings />;
}
return <AidSettings />;
```

---

## ✅ Проверка

**Откройте:** http://localhost:3118/settings

**Должны увидеть:**
1. ✅ Header с кнопкой "Назад"
2. ✅ Секция "Аудиоустройства" с 2 Select
3. ✅ Секция "Искусственный интеллект" с Select и условным Input
4. ✅ Секция "Дополнительно" со Switch
5. ✅ Кнопки "Отмена" и "Сохранить"

**Попробуйте:**
- Выбрать провайдер "Claude" → должен появиться Input для API ключа
- Выбрать "Ollama" → API ключ должен скрыться
- Toggle Switch → состояние меняется
- Нажать "Сохранить" → loading state + toast

---

## 🚀 Готово!

Настройки полностью адаптированы под shadcn/ui и соответствуют стилю остальных страниц.
