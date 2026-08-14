import { App, Notice, TFile } from 'obsidian';
import type SbePresentationsPlugin from '../main';
import { errorMessage } from '../../../sbe-core/src/utils/errors';
import type { PresentationTemplate, PresentationTemplateLayouts } from '../types/presentations';

const TEMPLATES_DIR = 'yourbase/sbe_presentations/templates';
const RULES_DIR = 'yourbase/sbe_presentations/rules';
const DESIGN_RULES_FILE = `${RULES_DIR}/design_rules.md`;
const TEMPLATE_RULES_FILE = `${RULES_DIR}/template_rules.md`;

/** Дизайн-скил (по умолчанию — содержание presentation-deck + правила Технониколь). */
export const DEFAULT_DESIGN_RULES = `# Дизайн-скил презентаций

Ты — эксперт по структурированию презентаций, которые ясно коммуницируют и убеждают.

## Типы презентаций
- **Stakeholder Update** (информировать и согласовать): контекст, прогресс, ключевые решения, следующие шаги, запросы.
- **Design Review** (получить обратную связь): цели, разбор решения, обоснование, открытые вопросы, запрос фидбэка.
- **Final Showcase** (получить одобрение): проблема, процесс, решение, доказательства, влияние, следующие шаги.
- **Portfolio/Case Study** (показать способность): вызов, подход, ключевые решения, результат, выводы.

## Универсальная структура
1. **Hook** — почему аудитории должно быть важно? (проблема, данные, история)
2. **Context** — что им нужно знать? (фон, ограничения)
3. **Journey** — как вы пришли сюда? (процесс, ключевые моменты)
4. **Solution** — что вы предлагаете? (решение, с обоснованием)
5. **Evidence** — почему это правильно? (исследования, тесты, данные)
6. **Ask** — что вам нужно от них? (одобрение, фидбэк, ресурсы)

## Принципы слайдов
- Одна идея на слайд.
- «Покажи, а не рассказывай» — визуал вместо текста.
- Прогрессивное раскрытие сложности.
- Дизайн «для заднего ряда»: крупный текст, высокая контрастность.
- Учитывай докладчика: краткий текст, понятный с ходу.
- Каждая презентация обязательно заканчивается финальным слайдом с фразой «Спасибо за внимание» — всегда одинаковой, без вариаций.

## Адаптация под аудиторию
- **Руководители**: с impact, кратко, акцент на бизнес-ценности.
- **Инженеры**: технические детали, спецификации, крайние случаи.
- **Смешанная**: слои деталей, начинать с общей картины.

## Best practices
- Начинай с проблем аудитории, а не своих.
- Заканчивай ясным запросом или следующим шагом.

## Ограничения контента
- Заголовки ВСЕ ПРОПИСНЫЕ, короткие (до ~8 слов на строку).
- Каждый слайд не перегружай: максимум 5-6 пунктов, по 1 строке.
- Тон — деловой, без канцелярита, без выдуманных фактов.
- Если данных мало — формулируй осторожно, без домыслов.`;

/** Правила извлечения шаблона из примера презентации. */
export const DEFAULT_TEMPLATE_RULES = `# Правила извлечения шаблона презентации

Из примера презентации (HTML или текстовое описание) извлеки дизайн-систему
и верни ОДИН валидный JSON-объект без пояснений в формате TemplateSpec.

## Схема TemplateSpec
{
  "id": "латинские-буквы-цифры-дефисы",
  "name": "Человеческое имя шаблона",
  "canvas": { "w": 960, "h": 540 },
  "colors": {
    "accent": "#E30613", "accentLight": "#FF6B73",
    "dark": "#242E40", "gray": "#59606D",
    "light": "#ECEEF1", "border": "#BABFC7",
    "white": "#FFFFFF", "onDark": "#FFFFFF", "bg": "#FFFFFF"
  },
  "fonts": { "title": "Arial Black", "body": "Arial", "uppercase": true,
             "titleSize": 2.7, "bodySize": 1.05 },
  "footerText": "дата · название · №",
  "slideTransition": "fade",
  "slideIntervalSeconds": 0,
  "slideLoop": false,
  "layouts": {
    "title":   { "bgStyle": "gradient|solid|image|none", "bg": "#242E40",
                 "gradient": "linear-gradient(...)", "brand": "ЛОГОТИП",
                 "brandColor": "#FFFFFF", "slogan": "Слоган", "sloganColor": "#FFFFFF",
                 "kicker": "ПОВОД · ДАТА", "kickerColor": "#E30613",
                 "titleColor": "#FFFFFF", "titleSize": 3.4, "speakerColor": "#FFFFFF",
                 "overlayOpacity": 0.35,
                 "pos": {
                   "brand":   { "align": "top-right" },
                   "slogan":  { "align": "top-left" },
                   "kicker":  { "align": "top-left", "top": 17 },
                   "title":   { "left": 4.45, "top": 30, "right": 4.45 },
                   "line":    { "left": 4.55, "top": 66 },
                   "speaker": { "left": 4.45, "top": 70, "right": 4.45 }
                 } },
    "section": { "bg": "#FFFFFF", "textColor": "#242E40", "accentColor": "#E30613" },
    "content": { "bg": "#FFFFFF", "textColor": "#242E40", "accentColor": "#E30613" },
    "bullets": { "marker": "#E30613", "textColor": "#242E40" },
    "cards":   { "columns": 2, "rows": 2, "gap": 0.35, "cardBg": "#ECEEF1",
                 "cardAccent": "#E30613", "textColor": "#242E40" },
    "table":   { "headerFill": "#242E40", "headerText": "#FFFFFF",
                 "altRowFill": "#ECEEF1", "highlightColumn": 1, "textColor": "#242E40" },
    "photo":   { "overlay": "linear-gradient(100deg, rgba(16,20,30,.94) 0%, rgba(16,20,30,.18) 60%, rgba(16,20,30,0) 100%)",
                 "overlayOpacity": 0.55,
                 "textColor": "#FFFFFF" },
    "final":   { "bg": "#242E40", "centerText": "#FFFFFF",
                 "pos": { "block": { "align": "center" },
                          "slogan": { "align": "bottom-left" } } }
  }
}

## Как извлекать из примера
1. **Холст**: 16:9 → canvas {w:960, h:540} (или {w:1280,h:720}, если очевидно из CSS).
2. **Цвета**: найди HEX/RGB/HSL в CSS и разложи по ролям: accent — акцент (красный/бренд),
   dark — тёмный (заголовки/шапки), gray — серый (текст/футер), light — светло-серый (карточки),
   border — рамки, white/onDark — тексты на тёмном, bg — фон контентных слайдов.
3. **Шрифты**: возьми font-family заголовков и тела; если всё капсом — uppercase:true.
   Размеры: переведи px в cqw = px/12.8 (для холста 960 → /9.6; для 1280 → /12.8).
4. **Layouts**: для каждого типа слайда опиши фон, цвет текста, акцент. У title — bgStyle,
   gradient, brand (название/лого в правом верхнем углу), kicker (повод/дата), цвета.
5. **footerText**: если в примере есть подпись «дата · название · номер» — запиши с плейсхолдером №.

## Требования
- Всегда возвращай ТОЛЬКО JSON, без markdown-обёртки и комментариев.
- id — латиницей, без пробелов. name — на русском, человеческим.
- Не выдумывай отсутствующие цвета — используй нейтральный дефолт:
  accent #C00000, dark #333333, gray #666666, light #F2F2F2, border #CCCCCC, white #FFFFFF, onDark #FFFFFF, bg #FFFFFF.
- Фон слайдов: если в примере светлый — bg #FFFFFF, тёмный — bg тёмного цвета.`;

const BUILTIN_TEMPLATES: PresentationTemplate[] = [
  {
    id: 'technonicol',
    name: 'Технониколь',
    canvas: { w: 960, h: 540 },
    colors: {
      accent: '#E30613',
      accentLight: '#FF6B73',
      dark: '#242E40',
      gray: '#59606D',
      light: '#ECEEF1',
      border: '#BABFC7',
      white: '#FFFFFF',
      onDark: '#FFFFFF',
      bg: '#FFFFFF',
    },
    fonts: {
      title: 'Arial Black',
      body: 'Arial',
      uppercase: true,
      titleSize: 2.7,
      bodySize: 1.05,
    },
    footerText: 'дата · название доклада · №',
    slideTransition: 'fade',
    slideIntervalSeconds: 0,
    slideLoop: false,
    layouts: {
      title: {
        bgStyle: 'gradient',
        bg: '#242E40',
        gradient: 'linear-gradient(100deg, rgba(16,20,30,.94) 0%, rgba(16,20,30,.18) 60%, rgba(16,20,30,0) 100%)',
        brand: 'ТЕХНОНИКОЛЬ',
        brandColor: '#FFFFFF',
        slogan: 'Знание. Опыт. Мастерство.',
        sloganColor: '#FFFFFF',
        kickerColor: '#E30613',
        titleColor: '#FFFFFF',
        titleSize: 3.4,
        speakerColor: '#FFFFFF',
      },
      section: { bg: '#FFFFFF', textColor: '#242E40', accentColor: '#E30613' },
      content: { bg: '#FFFFFF', textColor: '#242E40', accentColor: '#E30613' },
      bullets: { marker: '#E30613', textColor: '#242E40' },
      cards: { columns: 2, rows: 2, gap: 0.35, cardBg: '#ECEEF1', cardAccent: '#E30613', textColor: '#242E40' },
      table: { headerFill: '#242E40', headerText: '#FFFFFF', altRowFill: '#ECEEF1', highlightColumn: 1, textColor: '#242E40' },
      photo: {
        overlay: 'linear-gradient(100deg, rgba(16,20,30,.94) 0%, rgba(16,20,30,.18) 60%, rgba(16,20,30,0) 100%)',
        textColor: '#FFFFFF',
      },
      final: { bg: '#242E40', centerText: '#FFFFFF' },
    },
  },
];

export class PresentationTemplatesService {
  private plugin: SbePresentationsPlugin;
  private app: App;
  private customTemplates: PresentationTemplate[] = [];
  private templateMtimes = new Map<string, number>();

  constructor(plugin: SbePresentationsPlugin) {
    this.plugin = plugin;
    this.app = plugin.app;
  }

  /** Сеет дефолтные файлы (правила + встроенный шаблон), если их нет. */
  async init(): Promise<void> {
    try {
      const adapter = this.app.vault.adapter;
      for (const dir of [TEMPLATES_DIR, RULES_DIR]) {
        const existsDir = await adapter.exists(dir);
        if (!existsDir) await adapter.mkdir(dir);
      }
      if (!(await adapter.exists(DESIGN_RULES_FILE))) {
        await adapter.write(DESIGN_RULES_FILE, DEFAULT_DESIGN_RULES);
      }
      if (!(await adapter.exists(TEMPLATE_RULES_FILE))) {
        await adapter.write(TEMPLATE_RULES_FILE, DEFAULT_TEMPLATE_RULES);
      }
      for (const t of BUILTIN_TEMPLATES) {
        const path = `${TEMPLATES_DIR}/${t.id}.json`;
        if (!(await adapter.exists(path))) {
          await adapter.write(path, JSON.stringify(t, null, 2));
        }
      }
    } catch (e: unknown) {
      console.error('SBE Презентации: presentation templates seed error', errorMessage(e));
    }
    await this.loadCustomTemplates();
  }

  async loadCustomTemplates(): Promise<void> {
    const adapter = this.app.vault.adapter;
    this.customTemplates = [];
    this.templateMtimes.clear();
    try {
      const list = await adapter.list(TEMPLATES_DIR);
      for (const file of list.files) {
        if (!file.toLowerCase().endsWith('.json')) continue;
        try {
          const content = await adapter.read(file);
          const tpl = JSON.parse(content) as PresentationTemplate;
          if (tpl && tpl.id && tpl.name) {
            this.customTemplates.push(tpl);
            const tf = this.app.vault.getAbstractFileByPath(file);
            if (tf instanceof TFile) {
              this.templateMtimes.set(tpl.id, tf.stat.mtime);
            }
          }
        } catch (e: unknown) {
          console.warn(`SBE Презентации: пропущен повреждённый шаблон презентации ${file}:`, errorMessage(e));
        }
      }
    } catch {
      // папка шаблонов ещё не создана — не ошибка
    }
  }

  /** Перечитывает шаблоны из файлов (нужно вызывать перед рендером, чтобы
   *  правки JSON-шаблонов учитывались сразу). */
  async reload(): Promise<void> {
    await this.loadCustomTemplates();
  }

  /** Версия шаблона для инвалидации кэша HTML (mtime файла или builtin-метка). */
  getTemplateVersion(id: string): string {
    const m = this.templateMtimes.get(id);
    if (m !== undefined) return `file:${m}`;
    return `builtin:${id}`;
  }

  getAllTemplates(): PresentationTemplate[] {
    // Пользовательские шаблоны (JSON-файлы) имеют приоритет над встроенными с тем же id.
    const customIds = new Set(this.customTemplates.map(t => t.id));
    return [
      ...this.customTemplates,
      ...BUILTIN_TEMPLATES.filter(t => !customIds.has(t.id)),
    ];
  }

  getTemplate(id: string): PresentationTemplate | undefined {
    return this.getAllTemplates().find(t => t.id === id);
  }

  async readDesignRules(): Promise<string> {
    try {
      const exists = await this.app.vault.adapter.exists(DESIGN_RULES_FILE);
      if (exists) return await this.app.vault.adapter.read(DESIGN_RULES_FILE);
    } catch {}
    return DEFAULT_DESIGN_RULES;
  }

  async readTemplateRules(): Promise<string> {
    try {
      const exists = await this.app.vault.adapter.exists(TEMPLATE_RULES_FILE);
      if (exists) return await this.app.vault.adapter.read(TEMPLATE_RULES_FILE);
    } catch {}
    return DEFAULT_TEMPLATE_RULES;
  }

  /** Генерация нового шаблона через LLM по примеру (HTML/текст) и сохранение в файл. */
  async createTemplateFromExample(example: string, name: string, model?: string): Promise<PresentationTemplate> {
    const rules = await this.readTemplateRules();
    const spec = await this.plugin.llm.extractTemplate(example, rules, model);
    const safeId = (spec.id || name || 'template').toLowerCase()
      .replace(/[^a-z0-9-_]/g, '-').replace(/-+/g, '-').replace(/^-|-$/g, '') || 'template';
    spec.id = safeId;
    spec.name = name || spec.name || safeId;
    try {
      await this.app.vault.adapter.write(`${TEMPLATES_DIR}/${safeId}.json`, JSON.stringify(spec, null, 2));
      await this.loadCustomTemplates();
      new Notice(`Презентации: шаблон «${spec.name}» создан`);
    } catch (e: unknown) {
      new Notice(`Ошибка сохранения шаблона: ${errorMessage(e)}`);
      throw e;
    }
    return spec;
  }
}

export type { PresentationTemplateLayouts };
