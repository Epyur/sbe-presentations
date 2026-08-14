import { App, Notice, PluginSettingTab, Setting, TFile } from 'obsidian';
import type SbePresentationsPlugin from '../main';

export class PresentationSettingsTab extends PluginSettingTab {
  private plugin: SbePresentationsPlugin;

  constructor(app: App, plugin: SbePresentationsPlugin) {
    super(app, plugin);
    this.plugin = plugin;
  }

  display(): void {
    const { containerEl } = this;
    containerEl.empty();
    containerEl.createEl('h2', { text: 'Мастер презентаций' });
    containerEl.createEl('p', {
      cls: 'tn-muted',
      text: 'Генерация презентаций через сервис SBE LLM Center (API-ключ настраивается там). Модели задаются здесь — они передаются в каждый вызов LLM.',
    });

    new Setting(containerEl)
      .setName('Модели LLM')
      .setDesc('До 5 моделей (одни ключ и URL настраиваются в SBE LLM Center).')
      .addTextArea(ta => {
        ta.setPlaceholder('deepseek-v4-pro\n…');
        ta.inputEl.rows = 4;
        ta.setValue((this.plugin.settings.llmModels || []).join('\n'))
          .onChange(async (value) => {
            this.plugin.settings.llmModels = value
              .split('\n').map(m => m.trim()).filter(m => m.length > 0).slice(0, 5);
            await this.plugin.saveSettings();
            this.rebuildModelDefault();
          });
      });

    new Setting(containerEl)
      .setName('Модель по умолчанию')
      .setDesc('Используется, когда в презентации не выбрана модель явно.')
      .addDropdown(d => {
        this.populateModelDropdown(d);
        d.setValue(this.plugin.settings.llmDefaultModel || this.plugin.settings.llmModels?.[0] || '');
        d.onChange(async (value) => {
          this.plugin.settings.llmDefaultModel = value;
          await this.plugin.saveSettings();
        });
      });

    new Setting(containerEl)
      .setName('Шаблон оформления по умолчанию')
      .setDesc('Предзаполняется в анкете новой презентации.')
      .addDropdown(d => {
        const templates = this.plugin.presentationTemplates.getAllTemplates();
        for (const t of templates) d.addOption(t.id, t.name);
        d.setValue(this.plugin.settings.presentationDefaultTemplate || 'technonicol');
        d.onChange(async (value) => {
          this.plugin.settings.presentationDefaultTemplate = value;
          await this.plugin.saveSettings();
        });
      });

    new Setting(containerEl)
      .setName('Папки данных')
      .setDesc('БД, шаблоны, правила и картинки хранятся в yourbase/sbe_presentations/ — отдельно от монолита.')
      .addButton(b => b.setButtonText('Открыть')
        .onClick(() => {
          const file = this.app.vault.getAbstractFileByPath('yourbase/sbe_presentations');
          if (file instanceof TFile) void this.app.workspace.getLeaf(false).openFile(file);
          else new Notice('Папка появится после первой генерации');
        }));
  }

  private populateModelDropdown(d: { addOption: (value: string, display: string) => unknown }): void {
    const list = (this.plugin.settings.llmModels || []).filter(m => m && m.trim());
    if (list.length === 0) {
      d.addOption('', '— моделей нет —');
    }
    for (const m of list) d.addOption(m, m);
  }

  private rebuildModelDefault(): void {
    this.display();
  }
}