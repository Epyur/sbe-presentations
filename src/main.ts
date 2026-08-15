import { Plugin, TAbstractFile, WorkspaceLeaf } from 'obsidian';
import { PresentationsDatabase } from './database/presentations-db';
import { PresentationTemplatesService } from './services/presentation-templates';
import { LlmConsumer } from './services/llm-consumer';
import { PresentationsView, PRESENTATIONS_VIEW_TYPE } from './ui/presentations-view';
import { PresentationSettingsTab } from './ui/settings-tab';
import { publishService, unpublishService } from '../../sbe-core/src/bridge';
import type { SbePresentationsApi } from '../../sbe-core/src/types';

export interface PresentationSettings {
  llmModels: string[];
  llmDefaultModel: string;
  presentationDefaultTemplate: string;
}

const DEFAULT_SETTINGS: PresentationSettings = {
  llmModels: [],
  llmDefaultModel: '',
  presentationDefaultTemplate: 'technonicol',
};

export default class SbePresentationsPlugin extends Plugin {
  settings!: PresentationSettings;
  presentationsDb!: PresentationsDatabase;
  presentationTemplates!: PresentationTemplatesService;
  llm!: LlmConsumer;

  async onload(): Promise<void> {
    await this.loadSettings();
    this.presentationsDb = new PresentationsDatabase(this.app);
    await this.presentationsDb.init();
    this.presentationTemplates = new PresentationTemplatesService(this);
    await this.presentationTemplates.init();
    this.llm = new LlmConsumer(() => this.settings.llmDefaultModel || this.settings.llmModels?.[0] || '');

    this.registerView(
      PRESENTATIONS_VIEW_TYPE,
      (leaf: WorkspaceLeaf) => new PresentationsView(leaf, this),
    );

    this.addSettingTab(new PresentationSettingsTab(this.app, this));

    // Свежие шаблоны (правки JSON) учитываются при каждом переключении на вьюху.
    this.registerEvent(
      this.app.vault.on('modify', (file: TAbstractFile) => {
        if (file.path && file.path.startsWith('yourbase/sbe_presentations/')) {
          void this.presentationTemplates.reload().catch(() => {});
        }
      }),
    );

    // Точка входа — магазин: «Установленные → Открыть». Собственных риббона/команды нет.
    publishService<SbePresentationsApi>('sbe-presentations', {
      open: async () => {
        await this.activateView();
      },
    }, {
      version: this.manifest.version,
      name: this.manifest.name,
    });
  }

  onunload(): void {
    unpublishService('sbe-presentations');
  }

  async loadSettings(): Promise<void> {
    const data = (await this.loadData() as Partial<PresentationSettings>) || {};
    this.settings = Object.assign({}, DEFAULT_SETTINGS, data);
  }

  async saveSettings(): Promise<void> {
    await this.saveData(this.settings);
  }

  async activateView(): Promise<void> {
    const { workspace } = this.app;
    let leaf = workspace.getLeavesOfType(PRESENTATIONS_VIEW_TYPE)[0];
    if (!leaf) {
      leaf = workspace.getLeaf(false);
      await leaf.setViewState({ type: PRESENTATIONS_VIEW_TYPE, active: true });
    }
    workspace.revealLeaf(leaf);
    const view = leaf.view;
    if (view instanceof PresentationsView) {
      view.onOpen();
    }
  }
}
