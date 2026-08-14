import { ItemView, Notice, WorkspaceLeaf } from 'obsidian';
import type SbePresentationsPlugin from '../main';
import type { PresentationDraft, PresentationItem, PresentationQuestionaire } from '../types/presentations';
import { buildPresentationHtml, PRESENTATION_RENDER_VERSION } from '../services/presentation-generator';
import { QuestionnaireModal, BrainstormModal, PresentationPreviewModal, NewTemplateModal, ImageUploadModal, ShowSettingsModal, SlideTransition } from './presentation-modals';
import { PresentationEditorModal } from './presentation-editor';
import { errorMessage } from '../../../sbe-core/src/utils/errors';

export const PRESENTATIONS_VIEW_TYPE = 'sbe-presentations-view';

const EXPORT_DIR = 'Экспорт/Презентации';

function sanitize(name: string): string {
  return name.replace(/[\\/:*?"<>|]/g, '_').trim() || 'Презентация';
}

export class PresentationsView extends ItemView {
  plugin: SbePresentationsPlugin;
  private selectedModel = '';

  constructor(leaf: WorkspaceLeaf, plugin: SbePresentationsPlugin) {
    super(leaf);
    this.plugin = plugin;
  }

  getViewType(): string {
    return PRESENTATIONS_VIEW_TYPE;
  }

  getDisplayText(): string {
    return 'Презентации';
  }

  getIcon(): string {
    return 'presentation';
  }

  async onOpen(): Promise<void> {
    await this.plugin.presentationTemplates.init();
    this.markStaleGenerating();
    this.render();
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

  private render(): void {
    const root = this.contentEl;
    root.empty();
    root.addClass('tn-pres-container');

    const header = root.createDiv({ cls: 'tn-pres-header' });
    header.createEl('h3', { text: '📽 Презентации' });

    const toolbar = root.createDiv({ cls: 'tn-pres-header tn-mt-8' });
    toolbar.createEl('button', { text: '🆕 Новая презентация', cls: 'tn-pres-btn' })
      .addEventListener('click', () => this.newPresentation());
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

    const list = root.createDiv();
    const drafts = this.plugin.presentationsDb.getDrafts();
    if (drafts.length > 0) {
      const dHead = list.createDiv();
      dHead.style.cssText = 'font-weight:600;font-size:13px;margin:8px 0 4px;color:var(--text-muted);';
      dHead.setText('🕓 Черновики (генерация прервалась)');
      for (const d of [...drafts].reverse()) {
        this.renderDraft(list, d);
      }
    }
    const items = this.plugin.presentationsDb.getAll();
    if (items.length === 0 && drafts.length === 0) {
      list.createDiv({ text: 'Презентаций пока нет. Нажмите «🆕 Новая презентация».' })
        .style.cssText = 'color:var(--text-muted);padding:12px;';
      return;
    }

    for (const item of [...items].reverse()) {
      this.renderItem(list, item);
    }
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
      this.plugin.presentationsDb.deleteDraft(draft.id).then(() => this.render());
      void this.reopenQuestionnaire(draft);
    });
    btn('🗑 Удалить', () => {
      void this.plugin.presentationsDb.deleteDraft(draft.id).then(() => this.render());
    });
  }

  private async retryDraft(draft: PresentationDraft): Promise<void> {
    try {
      new Notice('Презентации: повторная генерация...');
      const designRules = await this.plugin.presentationTemplates.readDesignRules();
      await this.doGenerate(draft.questionaire, designRules, draft.id);
    } catch (e: unknown) {
      new Notice(`Ошибка: ${errorMessage(e)}`);
    }
  }

  private reopenQuestionnaire(draft: PresentationDraft): void {
    new QuestionnaireModal(this.plugin, async (q) => {
      const newDraft: PresentationDraft = {
        id: `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`,
        questionaire: q,
        brainstormLog: [],
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };
      await this.plugin.presentationsDb.saveDraft(newDraft);
      const designRules = await this.plugin.presentationTemplates.readDesignRules();
      if (q.brainstorm !== false) {
        new BrainstormModal(this.plugin, q, designRules, (brainstormed) => {
          void this.doGenerate(brainstormed, designRules, newDraft.id);
        }, (log) => {
          void this.plugin.presentationsDb.saveDraft({
            ...newDraft, questionaire: q, brainstormLog: log, updatedAt: new Date().toISOString(),
          });
        }, this.selectedModel).open();
      } else {
        void this.doGenerate(q, designRules, newDraft.id);
      }
    }, draft.questionaire).open();
  }

  private renderItem(container: HTMLElement, item: PresentationItem): void {
    const tpl = this.plugin.presentationTemplates.getTemplate(item.templateId);
    const row = container.createDiv();
    row.style.cssText = 'border:1px solid var(--background-modifier-border);border-radius:6px;padding:8px 10px;margin-bottom:8px;';

    const titleRow = row.createDiv();
    titleRow.style.cssText = 'display:flex;align-items:center;justify-content:space-between;gap:8px;';
    const title = titleRow.createSpan();
    title.style.cssText = 'font-weight:600;font-size:13px;';
    title.setText(item.title || item.generation.title || 'Без названия');
    const meta = row.createDiv();
    meta.style.cssText = 'font-size:11px;color:var(--text-muted);margin:4px 0;';
    const created = new Date(item.createdAt).toLocaleDateString('ru-RU');

    const actions = row.createDiv();
    actions.style.cssText = 'display:flex;gap:6px;flex-wrap:wrap;';
    const btn = (text: string, fn: () => void) => {
      const b = actions.createEl('button', { text, cls: 'tn-pres-btn' });
      b.style.cssText = 'font-size:11px;padding:2px 8px;';
      b.addEventListener('click', fn);
      return b;
    };

    if (item.status === 'generating') {
      const statusEl = row.createDiv();
      statusEl.style.cssText = 'display:flex;align-items:center;font-size:12px;color:var(--text-muted);margin:4px 0;';
      statusEl.createDiv({ cls: 'tn-blink' });
      statusEl.createSpan({ text: 'Генерация… это займёт 1–3 минуты' });
      meta.setText(`Создано: ${created} · Шаблон: ${tpl?.name ?? item.templateId}`);
      btn('🗑 Удалить', () => this.deleteItem(item));
      return;
    }

    if (item.status === 'error') {
      const errEl = row.createDiv();
      errEl.style.cssText = 'font-size:12px;color:var(--text-error);margin:4px 0;';
      errEl.setText(`❌ ${item.error || 'Ошибка генерации'}`);
      meta.setText(`Создано: ${created} · Шаблон: ${tpl?.name ?? item.templateId}`);
      btn('🔁 Перегенерировать', () => this.regenerate(item));
      btn('🗑 Удалить', () => this.deleteItem(item));
      return;
    }

    meta.setText(`Создано: ${created} · Слайдов: ${item.generation.slides.length} · Шаблон: ${tpl?.name ?? item.templateId} · Картинок: ${Object.keys(item.images).length}`);
    btn('👁 Предпросмотр', () => this.preview(item));
    btn('✏️ Содержание', () => this.openEditor(item));
    btn('🖨 PDF', () => this.preview(item, true));
    btn('📷 Изображения', () => this.openImages(item));
    btn('⚙ Показ', () => this.showSettings(item));
    btn('🔁 Перегенерировать', () => this.regenerate(item));
    btn('💾 Экспорт HTML', () => this.exportHtml(item));
    btn('🗑 Удалить', () => this.deleteItem(item));
  }

  private openEditor(item: PresentationItem): void {
    new PresentationEditorModal(this.plugin, item, () => this.render()).open();
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
      this.render();
    }).open();
  }

  private newPresentation(): void {
    new QuestionnaireModal(this.plugin, async (q) => {
      const draft: PresentationDraft = {
        id: `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`,
        questionaire: q,
        brainstormLog: [],
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };
      await this.plugin.presentationsDb.saveDraft(draft);
      const designRules = await this.plugin.presentationTemplates.readDesignRules();
      if (q.brainstorm !== false) {
        new BrainstormModal(this.plugin, q, designRules, (brainstormed) => {
          void this.doGenerate(brainstormed, designRules, draft.id);
        }, (log) => {
          void this.plugin.presentationsDb.saveDraft({
            ...draft, questionaire: q, brainstormLog: log, updatedAt: new Date().toISOString(),
          });
        }, this.selectedModel).open();
      } else {
        await this.doGenerate(q, designRules, draft.id);
      }
    }).open();
  }

  private async doGenerate(q: PresentationQuestionaire, designRules: string, draftId?: string): Promise<void> {
    new Notice('Презентации: генерация...');
    const tpl = this.plugin.presentationTemplates.getTemplate(q.templateId)
      || this.plugin.presentationTemplates.getTemplate('technonicol')!;
    const item: PresentationItem = {
      id: `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`,
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
    await this.plugin.presentationsDb.add(item);
    this.render();

    try {
      const generation = await this.plugin.llm.generateSlides(q, designRules, tpl.name, this.selectedModel);
      item.generation = generation;
      item.status = undefined;
      item.error = undefined;
      item.html = await this.generateHtml(item);
      await this.plugin.presentationsDb.update(item.id, {
        generation,
        status: undefined,
        error: undefined,
        html: item.html,
        renderVersion: item.renderVersion,
        templateVersion: item.templateVersion,
      });
      if (draftId) await this.plugin.presentationsDb.deleteDraft(draftId);
      new Notice(`Презентации: «${item.title}» создана (${generation.slides.length} слайдов)`);
      this.render();
    } catch (e: unknown) {
      const msg = errorMessage(e);
      item.status = 'error';
      item.error = msg;
      await this.plugin.presentationsDb.update(item.id, { status: 'error', error: msg });
      new Notice(`Ошибка генерации: ${msg}. Черновик сохранён — можно повторить без повторного ввода.`);
      if (draftId) {
        const draft = this.plugin.presentationsDb.getDraftById(draftId);
        if (draft) {
          draft.questionaire = q;
          draft.error = msg;
          await this.plugin.presentationsDb.saveDraft(draft);
        }
      }
      this.render();
    }
  }

  private regenerate(item: PresentationItem): void {
    new Notice('Перегенерация заменит текущее содержание презентации (включая ручные правки).');
    new QuestionnaireModal(this.plugin, async (q) => {
      try {
        new Notice('Презентации: перегенерация...');
        const tpl = this.plugin.presentationTemplates.getTemplate(q.templateId)
          || this.plugin.presentationTemplates.getTemplate('technonicol')!;
        const designRules = await this.plugin.presentationTemplates.readDesignRules();
        item.status = 'generating';
        item.error = undefined;
        await this.plugin.presentationsDb.update(item.id, { status: 'generating', error: undefined });
        this.render();
        const generation = await this.plugin.llm.generateSlides(q, designRules, tpl.name, this.selectedModel);
        item.title = q.topic;
        item.templateId = q.templateId;
        item.questionaire = q;
        item.generation = generation;
        item.status = undefined;
        item.renderVersion = PRESENTATION_RENDER_VERSION;
        item.templateVersion = this.plugin.presentationTemplates.getTemplateVersion(q.templateId);
        item.html = await this.generateHtml(item);
        await this.plugin.presentationsDb.update(item.id, {
          title: item.title, templateId: item.templateId, questionaire: q, generation,
          status: undefined, error: undefined,
          html: item.html, renderVersion: item.renderVersion, templateVersion: item.templateVersion,
        });
        new Notice('Презентации: перегенерировано');
        this.render();
      } catch (e: unknown) {
        const msg = errorMessage(e);
        item.status = 'error';
        item.error = msg;
        await this.plugin.presentationsDb.update(item.id, { status: 'error', error: msg });
        new Notice(`Ошибка перегенерации: ${msg}`);
        this.render();
      }
    }, item.questionaire).open();
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
        this.render();
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
    this.render();
  }
}
