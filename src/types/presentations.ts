/** Схема шаблона презентации (TemplateSpec) — дизайн-токены + геометрия layouts.
 *  Шаблоны хранятся как JSON-файлы в yourbase/presentation_templates/*.json
 *  и подключаются без изменения кода. */
export interface TemplateCanvas {
  w: number;
  h: number;
}

export interface TemplateColors {
  accent: string;
  accentLight?: string;
  dark: string;
  gray: string;
  light: string;
  border: string;
  white: string;
  onDark: string;
  bg?: string;
}

export interface TemplateFonts {
  title: string;
  body: string;
  uppercase?: boolean;
  titleSize?: number; // в cqw
  bodySize?: number;
}

export type AlignPreset =
  | 'top-left' | 'top-center' | 'top-right'
  | 'center-left' | 'center' | 'center-right'
  | 'bottom-left' | 'bottom-center' | 'bottom-right';

/** Позиция элемента на слайде: пресет выравнивания и/или точные координаты.
 *  Числа трактуются как cqw (для left/right) и cqh (для top/bottom), строки — как есть. */
export interface ElementPos {
  align?: AlignPreset;
  left?: number | string;
  top?: number | string;
  right?: number | string;
  bottom?: number | string;
}

/** Позиции элементов титульного слайда. */
export interface TemplateTitlePos {
  brand?: ElementPos;
  slogan?: ElementPos;
  kicker?: ElementPos;
  title?: ElementPos;
  line?: ElementPos;
  speaker?: ElementPos;
}

export interface TemplateTitleLayout {
  bgStyle: 'gradient' | 'solid' | 'image' | 'none';
  bg?: string;
  gradient?: string;
  imageScale?: number;
  brand?: string;
  brandColor?: string;
  slogan?: string;
  sloganColor?: string;
  kicker?: string;
  kickerColor?: string;
  titleColor?: string;
  titleSize?: number;
  speakerColor?: string;
  /** Степень затенения фоновой картинки титульного слайда (0..1, 0 = без затемнения).
   *  Если не задано — используется стандартный градиент/оверлей шаблона. */
  overlayOpacity?: number;
  /** Позиционирование элементов титульного слайда (по умолчанию — стандартная раскладка). */
  pos?: TemplateTitlePos;
}

export interface TemplateLayout {
  bg?: string;
  textColor?: string;
  accentColor?: string;
  marker?: string;
}

export interface TemplateCardsLayout extends TemplateLayout {
  columns?: number;
  rows?: number;
  gap?: number;
  cardBg?: string;
  cardAccent?: string;
}

export interface TemplateTableLayout extends TemplateLayout {
  headerFill?: string;
  headerText?: string;
  altRowFill?: string;
  highlightColumn?: number;
}

export interface TemplatePhotoLayout extends TemplateLayout {
  overlay?: string;
  overlayGradient?: string;
  /** Степень затенения фоновой картинки (0..1, 0 = без затемнения). Если не задано — используется overlay/дефолт. */
  overlayOpacity?: number;
}

export interface TemplateFinalLayout extends TemplateLayout {
  bg?: string;
  centerText?: string;
  /** Позиционирование элементов финального слайда. */
  pos?: {
    /** Позиция центрального блока (заголовок + линия + докладчик + QR) — пресет и/или координаты. */
    block?: ElementPos;
    slogan?: ElementPos;
  };
}

export interface PresentationTemplateLayouts {
  title?: TemplateTitleLayout;
  section?: TemplateLayout;
  content?: TemplateLayout;
  bullets?: TemplateLayout;
  cards?: TemplateCardsLayout;
  table?: TemplateTableLayout;
  photo?: TemplatePhotoLayout;
  final?: TemplateFinalLayout;
}

export interface PresentationTemplate {
  id: string;
  name: string;
  canvas: TemplateCanvas;
  colors: TemplateColors;
  fonts: TemplateFonts;
  footerText?: string;
  /** Интервал автопереключения слайдов в режиме «Слайды» (сек), 0/отсутствует = выключено. */
  slideIntervalSeconds?: number;
  /** Эффект перехода между слайдами в режиме «Слайды». */
  slideTransition?: 'fade' | 'slide' | 'none';
  /** Зацикливать ли показ (после последнего слайда — снова первый и наоборот). */
  slideLoop?: boolean;
  layouts: PresentationTemplateLayouts;
}

/** Слайд — структура контента, сгенерированная LLM. */
export interface PresentationSlide {
  layout: 'title' | 'section' | 'bullets' | 'cards' | 'table' | 'photo' | 'final';
  heading1?: string;
  heading2?: string;
  subtitle?: string;
  bullets?: string[];
  cards?: Array<{ title: string; body: string; accent?: 'accent' | 'dark' }>;
  table?: { headers: string[]; rows: string[][] };
  speaker?: string;
  footer?: string;
  imageHint?: string;
  imagePath?: string; // путь иллюстрации из анкеты (ключ в illustrations), если подходит
}

export interface PresentationGeneration {
  title: string;
  slides: PresentationSlide[];
}

/** Поля анкеты пользователя. */
export interface PresentationQuestionaire {
  topic: string;
  audience: string;
  purpose: string;
  keyMessages: string;
  tone: string;
  structure: string;
  templateId: string;
  presenter: string;
  date: string;
  slideCountHint: string;
  kicker?: string;
  brainstorm?: boolean;
  presenterPhone?: string;
  presenterEmail?: string;
  illustrations?: Array<{ id?: string; path: string; description: string; uri: string }>;
}

/** Хранимая презентация. */
export interface PresentationItem {
  id: string;
  title: string;
  createdAt: string;
  updatedAt: string;
  templateId: string;
  questionaire: PresentationQuestionaire;
  generation: PresentationGeneration;
  images: Record<string, string>; // ключ (напр. "title", "bg:3") → data URI
  illustrations?: Record<string, string>; // путь иллюстрации → data URI
  html?: string;
  /** Версия HTML-рендера, чтобы после обновления плагина пересобирать устаревший html. */
  renderVersion?: number;
  /** Версия шаблона (mtime JSON-файла), при изменении которой html пересобирается. */
  templateVersion?: string;
  /** Затемнение фона по слайду: ключ ('bg:title', 'bg:N') → 0..1. Задаётся в настройках изображений. */
  bgDarken?: Record<string, number>;
  /** Переопределение интервала автопереключения (сек), 0 = выкл. Приоритет над шаблоном. */
  slideIntervalSeconds?: number;
  /** Переопределение эффекта перехода между слайдами. Приоритет над шаблоном. */
  slideTransition?: 'fade' | 'slide' | 'none';
  /** Переопределение зацикливания показа. Приоритет над шаблоном. */
  slideLoop?: boolean;
  /** Показывать ли прогресс-бар в режиме «Слайды». */
  showProgress?: boolean;
  /** Статус генерации: 'generating' — в процессе, 'error' — не удалась. Отсутствует = готова. */
  status?: 'generating' | 'error';
  /** Сообщение об ошибке генерации. */
  error?: string;
}

/** Черновик презентации: анкета + лог мозгового штурма, сохраняется сразу при вводе,
 *  чтобы при ошибке генерации (например 504) можно было повторить без повторного ввода. */
export interface PresentationDraft {
  id: string;
  questionaire: PresentationQuestionaire;
  brainstormLog: Array<{ role: 'user' | 'assistant'; text: string }>;
  createdAt: string;
  updatedAt: string;
  error?: string;
}

export interface PresentationDbData {
  presentations: PresentationItem[];
  drafts?: PresentationDraft[];
}
