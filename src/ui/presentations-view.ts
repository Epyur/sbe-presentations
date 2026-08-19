import { DropdownComponent, ItemView, Notice, Setting, TextComponent, WorkspaceLeaf } from 'obsidian';
import type SbePresentationsPlugin from '../main';
import type { PresentationDraft, PresentationItem, PresentationQuestionaire } from '../types/presentations';
import { buildPresentationHtml, PRESENTATION_RENDER_VERSION, getVaultResourceUrl } from '../services/presentation-generator';
import { PresentationPreviewModal, NewTemplateModal, ImageUploadModal, ShowSettingsModal, SlideTransition } from './presentation-modals';
import { PresentationEditorModal } from './presentation-editor';
import { errorMessage } from '../../../sbe-core/src/utils/errors';

export const PRESENTATIONS_VIEW_TYPE = 'sbe-presentations-view';

const EXPORT_DIR = 'Экспорт/Презентации';

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

type Tab = 'master' | 'registry';
type Target = { mode: 'new' } | { mode: 'regenerate'; itemId: string };

function newId(): string {
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

function sanitize(name: string): string {
  return name.replace(/[\\/:*?"<>|]/g, '_').trim() || 'Презентация';
}

export class PresentationsView extends ItemView {
  plugin: SbePresentationsPlugin;
  private rootEl!: HTMLElement;
  private navEl!: HTMLElement;
  private crumbEl!: HTMLElement;
  private collapseLabel!: HTMLElement;
  private bodyEl!: HTMLElement;
  private collapsed = false;
  private currentTab: Tab = 'master';
  private selectedModel = '';
  private questionaire!: PresentationQuestionaire;
  private target: Target = { mode: 'new' };
  private activeDraftId: string | null = null;
  private designRules = '';
  private chatActive = false;
  private chatLog: Array<{ role: 'user' | 'assistant'; text: string }> = [];
  private chatRound = 0;
  private chatBusy = false;
  private chatBodyEl!: HTMLElement;
  private chatInputEl!: HTMLTextAreaElement;
  private chatBtnEl!: HTMLButtonElement;
  private chatSkipBtnEl!: HTMLButtonElement;

  constructor(leaf: WorkspaceLeaf, plugin: SbePresentationsPlugin) {
    super(leaf);
    this.plugin = plugin;
    this.questionaire = this.defaultQuestionaire();
  }

  getViewType(): string {
    return PRESENTATIONS_VIEW_TYPE;
  }

  getDisplayText(): string {
    return 'LogicTEAM.Презентации';
  }

  getIcon(): string {
    return 'presentation';
  }

  async onOpen(): Promise<void> {
    await this.plugin.presentationTemplates.init();
    this.markStaleGenerating();
    this.buildShell();
    this.renderPage();
  }

  /** Помечает «зависшие» генерации (перезагрузка плагина во время LLM-вызова) как ошибки. */
  private markStaleGenerating(): void {
    const cutoff = Date.now() - 10 * 60 * 1000;
    for (const item of this.plugin.presentationsDb.getAll()) {
      if (item.status === 'generating' && new Date(item.updatedAt).getTime() < cutoff) {
        item.status = 'error';
        item.error = 'Генерация прервана (перезагрузка). Повторите перегенерацию.';
        void this.plugin.presentationsDb.update(item.id, { status: 'error', error: item.error });
      }
    }
  }

  onClose(): Promise<void> {
    this.containerEl.empty();
    return Promise.resolve();
  }

  private defaultQuestionaire(): PresentationQuestionaire {
    return {
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
  }

  // ---- Каркас ----

  private buildShell(): void {
    const container = this.contentEl;
    container.addClass('tn-pres-container');
    this.rootEl = container.createDiv({ cls: 'tn-pres-app' });

    const topbar = this.rootEl.createDiv({ cls: 'tn-pres-topbar' });
    topbar.createDiv({ cls: 'tn-pres-module-title', text: 'LogicTEAM.Презентации' });
    this.crumbEl = topbar.createDiv({ cls: 'tn-pres-crumb' });
    topbar.createDiv({ cls: 'tn-pres-spacer' });
    const createBtn = topbar.createEl('button', { text: '＋ Новая презентация', cls: 'tn-pres-create' });
    createBtn.addEventListener('click', () => {
      this.currentTab = 'master';
      this.newPresentation();
      this.syncNavActive();
    });

    const main = this.rootEl.createDiv({ cls: 'tn-pres-main' });
    const sidebar = main.createDiv({ cls: 'tn-pres-sidebar' });

    const collapseBtn = sidebar.createDiv({ cls: 'tn-pres-collapse' });
    collapseBtn.createSpan({ text: '▧' });
    this.collapseLabel = collapseBtn.createSpan({ cls: 'tn-pres-collapse-lbl', text: 'Свернуть' });
    collapseBtn.addEventListener('click', () => this.toggleCollapse());

    this.navEl = sidebar.createDiv({ cls: 'tn-pres-nav' });
    this.buildNav();

    const content = main.createDiv({ cls: 'tn-pres-content' });
    this.bodyEl = content.createDiv();
  }

  private buildNav(): void {
    this.navEl.empty();
    const tabs: Array<{ id: Tab; ico: string; label: string }> = [
      { id: 'master', ico: '🛠', label: 'Мастер презентаций' },
      { id: 'registry', ico: '🗂', label: 'Реестр презентаций' },
    ];
    for (const t of tabs) {
      const item = this.navEl.createEl('a', { cls: 'tn-pres-nav-item', attr: { href: '#' } });
      item.createSpan({ cls: 'tn-pres-nav-ico', text: t.ico });
      item.createSpan({ cls: 'tn-pres-nav-lbl', text: t.label });
      item.dataset.key = t.id;
      item.addEventListener('click', (ev) => {
        ev.preventDefault();
        this.currentTab = t.id;
        this.syncNavActive();
        this.renderPage();
      });
    }
    this.syncNavActive();
  }

  private syncNavActive(): void {
    this.navEl.querySelectorAll('.tn-pres-nav-item').forEach((el) => {
      const navEl = el as HTMLElement;
      navEl.classList.toggle('active', navEl.dataset.key === this.currentTab);
    });
  }

  private toggleCollapse(): void {
    this.collapsed = !this.collapsed;
    this.rootEl.classList.toggle('collapsed', this.collapsed);
    if (this.collapseLabel) {
      this.collapseLabel.setText(this.collapsed ? 'Развернуть' : 'Свернуть');
    }
  }

  // ---- Страница ----

  private renderPage(): void {
    const isMaster = this.currentTab === 'master';
    this.crumbEl.setText(isMaster ? 'Мастер презентаций' : 'Реестр презентаций');
    this.bodyEl.empty();
    if (isMaster) {
      this.renderMaster(this.bodyEl);
    } else {
      this.renderRegistry(this.bodyEl);
    }
  }

  // ---- Вкладка «Мастер презентаций» ----

  private renderMaster(root: HTMLElement): void {
    const toolbar = root.createDiv({ cls: 'tn-pres-header tn-mt-8' });
    toolbar.createEl('button', { text: '🎨 Новый шаблон', cls: 'tn-pres-btn' })
      .addEventListener('click', () => new NewTemplateModal(this.plugin, this.selectedModel).open());

    const modelLabel = toolbar.createSpan({ text: '🤖 Модель:' });
    modelLabel.style.cssText = 'font-size:12px;color:var(--text-muted);margin-left:10px;';
    const modelSel = toolbar.createEl('select');
    modelSel.addClass('dropdown');
    modelSel.style.cssText = 'max-width:240px;font-size:12px;';
    modelSel.createEl('option', { value: '', text: 'По умолчанию' });
    for (const m of (this.plugin.settings.llmModels || [])) {
      if (m && m.trim()) modelSel.createEl('option', { value: m.trim(), text: m.trim() });
    }
    modelSel.value = this.selectedModel;
    modelSel.addEventListener('change', () => { this.selectedModel = modelSel.value; });

    const drafts = this.plugin.presentationsDb.getDrafts();
    if (drafts.length > 0) {
      const dHead = root.createDiv();
      dHead.style.cssText = 'font-weight:600;font-size:13px;margin:8px 0 4px;color:var(--text-muted);';
      dHead.setText('🕓 Черновики (генерация прервалась)');
      for (const d of [...drafts].reverse()) {
        this.renderDraft(root, d);
      }
    }

    this.renderQuestionnaire(root, this.questionaire, this.target.mode === 'regenerate');

    if (this.chatActive) {
      this.renderChatPanel(root);
    }
  }

  private newPresentation(): void {
    this.questionaire = this.defaultQuestionaire();
    this.target = { mode: 'new' };
    this.activeDraftId = null;
    this.chatActive = false;
    this.chatLog = [];
    this.chatRound = 0;
    this.renderPage();
  }

  private renderDraft(container: HTMLElement, draft: PresentationDraft): void {
    const row = container.createDiv();
    row.style.cssText = 'border:1px dashed var(--background-modifier-border);border-radius:6px;padding:8px 10px;margin-bottom:8px;background:var(--background-secondary);';
    const title = row.createSpan();
    title.style.cssText = 'font-weight:600;font-size:13px;';
    title.setText(draft.questionaire.topic || 'Без темы');
    const meta = row.createDiv();
    meta.style.cssText = 'font-size:11px;color:var(--text-muted);margin:4px 0;';
    const answers = draft.brainstormLog.filter(m => m.role === 'user').length;
    meta.setText(`Черновик · Ответов штурма: ${answers}${draft.error ? ` · Ошибка: ${draft.error}` : ''}`);

    const actions = row.createDiv();
    actions.style.cssText = 'display:flex;gap:6px;flex-wrap:wrap;';
    const btn = (text: string, fn: () => void) => {
      const b = actions.createEl('button', { text, cls: 'tn-pres-btn' });
      b.style.cssText = 'font-size:11px;padding:2px 8px;';
      b.addEventListener('click', fn);
      return b;
    };
    btn('🔁 Продолжить (повтор LLM)', () => void this.retryDraft(draft));
    btn('✏️ Изменить', () => {
      this.questionaire = { ...draft.questionaire };
      this.target = { mode: 'new' };
      this.activeDraftId = draft.id;
      this.chatActive = false;
      void this.plugin.presentationsDb.deleteDraft(draft.id).then(() => this.renderPage());
    });
    btn('🗑 Удалить', () => {
      void this.plugin.presentationsDb.deleteDraft(draft.id).then(() => this.renderPage());
    });
  }

  private async retryDraft(draft: PresentationDraft): Promise<void> {
    try {
      new Notice('Презентации: повторная генерация...');
      this.questionaire = { ...draft.questionaire };
      this.target = { mode: 'new' };
      this.activeDraftId = draft.id;
      this.chatActive = false;
      this.designRules = await this.plugin.presentationTemplates.readDesignRules();
      await this.doGenerate(this.questionaire, this.designRules);
    } catch (e: unknown) {
      new Notice(`Ошибка: ${errorMessage(e)}`);
    }
  }

  /** Компактное поле-дропдаун в строке из нескольких полей (`tn-pres-row`). */
  private addCompactDropdown(row: HTMLElement, label: string, options: string[], value: string, onChange: (v: string) => void): void {
    const field = row.createDiv({ cls: 'tn-pres-row-field' });
    field.createDiv({ cls: 'tn-pres-row-label', text: label });
    const dd = new DropdownComponent(field);
    for (const o of options) dd.addOption(o, o);
    dd.setValue(value).onChange(onChange);
  }

  /** Компактное текстовое поле в строке из нескольких полей (`tn-pres-row`). */
  private addCompactText(row: HTMLElement, label: string, value: string, placeholder: string, onChange: (v: string) => void): void {
    const field = row.createDiv({ cls: 'tn-pres-row-field' });
    field.createDiv({ cls: 'tn-pres-row-label', text: label });
    new TextComponent(field).setValue(value).setPlaceholder(placeholder).onChange(onChange);
  }

  /** Встроенная анкета (перенос QuestionnaireModal) — рисуется прямо во вкладке. */
  private renderQuestionnaire(container: HTMLElement, q: PresentationQuestionaire, isRegenerate: boolean): void {
    const card = container.createDiv({ cls: 'tn-pres-card' });
    card.createEl('h4', { text: isRegenerate ? '🔄 Перегенерация презентации' : '🆕 Новая презентация' });

    new Setting(card).setName('Тема презентации').setDesc('О чём презентация')
      .addText(t => t.setValue(q.topic).setPlaceholder('Например: Обеспечение огнестойкости узлов кровли').onChange(v => { q.topic = v; }));

    new Setting(card).setName('Повод (кикер)').setDesc('Надпись над заголовком титульного слайда, например «Экспертно-технический совет · 13.08.2026» (необязательно)')
      .addText(t => t.setValue(q.kicker || '').setPlaceholder('Повод · дата').onChange(v => { q.kicker = v; }));

    const classifyRow = card.createDiv({ cls: 'tn-pres-row' });
    this.addCompactDropdown(classifyRow, 'Аудитория', AUDIENCE_OPTIONS, q.audience, v => { q.audience = v; });
    this.addCompactDropdown(classifyRow, 'Цель', PURPOSE_OPTIONS, q.purpose, v => { q.purpose = v; });
    this.addCompactDropdown(classifyRow, 'Структура', STRUCTURE_OPTIONS, q.structure, v => { q.structure = v; });

    new Setting(card).setName('Ключевые сообщения').setDesc('Что обязательно донести (необязательно)')
      .addTextArea(ta => {
        ta.setValue(q.keyMessages).setPlaceholder('Одна мысль на строку...');
        ta.inputEl.rows = 4;
        ta.onChange(v => { q.keyMessages = v; });
      });

    new Setting(card).setName('Тон').setDesc('Необязательно')
      .addText(t => t.setValue(q.tone).setPlaceholder('Деловой, осторожный...').onChange(v => { q.tone = v; }));

    const presenterRow = card.createDiv({ cls: 'tn-pres-row' });
    this.addCompactText(presenterRow, 'Докладчик', q.presenter, 'ФИО — должность', v => { q.presenter = v; });
    this.addCompactText(presenterRow, 'Телефон', q.presenterPhone || '', '+7 900 000-00-00', v => { q.presenterPhone = v; });
    this.addCompactText(presenterRow, 'E-mail', q.presenterEmail || '', 'name@company.ru', v => { q.presenterEmail = v; });
    card.createDiv({ cls: 'tn-pres-row-hint', text: 'Телефон и e-mail докладчика — для QR-кода на финальном слайде (необязательно).' });

    // ---- Иллюстрации: файлы с описаниями, передаются в LLM как «путь — описание» ----
    const illContainer = card.createDiv({ cls: 'tn-pres-ill-box' });
    illContainer.createEl('div', { text: '🖼 Иллюстрации (необязательно)', cls: 'setting-item-name tn-pres-ill-title' });
    const illDesc = illContainer.createDiv({ cls: 'tn-pres-ill-desc' });
    illDesc.setText('Загрузите изображения с описанием — LLM расставит их по слайдам как иллюстрации (по 1 на слайд рядом с текстом). Каждой картинке постарайтесь дать описание.');

    const illRows: Array<{ id?: string; path: string; description: string; uri: string }> = (q.illustrations || []).slice();
    const illPreview = illContainer.createDiv({ cls: 'tn-pres-ill-preview' });

    const saveIllToQ = () => {
      q.illustrations = illRows.map(r => ({ path: r.path, description: r.description, uri: r.uri }));
    };

    const renderIll = () => {
      illPreview.empty();
      for (const row of illRows) {
        const card2 = illPreview.createDiv({ cls: 'tn-pres-ill-card' });
        const img = card2.createEl('img', { cls: 'tn-pres-ill-img', attr: { src: getVaultResourceUrl(this.plugin.app, row.uri) } });
        const cap = card2.createDiv({ cls: 'tn-pres-ill-cap' });
        cap.setText(row.path);
        const desc = card2.createEl('input', { cls: 'tn-pres-ill-input', attr: { placeholder: 'Описание (например: диаграмма роста)' } });
        desc.value = row.description;
        desc.addEventListener('change', () => { row.description = desc.value; saveIllToQ(); });
        const del = card2.createEl('button', { text: '🗑 Удалить', cls: 'tn-pres-btn tn-pres-ill-del' });
        del.addEventListener('click', () => { illRows.splice(illRows.findIndex(r => r.id === row.id), 1); saveIllToQ(); renderIll(); });
      }
    };

    const illFile = illContainer.createEl('input', { cls: 'tn-pres-hidden', attr: { type: 'file', multiple: 'true', accept: 'image/*' } });
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

    new Setting(card).setName('Дата')
      .addText(t => t.setValue(q.date).onChange(v => { q.date = v; }));

    new Setting(card).setName('Ориентировочное число слайдов').setDesc('Необязательно; по умолчанию — по контексту')
      .addText(t => t.setValue(q.slideCountHint).setPlaceholder('например, 10').onChange(v => { q.slideCountHint = v; }));

    new Setting(card).setName('Шаблон оформления')
      .addDropdown(d => {
        for (const tpl of this.plugin.presentationTemplates.getAllTemplates()) d.addOption(tpl.id, tpl.name);
        d.setValue(q.templateId).onChange(v => { q.templateId = v; });
      });

    new Setting(card)
      .setName('Мозговой штурм')
      .setDesc('LLM сначала задаст уточняющие вопросы и соберёт детали, затем сгенерирует презентацию')
      .addToggle(t => t.setValue(q.brainstorm !== false).onChange(v => { q.brainstorm = v; }));

    new Setting(card)
      .addButton(b => b.setButtonText(isRegenerate ? 'Перегенерировать' : 'Сгенерировать').setCta()
        .onClick(() => void this.startGenerate()))
      .addButton(b => b.setButtonText('Сбросить').onClick(() => this.newPresentation()));
  }

  /** Запуск генерации из анкеты: при включённом штурме сначала открывается встроенный чат. */
  private async startGenerate(): Promise<void> {
    const q = this.questionaire;
    if (!q.topic.trim()) {
      new Notice('Укажите тему презентации');
      return;
    }
    this.designRules = await this.plugin.presentationTemplates.readDesignRules();

    if (this.target.mode === 'new' && !this.activeDraftId) {
      const draft: PresentationDraft = {
        id: newId(),
        questionaire: q,
        brainstormLog: [],
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };
      await this.plugin.presentationsDb.saveDraft(draft);
      this.activeDraftId = draft.id;
    }

    if (q.brainstorm !== false) {
      this.chatActive = true;
      this.chatLog = [];
      this.chatRound = 0;
      this.renderPage();
      await this.chatAskNext();
    } else {
      await this.doGenerate(q, this.designRules);
    }
  }

  // ---- Встроенный чат с ИИ (перенос BrainstormModal) ----

  private renderChatPanel(root: HTMLElement): void {
    const panel = root.createDiv({ cls: 'tn-pres-chat-panel' });
    panel.createEl('h4', { text: '🧠 Мозговой штурм' });
    const sub = panel.createDiv({ cls: 'tn-pres-chat-sub' });
    sub.setText(`Тема: ${this.questionaire.topic}. LLM задаст уточняющие вопросы, чтобы собрать детали. Отвечайте своими словами.`);

    this.chatBodyEl = panel.createDiv({ cls: 'tn-pres-chat-body' });

    this.chatInputEl = panel.createEl('textarea', { cls: 'tn-pres-chat-input', attr: { placeholder: 'Ваш ответ...', rows: '3' } });

    const row = panel.createDiv({ cls: 'tn-pres-chat-row' });

    this.chatSkipBtnEl = row.createEl('button', { text: '⏭ Пропустить', cls: 'tn-pres-btn' });
    this.chatSkipBtnEl.addEventListener('click', () => this.finishChat());

    this.chatBtnEl = row.createEl('button', { text: '➤ Ответить', cls: 'mod-cta' });
    this.chatBtnEl.addEventListener('click', () => this.chatSubmit());

    this.chatInputEl.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) {
        e.preventDefault();
        this.chatSubmit();
      }
    });

    for (const m of this.chatLog) {
      this.appendChatMessage(m.role, m.text);
    }
  }

  private appendChatMessage(role: 'user' | 'assistant', text: string): void {
    const wrap = this.chatBodyEl.createDiv({ cls: 'tn-pres-msg' + (role === 'assistant' ? '' : ' tn-pres-msg-user') });
    const bubble = wrap.createDiv({ cls: 'tn-pres-bubble ' + (role === 'assistant' ? 'tn-pres-bubble-assistant' : 'tn-pres-bubble-user') });
    bubble.setText(text);
    this.chatBodyEl.scrollTop = this.chatBodyEl.scrollHeight;
  }

  private setChatBusy(busy: boolean): void {
    this.chatBusy = busy;
    this.chatBtnEl.disabled = busy;
    this.chatSkipBtnEl.disabled = busy;
    this.chatInputEl.disabled = busy;
    this.chatBtnEl.setText(busy ? 'Думаю...' : '➤ Ответить');
  }

  private async chatAskNext(): Promise<void> {
    this.setChatBusy(true);
    this.chatRound++;
    try {
      const reply = await this.plugin.llm.brainstormNext(
        this.questionaire, this.chatLog, this.designRules, this.chatRound, 5, this.selectedModel);
      if (reply.done) {
        if (reply.summary) {
          this.appendChatMessage('assistant', '✅ Достаточно деталей. Итоговый бриф:\n\n' + reply.summary);
          this.questionaire.keyMessages = [this.questionaire.keyMessages, reply.summary].filter(Boolean).join('\n\n');
        }
        this.finishChat();
        return;
      }
      const question = reply.question || 'Расскажите подробнее?';
      this.chatLog.push({ role: 'assistant', text: question });
      this.appendChatMessage('assistant', '🤖 ' + question);
      this.saveChatProgress();
      this.chatInputEl.value = '';
      this.chatInputEl.focus();
      if (this.chatRound >= 5) {
        this.chatSkipBtnEl.setText('⏭ Сгенерировать сейчас');
      }
    } catch (e: unknown) {
      const msg = errorMessage(e);
      this.appendChatMessage('assistant', '⚠️ Ошибка: ' + msg);
      new Notice('Ошибка мозгового штурма: ' + msg);
    } finally {
      this.setChatBusy(false);
    }
  }

  private saveChatProgress(): void {
    if (!this.activeDraftId) return;
    const draft = this.plugin.presentationsDb.getDraftById(this.activeDraftId);
    if (!draft) return;
    draft.questionaire = this.questionaire;
    draft.brainstormLog = this.chatLog;
    void this.plugin.presentationsDb.saveDraft(draft);
  }

  private chatSubmit(): void {
    if (this.chatBusy) return;
    const answer = this.chatInputEl.value.trim();
    if (!answer) {
      new Notice('Введите ответ');
      return;
    }
    this.chatLog.push({ role: 'user', text: answer });
    this.appendChatMessage('user', answer);
    this.saveChatProgress();
    void this.chatAskNext();
  }

  private finishChat(): void {
    this.saveChatProgress();
    this.chatActive = false;
    this.renderPage();
    void this.doGenerate(this.questionaire, this.designRules);
  }

  // ---- Генерация (создание новой или перегенерация существующей) ----

  private async doGenerate(q: PresentationQuestionaire, designRules: string): Promise<void> {
    new Notice('Презентации: генерация...');
    const tpl = this.plugin.presentationTemplates.getTemplate(q.templateId)
      || this.plugin.presentationTemplates.getTemplate('technonicol')!;

    let item: PresentationItem;
    if (this.target.mode === 'regenerate') {
      const existing = this.plugin.presentationsDb.getById(this.target.itemId);
      if (!existing) {
        new Notice('Презентация не найдена в реестре');
        return;
      }
      item = existing;
    } else {
      item = {
        id: newId(),
        title: q.topic,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        templateId: q.templateId,
        questionaire: q,
        generation: { title: q.topic, slides: [] },
        images: {},
        renderVersion: PRESENTATION_RENDER_VERSION,
        templateVersion: this.plugin.presentationTemplates.getTemplateVersion(q.templateId),
        status: 'generating',
      };
    }
    item.status = 'generating';
    item.error = undefined;
    item.questionaire = q;
    if (this.target.mode === 'regenerate') {
      item.title = q.topic;
      item.templateId = q.templateId;
    }
    if (this.target.mode === 'new') {
      await this.plugin.presentationsDb.add(item);
    } else {
      await this.plugin.presentationsDb.update(item.id, {
        status: 'generating', error: undefined, title: item.title, templateId: item.templateId, questionaire: q,
      });
    }
    this.renderPage();

    try {
      const generation = await this.plugin.llm.generateSlides(q, designRules, tpl.name, this.selectedModel);
      item.generation = generation;
      item.status = undefined;
      item.error = undefined;
      item.renderVersion = PRESENTATION_RENDER_VERSION;
      item.templateVersion = this.plugin.presentationTemplates.getTemplateVersion(q.templateId);
      item.html = await this.generateHtml(item);
      await this.plugin.presentationsDb.update(item.id, {
        generation,
        status: undefined,
        error: undefined,
        html: item.html,
        renderVersion: item.renderVersion,
        templateVersion: item.templateVersion,
      });
      if (this.activeDraftId) await this.plugin.presentationsDb.deleteDraft(this.activeDraftId);
      this.activeDraftId = null;
      new Notice(`Презентации: «${item.title}» ${this.target.mode === 'regenerate' ? 'перегенерирована' : 'создана'} (${generation.slides.length} слайдов)`);
      this.currentTab = 'registry';
      this.renderPage();
    } catch (e: unknown) {
      const msg = errorMessage(e);
      item.status = 'error';
      item.error = msg;
      await this.plugin.presentationsDb.update(item.id, { status: 'error', error: msg });
      if (this.target.mode === 'new' && this.activeDraftId) {
        const draft = this.plugin.presentationsDb.getDraftById(this.activeDraftId);
        if (draft) {
          draft.questionaire = q;
          draft.error = msg;
          await this.plugin.presentationsDb.saveDraft(draft);
        }
      }
      new Notice(`Ошибка генерации: ${msg}. Черновик сохранён — можно повторить без повторного ввода.`);
      this.renderPage();
    }
  }

  // ---- Вкладка «Реестр презентаций» ----

  private renderRegistry(root: HTMLElement): void {
    const items = this.plugin.presentationsDb.getAll();
    if (items.length === 0) {
      root.createDiv({ cls: 'tn-pres-meta tn-pres-p24' })
        .setText('Презентаций пока нет. Создайте их во вкладке «Мастер презентаций».');
      return;
    }
    for (const item of [...items].reverse()) {
      this.renderItem(root, item);
    }
  }

  /** Перегенерация из реестра: открывает анкету во вкладке «Мастер» для той же презентации. */
  private regenerateFromRegistry(item: PresentationItem): void {
    new Notice('Анкета открыта во вкладке «Мастер презентаций». Заполните и нажмите «Перегенерировать».');
    this.questionaire = { ...item.questionaire };
    this.target = { mode: 'regenerate', itemId: item.id };
    this.activeDraftId = null;
    this.chatActive = false;
    this.chatLog = [];
    this.chatRound = 0;
    this.currentTab = 'master';
    this.renderPage();
  }

  private renderItem(container: HTMLElement, item: PresentationItem): void {
    const tpl = this.plugin.presentationTemplates.getTemplate(item.templateId);
    const card = container.createDiv({ cls: 'tn-pres-reg-card' });

    const head = card.createDiv({ cls: 'tn-pres-reg-card-head' });
    head.createEl('h4', { text: item.title || item.generation.title || 'Без названия', cls: 'tn-pres-reg-card-title' });
    const created = new Date(item.createdAt).toLocaleDateString('ru-RU');

    const meta = card.createDiv({ cls: 'tn-pres-reg-card-meta' });
    const actions = card.createDiv({ cls: 'tn-pres-reg-card-actions' });
    const btn = (text: string, fn: () => void) => {
      const b = actions.createEl('button', { text, cls: 'tn-pres-btn tn-pres-reg-btn' });
      b.addEventListener('click', fn);
      return b;
    };

    if (item.status === 'generating') {
      const statusEl = card.createDiv({ cls: 'tn-pres-reg-card-status' });
      statusEl.createDiv({ cls: 'tn-blink' });
      statusEl.createSpan({ text: 'Генерация… это займёт 1–3 минуты' });
      meta.setText(`Создано: ${created} · Шаблон: ${tpl?.name ?? item.templateId}`);
      btn('🗑 Удалить', () => this.deleteItem(item));
      return;
    }

    if (item.status === 'error') {
      card.createDiv({ cls: 'tn-pres-reg-card-error', text: `❌ ${item.error || 'Ошибка генерации'}` });
      meta.setText(`Создано: ${created} · Шаблон: ${tpl?.name ?? item.templateId}`);
      btn('🔁 Перегенерировать', () => this.regenerateFromRegistry(item));
      btn('🗑 Удалить', () => this.deleteItem(item));
      return;
    }

    meta.setText(`Создано: ${created} · Слайдов: ${item.generation.slides.length} · Шаблон: ${tpl?.name ?? item.templateId} · Картинок: ${Object.keys(item.images).length}`);
    btn('👁 Предпросмотр', () => this.preview(item));
    btn('✏️ Содержание', () => this.openEditor(item));
    btn('🖨 PDF', () => this.preview(item, true));
    btn('📷 Изображения', () => this.openImages(item));
    btn('⚙ Показ', () => this.showSettings(item));
    btn('🔁 Перегенерировать', () => this.regenerateFromRegistry(item));
    btn('💾 Экспорт HTML', () => this.exportHtml(item));
    btn('🗑 Удалить', () => this.deleteItem(item));
  }

  private openEditor(item: PresentationItem): void {
    new PresentationEditorModal(this.plugin, item, () => this.renderPage()).open();
  }

  private async generateHtml(item: PresentationItem): Promise<string> {
    const tpl = this.plugin.presentationTemplates.getTemplate(item.templateId)
      || this.plugin.presentationTemplates.getTemplate('technonicol')!;
    return buildPresentationHtml(this.plugin.app, tpl, item, item.generation);
  }

  private showSettings(item: PresentationItem): void {
    const tpl = this.plugin.presentationTemplates.getTemplate(item.templateId)
      || this.plugin.presentationTemplates.getTemplate('technonicol');
    new ShowSettingsModal(this.plugin, tpl, {
      slideIntervalSeconds: item.slideIntervalSeconds,
      slideTransition: item.slideTransition,
      slideLoop: item.slideLoop,
      showProgress: item.showProgress,
    }, async (opts) => {
      item.slideIntervalSeconds = opts.slideIntervalSeconds;
      item.slideTransition = opts.slideTransition;
      item.slideLoop = opts.slideLoop;
      item.showProgress = opts.showProgress;
      item.renderVersion = PRESENTATION_RENDER_VERSION;
      item.templateVersion = this.plugin.presentationTemplates.getTemplateVersion(item.templateId);
      item.html = await this.generateHtml(item);
      await this.plugin.presentationsDb.update(item.id, {
        slideIntervalSeconds: item.slideIntervalSeconds,
        slideTransition: item.slideTransition,
        slideLoop: item.slideLoop,
        showProgress: item.showProgress,
        html: item.html,
        renderVersion: item.renderVersion,
        templateVersion: item.templateVersion,
      });
      new Notice('Презентации: настройки показа обновлены');
      this.renderPage();
    }).open();
  }

  private async ensureHtml(item: PresentationItem): Promise<string> {
    await this.plugin.presentationTemplates.reload();
    const tplVersion = this.plugin.presentationTemplates.getTemplateVersion(item.templateId);
    if (!item.html || item.renderVersion !== PRESENTATION_RENDER_VERSION || item.templateVersion !== tplVersion) {
      item.html = await this.generateHtml(item);
      item.renderVersion = PRESENTATION_RENDER_VERSION;
      item.templateVersion = tplVersion;
      await this.plugin.presentationsDb.update(item.id, {
        html: item.html, renderVersion: item.renderVersion, templateVersion: item.templateVersion,
      });
    }
    return item.html;
  }

  private async preview(item: PresentationItem, focusPdf = false): Promise<void> {
    const html = await this.ensureHtml(item);
    const modal = new PresentationPreviewModal(this.plugin.app, html);
    modal.open();
    if (focusPdf) {
      new Notice('В презентации нажмите «🖨 Печать / PDF» и выберите «Сохранить как PDF»');
    }
  }

  private openImages(item: PresentationItem): void {
    new ImageUploadModal(
      this.plugin,
      item.generation.slides.length,
      item.images,
      item.bgDarken || {},
      async (images, bgDarken) => {
        item.images = images;
        item.bgDarken = bgDarken;
        item.renderVersion = PRESENTATION_RENDER_VERSION;
        item.templateVersion = this.plugin.presentationTemplates.getTemplateVersion(item.templateId);
        item.html = await this.generateHtml(item);
        await this.plugin.presentationsDb.update(item.id, {
          images, bgDarken, html: item.html, renderVersion: item.renderVersion, templateVersion: item.templateVersion,
        });
        new Notice('Презентации: изображения обновлены');
        this.renderPage();
      },
    ).open();
  }

  private async exportHtml(item: PresentationItem): Promise<void> {
    try {
      const html = await this.ensureHtml(item);
      const adapter = this.plugin.app.vault.adapter;
      if (!(await adapter.exists(EXPORT_DIR))) {
        await adapter.mkdir(EXPORT_DIR);
      }
      const path = `${EXPORT_DIR}/${sanitize(item.title)}.html`;
      await adapter.write(path, html);
      new Notice(`Презентации: сохранено ${path}`);
    } catch (e: unknown) {
      new Notice(`Ошибка экспорта: ${errorMessage(e)}`);
    }
  }

  private async deleteItem(item: PresentationItem): Promise<void> {
    await this.plugin.presentationsDb.delete(item.id);
    new Notice('Презентации: удалено');
    this.renderPage();
  }
}