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

## Правило по инлайн-стилям

- **Legacy-инлайн-стили (перенесённые из монолита 1:1) не трогаем** — они
  задокументированы как намеренное исключение.
- **Всё новое или переносимое из старого места в новое приводим в соответствие
  с правилами**: инлайн-стили заменяем на CSS-классы с префиксом `tn-pres-*`
  в `styles.css`. Так было сделано при переносе анкеты и чата из модалок
  во вкладку «Мастер» (v0.3.0): все их инлайн-стили переведены в классы.

## История работ

### 2026-08-15 — v0.3.1 (подтверждение брифа в мозговом штурме)
- Системный промт `brainstormNext` в `src/services/llm-consumer.ts` переработан:
  после сбора информации агент **не завершает штурм сразу**, а представляет
  пользователю итоговый бриф (3-6 строк, начинается с «БРИФ:») на подтверждение.
  `done:true` возвращается только после подтверждения пользователем; при правках —
  агент вносит уточнения, при необходимости задаёт уточняющие вопросы и повторно
  предлагает обновлённый бриф.
- В user-промт добавлена секция «Текущая стадия»: стадия определяется по наличию
  «БРИФ:» в последнем сообщении ассистента (`awaitingApproval`).
- `npx tsc --noEmit` EXIT=0; `npm run build` OK.
- Версия 0.3.0 → **0.3.1** (manifest + package.json).

### 2026-08-15 — v0.3.0 (две вкладки: Мастер / Реестр)
- Дизайн: `docs/superpowers/specs/2026-08-15-sbe-presentations-tabs-design.md`.
- `PresentationsView` разделён на две вкладки: «Мастер презентаций» (по умолчанию)
  и «Реестр презентаций».
- Анкета (`QuestionnaireModal`) и чат с ИИ (`BrainstormModal`) встроены прямо во
  вкладку «Мастер» (методы `renderQuestionnaire`, `renderChatPanel`); модалки удалены.
- Перегенерация из реестра открывает анкету во «Мастере» (`target = regenerate`)
  и обновляет ту же презентацию; после генерации — авто-переход на «Реестр».
- `activateView` в `main.ts` упрощён (без ручного `view.onOpen()` — дедупликация, паттерн sbe-tasks).
- `npx tsc --noEmit` EXIT=0; `npm run build` OK (`main.js` 161KB).
- Версия 0.2.1 → **0.3.0** (manifest + package.json).

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

- Инлайн-стили `.style.*`/`cssText` — во вьюхе **17 мест** (legacy из монолита:
  тулбар, черновики, реестр — не трогаем по правилу), в модалках/редакторе —
  legacy (предпросмотр, шаблон, изображения, настройки показа, WYSIWYG).
  Новый/перенесённый код (анкета и чат во вкладке «Мастер», v0.3.0) — на
  CSS-классах `tn-pres-*`.
- Прочих нарушений нет: 0 `any`, 0 `fetch`, `window.setTimeout` — корректно,
  все `catch(e: unknown)` + `errorMessage()`.
- Сборка и типы — без ошибок и предупреждений.

## Правила

- `catch(e: unknown)` + `errorMessage()`; `requestUrl()`/`getService()` вместо `fetch`; `window.setTimeout()`; без `any`; UI на русском; автор — Полищук Евгений (polishchuk@tn.ru).