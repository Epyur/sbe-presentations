import { App } from 'obsidian';
import type { PresentationDbData, PresentationDraft, PresentationItem } from '../types/presentations';

const DB_PATH = 'yourbase/sbe_presentations/presentations_data.json';

export class PresentationsDatabase {
  private app: App;
  private data: PresentationDbData = { presentations: [], drafts: [] };

  constructor(app: App) {
    this.app = app;
  }

  async init(): Promise<void> {
    const adapter = this.app.vault.adapter;
    try {
      const exists = await adapter.exists(DB_PATH);
      if (exists) {
        const content = await adapter.read(DB_PATH);
        const parsed = JSON.parse(content);
        this.data = {
          presentations: Array.isArray(parsed.presentations) ? parsed.presentations : [],
          drafts: Array.isArray(parsed.drafts) ? parsed.drafts : [],
        };
      }
    } catch {
      // file not accessible yet
    }
  }

  private async save(): Promise<void> {
    try {
      await this.app.vault.adapter.write(DB_PATH, JSON.stringify(this.data, null, 2));
    } catch {
      console.error('SBE Презентации: failed to save presentations db');
    }
  }

  getAll(): PresentationItem[] {
    return this.data.presentations;
  }

  getById(id: string): PresentationItem | undefined {
    return this.data.presentations.find(p => p.id === id);
  }

  async add(item: PresentationItem): Promise<void> {
    const idx = this.data.presentations.findIndex(p => p.id === item.id);
    if (idx !== -1) {
      this.data.presentations[idx] = item;
    } else {
      this.data.presentations.push(item);
    }
    await this.save();
  }

  async update(id: string, updates: Partial<PresentationItem>): Promise<void> {
    const idx = this.data.presentations.findIndex(p => p.id === id);
    if (idx !== -1) {
      this.data.presentations[idx] = { ...this.data.presentations[idx], ...updates, updatedAt: new Date().toISOString() };
      await this.save();
    }
  }

  async delete(id: string): Promise<void> {
    this.data.presentations = this.data.presentations.filter(p => p.id !== id);
    await this.save();
  }

  async replaceHtml(id: string, html: string): Promise<void> {
    await this.update(id, { html });
  }

  getDrafts(): PresentationDraft[] {
    return this.data.drafts || [];
  }

  getDraftById(id: string): PresentationDraft | undefined {
    return (this.data.drafts || []).find(d => d.id === id);
  }

  async saveDraft(draft: PresentationDraft): Promise<void> {
    const drafts = this.data.drafts || [];
    const idx = drafts.findIndex(d => d.id === draft.id);
    if (idx !== -1) {
      drafts[idx] = { ...drafts[idx], ...draft, updatedAt: new Date().toISOString() };
    } else {
      drafts.push({ ...draft, createdAt: draft.createdAt || new Date().toISOString(), updatedAt: new Date().toISOString() });
    }
    this.data.drafts = drafts;
    await this.save();
  }

  async deleteDraft(id: string): Promise<void> {
    this.data.drafts = (this.data.drafts || []).filter(d => d.id !== id);
    await this.save();
  }
}
