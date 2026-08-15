import { App, Modal, Notice, Setting } from 'obsidian';
import type SbePresentationsPlugin from '../main';
import type { PresentationTemplate } from '../types/presentations';
import { getVaultResourceUrl } from '../services/presentation-generator';
import { errorMessage } from '../../../sbe-core/src/utils/errors';

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

/** Диалог загрузки изображений на слайды. */
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
