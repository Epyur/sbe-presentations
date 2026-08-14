import { App, Modal, Notice, Setting } from 'obsidian';
import type SbePresentationsPlugin from '../main';
import type { PresentationQuestionaire, PresentationTemplate } from '../types/presentations';
import { getVaultResourceUrl } from '../services/presentation-generator';
import { errorMessage } from '../../../sbe-core/src/utils/errors';

const AUDIENCE_OPTIONS = ['Руководители', 'Эксперты', 'Инженеры', 'Смешанная', 'Другое'];
const PURPOSE_OPTIONS = [
  'Информировать и согласовать',
  'Получить обратную связь',
  'Показать результат и получить одобрение',
  'Продемонстрировать опыт',
  'Другое',
];
const STRUCTURE_OPTIONS = [
  'Авто по скилу',
  'Stakeholder Update',
  'Design Review',
  'Final Showcase',
  'Portfolio / Case Study',
  'Свободная структура',
];

export class QuestionnaireModal extends Modal {
  plugin: SbePresentationsPlugin;
  onDone: (q: PresentationQuestionaire) => void;
  initial?: PresentationQuestionaire;
  templates: PresentationTemplate[];

  constructor(
    plugin: SbePresentationsPlugin,
    onDone: (q: PresentationQuestionaire) => void,
    initial?: PresentationQuestionaire,
  ) {
    super(plugin.app);
    this.plugin = plugin;
    this.onDone = onDone;
    this.initial = initial;
    this.templates = plugin.presentationTemplates.getAllTemplates();
  }

  onOpen(): void {
    const { contentEl } = this;
    contentEl.empty();
    contentEl.addClass('tn-pres-container');

    const q: PresentationQuestionaire = this.initial || {
      topic: '',
      audience: 'Смешанная',
      purpose: 'Информировать и согласовать',
      keyMessages: '',
      tone: '',
      structure: 'Авто по скилу',
      templateId: this.plugin.settings.presentationDefaultTemplate || 'technonicol',
      presenter: '',
      date: new Date().toLocaleDateString('ru-RU'),
      slideCountHint: '',
      kicker: '',
      brainstorm: true,
    };

    contentEl.createEl('h3', { text: this.initial ? '🔄 Перегенерация презентации' : '🆕 Новая презентация' });

    new Setting(contentEl).setName('Тема презентации').setDesc('О чём презентация')
      .addText(t => t.setValue(q.topic).setPlaceholder('Например: Обеспечение огнестойкости узлов кровли').onChange(v => { q.topic = v; }));

    new Setting(contentEl).setName('Повод (кикер)').setDesc('Надпись над заголовком титульного слайда, например «Экспертно-технический совет · 13.08.2026» (необязательно)')
      .addText(t => t.setValue(q.kicker || '').setPlaceholder('Повод · дата').onChange(v => { q.kicker = v; }));

    new Setting(contentEl).setName('Аудитория')
      .addDropdown(d => {
        for (const o of AUDIENCE_OPTIONS) d.addOption(o, o);
        d.setValue(q.audience).onChange(v => { q.audience = v; });
      });

    new Setting(contentEl).setName('Цель')
      .addDropdown(d => {
        for (const o of PURPOSE_OPTIONS) d.addOption(o, o);
        d.setValue(q.purpose).onChange(v => { q.purpose = v; });
      });

    new Setting(contentEl).setName('Структура')
      .addDropdown(d => {
        for (const o of STRUCTURE_OPTIONS) d.addOption(o, o);
        d.setValue(q.structure).onChange(v => { q.structure = v; });
      });

    new Setting(contentEl).setName('Ключевые сообщения').setDesc('Что обязательно донести (необязательно)')
      .addTextArea(ta => {
        ta.setValue(q.keyMessages).setPlaceholder('Одна мысль на строку...');
        ta.inputEl.rows = 4;
        ta.onChange(v => { q.keyMessages = v; });
      });

    new Setting(contentEl).setName('Тон').setDesc('Необязательно')
      .addText(t => t.setValue(q.tone).setPlaceholder('Деловой, осторожный...').onChange(v => { q.tone = v; }));

    new Setting(contentEl).setName('Докладчик')
      .addText(t => t.setValue(q.presenter).setPlaceholder('ФИО — должность').onChange(v => { q.presenter = v; }));

    new Setting(contentEl).setName('Телефон докладчика').setDesc('Для QR-кода на финальном слайде (необязательно)')
      .addText(t => t.setValue(q.presenterPhone || '').setPlaceholder('+7 900 000-00-00').onChange(v => { q.presenterPhone = v; }));

    new Setting(contentEl).setName('Email докладчика').setDesc('Для QR-кода на финальном слайде (необязательно)')
      .addText(t => t.setValue(q.presenterEmail || '').setPlaceholder('name@company.ru').onChange(v => { q.presenterEmail = v; }));

    // ---- Иллюстрации: файлы с описаниями, передаются в LLM как «путь — описание» ----
    const illContainer = contentEl.createDiv();
    illContainer.style.cssText = 'margin:10px 0;border:1px solid var(--background-modifier-border);border-radius:6px;padding:10px;';
    illContainer.createEl('div', { text: '🖼 Иллюстрации (необязательно)', cls: 'setting-item-name' })
      .style.cssText = 'font-weight:600;margin-bottom:4px;';
    const illDesc = illContainer.createDiv();
    illDesc.style.cssText = 'font-size:11px;color:var(--text-muted);margin-bottom:8px;';
    illDesc.setText('Загрузите изображения с описанием — LLM расставит их по слайдам как иллюстрации (по 1 на слайд рядом с текстом). Каждой картинке постарайтесь дать описание.');

    const illRows: Array<{ id?: string; path: string; description: string; uri: string }> = (q.illustrations || []).slice();
    const illPreview = illContainer.createDiv();
    illPreview.style.cssText = 'display:flex;flex-wrap:wrap;gap:10px;';

    const saveIllToQ = () => {
      q.illustrations = illRows.map(r => ({ path: r.path, description: r.description, uri: r.uri }));
    };

    const renderIll = () => {
      illPreview.empty();
      for (const row of illRows) {
        const card = illPreview.createDiv();
        card.style.cssText = 'width:200px;border:1px solid var(--background-modifier-border);border-radius:4px;padding:6px;background:var(--background-secondary);';
        const img = card.createEl('img', { attr: { src: getVaultResourceUrl(this.plugin.app, row.uri) } });
        img.style.cssText = 'width:100%;height:110px;object-fit:cover;border-radius:3px;';
        const cap = card.createDiv();
        cap.style.cssText = 'text-transform:uppercase;font-size:10px;color:var(--text-muted);margin:4px 0 2px;';
        cap.setText(row.path);
        const desc = card.createEl('input', { attr: { placeholder: 'Описание (например: диаграмма роста)' } });
        desc.style.cssText = 'width:100%;font-size:11px;padding:2px 4px;';
        desc.value = row.description;
        desc.addEventListener('change', () => { row.description = desc.value; saveIllToQ(); });
        const del = card.createEl('button', { text: '🗑 Удалить', cls: 'tn-pres-btn' });
        del.style.cssText = 'width:100%;margin-top:4px;font-size:10px;';
        del.addEventListener('click', () => { illRows.splice(illRows.findIndex(r => r.id === row.id), 1); saveIllToQ(); renderIll(); });
      }
    };

    const illFile = illContainer.createEl('input', { attr: { type: 'file', multiple: 'true', accept: 'image/*' } });
    illFile.style.display = 'none';
    const illBtn = illContainer.createEl('button', { text: '⬆️ Добавить изображение', cls: 'tn-pres-btn' });
    illBtn.addEventListener('click', () => illFile.click());
    illFile.addEventListener('change', async (e) => {
      const files = (e.target as HTMLInputElement).files;
      if (!files) return;
      for (const file of Array.from(files)) {
        try {
          const uri = await import('../services/presentation-generator').then(m =>
            m.saveImageToVault(this.plugin.app, file, m.PRESENTATION_PICS_DIR, 1400, 0.8));
          let path = file.name.replace(/[^A-Za-z0-9а-яА-ЯёЁ.\-_ ]/g, '_') || `img-${Date.now()}`;
          let n = 2;
          const base = path.split('.'); const ext = base.length > 1 ? `.${base.pop()}` : '';
          const stem = base.join('.');
          while (illRows.some(r => r.path === path)) path = `${stem}-${n++}${ext}`;
          illRows.push({ id: `${Date.now()}-${Math.random().toString(36).slice(2, 6)}`, path, description: '', uri });
          saveIllToQ();
          renderIll();
        } catch (err: unknown) {
          new Notice(`Ошибка: ${errorMessage(err)}`);
        }
      }
      illFile.value = '';
    });
    saveIllToQ();
    renderIll();

    new Setting(contentEl).setName('Дата')
      .addText(t => t.setValue(q.date).onChange(v => { q.date = v; }));

    new Setting(contentEl).setName('Ориентировочное число слайдов').setDesc('Необязательно; по умолчанию — по контексту')
      .addText(t => t.setValue(q.slideCountHint).setPlaceholder('например, 10').onChange(v => { q.slideCountHint = v; }));

    new Setting(contentEl).setName('Шаблон оформления')
      .addDropdown(d => {
        for (const tpl of this.templates) d.addOption(tpl.id, tpl.name);
        d.setValue(q.templateId).onChange(v => { q.templateId = v; });
      });

    new Setting(contentEl)
      .setName('Мозговой штурм')
      .setDesc('LLM сначала задаст уточняющие вопросы и соберёт детали, затем сгенерирует презентацию')
      .addToggle(t => t.setValue(q.brainstorm !== false).onChange(v => { q.brainstorm = v; }));

    new Setting(contentEl)
      .addButton(b => b.setButtonText(this.initial ? 'Перегенерировать' : 'Сгенерировать').setCta()
        .onClick(() => {
          if (!q.topic.trim()) {
            new Notice('Укажите тему презентации');
            return;
          }
          this.close();
          this.onDone(q);
        }))
      .addButton(b => b.setButtonText('Отмена').onClick(() => this.close()));
  }

  onClose(): void {
    this.contentEl.empty();
  }
}

export class PresentationPreviewModal extends Modal {
  html: string;

  constructor(app: App, html: string) {
    super(app);
    this.html = html;
    this.modalEl.style.width = 'min(1200px, 96vw)';
    this.modalEl.style.height = '92vh';
  }

  onOpen(): void {
    const { contentEl } = this;
    contentEl.empty();
    const hint = contentEl.createDiv();
    hint.style.cssText = 'font-size:12px;color:var(--text-muted);margin-bottom:6px;';
    hint.setText('Для PDF: нажмите «🖨 Печать / PDF» в правом верхнем углу презентации и выберите «Сохранить как PDF». В диалоге печати выставьте бумагу 16:9 / «Презентация» и поля «Нет» — тогда слайды займут весь лист без отступов.');
    const frame = contentEl.createEl('iframe', { attr: { sandbox: 'allow-scripts allow-modals', allowfullscreen: 'true', allow: 'fullscreen', srcdoc: this.html } });
    frame.style.cssText = 'width:100%;height:calc(100% - 30px);border:1px solid var(--background-modifier-border);border-radius:6px;background:#fff;';
  }

  onClose(): void {
    this.contentEl.empty();
  }
}

export class NewTemplateModal extends Modal {
  plugin: SbePresentationsPlugin;
  model: string;

  constructor(plugin: SbePresentationsPlugin, model = '') {
    super(plugin.app);
    this.plugin = plugin;
    this.model = model;
    this.modalEl.style.width = 'min(900px, 94vw)';
  }

  onOpen(): void {
    const { contentEl } = this;
    contentEl.empty();
    contentEl.addClass('tn-pres-container');
    contentEl.createEl('h3', { text: '🎨 Новый шаблон из примера' });

    let name = '';
    new Setting(contentEl).setName('Имя шаблона')
      .addText(t => t.setPlaceholder('Например: Мой корпоративный').onChange(v => { name = v; }));

    let example = '';
    new Setting(contentEl).setName('Пример презентации')
      .setDesc('Вставьте HTML или текстовое описание презентации, по которому LLM извлечёт дизайн-систему.')
      .addTextArea(ta => {
        ta.setPlaceholder('<!DOCTYPE html>... или описание цветов/шрифтов/макетов...');
        ta.inputEl.rows = 12;
        ta.onChange(v => { example = v; });
      });

    new Setting(contentEl)
      .addButton(b => b.setButtonText('Создать шаблон').setCta().onClick(async () => {
        if (!example.trim()) {
          new Notice('Вставьте пример презентации');
          return;
        }
        b.setDisabled(true).setButtonText('Извлечение...');
        try {
          await this.plugin.presentationTemplates.createTemplateFromExample(example, name, this.model);
          this.close();
        } catch (e: unknown) {
          new Notice(`Ошибка: ${errorMessage(e)}`);
          b.setDisabled(false).setButtonText('Создать шаблон');
        }
      }))
      .addButton(b => b.setButtonText('Отмена').onClick(() => this.close()));
  }

  onClose(): void {
    this.contentEl.empty();
  }
}

/** Диалог мозгового штурма: LLM по очереди задаёт уточняющие вопросы,
 *  пользователь отвечает, пока не накопятся детали для генерации. */
export class BrainstormModal extends Modal {
  plugin: SbePresentationsPlugin;
  onDone: (q: PresentationQuestionaire) => void;
  onProgress?: (log: Array<{ role: 'user' | 'assistant'; text: string }>) => void;
  q: PresentationQuestionaire;
  designRules: string;
  log: Array<{ role: 'user' | 'assistant'; text: string }> = [];
  maxRounds = 5;
  round = 0;
  busy = false;
  model = '';
  private bodyEl!: HTMLElement;
  private inputEl!: HTMLTextAreaElement;
  private btnEl!: HTMLButtonElement;
  private skipBtnEl!: HTMLButtonElement;

  constructor(
    plugin: SbePresentationsPlugin,
    q: PresentationQuestionaire,
    designRules: string,
    onDone: (q: PresentationQuestionaire) => void,
    onProgress?: (log: Array<{ role: 'user' | 'assistant'; text: string }>) => void,
    model = '',
  ) {
    super(plugin.app);
    this.plugin = plugin;
    this.q = { ...q };
    this.designRules = designRules;
    this.onDone = onDone;
    this.onProgress = onProgress;
    this.model = model;
    this.modalEl.style.width = 'min(900px, 96vw)';
    this.modalEl.style.height = '80vh';
  }

  onOpen(): void {
    const { contentEl } = this;
    contentEl.empty();
    contentEl.addClass('tn-pres-container');
    contentEl.createEl('h3', { text: '🧠 Мозговой штурм' });

    const sub = contentEl.createDiv();
    sub.style.cssText = 'font-size:12px;color:var(--text-muted);margin-bottom:8px;';
    sub.setText(`Тема: ${this.q.topic}. LLM задаст уточняющие вопросы, чтобы собрать детали. Отвечайте своими словами.`);

    this.bodyEl = contentEl.createDiv();
    this.bodyEl.style.cssText = 'border:1px solid var(--background-modifier-border);border-radius:6px;height:calc(100% - 180px);min-height:260px;overflow-y:auto;padding:10px;background:var(--background-primary);';

    this.inputEl = contentEl.createEl('textarea', { attr: { placeholder: 'Ваш ответ...', rows: '3' } });
    this.inputEl.style.cssText = 'width:100%;margin-top:8px;';

    const row = contentEl.createDiv();
    row.style.cssText = 'display:flex;gap:8px;margin-top:8px;justify-content:flex-end;';

    this.skipBtnEl = row.createEl('button', { text: '⏭ Пропустить', cls: 'tn-pres-btn' });
    this.skipBtnEl.addEventListener('click', () => this.finish());

    this.btnEl = row.createEl('button', { text: '➤ Ответить', cls: 'mod-cta' });
    this.btnEl.addEventListener('click', () => this.submit());

    this.inputEl.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) {
        e.preventDefault();
        this.submit();
      }
    });

    void this.askNext();
  }

  private appendMessage(role: 'user' | 'assistant', text: string): void {
    const wrap = this.bodyEl.createDiv();
    wrap.style.cssText = 'margin-bottom:8px;display:flex;' + (role === 'assistant' ? '' : 'justify-content:flex-end;');
    const bubble = wrap.createDiv();
    bubble.style.cssText = 'max-width:85%;padding:8px 12px;border-radius:8px;white-space:pre-wrap;font-size:13px;line-height:1.4;'
      + (role === 'assistant'
        ? 'background:var(--background-secondary);border:1px solid var(--background-modifier-border);'
        : 'background:var(--interactive-accent);color:var(--text-on-accent);');
    bubble.setText(text);
    this.bodyEl.scrollTop = this.bodyEl.scrollHeight;
  }

  private setBusy(busy: boolean): void {
    this.busy = busy;
    this.btnEl.disabled = busy;
    this.skipBtnEl.disabled = busy;
    this.inputEl.disabled = busy;
    this.btnEl.setText(busy ? 'Думаю...' : '➤ Ответить');
  }

  private async askNext(): Promise<void> {
    this.setBusy(true);
    this.round++;
    try {
      const reply = await this.plugin.llm.brainstormNext(this.q, this.log, this.designRules, this.round, this.maxRounds, this.model);
      if (reply.done) {
        if (reply.summary) {
          this.appendMessage('assistant', '✅ Достаточно деталей. Итоговый бриф:\n\n' + reply.summary);
          this.q.keyMessages = [this.q.keyMessages, reply.summary].filter(Boolean).join('\n\n');
        }
        this.finish();
        return;
      }
      const question = reply.question || 'Расскажите подробнее?';
      this.log.push({ role: 'assistant', text: question });
      this.appendMessage('assistant', '🤖 ' + question);
      this.onProgress?.(this.log);
      this.inputEl.value = '';
      this.inputEl.focus();
      if (this.round >= this.maxRounds) {
        this.skipBtnEl.setText('⏭ Сгенерировать сейчас');
      }
    } catch (e: unknown) {
      const msg = errorMessage(e);
      this.appendMessage('assistant', '⚠️ Ошибка: ' + msg);
      new Notice('Ошибка мозгового штурма: ' + msg);
    } finally {
      this.setBusy(false);
    }
  }

  private submit(): void {
    if (this.busy) return;
    const answer = this.inputEl.value.trim();
    if (!answer) {
      new Notice('Введите ответ');
      return;
    }
    this.log.push({ role: 'user', text: answer });
    this.appendMessage('user', answer);
    this.onProgress?.(this.log);
    void this.askNext();
  }

  private finish(): void {
    this.onProgress?.(this.log);
    this.close();
    this.onDone(this.q);
  }

  onClose(): void {
    this.contentEl.empty();
  }
}

export class ImageUploadModal extends Modal {
  plugin: SbePresentationsPlugin;
  slideCount: number;
  images: Record<string, string> = {};
  bgDarken: Record<string, number> = {};
  onDone: (images: Record<string, string>, bgDarken: Record<string, number>) => void;

  constructor(
    plugin: SbePresentationsPlugin,
    slideCount: number,
    initialImages: Record<string, string>,
    initialBgDarken: Record<string, number> = {},
    onDone: (images: Record<string, string>, bgDarken: Record<string, number>) => void,
  ) {
    super(plugin.app);
    this.plugin = plugin;
    this.slideCount = slideCount;
    this.images = { ...initialImages };
    this.bgDarken = { ...initialBgDarken };
    this.onDone = onDone;
    this.modalEl.style.width = 'min(900px, 96vw)';
  }

  onOpen(): void {
    const { contentEl } = this;
    contentEl.empty();
    contentEl.addClass('tn-pres-container');
    contentEl.createEl('h3', { text: '📷 Изображения' });

    const pool: Array<{ name: string; uri: string }> = [];

    const seenUris = new Set<string>();
    let savedCount = 0;
    for (const uri of Object.values(this.images)) {
      if (!uri || seenUris.has(uri)) continue;
      seenUris.add(uri);
      savedCount++;
      pool.push({ name: `Сохранённое ${savedCount}`, uri });
    }

    const fileInput = contentEl.createEl('input', { attr: { type: 'file', multiple: 'true', accept: 'image/*' } });
    fileInput.style.display = 'none';
    const uploadBtn = contentEl.createEl('button', { text: '⬆️ Загрузить изображения', cls: 'tn-pres-btn' });
    uploadBtn.addEventListener('click', () => fileInput.click());

    const poolDiv = contentEl.createDiv();
    poolDiv.style.cssText = 'display:flex;flex-wrap:wrap;gap:8px;margin:8px 0;';

    const renderPoolBoxes = () => {
      poolDiv.empty();
      for (const p of pool) {
        const box = poolDiv.createDiv();
        box.style.cssText = 'position:relative;width:110px;height:70px;border:1px solid var(--background-modifier-border);border-radius:4px;overflow:hidden;';
        const img = box.createEl('img', { attr: { src: getVaultResourceUrl(this.plugin.app, p.uri) } });
        img.style.cssText = 'width:100%;height:100%;object-fit:cover;';
        box.setAttr('title', p.name);
        box.createEl('div', { text: '✓', attr: { title: p.name } })
          .style.cssText = 'position:absolute;bottom:0;right:0;background:var(--interactive-accent);color:#fff;font-size:11px;padding:0 3px;';
      }
    };

    const addToPool = (name: string, uri: string) => {
      pool.push({ name, uri });
      renderPoolBoxes();
      renderSlides();
    };

    fileInput.addEventListener('change', async (e) => {
      const files = (e.target as HTMLInputElement).files;
      if (!files) return;
      for (const file of Array.from(files)) {
        try {
          const uri = await import('../services/presentation-generator').then(m =>
            m.saveImageToVault(this.plugin.app, file, m.PRESENTATION_PICS_DIR));
          addToPool(file.name, uri);
        } catch (err: unknown) {
          new Notice(`Ошибка: ${errorMessage(err)}`);
        }
      }
      fileInput.value = '';
    });

    const slidesDiv = contentEl.createDiv();
    slidesDiv.style.cssText = 'margin:8px 0;max-height:340px;overflow-y:auto;';

    const renderSlides = () => {
      slidesDiv.empty();
      const options = ['— не выбрано —', ...pool.map((p, i) => `${i + 1}. ${p.name}`)];
      const makeSelect = (label: string, key: string) => {
        const row = slidesDiv.createDiv();
        row.style.cssText = 'display:flex;align-items:center;gap:8px;margin:2px 0;font-size:12px;';
        row.createSpan({ text: label });
        const sel = row.createEl('select');
        for (let i = 0; i < options.length; i++) {
          sel.createEl('option', { value: String(i), text: options[i] });
        }
        const current = this.images[key];
        const currentIdx = current ? pool.findIndex(p => p.uri === current) + 1 : 0;
        sel.value = String(Math.max(0, currentIdx));
        sel.addEventListener('change', () => {
          const idx = parseInt(sel.value, 10);
          if (idx === 0) delete this.images[key];
          else this.images[key] = pool[idx - 1].uri;
        });
        const darkLabel = row.createSpan({ text: 'Затемнение' });
        darkLabel.style.cssText = 'margin-left:10px;color:var(--text-muted);';
        const darkInput = row.createEl('input', { attr: { type: 'number', min: '0', max: '100', step: '5', title: 'Затемнение фона, %' } });
        darkInput.style.cssText = 'width:56px;font-size:12px;';
        darkInput.value = String(Math.round((this.bgDarken[key] ?? 0) * 100));
        darkInput.addEventListener('change', () => {
          const v = parseFloat(darkInput.value);
          if (isNaN(v) || v <= 0) {
            delete this.bgDarken[key];
            darkInput.value = '0';
          } else {
            this.bgDarken[key] = Math.min(1, Math.max(0, v / 100));
          }
        });
        return sel;
      };

      makeSelect('🎬 Титул (фон):', 'bg:title');
      for (let i = 1; i < this.slideCount; i++) {
        makeSelect(`Слайд ${i} (фон):`, `bg:${i}`);
      }
      const clearBtn = slidesDiv.createEl('button', { text: 'Сбросить все', cls: 'tn-pres-btn' });
      clearBtn.style.marginTop = '8px';
      clearBtn.addEventListener('click', () => {
        this.images = {};
        this.bgDarken = {};
        renderSlides();
      });
    };

    renderPoolBoxes();
    renderSlides();

    new Setting(contentEl)
      .addButton(b => b.setButtonText('Сохранить').setCta().onClick(() => {
        this.close();
        this.onDone({ ...this.images }, { ...this.bgDarken });
      }))
      .addButton(b => b.setButtonText('Отмена').onClick(() => this.close()));
  }

  onClose(): void {
    this.contentEl.empty();
  }
}

export type SlideTransition = 'fade' | 'slide' | 'none';

/** Настройки показа презентации: автопереключение, эффект перехода, прогресс-бар. */
export class ShowSettingsModal extends Modal {
  plugin: SbePresentationsPlugin;
  tpl: PresentationTemplate | undefined;
  interval: number;
  transition: SlideTransition;
  loop: boolean;
  showProgress: boolean;
  onDone: (opts: { slideIntervalSeconds: number; slideTransition: SlideTransition; slideLoop: boolean; showProgress: boolean }) => void;

  constructor(
    plugin: SbePresentationsPlugin,
    tpl: PresentationTemplate | undefined,
    initial: { slideIntervalSeconds?: number; slideTransition?: SlideTransition; slideLoop?: boolean; showProgress?: boolean },
    onDone: ShowSettingsModal['onDone'],
  ) {
    super(plugin.app);
    this.plugin = plugin;
    this.tpl = tpl;
    this.interval = initial.slideIntervalSeconds ?? tpl?.slideIntervalSeconds ?? 0;
    this.transition = initial.slideTransition ?? tpl?.slideTransition ?? 'fade';
    this.loop = initial.slideLoop ?? tpl?.slideLoop ?? false;
    this.showProgress = initial.showProgress ?? true;
    this.onDone = onDone;
    this.modalEl.style.width = 'min(460px, 94vw)';
  }

  onOpen(): void {
    const { contentEl } = this;
    contentEl.empty();
    contentEl.addClass('tn-pres-container');
    contentEl.createEl('h3', { text: '⚙ Настройки показа' });
    contentEl.createEl('div', {
      text: `Дефолты шаблона «${this.tpl?.name ?? '—'}»: интервал ${this.tpl?.slideIntervalSeconds ?? 0} с · эффект ${this.tpl?.slideTransition ?? 'fade'}`,
    }).style.cssText = 'font-size:11px;color:var(--text-muted);margin-bottom:8px;';

    let interval = this.interval;
    new Setting(contentEl).setName('Автопереключение (сек)')
      .setDesc('Интервал между слайдами в режиме «Слайды». 0 = выключено.')
      .addText(t => {
        t.inputEl.type = 'number';
        t.inputEl.min = '0';
        t.inputEl.step = '1';
        t.setValue(String(interval));
        t.onChange(v => { interval = parseInt(v, 10); if (isNaN(interval) || interval < 0) interval = 0; });
      });

    let transition: SlideTransition = this.transition;
    new Setting(contentEl).setName('Эффект перехода')
      .addDropdown(d => {
        for (const val of ['fade', 'slide', 'none'] as SlideTransition[]) {
          const label = val === 'fade' ? 'Fade (растворение)' : val === 'slide' ? 'Fade + сдвиг' : 'Без эффекта';
          d.addOption(val, label);
        }
        d.setValue(transition);
        d.onChange(v => { transition = v as SlideTransition; });
      });

    let showProgress = this.showProgress;
    new Setting(contentEl).setName('Прогресс-бар')
      .setDesc('Полоса прогресса внизу экрана в режиме «Слайды».')
      .addToggle(tg => {
        tg.setValue(showProgress);
        tg.onChange(v => { showProgress = v; });
      });

    let loop = this.loop;
    new Setting(contentEl).setName('Зациклить показ')
      .setDesc('После последнего слайда — снова первый (и наоборот). Работает для автопоказа и ручного переключения.')
      .addToggle(tg => {
        tg.setValue(loop);
        tg.onChange(v => { loop = v; });
      });

    new Setting(contentEl)
      .addButton(b => b.setButtonText('Сохранить').setCta().onClick(() => {
        this.close();
        this.onDone({
          slideIntervalSeconds: interval,
          slideTransition: transition,
          slideLoop: loop,
          showProgress,
        });
      }))
      .addButton(b => b.setButtonText('Отмена').onClick(() => this.close()));
  }

  onClose(): void {
    this.contentEl.empty();
  }
}
