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
- `src/ui/presentations-view.ts` — фасад «LogicTEAM.Презентации» (топбар + сайдбар + контент,
  как sbe-mailer/sbe-documents): сайдбар — пункты «Мастер презентаций»/«Реестр презентаций»
  (раньше — вкладки-пилюли над контентом). Мастер: анкета/штурм/черновики без изменений;
  Реестр — карточками (`tn-pres-reg-card`) вместо инлайн-стилизованных строк. Экспорт HTML,
  предпросмотр/PDF. **«В чат YouGile» удалён** (ждать sbe-yougile).
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

### 2026-08-20 — v0.3.7 (пересборка за sbe-core: SbeContactsApi)
- `sbe-core`: добавлены `SbeContactsApi` и `'sbe-contacts'` в `SbeServiceMap` — пересборка `main.js`, исходники плагина не менялись. Версия 0.3.6 → **0.3.7** (manifest + package.json).
- `npx tsc --noEmit` EXIT=0; `npm run build` OK.

### 2026-08-19 — v0.3.6 (стили анкеты, иллюстраций и встроенного чата)
- Побочно обнаруженное в v0.3.5 (не было исправлено там) теперь закрыто: классы
  `tn-pres-card`, `tn-pres-ill-box`/`-title`/`-desc`/`-preview`/`-card`/`-img`/`-cap`/
  `-input`/`-del`, `tn-pres-hidden`, `tn-pres-chat-panel`/`-sub`/`-body`/`-input`/`-row`,
  `tn-pres-msg`/`-msg-user`, `tn-pres-bubble`/`-bubble-assistant`/`-bubble-user` —
  использовались во вкладке «Мастер» с v0.3.0, но ни одного правила в `styles.css` не
  было (анкета, блок иллюстраций и чат мозгового штурма рендерились без оформления).
  Добавлены все правила: карточка анкеты и панель чата на `--surface`/`--border`/
  `--radius` фасада, блок иллюстраций — превью-карточки с миниатюрой/подписью/полем
  описания, чат — пузыри сообщений (ассистент слева на `--bg`, пользователь справа на
  `--accent`).
- Версия 0.3.5 → **0.3.6** (manifest + package.json). `npx tsc --noEmit` EXIT=0;
  `npm run build` OK (правки только в CSS, TS не менялся).

### 2026-08-19 — v0.3.5 (фасад «LogicTEAM.Презентации»)
- `presentations-view.ts` переоформлен в фасад (топбар + сайдбар + контент), как у
  sbe-mailer/sbe-documents/sbe-calendar: старые вкладки-пилюли «🛠 Мастер презентаций» /
  «🗂 Реестр презентаций» над контентом заменены пунктами сайдбара с тем же переключением
  (`currentTab`); топбар — кнопка «＋ Новая презентация» (была внутри тулбара Мастера,
  дублировала функцию — убрана оттуда), кроме неё тулбар Мастера не изменился («🎨 Новый
  шаблон», выбор модели).
- Вкладка «Реестр»: `renderItem()` переведён с инлайн-стилей на CSS-классы
  `tn-pres-reg-card`/`-head`/`-title`/`-meta`/`-status`/`-error`/`-actions` (правило
  «переносимый код — на классы»); анкета/штурм/черновики во вкладке «Мастер» не трогались
  (legacy-инлайн-стили там сохранены по существующему правилу).
- **Компактные строки анкеты** (по замечанию пользователя — короткие поля «Аудитория» /
  «Цель» / «Структура» и «Докладчик» / «Телефон» / «E-mail» занимали по целой строке
  `Setting` каждое, хотя значения короткие): каждая тройка теперь в одной строке
  `.tn-pres-row` (три `.tn-pres-row-field` с меткой над полем) вместо трёх отдельных
  `new Setting(card)...addDropdown()/.addText()`. Новые хелперы `addCompactDropdown()`/
  `addCompactText()` в `presentations-view.ts`; CSS `.tn-pres-row*` в `styles.css`.
- Метод `render()` переименован в `renderPage()` во всех вызовах (был единственной точкой
  полной перерисовки; отдельного метода-обёртки не оставляли).
- ℹ️ Побочно обнаружено (не исправлялось — вне объёма этой правки): классы
  `tn-pres-card`/`tn-pres-chat-panel`/`tn-pres-ill-*`/`tn-pres-msg*`/`tn-pres-bubble*`,
  используемые анкетой и чатом во вкладке «Мастер» (перенесены на классы в v0.3.0), не имеют
  ни одного правила в `styles.css` — анкета и чат рендерятся без оформления этих блоков.
- Версия 0.3.4 → **0.3.5** (manifest + package.json). `npx tsc --noEmit` EXIT=0;
  `npm run build` OK.

### 2026-08-18 — v0.3.4 (пересборка за sbe-core: sbe-lims в service-map)
- `sbe-core`: добавлены `SbeLimsApi` и `'sbe-lims'` в `SbeServiceMap` — пересборка `main.js`,
  исходники плагина не менялись. Версия 0.3.3 → **0.3.4** (manifest + package.json).
- `npx tsc --noEmit` EXIT=0; `npm run build` OK. Коммит и пуш сделаны.

### 2026-08-18 — v0.3.3 (пересборка за sbe-core: SbeEknApi)
- `sbe-core`: добавлены `SbeEknApi` и `'sbe-ekn'` в `SbeServiceMap` — пересборка `main.js`,
  исходники не менялись. Версия 0.3.2 → **0.3.3** (manifest + package.json).

### 2026-08-17 — v0.3.2 (источник реестра)
- `sbe-core`: `DEFAULT_REGISTRY_URL` → `https://epyur.fvds.ru/registry.json`
  (raw.githubusercontent.com отдавал 429). Пересборка `main.js`, исходники не менялись.
- Версия 0.3.1 → **0.3.2** (manifest + package.json).
- `npx tsc --noEmit` EXIT=0; `npm run build` OK.

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