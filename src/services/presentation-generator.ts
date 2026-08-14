import { App, TFile } from 'obsidian';
import type { PresentationGeneration, PresentationItem, PresentationQuestionaire, PresentationTemplate, PresentationSlide, ElementPos, TemplateTitleLayout, TemplateCardsLayout, TemplateTableLayout, TemplatePhotoLayout, TemplateLayout, TemplateFinalLayout } from '../types/presentations';

function escapeHtml(s: unknown): string {
  return String(s ?? '')
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function upper(s: unknown, uppercase: boolean): string {
  return uppercase ? String(s ?? '').toUpperCase() : String(s ?? '');
}

type PosKey = 'left' | 'top' | 'right' | 'bottom';

function posUnit(v: number | string, axis: 'x' | 'y'): string {
  return typeof v === 'number' ? `${v}${axis === 'x' ? 'cqw' : 'cqh'}` : v;
}

/** Собирает CSS-позиционирование элемента: пресет выравнивания + точные координаты поверх.
 *  defaults — базовые координаты (используются при отсутствии pos). */
function posCss(pos: ElementPos | undefined, defaults: Array<[PosKey, string]>): string {
  const map = new Map<PosKey | 'transform' | 'text-align', string>(defaults);
  if (pos?.align) {
    const a = pos.align;
    map.delete('left'); map.delete('top'); map.delete('right'); map.delete('bottom'); map.delete('transform');
    const vertical: 'top' | 'bottom' | 'mid' = a.includes('top') ? 'top' : a.includes('bottom') ? 'bottom' : 'mid';
    const horizontal: 'left' | 'right' | 'mid' = a.includes('left') ? 'left' : a.includes('right') ? 'right' : 'mid';
    if (vertical === 'top') map.set('top', '3.9cqh');
    else if (vertical === 'bottom') map.set('bottom', '3.9cqh');
    else { map.set('top', '50%'); map.set('transform', 'translateY(-50%)'); }
    if (horizontal === 'left') map.set('left', '4.45cqw');
    else if (horizontal === 'right') map.set('right', '4.45cqw');
    else { map.set('left', '4.45cqw'); map.set('right', '4.45cqw'); map.set('text-align', 'center'); }
  }
  if (pos) {
    if (pos.left !== undefined) map.set('left', posUnit(pos.left, 'x'));
    if (pos.right !== undefined) map.set('right', posUnit(pos.right, 'x'));
    if (pos.top !== undefined) { map.set('top', posUnit(pos.top, 'y')); map.delete('transform'); }
    if (pos.bottom !== undefined) { map.set('bottom', posUnit(pos.bottom, 'y')); map.delete('transform'); }
  }
  const parts: string[] = [];
  for (const [k, v] of map) parts.push(`${k}:${v}`);
  return parts.join(';');
}

function bgImageStyle(uri?: string): string {
  return uri ? `background-image:url('${uri}');` : '';
}

/** Нормализация пути иллюстрации для сопоставления (регистр, пробелы, разделители). */
export function normalizeIllustrationPath(p: unknown): string {
  return String(p ?? '')
    .trim()
    .toLowerCase()
    .replace(/\\/g, '/')
    .replace(/\s+/g, ' ')
    .replace(/^\.?\//, '');
}

/** Находит URI иллюстрации по пути: точное совпадение → нормализованное → по имени файла.
 *  LLM может вернуть imagePath не совпадающий буквально (регистр, лишние пробелы, имя без
 *  расширения) — этот резолвер делает вставку иллюстраций из анкеты устойчивой. */
export function resolveIllustration(
  imagePath: string | undefined,
  illustrations: Record<string, string>,
): string | undefined {
  if (!imagePath) return undefined;
  if (illustrations[imagePath]) return illustrations[imagePath];
  const norm = normalizeIllustrationPath(imagePath);
  if (!norm) return undefined;
  for (const [key, uri] of Object.entries(illustrations)) {
    if (normalizeIllustrationPath(key) === norm) return uri;
  }
  const base = norm.split('/').pop() || norm;
  const stem = base.replace(/\.[a-z0-9]+$/, '');
  if (stem && stem !== base) {
    for (const [key, uri] of Object.entries(illustrations)) {
      const kBase = normalizeIllustrationPath(key).split('/').pop() || '';
      if (kBase === base || kBase.replace(/\.[a-z0-9]+$/, '') === stem) return uri;
    }
  }
  return undefined;
}

/** Папка в корне хранилища, куда копируются все изображения презентаций. */
export const PRESENTATION_PICS_DIR = 'yourbase/sbe_presentations/pics';

/** Версия HTML-рендера. Увеличивается при изменениях разметки/CSS/скрипта презентации,
 *  чтобы существующие презентации пересобирали свой html автоматически. */
export const PRESENTATION_RENDER_VERSION = 13;

function arrayBufferToBase64(buffer: ArrayBuffer): string {
  const bytes = new Uint8Array(buffer);
  let binary = '';
  const chunk = 0x8000;
  for (let i = 0; i < bytes.length; i += chunk) {
    binary += String.fromCharCode(...bytes.subarray(i, i + chunk));
  }
  return btoa(binary);
}

/** Ресайз картинки через canvas до maxDim по большей стороне, JPEG q → Blob. */
function resizeImageToBlob(file: File, maxDim = 1920, quality = 0.82): Promise<Blob> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const img = new Image();
      img.onload = () => {
        const scale = Math.min(1, maxDim / Math.max(img.naturalWidth, img.naturalHeight));
        const w = Math.max(1, Math.round(img.naturalWidth * scale));
        const h = Math.max(1, Math.round(img.naturalHeight * scale));
        const canvas = document.createElement('canvas');
        canvas.width = w;
        canvas.height = h;
        const ctx = canvas.getContext('2d');
        if (!ctx) {
          reject(new Error('Canvas недоступен'));
          return;
        }
        ctx.drawImage(img, 0, 0, w, h);
        canvas.toBlob(b => {
          if (b) resolve(b);
          else reject(new Error('Не удалось сжать изображение'));
        }, 'image/jpeg', quality);
      };
      img.onerror = () => reject(new Error('Некорректное изображение'));
      img.src = reader.result as string;
    };
    reader.onerror = () => reject(new Error('Не удалось прочитать файл'));
    reader.readAsDataURL(file);
  });
}

/** Ресайз картинки через canvas до maxDim по большей стороне, JPEG q82 → data URI. */
export async function resizeImageToDataUri(file: File, maxDim = 1920, quality = 0.82): Promise<string> {
  const blob = await resizeImageToBlob(file, maxDim, quality);
  return await new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = () => reject(new Error('Не удалось прочитать изображение'));
    reader.readAsDataURL(blob);
  });
}

/** Копирует изображение в vault (presentation_pics/) и возвращает предсказуемый путь.
 *  Имя — санитизированное имя исходного файла, при конфликте добавляется -2, -3... */
export async function saveImageToVault(
  app: App,
  file: File,
  dirPath = PRESENTATION_PICS_DIR,
  maxDim = 1920,
  quality = 0.82,
): Promise<string> {
  const blob = await resizeImageToBlob(file, maxDim, quality);
  const arrayBuffer = await blob.arrayBuffer();
  const base = file.name.replace(/[^A-Za-z0-9а-яА-ЯёЁ.\-_ ]/g, '_').trim().replace(/\s+/g, '_') || 'image';
  const stem = base.lastIndexOf('.') > 0 ? base.slice(0, base.lastIndexOf('.')) : base;
  const adapter = app.vault.adapter;
  if (!(await adapter.exists(dirPath))) {
    await adapter.mkdir(dirPath);
  }
  let candidate = `${dirPath}/${stem}.jpg`;
  let n = 2;
  while (await adapter.exists(candidate)) {
    candidate = `${dirPath}/${stem}-${n}.jpg`;
    n++;
  }
  await app.vault.createBinary(candidate, arrayBuffer);
  return candidate;
}

/** URL для отображения файла vault внутри Obsidian (превью в модалках). */
export function getVaultResourceUrl(app: App, ref: string): string {
  if (!ref || ref.startsWith('data:')) return ref;
  try {
    const file = app.vault.getAbstractFileByPath(ref);
    if (file instanceof TFile) {
      return app.vault.getResourcePath(file);
    }
  } catch {
    // ignore
  }
  return ref;
}

/** Собирает vCard докладчика для QR-кода финального слайда. */
export function buildVCard(q?: PresentationQuestionaire): string | null {
  if (!q?.presenterPhone && !q?.presenterEmail) return null;
  return [
    'BEGIN:VCARD',
    'VERSION:3.0',
    `FN:${q.presenter || ''}`,
    `TEL:${q.presenterPhone || ''}`,
    `EMAIL:${q.presenterEmail || ''}`,
    'END:VCARD',
  ].join('\n');
}

/** Полная сборка HTML презентации из генерации + шаблона + ассетов записи
 *  (images, иллюстрации из анкеты, QR-код докладчика). Используется и просмотром,
 *  и редактором содержания — единая точка сборки. */
export async function buildPresentationHtml(
  app: App,
  tpl: PresentationTemplate,
  item: PresentationItem,
  generation: PresentationGeneration,
): Promise<string> {
  const q = item.questionaire;
  const illustrations: Record<string, string> = {};
  for (const ill of q?.illustrations || []) {
    if (ill.uri) {
      const resolved = await resolveImageDataUri(app, ill.uri);
      if (resolved) illustrations[ill.path] = resolved;
    }
  }
  const images: Record<string, string> = {};
  for (const [key, ref] of Object.entries(item.images)) {
    const resolved = await resolveImageDataUri(app, ref);
    if (resolved) images[key] = resolved;
  }
  let qrDataUri: string | undefined;
  const vcard = buildVCard(q);
  if (vcard) {
    try {
      const QRCode = (await import('qrcode')).default;
      qrDataUri = await QRCode.toDataURL(vcard, { width: 250, margin: 2, color: { dark: '#FF0000', light: '#FFFFFF' } });
    } catch {
      // QR не обязателен — игнорируем ошибку
    }
  }
  return renderPresentationHtml(generation, tpl, images, {
    title: item.title,
    date: q?.date,
    presenter: q?.presenter,
    phone: q?.presenterPhone,
    email: q?.presenterEmail,
    qrDataUri,
    illustrations,
    bgDarken: item.bgDarken,
    slideIntervalSeconds: item.slideIntervalSeconds,
    slideTransition: item.slideTransition,
    slideLoop: item.slideLoop,
    showProgress: item.showProgress,
  });
}

/** Превращает ссылку на изображение (data URI или путь в vault) в data URI для встраивания в HTML. */
export async function resolveImageDataUri(app: App, ref: string): Promise<string> {
  if (!ref) return '';
  if (ref.startsWith('data:')) return ref;
  try {
    const file = app.vault.getAbstractFileByPath(ref);
    if (!(file instanceof TFile)) return '';
    const data = await app.vault.readBinary(file);
    const ext = file.extension.toLowerCase();
    const mime = ext === 'jpg' ? 'image/jpeg' : ext === 'svg' ? 'image/svg+xml' : `image/${ext}`;
    return `data:${mime};base64,${arrayBufferToBase64(data)}`;
  } catch {
    return '';
  }
}

function buildCss(tpl: PresentationTemplate, transition: 'fade' | 'slide' | 'none' = 'fade', showProgress = true): string {
  const c = tpl.colors;
  const f = tpl.fonts;
  const l = tpl.layouts;
  const title: TemplateTitleLayout = l.title ?? ({} as TemplateTitleLayout);
  const titleSize = title.titleSize ?? f.titleSize ?? 3.4;      // в cqw (не пиксели)
  const headerSize = f.titleSize ?? 2.7;                        // в cqw
  const bodySize = f.bodySize ?? 1.05;
  const cqw = (px: number) => `${(px / 12.8).toFixed(3)}cqw`;
  const cqh = (px: number) => `${(px / 7.2).toFixed(3)}cqh`;
  const up = f.uppercase ? 'text-transform:uppercase;' : '';
  const cards: TemplateCardsLayout = l.cards ?? {};
  const table: TemplateTableLayout = l.table ?? {};
  const photo: TemplatePhotoLayout = l.photo ?? {};
  const section: TemplateLayout = l.section ?? {};
  const content: TemplateLayout = l.content ?? {};
  const bullets: TemplateLayout = l.bullets ?? {};
  const final: TemplateFinalLayout = l.final ?? {};

  return `
  * { box-sizing:border-box; margin:0; padding:0; }
  html,body { background:#fff; }
  body { font-family:"${f.body}", Arial, sans-serif; color:${c.dark}; }
  .toolbar { position:fixed; top:10px; right:12px; z-index:1000; display:flex; gap:8px; align-items:center; }
  .toolbar button {
    font-family:Arial, sans-serif; font-size:12px; cursor:pointer; border:1px solid ${c.border};
    background:${c.white}; color:${c.dark}; border-radius:4px; padding:4px 10px;
  }
  .toolbar button:hover { background:${c.light}; }
  :fullscreen .toolbar { display:none !important; }
  :-webkit-full-screen .toolbar { display:none !important; }
  .deck { max-width:1280px; margin:0 auto; padding:16px 0; }
  .slide {
    width:100%; aspect-ratio:16/9; container-type:size; position:relative; overflow:hidden;
    background:${c.bg ?? '#fff'}; margin-bottom:16px;
  }
  .slide:last-child { margin-bottom:0; }
  .deck.mode-slides { position:fixed; inset:0; max-width:none; margin:0; padding:0; z-index:999;
    background:#000; display:flex; align-items:center; justify-content:center; }
  .deck.mode-slides .slide {
    position:absolute; inset:0; margin:auto; aspect-ratio:auto;
    width:min(100vw, calc(100vh * 16 / 9));
    height:min(100vh, calc(100vw * 9 / 16));
    opacity:0; pointer-events:none; visibility:hidden;
    transition:opacity .45s ease, transform .45s ease, visibility 0s linear .45s;
  }
  .deck.mode-slides .slide.current { opacity:1; pointer-events:auto; visibility:visible; transition:opacity .45s ease, transform .45s ease; }
  .deck.mode-slides .slide.slide-in-left { transform:translateX(-7%); }
  .deck.mode-slides .slide.slide-in-right { transform:translateX(7%); }
  .deck.mode-slides .slide.slide-out-left { transform:translateX(-7%); }
  .deck.mode-slides .slide.slide-out-right { transform:translateX(7%); }
  ${transition === 'none' ? `
  .deck.mode-slides .slide { transition:none; }
  ` : ''}
  .progress { position:fixed; left:0; right:0; bottom:0; height:3px; z-index:1001; background:rgba(255,255,255,.25); display:none; }
  .deck.mode-slides ~ .progress { display:block; }
  .progress .bar { display:block; height:100%; width:0; background:${c.accent}; transition:width .3s ease; }
  ${showProgress ? '' : '.deck.mode-slides ~ .progress { display:none !important; }'}
  .foot {
    position:absolute; right:4.45cqw; bottom:3.9cqh; font-size:${cqw(13)};
    font-family:"${f.body}", Arial, sans-serif; color:${c.gray}; white-space:nowrap;
  }
  .foot .mark { display:none; }
  .s-final .foot { color:rgba(255,255,255,.75); }
  .s-photo .foot, .s-title .foot { color:rgba(255,255,255,.8); }

  /* ---------- Title ---------- */
  .s-title { background-color:${title.bg ?? c.dark}; }
  .s-title .t-img { position:absolute; inset:0; background-size:cover; background-position:center; }
  .s-title .t-overlay { position:absolute; inset:0; }
  .s-title .t-brand {
    position:absolute; ${posCss(title.pos?.brand, [['right', '4.45cqw'], ['top', '3.9cqh']])}; font-family:"${f.title}", Arial Black, sans-serif;
    color:${title.brandColor ?? c.white}; letter-spacing:.18em; font-size:${cqw(16)}; ${up}
  }
  .s-title .t-slogan {
    position:absolute; ${posCss(title.pos?.slogan, [['left', '4.45cqw'], ['top', '3.9cqh']])}; color:${title.sloganColor ?? c.white};
    font-size:${cqw(15)}; letter-spacing:.06em; ${up}
  }
  .s-title .t-kicker {
    position:absolute; ${posCss(title.pos?.kicker, [['left', '4.45cqw'], ['top', '17cqh']])}; color:${title.kickerColor ?? c.accent};
    font-size:1.172cqw; font-weight:bold; letter-spacing:.08em; ${up}
  }
  .s-title .t-title {
    position:absolute; ${posCss(title.pos?.title, [['left', '4.45cqw'], ['top', '30cqh'], ['right', '4.45cqw']])}; font-family:"${f.title}", Arial Black, sans-serif;
    color:${title.titleColor ?? c.white}; font-size:${titleSize}cqw; line-height:1.16; ${up}
  }
  .s-title .t-line { position:absolute; ${posCss(title.pos?.line, [['left', '4.55cqw'], ['top', '66cqh']])}; width:7cqw; height:0.4cqh; background:${c.accent}; }
  .s-title .t-speaker {
    position:absolute; ${posCss(title.pos?.speaker, [['left', '4.45cqw'], ['top', '70cqh'], ['right', '4.45cqw']])}; color:${title.speakerColor ?? c.white};
    font-size:${cqw(14)}; line-height:1.3;
  }

  /* ---------- Section / шмуцтитул ---------- */
  .s-section { background:${section.bg ?? c.bg ?? '#fff'}; }
  .s-section .sec-body { position:absolute; inset:0; display:grid; grid-template-columns:1fr 1fr; }
  .s-section .sec-img {
    background-size:cover; background-position:center; background-color:${c.light};
    border-right:1px solid ${c.border};
  }
  .s-section .sec-txt { display:flex; flex-direction:column; justify-content:center; padding:0 4.45cqw; }
  .s-section .h1 {
    font-family:"${f.title}", Arial Black, sans-serif; color:${section.accentColor ?? c.accent};
    font-size:${headerSize}cqw; line-height:1.15; ${up} margin-bottom:2cqh;
  }
  .s-section .sub { color:${section.textColor ?? c.dark}; font-size:${cqw(14)}; line-height:1.35; }

  /* ---------- Content (bullets / cards / table) ---------- */
  .s-content { background:${content.bg ?? c.bg ?? '#fff'}; background-size:cover; background-position:center; }
  .s-content .s-bg-dark, .s-final .s-bg-dark { position:absolute; inset:0; }
  .s-content .hd {
    position:absolute; left:4.45cqw; top:4.45cqw; right:4.45cqw;
    font-family:"${f.title}", Arial Black, sans-serif; font-size:${headerSize}cqw; line-height:1.2; ${up}
  }
  .s-content .hd .l1 { color:${content.accentColor ?? c.accent}; }
  .s-content .hd .l2 { color:${content.textColor ?? c.dark}; }
  .s-content .body-bullets { position:absolute; left:4.45cqw; top:24cqh; right:4.45cqw; }
  .s-content .bullet { display:flex; gap:1.2cqw; margin-bottom:2.2cqh; align-items:flex-start; }
  .s-content .bullet .mark {
    width:1.4cqw; height:1.4cqw; flex:0 0 auto; background:${bullets.marker ?? c.accent};
    margin-top:0.45cqh; border-radius:50%;
  }
  .s-content .bullet .bt { color:${bullets.textColor ?? c.dark}; font-size:${cqw(bodySize * 15)}; line-height:1.25; }
  .s-content .cards-grid { position:absolute; left:4.45cqw; top:24cqh; right:4.45cqw; bottom:10cqh;
    display:grid; grid-template-columns:repeat(${cards.columns ?? 2},1fr);
    grid-template-rows:repeat(${cards.rows ?? 2},1fr); gap:${(cards.gap ?? 0.35) * 12.8}cqw; }  .s-content .card {
    background:${cards.cardBg ?? c.light}; border:1px solid ${c.border}; padding:1.8cqw;
    border-top:0.45cqh solid ${cards.cardAccent ?? c.accent}; overflow:hidden;
  }
  .s-content .card .card-t {
    font-family:"${f.title}", Arial Black, sans-serif; color:${cards.cardAccent ?? c.accent};
    font-size:${cqw(16)}; margin-bottom:1cqh; ${up}
  }
  .s-content .card .card-b { color:${cards.textColor ?? c.dark}; font-size:${cqw(12)}; line-height:1.3; }
  .s-content table { border-collapse:collapse; width:100%; }
  .s-content .tbl-wrap { position:absolute; left:4.45cqw; top:24cqh; right:4.45cqw; }
  .s-content th {
    background:${table.headerFill ?? c.dark}; color:${table.headerText ?? c.white};
    font-family:"${f.title}", Arial Black, sans-serif; font-size:${cqw(12)}; text-align:left;
    padding:0.8cqw 0.9cqw;
  }
  .s-content td { padding:0.8cqw 0.9cqw; font-size:${cqw(12)}; color:${table.textColor ?? c.dark}; }
  .s-content tr:nth-child(odd) td { background:${table.altRowFill ?? c.light}; }
  .s-content td.hl {
    color:${c.accent}; font-family:"${f.title}", Arial Black, sans-serif; font-weight:bold;
  }

  /* ---------- Иллюстрация справа от текста ---------- */
  .s-content .ill {
    position:absolute; right:4.45cqw; top:24cqh; bottom:10cqh; width:42cqw;
    border-radius:4px; overflow:hidden; border:1px solid ${c.border};
  }
  .s-content .ill img { width:100%; height:100%; object-fit:cover; display:block; }
  .s-content.has-ill .body-bullets { right:48.5cqw; }
  .s-content.has-ill .tbl-wrap { right:48.5cqw; }
  .s-content.has-ill .cards-grid { right:48.5cqw; }

  /* ---------- Photo ---------- */
  .s-photo { background-color:${photo.bg ?? c.dark}; background-size:cover; background-position:center; }
  .s-photo .p-overlay { position:absolute; inset:0; background:${photo.overlay ?? 'rgba(16,20,30,.6)'}; }
  .s-photo .p-content { position:absolute; inset:0; z-index:1; }
  .s-photo .p-hd {
    position:absolute; left:4.45cqw; top:4.45cqw; right:4.45cqw;
    font-family:"${f.title}", Arial Black, sans-serif; font-size:${headerSize}cqw; line-height:1.2; ${up}
  }
  .s-photo .p-hd .l1 { color:${photo.accentColor ?? c.accentLight ?? '#ff4b55'}; }
  .s-photo .p-hd .l2 { color:${photo.textColor ?? c.white}; }
  .s-photo .p-body { position:absolute; left:4.45cqw; top:26cqh; right:4.45cqw; }
  .s-photo .bullet { display:flex; gap:1.2cqw; margin-bottom:2.2cqh; align-items:flex-start; }
  .s-photo .bullet .mark { width:1.4cqw; height:1.4cqw; flex:0 0 auto; background:${c.accent};
    margin-top:0.45cqh; border-radius:50%; }
  .s-photo .bullet .bt { color:${photo.textColor ?? c.white}; font-size:${cqw(bodySize * 15)}; line-height:1.25; }

  /* ---------- Final ---------- */
  .s-final { background:${final.bg ?? c.dark}; background-size:cover; background-position:center; position:relative; text-align:center; }
  ${(() => {
    const blockPos = final.pos?.block;
    const blockCss = blockPos
      ? posCss(blockPos, [['left', '4.45cqw'], ['right', '4.45cqw'], ['top', '50%']])
      : 'left:4.45cqw;right:4.45cqw;top:50%;transform:translateY(-50%);';
    return `.fin-block { position:absolute; display:flex; flex-direction:column; align-items:center; ${blockCss} }`;
  })()}
  .s-final .fin-center {
    font-family:"${f.title}", Arial Black, sans-serif; color:${final.centerText ?? c.white};
    font-size:${headerSize + 1}cqw; ${up} letter-spacing:.04em;
  }
  .s-final .fin-line { width:7cqw; height:0.4cqh; background:${c.accent}; margin:3cqh auto; }
  .s-final .fin-speaker { color:rgba(255,255,255,.85); font-size:${cqw(14)}; }
  .s-final .fin-qr { margin-top:2.5cqh; }
  .s-final .fin-qr img { width:${cqw(150)}; height:${cqw(150)}; border-radius:4px; display:block; margin:0 auto; }
  .s-final .fin-slogan { position:absolute; ${posCss(final.pos?.slogan, [['left', '4.45cqw'], ['bottom', '3.9cqh']])}; color:rgba(255,255,255,.6);
    font-size:${cqw(13)}; letter-spacing:.06em; ${up} }

  @media print {
    @page { size:13.333in 7.5in !important; margin:0 !important; }
    * { -webkit-print-color-adjust:exact !important; print-color-adjust:exact !important; }
    html, body { margin:0 !important; padding:0 !important; background:#fff !important; }
    .toolbar { display:none !important; }
    .progress { display:none !important; }
    .deck { max-width:none !important; padding:0 !important; margin:0 !important; }
    .deck.mode-slides { position:static !important; display:block !important; background:#fff !important; }
    .deck.mode-slides .slide, .slide {
      display:block !important; position:static !important; margin:0 !important; padding:0 !important;
      opacity:1 !important; visibility:visible !important; pointer-events:auto !important;
      width:100% !important; height:100vh !important; aspect-ratio:auto !important; transform:none !important;
    }
    .slide { break-after:page; page-break-after:always; }
    .slide:last-child { break-after:auto; page-break-after:auto; }
  }
  `;
}

function renderSlide(
  slide: PresentationSlide,
  index: number,
  total: number,
  tpl: PresentationTemplate,
  images: Record<string, string>,
  meta?: {
    title?: string;
    date?: string;
    presenter?: string;
    phone?: string;
    email?: string;
    qrDataUri?: string;
    illustrations?: Record<string, string>;
    /** Затемнение фоновой картинки по слайду: 'bg:title' / 'bg:N' → 0..1. */
    bgDarken?: Record<string, number>;
  },
): string {
  const c = tpl.colors;
  const f = tpl.fonts;
  const up = f.uppercase ? 'uppercase' : 'none';
  const presTitle = meta?.title || '';
  const presDate = meta?.date || '';
  const footer = (slide.footer || tpl.footerText || '')
    .replace(/дата/g, presDate || 'дата')
    .replace(/название доклада/g, presTitle || 'название доклада')
    .replace(/название/g, presTitle || 'название');
  const footHtml = footer
    ? `<div class="foot"><span class="mark"></span>${escapeHtml(footer).replace('№', `${index + 1}`)}</div>`
    : '';
  const hd = slide.heading1 || slide.heading2
    ? `<div class="hd"><span class="l1">${escapeHtml(upper(slide.heading1, f.uppercase ?? true))}</span>${slide.heading2 ? `<br><span class="l2">${escapeHtml(upper(slide.heading2, f.uppercase ?? true))}</span>` : ''}</div>`
    : '';
  const illUri = resolveIllustration(slide.imagePath, meta?.illustrations || {});
  const illHtml = illUri
    ? `<div class="ill"><img src="${illUri}" alt=""></div>`
    : '';
  const illCls = illUri ? ' has-ill' : '';

  switch (slide.layout) {
    case 'title': {
      const title: TemplateTitleLayout = tpl.layouts.title ?? ({} as TemplateTitleLayout);
      const bgUri = images['bg:title'];
      const gradient = title.bgStyle === 'gradient' && title.gradient ? title.gradient : '';
      const overlay = bgUri && gradient ? gradient.replace(/rgba\(16,20,30,(\.\d+|0)\)/g, 'rgba(16,20,30,.25)') : gradient;
      const titleDarken = meta?.bgDarken?.['bg:title'] ?? title.overlayOpacity;
      return `<div class="slide s-title">
        ${bgUri ? `<div class="t-img" style="${bgImageStyle(bgUri)}"></div>` : ''}
        ${overlay ? `<div class="t-overlay" style="background:${overlay};"></div>` : ''}
        ${titleDarken !== undefined ? `<div class="t-overlay" style="background:rgba(0,0,0,${titleDarken});"></div>` : ''}
        ${title.brand ? `<div class="t-brand">${escapeHtml(title.brand)}</div>` : ''}
        ${title.slogan ? `<div class="t-slogan">${escapeHtml(title.slogan)}</div>` : ''}
        ${title.kicker || slide.subtitle ? `<div class="t-kicker">${escapeHtml(title.kicker || slide.subtitle)}</div>` : ''}
        <div class="t-title">${escapeHtml(upper(slide.heading1 || slide.heading2 || slide.subtitle || '', true))}</div>
        <div class="t-line"></div>
        ${slide.speaker ? `<div class="t-speaker">${escapeHtml(slide.speaker)}</div>` : ''}
        ${footHtml}
      </div>`;
    }
    case 'section': {
      const bgUri = images[`bg:${index}`] || images[`img:${index}`];
      const heading = upper(slide.heading1 || slide.subtitle || '', f.uppercase ?? true);
      const secDarken = meta?.bgDarken?.[`bg:${index}`];
      const secImgStyle = bgUri
        ? (secDarken !== undefined
          ? `background-image:linear-gradient(rgba(0,0,0,${secDarken}),rgba(0,0,0,${secDarken})),url('${bgUri}');`
          : bgImageStyle(bgUri))
        : '';
      return `<div class="slide s-section">
        ${secImgStyle ? `<div class="sec-img" style="${secImgStyle}"></div>` : `<div class="sec-img"></div>`}
        <div class="sec-txt">
          <div class="h1">${escapeHtml(heading)}</div>
          ${slide.heading2 ? `<div class="sub">${escapeHtml(slide.heading2)}</div>` : ''}
        </div>
        ${footHtml}
      </div>`;
    }
    case 'bullets': {
      const bullets = (slide.bullets || []).map(b =>
        `<div class="bullet"><span class="mark"></span><span class="bt">${escapeHtml(b)}</span></div>`).join('');
      const bgUri = images[`bg:${index}`];
      const darken = meta?.bgDarken?.[`bg:${index}`];
      return `<div class="slide s-content${illCls}" ${bgUri ? `style="${bgImageStyle(bgUri)}"` : ''}>
        ${darken !== undefined && bgUri ? `<div class="s-bg-dark" style="background:rgba(0,0,0,${darken});"></div>` : ''}
        ${hd}
        <div class="body-bullets">${bullets}</div>
        ${illHtml}
        ${footHtml}
      </div>`;
    }
    case 'cards': {
      const cards = (slide.cards || []).map(card =>
        `<div class="card"><div class="card-t">${escapeHtml(upper(card.title, f.uppercase ?? true))}</div><div class="card-b">${escapeHtml(card.body)}</div></div>`).join('');
      const n = slide.cards?.length ?? 0;
      const gridCols = n <= 3 ? Math.max(1, n) : (n <= 4 ? 2 : 3);
      const gridRows = Math.max(1, Math.ceil(n / gridCols));
      const gridStyle = `grid-template-columns:repeat(${gridCols},1fr);grid-template-rows:repeat(${gridRows},1fr);`;
      const bgUri = images[`bg:${index}`];
      const darken = meta?.bgDarken?.[`bg:${index}`];
      return `<div class="slide s-content${illCls}" ${bgUri ? `style="${bgImageStyle(bgUri)}"` : ''}>
        ${darken !== undefined && bgUri ? `<div class="s-bg-dark" style="background:rgba(0,0,0,${darken});"></div>` : ''}
        ${hd}
        <div class="cards-grid" style="${gridStyle}">${cards}</div>
        ${illHtml}
        ${footHtml}
      </div>`;
    }
    case 'table': {
      const t = slide.table;
      if (!t) return '';
      const highlightIdx = tpl.layouts.table?.highlightColumn ?? 1;
      const head = t.headers.map(h => `<th>${escapeHtml(h)}</th>`).join('');
      const rows = t.rows.map(row =>
        `<tr>${row.map((cell, ci) => `<td${ci === highlightIdx ? ' class="hl"' : ''}>${escapeHtml(cell)}</td>`).join('')}</tr>`).join('');
      const bgUri = images[`bg:${index}`];
      const darken = meta?.bgDarken?.[`bg:${index}`];
      return `<div class="slide s-content${illCls}" ${bgUri ? `style="${bgImageStyle(bgUri)}"` : ''}>
        ${darken !== undefined && bgUri ? `<div class="s-bg-dark" style="background:rgba(0,0,0,${darken});"></div>` : ''}
        ${hd}
        <div class="tbl-wrap"><table><thead><tr>${head}</tr></thead><tbody>${rows}</tbody></table></div>
        ${illHtml}
        ${footHtml}
      </div>`;
    }
    case 'photo': {
      const bgUri = images[`bg:${index}`];
      const photo: TemplatePhotoLayout = tpl.layouts.photo ?? {};
      const bullets = (slide.bullets || []).map(b =>
        `<div class="bullet"><span class="mark"></span><span class="bt">${escapeHtml(b)}</span></div>`).join('');
      const phead = slide.heading1 || slide.heading2
        ? `<div class="p-hd"><span class="l1">${escapeHtml(upper(slide.heading1, f.uppercase ?? true))}</span>${slide.heading2 ? `<br><span class="l2">${escapeHtml(upper(slide.heading2, f.uppercase ?? true))}</span>` : ''}</div>`
        : '';
      const photoDarken = meta?.bgDarken?.[`bg:${index}`];
      const overlayBg = photoDarken !== undefined ? `rgba(0,0,0,${photoDarken})` : (photo.overlay ?? 'rgba(16,20,30,.6)');
      const overlayHtml = bgUri ? `<div class="p-overlay" style="background:${overlayBg};"></div>` : '';
      return `<div class="slide s-photo" ${bgUri ? `style="${bgImageStyle(bgUri)}"` : ''}>
        ${overlayHtml}
        <div class="p-content">
          ${phead}
          ${bullets ? `<div class="p-body">${bullets}</div>` : ''}
          ${footHtml}
        </div>
      </div>`;
    }
    case 'final': {
      const final: TemplateFinalLayout = tpl.layouts.final ?? {};
      const slogan = tpl.layouts.title?.slogan;
      const speakerName = slide.speaker || meta?.presenter || '';
      const qrHtml = meta?.qrDataUri
        ? `<div class="fin-qr"><img src="${meta.qrDataUri}" alt="QR-код контакта"></div>`
        : '';
      const bgUri = images[`bg:${index}`];
      const darken = meta?.bgDarken?.[`bg:${index}`];
      return `<div class="slide s-final" ${bgUri ? `style="${bgImageStyle(bgUri)}"` : ''}>
        ${darken !== undefined && bgUri ? `<div class="s-bg-dark" style="background:rgba(0,0,0,${darken});"></div>` : ''}
        <div class="fin-block">
          <div class="fin-center">${escapeHtml(upper('Спасибо за внимание', true))}</div>
          <div class="fin-line"></div>
          ${speakerName ? `<div class="fin-speaker">${escapeHtml(speakerName)}</div>` : ''}
          ${qrHtml}
        </div>
        ${slogan ? `<div class="fin-slogan">${escapeHtml(slogan)}</div>` : ''}
        ${footHtml}
      </div>`;
    }
    default:
      return '';
  }
}

const DECK_SCRIPT = `
(function(){
  var deck=document.querySelector('.deck');
  var slides=[].slice.call(deck.querySelectorAll('.slide'));
  var bar=document.querySelector('.progress .bar');
  var cur=0;
  var timer=null;
  var auto=false;
  var interval=parseFloat(deck.getAttribute('data-interval')||'0');
  var loop=deck.getAttribute('data-loop')==='true';
  function clearStates(){
    slides.forEach(function(s){s.classList.remove('current','slide-in-left','slide-in-right','slide-out-left','slide-out-right');});
  }
  function updateProgress(){
    if(!bar) return;
    bar.style.width=((cur+1)/slides.length*100)+'%';
  }
  function resetAuto(){
    if(!auto||interval<=0) return;
    clearInterval(timer);
    timer=setInterval(function(){nav(1);}, interval*1000);
  }
  function startAuto(){
    if(interval<=0) return;
    auto=true; resetAuto();
    var b=document.querySelector('.toolbar .auto-btn');
    if(b) b.textContent='⏸ Стоп';
  }
  function stopAuto(){
    auto=false; clearInterval(timer);
    var b=document.querySelector('.toolbar .auto-btn');
    if(b) b.textContent='▶ Авто';
  }
  function toggleAuto(){ auto?stopAuto():startAuto(); }
  function nav(dir){
    var len=slides.length;
    var ni=loop ? (cur+dir+len)%len : Math.max(0,Math.min(len-1,cur+dir));
    if(ni===cur) return;
    clearStates();
    var out=slides[cur], inc=slides[ni];
    cur=ni;
    var inCls = dir<0 ? 'slide-in-left' : 'slide-in-right';
    var outCls = dir<0 ? 'slide-out-right' : 'slide-out-left';
    inc.classList.add(inCls);
    void inc.offsetWidth;
    inc.classList.add('current');
    inc.classList.remove(inCls);
    out.classList.add(outCls);
    requestAnimationFrame(function(){
      if(!loop && cur >= len-1 && dir>0){ stopAuto(); } else { resetAuto(); }
    });
    updateProgress();
  }
  function show(i){
    cur=Math.max(0,Math.min(slides.length-1,i));
    clearStates();
    slides[cur].classList.add('current');
    updateProgress();
    resetAuto();
  }
  function setMode(m){
    var slidesMode = m==='slides';
    deck.classList.toggle('mode-slides', slidesMode);
    if(slidesMode){
      if(!deck.querySelector('.slide.current')) show(0);
      updateProgress();
      startAuto();
    } else {
      stopAuto();
    }
  }
  function toggleFullscreen(){
    if(document.fullscreenElement){ (document.exitFullscreen||function(){}).call(document); }
    else {
      var el=document.documentElement;
      (el.requestFullscreen||el.webkitRequestFullscreen||function(){}).call(el);
    }
  }
  window.__setMode=setMode;
  window.__toggleFullscreen=toggleFullscreen;
  window.__toggleAuto=toggleAuto;
  window.__nav={next:function(){nav(1);},prev:function(){nav(-1);}};
  window.addEventListener('keydown',function(e){
    if(e.key==='f'||e.key==='F'||e.key==='а'||e.key==='А'){ toggleFullscreen(); return; }
    if(!deck.classList.contains('mode-slides')) return;
    if(e.key==='ArrowRight'||e.key==='ArrowDown'||e.key==='PageDown'||e.key===' '){e.preventDefault();nav(1);}
    else if(e.key==='ArrowLeft'||e.key==='ArrowUp'||e.key==='PageUp'){e.preventDefault();nav(-1);}
    else if(e.key==='Home'){show(0);}
    else if(e.key==='End'){show(slides.length-1);}
  });
  window.addEventListener('touchstart',function(e){window.__tx=e.touches[0].clientX;},{passive:true});
  window.addEventListener('touchend',function(e){
    if(!deck.classList.contains('mode-slides')) return;
    var dx=e.changedTouches[0].clientX-(window.__tx||0);
    if(Math.abs(dx)>40) nav(dx<0?1:-1);
  });
  window.addEventListener('click',function(e){
    if(!deck.classList.contains('mode-slides')) return;
    if(e.target&&e.target.closest){ if(e.target.closest('.toolbar')) return; if(e.target.closest('a,button')) return; }
    nav(1);
  });
  window.addEventListener('contextmenu',function(e){
    if(!deck.classList.contains('mode-slides')) return;
    e.preventDefault();
    nav(-1);
  });
})();
`;

/** Полная сборка HTML презентации. */
export function renderPresentationHtml(
  generation: PresentationGeneration,
  tpl: PresentationTemplate,
  images: Record<string, string>,
  meta?: {
    title?: string;
    date?: string;
    presenter?: string;
    phone?: string;
    email?: string;
    qrDataUri?: string;
    illustrations?: Record<string, string>;
    /** Затемнение фоновой картинки по слайду: 'bg:title' / 'bg:N' → 0..1. */
    bgDarken?: Record<string, number>;
    /** Интервал автопереключения (сек), 0 = выкл. Приоритет над шаблоном. */
    slideIntervalSeconds?: number;
    /** Эффект перехода между слайдами. Приоритет над шаблоном. */
    slideTransition?: 'fade' | 'slide' | 'none';
    /** Зацикливать ли показ. Приоритет над шаблоном. */
    slideLoop?: boolean;
    /** Показывать ли прогресс-бар в режиме «Слайды». */
    showProgress?: boolean;
  },
): string {
  const total = generation.slides.length;
  const slidesHtml = generation.slides.map((s, i) => renderSlide(s, i, total, tpl, images, meta)).join('\n');
  const title = escapeHtml(generation.title || 'Презентация');
  const interval = meta?.slideIntervalSeconds ?? tpl.slideIntervalSeconds ?? 0;
  const transition = meta?.slideTransition ?? tpl.slideTransition ?? 'fade';
  const loop = meta?.slideLoop ?? tpl.slideLoop ?? false;
  const showProgress = meta?.showProgress ?? true;
  const css = buildCss(tpl, transition, showProgress);
  const printBtn = `<button onclick="window.print()">🖨 Печать / PDF</button>`;
  const landingBtn = `<button onclick="window.__setMode('landing')">Лендинг</button>`;
  const slidesBtn = `<button onclick="window.__setMode('slides')">Слайды</button>`;
  const fullBtn = `<button onclick="window.__toggleFullscreen()">⛶ Экран</button>`;
  const autoBtn = interval > 0 ? `<button class="auto-btn" onclick="window.__toggleAuto()">▶ Авто</button>` : '';
  const prevBtn = `<button onclick="window.__nav.prev()">◀</button>`;
  const nextBtn = `<button onclick="window.__nav.next()">▶</button>`;
  return `<!DOCTYPE html>
<html lang="ru">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>${title}</title>
<style>${css}</style>
</head>
<body>
<div class="toolbar">${landingBtn}${slidesBtn}${prevBtn}${nextBtn}${fullBtn}${autoBtn}${printBtn}</div>
<div class="deck mode-landing" data-interval="${interval}" data-loop="${loop ? 'true' : 'false'}">
${slidesHtml}
</div>
<div class="progress"><div class="bar"></div></div>
<script>
${DECK_SCRIPT}
</script>
</body>
</html>`;
}
