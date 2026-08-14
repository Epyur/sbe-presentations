import { Modal, Notice } from 'obsidian';
import type SbePresentationsPlugin from '../main';
import type { PresentationGeneration, PresentationItem, PresentationSlide } from '../types/presentations';
import { buildPresentationHtml, PRESENTATION_RENDER_VERSION } from '../services/presentation-generator';
import { errorMessage } from '../../../sbe-core/src/utils/errors';

const LAYOUT_LABELS: Record<PresentationSlide['layout'], string> = {
  title: 'Титульный',
  section: 'Разделитель',
  bullets: 'Маркированный список',
  cards: 'Карточки',
  table: 'Таблица',
  photo: 'Фото',
  final: 'Финальный',
};

const LAYOUT_OPTIONS = (Object.keys(LAYOUT_LABELS) as PresentationSlide['layout'][])
  .map(value => ({ value, label: LAYOUT_LABELS[value] }));

/** Глубокий клон генерации (данные JSON-safe). */
function cloneGeneration(g: PresentationGeneration): PresentationGeneration {
  return JSON.parse(JSON.stringify(g));
}

/** Слайд по умолчанию для нового слайда выбранного макета. */
function newSlide(layout: PresentationSlide['layout']): PresentationSlide {
  switch (layout) {
    case 'title': return { layout, heading1: 'Заголовок презентации', speaker: '' };
    case 'section': return { layout, heading1: 'Раздел', heading2: '' };
    case 'bullets': return { layout, heading1: 'Заголовок', bullets: ['Первый пункт', 'Второй пункт'] };
    case 'cards': return { layout, heading1: 'Заголовок', cards: [{ title: 'Карточка', body: 'Текст карточки' }] };
    case 'table': return { layout, heading1: 'Заголовок', table: { headers: ['Колонка 1', 'Колонка 2'], rows: [['', '']] } };
    case 'photo': return { layout, heading1: 'Заголовок', bullets: ['Первый пункт'] };
    case 'final': return { layout, speaker: '' };
  }
}

/** Смена макета: сохраняем совместимые поля; буллеты сохраняются только между bullets ↔ photo. */
function migrateLayout(slide: PresentationSlide, layout: PresentationSlide['layout']): PresentationSlide {
  const keepBullets = (slide.layout === 'bullets' || slide.layout === 'photo')
    && (layout === 'bullets' || layout === 'photo')
    && Array.isArray(slide.bullets);
  const res: PresentationSlide = {
    layout,
    heading1: slide.heading1,
    heading2: slide.heading2,
    subtitle: slide.subtitle,
    speaker: slide.speaker,
    footer: slide.footer,
    imagePath: slide.imagePath,
  };
  if (keepBullets) res.bullets = (slide.bullets || []).slice();
  return res;
}

export class PresentationEditorModal extends Modal {
  plugin: SbePresentationsPlugin;
  item: PresentationItem;
  working: PresentationGeneration;
  onSaved: () => void;
  selectedIndex = 0;
  private slidesEl!: HTMLElement;
  private fieldsEl!: HTMLElement;
  private previewFrame!: HTMLIFrameElement;
  private previewTimer: number | null = null;

  constructor(plugin: SbePresentationsPlugin, item: PresentationItem, onSaved: () => void) {
    super(plugin.app);
    this.plugin = plugin;
    this.item = item;
    this.onSaved = onSaved;
    this.working = cloneGeneration(item.generation);
    if (this.working.slides.length === 0) {
      this.working.slides.push({ layout: 'bullets', heading1: 'Новый слайд' });
    }
    this.modalEl.style.width = 'min(1200px, 96vw)';
    this.modalEl.style.height = '92vh';
  }

  onOpen(): void {
    const { contentEl } = this;
    contentEl.empty();
    contentEl.addClass('tn-pres-container');

    const header = contentEl.createDiv();
    header.style.cssText = 'display:flex;align-items:center;justify-content:space-between;gap:8px;margin-bottom:8px;';
    header.createEl('h3', { text: '✏️ Содержание презентации' });
    const btns = header.createDiv();
    btns.style.cssText = 'display:flex;gap:6px;';
    const saveBtn = btns.createEl('button', { text: '💾 Сохранить', cls: 'mod-cta' });
    saveBtn.addEventListener('click', () => void this.save());
    const cancelBtn = btns.createEl('button', { text: 'Отмена', cls: 'tn-pres-btn' });
    cancelBtn.addEventListener('click', () => this.close());

    const body = contentEl.createDiv();
    body.style.cssText = 'display:flex;gap:10px;height:calc(100% - 52px);';

    const sidebar = body.createDiv();
    sidebar.style.cssText = 'width:230px;flex:0 0 230px;overflow-y:auto;border:1px solid var(--background-modifier-border);border-radius:6px;padding:6px;';
    this.slidesEl = sidebar.createDiv();
    this.renderSlideList();
    const addBtn = sidebar.createEl('button', { text: '➕ Добавить слайд', cls: 'tn-pres-btn' });
    addBtn.style.cssText = 'width:100%;margin-top:6px;';
    addBtn.addEventListener('click', () => this.addSlide());

    this.fieldsEl = body.createDiv();
    this.fieldsEl.style.cssText = 'width:430px;flex:0 0 430px;overflow-y:auto;border:1px solid var(--background-modifier-border);border-radius:6px;padding:10px;';

    const previewWrap = body.createDiv();
    previewWrap.style.cssText = 'flex:1;display:flex;flex-direction:column;border:1px solid var(--background-modifier-border);border-radius:6px;overflow:hidden;';
    const pLabel = previewWrap.createDiv();
    pLabel.style.cssText = 'font-size:11px;color:var(--text-muted);padding:4px 8px;';
    pLabel.setText('Предпросмотр — обновляется автоматически при изменениях');
    this.previewFrame = previewWrap.createEl('iframe', {
      attr: { sandbox: 'allow-scripts allow-modals', allowfullscreen: 'true', allow: 'fullscreen' },
    });
    this.previewFrame.style.cssText = 'flex:1;width:100%;border:0;background:#fff;';

    this.renderFields();
    void this.rebuildPreview();
  }

  onClose(): void {
    if (this.previewTimer !== null) clearTimeout(this.previewTimer);
    this.contentEl.empty();
  }

  // ---------- Панель слайдов ----------

  private renderSlideList(): void {
    this.slidesEl.empty();
    this.working.slides.forEach((slide, i) => {
      const row = this.slidesEl.createDiv();
      row.style.cssText = 'display:flex;align-items:center;gap:4px;padding:3px 4px;border-radius:4px;cursor:pointer;margin-bottom:2px;'
        + (i === this.selectedIndex
          ? 'background:var(--interactive-accent);color:var(--text-on-accent);'
          : '');
      row.addEventListener('click', () => {
        this.selectedIndex = i;
        this.renderSlideList();
        this.renderFields();
      });
      const label = row.createSpan();
      label.style.cssText = 'flex:1;font-size:12px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;';
      label.setText(`${i + 1}. ${LAYOUT_LABELS[slide.layout]}: ${slide.heading1 || slide.subtitle || ''}`);
      this.smallBtn(row, '↑', e => { e.stopPropagation(); this.moveSlide(i, -1); });
      this.smallBtn(row, '↓', e => { e.stopPropagation(); this.moveSlide(i, 1); });
      this.smallBtn(row, '🗑', e => {
        e.stopPropagation();
        this.deleteSlide(i);
      });
    });
  }

  private smallBtn(parent: HTMLElement, text: string, onClick: (e: MouseEvent) => void): void {
    const b = parent.createEl('button', { text, cls: 'tn-pres-btn' });
    b.style.cssText = 'font-size:10px;padding:1px 4px;';
    b.addEventListener('click', onClick);
  }

  private addSlide(): void {
    const existing = this.slidesEl.querySelector('.tn-add-slide-picker');
    if (existing) existing.remove();
    const picker = this.slidesEl.createDiv();
    picker.addClass('tn-add-slide-picker');
    picker.style.cssText = 'margin-top:6px;border:1px solid var(--background-modifier-border);border-radius:6px;padding:6px;';
    const sel = picker.createEl('select');
    for (const opt of LAYOUT_OPTIONS) sel.createEl('option', { value: opt.value, text: opt.label });
    const row = picker.createDiv();
    row.style.cssText = 'display:flex;gap:4px;margin-top:6px;';
    const ok = row.createEl('button', { text: 'Добавить', cls: 'mod-cta' });
    ok.style.cssText = 'flex:1;font-size:11px;';
    ok.addEventListener('click', () => {
      const idx = this.selectedIndex + 1;
      this.working.slides.splice(idx, 0, newSlide(sel.value as PresentationSlide['layout']));
      this.selectedIndex = idx;
      picker.remove();
      this.renderSlideList();
      this.renderFields();
      this.schedulePreview();
    });
    const cancel = row.createEl('button', { text: 'Отмена', cls: 'tn-pres-btn' });
    cancel.style.cssText = 'flex:1;font-size:11px;';
    cancel.addEventListener('click', () => picker.remove());
  }

  private deleteSlide(i: number): void {
    if (this.working.slides.length <= 1) {
      new Notice('Нельзя удалить единственный слайд');
      return;
    }
    if (!window.confirm('Удалить слайд?')) return;
    this.working.slides.splice(i, 1);
    if (this.selectedIndex >= this.working.slides.length) {
      this.selectedIndex = this.working.slides.length - 1;
    }
    this.renderSlideList();
    this.renderFields();
    this.schedulePreview();
  }

  private moveSlide(i: number, dir: -1 | 1): void {
    const j = i + dir;
    if (j < 0 || j >= this.working.slides.length) return;
    const arr = this.working.slides;
    const tmp = arr[i];
    arr[i] = arr[j];
    arr[j] = tmp;
    this.selectedIndex = j;
    this.renderSlideList();
    this.renderFields();
    this.schedulePreview();
  }

  // ---------- Формы ----------

  private renderFields(): void {
    this.fieldsEl.empty();
    const slide = this.working.slides[this.selectedIndex];
    if (!slide) {
      this.fieldsEl.createDiv({ text: 'Нет слайда' });
      return;
    }

    const layoutRow = this.fieldsEl.createDiv();
    layoutRow.style.cssText = 'display:flex;align-items:center;gap:8px;margin-bottom:4px;';
    layoutRow.createSpan({ text: 'Макет:' }).style.cssText = 'font-size:12px;color:var(--text-muted);';
    const layoutSel = layoutRow.createEl('select');
    for (const opt of LAYOUT_OPTIONS) {
      layoutSel.createEl('option', { value: opt.value, text: opt.label });
    }
    layoutSel.value = slide.layout;
    layoutSel.addEventListener('change', () => {
      const idx = this.selectedIndex;
      this.working.slides[idx] = migrateLayout(this.working.slides[idx], layoutSel.value as PresentationSlide['layout']);
      this.renderFields();
      this.renderSlideList();
      this.schedulePreview();
    });

    if (slide.layout !== 'final') {
      this.textField('Заголовок', slide.heading1 || '', v => { slide.heading1 = v; this.schedulePreview(); });
    }
    if (slide.layout !== 'title' && slide.layout !== 'final') {
      this.textField('Подзаголовок (строка 2)', slide.heading2 || '', v => { slide.heading2 = v; this.schedulePreview(); });
    }
    if (slide.layout === 'title' || slide.layout === 'section') {
      this.textField(slide.layout === 'title' ? 'Кикер (над заголовком)' : 'Подпись', slide.subtitle || '', v => { slide.subtitle = v; this.schedulePreview(); });
    }
    if (slide.layout === 'title' || slide.layout === 'final') {
      this.textField('Докладчик', slide.speaker || '', v => { slide.speaker = v; this.schedulePreview(); });
    }

    if (slide.layout === 'bullets' || slide.layout === 'photo') this.renderBullets(slide);
    if (slide.layout === 'cards') this.renderCards(slide);
    if (slide.layout === 'table') this.renderTable(slide);

    this.textField('Колонтитул (своё, опционально)', slide.footer || '', v => { slide.footer = v; this.schedulePreview(); });
  }

  private textField(label: string, value: string, onChange: (v: string) => void): void {
    const lab = this.fieldsEl.createEl('label');
    lab.style.cssText = 'display:block;font-size:11px;color:var(--text-muted);margin-top:10px;';
    lab.setText(label);
    const input = this.fieldsEl.createEl('input', { attr: { type: 'text' } });
    input.style.cssText = 'width:100%;';
    input.value = value;
    input.addEventListener('input', () => onChange(input.value));
  }

  private renderBullets(slide: PresentationSlide): void {
    const head = this.fieldsEl.createDiv();
    head.style.cssText = 'font-weight:600;font-size:12px;margin-top:12px;';
    head.setText('Пункты списка');
    const list = this.fieldsEl.createDiv();
    const rebuild = () => {
      list.empty();
      (slide.bullets || []).forEach((b, i) => {
        const row = list.createDiv();
        row.style.cssText = 'display:flex;gap:4px;align-items:center;margin-top:4px;';
        const ta = row.createEl('textarea');
        ta.style.cssText = 'flex:1;min-height:30px;';
        ta.value = b;
        ta.addEventListener('input', () => {
          if (slide.bullets) slide.bullets[i] = ta.value;
          this.schedulePreview();
        });
        const del = row.createEl('button', { text: '🗑', cls: 'tn-pres-btn' });
        del.style.cssText = 'font-size:10px;';
        del.addEventListener('click', () => {
          slide.bullets = (slide.bullets || []).filter((_, j) => j !== i);
          rebuild();
          this.schedulePreview();
        });
      });
    };
    rebuild();
    const add = this.fieldsEl.createEl('button', { text: '+ Добавить пункт', cls: 'tn-pres-btn' });
    add.style.cssText = 'margin-top:6px;';
    add.addEventListener('click', () => {
      if (!slide.bullets) slide.bullets = [];
      slide.bullets.push('');
      rebuild();
      this.schedulePreview();
    });
  }

  private renderCards(slide: PresentationSlide): void {
    const head = this.fieldsEl.createDiv();
    head.style.cssText = 'font-weight:600;font-size:12px;margin-top:12px;';
    head.setText('Карточки');
    const list = this.fieldsEl.createDiv();
    const rebuild = () => {
      list.empty();
      (slide.cards || []).forEach((card, i) => {
        const box = list.createDiv();
        box.style.cssText = 'border:1px solid var(--background-modifier-border);border-radius:6px;padding:6px;margin-top:6px;';
        box.createEl('label', { text: 'Заголовок' }).style.cssText = 'font-size:10px;color:var(--text-muted);display:block;';
        const tInput = box.createEl('input', { attr: { type: 'text' } });
        tInput.style.cssText = 'width:100%;';
        tInput.value = card.title;
        tInput.addEventListener('input', () => { card.title = tInput.value; this.schedulePreview(); });
        box.createEl('label', { text: 'Текст' }).style.cssText = 'font-size:10px;color:var(--text-muted);display:block;margin-top:4px;';
        const bInput = box.createEl('textarea');
        bInput.style.cssText = 'width:100%;min-height:36px;';
        bInput.value = card.body;
        bInput.addEventListener('input', () => { card.body = bInput.value; this.schedulePreview(); });
        const del = box.createEl('button', { text: '🗑 Удалить карточку', cls: 'tn-pres-btn' });
        del.style.cssText = 'font-size:10px;margin-top:4px;';
        del.addEventListener('click', () => {
          slide.cards = (slide.cards || []).filter((_, j) => j !== i);
          rebuild();
          this.schedulePreview();
        });
      });
    };
    rebuild();
    const add = this.fieldsEl.createEl('button', { text: '+ Добавить карточку', cls: 'tn-pres-btn' });
    add.style.cssText = 'margin-top:6px;';
    add.addEventListener('click', () => {
      if (!slide.cards) slide.cards = [];
      slide.cards.push({ title: 'Новая карточка', body: '' });
      rebuild();
      this.schedulePreview();
    });
  }

  private renderTable(slide: PresentationSlide): void {
    if (!slide.table) slide.table = { headers: ['Колонка 1'], rows: [['']] };
    const t = slide.table;
    const head = this.fieldsEl.createDiv();
    head.style.cssText = 'font-weight:600;font-size:12px;margin-top:12px;';
    head.setText('Таблица');

    const headerRow = this.fieldsEl.createDiv();
    headerRow.style.cssText = 'display:flex;gap:4px;margin-top:6px;';
    t.headers.forEach((h, ci) => {
      const cell = headerRow.createDiv();
      cell.style.cssText = 'flex:1;display:flex;gap:2px;align-items:center;';
      const inp = cell.createEl('input', { attr: { type: 'text' } });
      inp.style.cssText = 'flex:1;font-weight:600;';
      inp.value = h;
      inp.addEventListener('input', () => { t.headers[ci] = inp.value; this.schedulePreview(); });
      const del = cell.createEl('button', { text: '✕', cls: 'tn-pres-btn' });
      del.style.cssText = 'font-size:10px;';
      del.addEventListener('click', () => {
        t.headers.splice(ci, 1);
        for (const r of t.rows) r.splice(ci, 1);
        if (t.headers.length === 0) t.headers.push('');
        this.renderFields();
        this.schedulePreview();
      });
    });

    const rowsEl = this.fieldsEl.createDiv();
    const rebuildRows = () => {
      rowsEl.empty();
      t.rows.forEach((r, ri) => {
        const row = rowsEl.createDiv();
        row.style.cssText = 'display:flex;gap:4px;margin-top:4px;';
        r.forEach((cellVal, ci) => {
          const inp = row.createEl('input', { attr: { type: 'text' } });
          inp.style.cssText = 'flex:1;';
          inp.value = cellVal;
          inp.addEventListener('input', () => { t.rows[ri][ci] = inp.value; this.schedulePreview(); });
        });
        const del = row.createEl('button', { text: '🗑', cls: 'tn-pres-btn' });
        del.style.cssText = 'font-size:10px;';
        del.addEventListener('click', () => {
          t.rows.splice(ri, 1);
          if (t.rows.length === 0) t.rows.push(Array(t.headers.length).fill(''));
          rebuildRows();
          this.schedulePreview();
        });
      });
    };
    rebuildRows();

    const btnRow = this.fieldsEl.createDiv();
    btnRow.style.cssText = 'display:flex;gap:6px;margin-top:6px;';
    const addRow = btnRow.createEl('button', { text: '+ Строка', cls: 'tn-pres-btn' });
    addRow.addEventListener('click', () => {
      t.rows.push(Array(t.headers.length).fill(''));
      rebuildRows();
      this.schedulePreview();
    });
    const addCol = btnRow.createEl('button', { text: '+ Столбец', cls: 'tn-pres-btn' });
    addCol.addEventListener('click', () => {
      t.headers.push('');
      for (const r of t.rows) r.push('');
      this.renderFields();
      this.schedulePreview();
    });
  }

  // ---------- Превью и сохранение ----------

  private schedulePreview(): void {
    if (this.previewTimer !== null) clearTimeout(this.previewTimer);
    this.previewTimer = window.setTimeout(() => {
      this.previewTimer = null;
      void this.rebuildPreview();
    }, 250);
  }

  private async rebuildPreview(): Promise<void> {
    try {
      const tpl = this.plugin.presentationTemplates.getTemplate(this.item.templateId)
        || this.plugin.presentationTemplates.getTemplate('technonicol');
      if (!tpl) return;
      const html = await buildPresentationHtml(this.plugin.app, tpl, this.item, this.working);
      this.previewFrame.setAttr('srcdoc', html);
    } catch {
      // оставляем последний удачный рендер
    }
  }

  private async save(): Promise<void> {
    try {
      const tpl = this.plugin.presentationTemplates.getTemplate(this.item.templateId)
        || this.plugin.presentationTemplates.getTemplate('technonicol');
      if (!tpl) throw new Error('Шаблон не найден');
      this.item.generation = this.working;
      this.item.renderVersion = PRESENTATION_RENDER_VERSION;
      this.item.templateVersion = this.plugin.presentationTemplates.getTemplateVersion(this.item.templateId);
      this.item.html = await buildPresentationHtml(this.plugin.app, tpl, this.item, this.working);
      await this.plugin.presentationsDb.update(this.item.id, {
        generation: this.working,
        html: this.item.html,
        renderVersion: this.item.renderVersion,
        templateVersion: this.item.templateVersion,
      });
      new Notice('Презентации: содержание обновлено');
      this.onSaved();
      this.close();
    } catch (e: unknown) {
      new Notice(`Ошибка сохранения: ${errorMessage(e)}`);
    }
  }
}
