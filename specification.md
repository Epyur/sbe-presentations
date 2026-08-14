# specification.md — sbe-presentations (Мастер презентаций)

## 1. Идентификация

- `manifest.id`: `sbe-presentations`
- Имя: Мастер презентаций
- Автор: Полищук Евгений (polishchuk@tn.ru)
- Зависимости: **runtime** — плагин `sbe-llm` (SBE LLM Center) через мост `window.SBE`; **build** — `sbe-core`, `qrcode`.

## 2. Потребляемый сервис

- Сервис: `sbe-llm` (тип `SbeLlmApi` в `sbe-core/src/types.ts`).
- Получение: `getService('sbe-llm')` (мост sbe-core, поллинг 200 мс, таймаут 15 с). Лениво — только при первом использовании LLM (генерация/штурм/извлечение шаблона). При недоступности — Notice с понятным текстом и reject ошибки в вызывающий код.
- Используемые методы:
  - `completeJson(system, user, { model })` — генерация слайдов (`generateSlides`), мозговой штурм (`brainstormNext`), извлечение шаблона (`extractTemplate`).
  - Модель передаётся явно в каждый вызов: выбранная в селекторе view → `llmDefaultModel` → первая из `llmModels`. Центр сам модель не резолвит.

## 3. Данные (paths, относительные к корню vault)

| Путь | Назначение |
|---|---|
| `yourbase/sbe_presentations/presentations_data.json` | БД: `PresentationDbData { presentations, drafts }` |
| `yourbase/sbe_presentations/templates/*.json` | Пользовательские TemplateSpec (приоритет над встроенными с тем же id) |
| `yourbase/sbe_presentations/rules/design_rules.md` | Дизайн-скил (системный промпт генерации) |
| `yourbase/sbe_presentations/rules/template_rules.md` | Правила извлечения шаблона из примера |
| `yourbase/sbe_presentations/pics/` | Загруженные иллюстрации и фоны (resize 1920/0.82, предсказуемые имена `<stem>.jpg`, конфликт `-2`, `-3`) |
| `Экспорт/Презентации/<title>.html` | Экспорт HTML |

Пути жёстко заданы в коде, не настраиваются. Отделены от монолита (`yourbase/presentations_*`, `presentation_pics/`) — конфликтов нет.

## 4. Настройки (`data.json`)

```ts
{
  "llmModels": ["deepseek-v4-pro"],     // до 5 моделей для селектора
  "llmDefaultModel": "",                // модель по умолчанию (пусто → первая из llmModels)
  "presentationDefaultTemplate": "technonicol"
}
```

## 5. Формы данных (типы в `src/types/presentations.ts`)

- `PresentationQuestionaire` — анкета (тема, аудитория, цель, структура, ключевые сообщения, тон, докладчик, телефон/email для QR, дата, кикер, slideCountHint, иллюстрации `[{path, description, uri}]`).
- `PresentationGeneration` — `{ title, slides: PresentationSlide[] }`; `PresentationSlide` — `{ layout: title|section|bullets|cards|table|photo|final, heading1/2, subtitle, bullets[], cards[], table{headers,rows}, speaker, footer, imagePath }`.
- `PresentationTemplate` (TemplateSpec) — canvas, colors, fonts, footerText, slideTransition/Interval/Loop, layouts (title/section/content/bullets/cards/table/photo/final) с `pos` (align + cqw/cqh).
- `PresentationItem` — хранимая запись: `{ id, title, templateId, questionaire, generation, images{}, illustrations?, html?, renderVersion, templateVersion, bgDarken?, slideIntervalSeconds?, slideTransition?, slideLoop?, showProgress?, status?: 'generating'|'error', error? }`.
- `PresentationDraft` — черновик (анкета + лог штурма + error), сохраняется при вводе, чтобы перегенерировать без повторного ввода.
- JSON-обмен с LLM строго через `completeJson<T>`; схемы слайдов/штурма/TemplateSpec описаны в промтах `llm-consumer.ts`.

## 6. Рендер и показ

- Единая сборка HTML — `buildPresentationHtml()` в `presentation-generator.ts` (используется view и редактором). QR vCard — динамический импорт `qrcode`.
- Кэш HTML: инвалидируется по `PRESENTATION_RENDER_VERSION` (=13) и `templateVersion` (mtime JSON-шаблона).
- Показ: режим «Слайды» (полноэкранный, автопоказ, переходы fade/slide/none, прогресс-бар, loop), печать PDF через `window.print()` (CSS `@page 13.333in 7.5in`).

## 7. Ошибки

- LLM-ошибки приходят из sbe-llm (HTTP-коды/таймаут/«API ключ не настроен») → записываются в `item.status='error'` + `item.error`, черновик сохраняется.
- Ошибки рендера/сохранения — `errorMessage()` из sbe-core, Notice.
- «Зависшие» генерации старше 10 мин помечаются `error` при `onOpen`.

## 8. Сборка и проверка

- `npm install` → `npm run build` (esbuild: бандл + склейка tokens/components sbe-core + собственных `tn-pres-*` стилей) → `npx tsc --noEmit` (EXIT=0).
- Релизные файлы: `main.js`, `styles.css`, `manifest.json`, `README.md`.