# AGENTS.md — sbe-presentations (Мастер презентаций)

Генерация HTML-презентаций из анкеты через LLM. Потребляет сервис `sbe-llm`
(SBE LLM Center) через мост `window.SBE`. Данные — отдельно от монолита
`yougile-tntn`: `yourbase/sbe_presentations/`.

## Потребление LLM

- `src/services/llm-consumer.ts` — `getService('sbe-llm')` лениво (не в onload),
  при таймауте Notice «Включите плагин sbe-llm и настройте API-ключ». Промты
  генерации (`generateSlides`/`brainstormNext`/`extractTemplate`) — локальные,
  модель резолвится через `getModel()` (default → первая из списка).
- Модели и шаблон по умолчанию — в настройках плагина (`PresentationSettings`).

## Структура

- `src/main.ts` — `SbePresentationsPlugin`: view «📽 Презентации», ribbon, команда, settings tab, reload шаблонов по modify.
- `src/ui/presentations-view.ts` — список/черновики, генерация, экспорт HTML, предпросмотр/PDF. **«В чат YouGile» удалён** (ждать sbe-yougile).
- `src/ui/presentation-modals.ts` — анкета, мозговой штурм, предпросмотр, новый шаблон, изображения, настройки показа. `TaskPickModal` удалён.
- `src/ui/presentation-editor.ts` — WYSIWYG-редактор содержания.
- `src/services/presentation-templates.ts` — TemplateSpec: встроенный «Технониколь» + пользовательские JSON, дизайн-скил.
- `src/services/presentation-generator.ts` — HTML-рендер (per-slide, фоны, QR vCard через `qrcode`).
- `src/database/presentations-db.ts` — БД `yourbase/sbe_presentations/presentations_data.json`.
- `src/ui/settings-tab.ts` — модели LLM, default-модель, шаблон по умолчанию.

## Отличия от монолита

| Монолит yougile-tntn | sbe-presentations |
|---|---|
| `yourbase/presentations_data.json`, `presentation_templates/`, `presentation_rules/`, `presentation_pics/` | `yourbase/sbe_presentations/` (БД, templates/, rules/, pics/) |
| `llmService` (прямые HTTP-запросы) | `llm` → `getService('sbe-llm')` |
| Кнопки «📤 В чат YouGile», TaskPickModal | удалены (временно) |
| классы `mailer-*` | `tn-pres-*` + инлайн-стили (сохранены из монолита, визуальные регрессии не ожидаются) |
| LLM-настройки в своём settings | модели здесь, ключ/URL — в sbe-llm |

## История работ

### 2026-08-15 — v0.2.1 (sbe-tasks)
- Пересборка `main.js` после расширения sbe-core (`SbeYougileApi.client`,
  `SbeTasksApi`). Исходники не менялись.
- Версия 0.2.0 → **0.2.1** (manifest + package.json).
- `npx tsc --noEmit` EXIT=0; `npm run build` OK.

### 2026-08-14 — v0.1.0 (создание)
- Создан в рамках выноса модуля «Презентации» из монолита `yougile-tntn` (дизайн: `docs/superpowers/specs/2026-08-14-sbe-llm-presentations-design.md`).
- Полный перенос: types, БД, шаблоны, генератор, view, модалки, редактор. Убрано только «В чат YouGile».
- Пути данных перенесены в `yourbase/sbe_presentations/` (отдельно от монолита).
- Новый `llm-consumer.ts` вместо `llm-service.ts`: промты локальны, HTTP делает sbe-llm.
- Из `presentation-modals.ts` удалён `TaskPickModal` (зависел от `CachedTask` и клиента YouGile).
- Классы `mailer-*` → `tn-pres-*` (свой styles.css); инлайн-стили UI сохранены как в монолите.
- Исправлены все типовые ошибки генератора: `?? {}` → типизированные литералы + `@types/qrcode`. `npx tsc --noEmit` EXIT=0 (в монолите эти 23 ошибки остаются).
- Сборка: `npm run build` → `main.js` (160KB, qrcode забандлен) + `styles.css`.

## Статистика ошибок и отступлений

- Инлайн-стили `.style.*`/`cssText` — **98 мест** (сохранены из монолита
  намеренно, задокументировано в «Отличиях от монолита»; без визуальных
  регрессий).
- Прочих нарушений нет: 0 `any`, 0 `fetch`, `window.setTimeout` — корректно,
  все `catch(e: unknown)` + `errorMessage()`.
- Сборка и типы — без ошибок и предупреждений.

## Правила

- `catch(e: unknown)` + `errorMessage()`; `requestUrl()`/`getService()` вместо `fetch`; `window.setTimeout()`; без `any`; UI на русском; автор — Полищук Евгений (polishchuk@tn.ru).