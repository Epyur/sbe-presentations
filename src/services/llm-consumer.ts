import { Notice } from 'obsidian';
import { getService } from '../../../sbe-core/src/bridge';
import { errorMessage } from '../../../sbe-core/src/utils/errors';
import type { SbeLlmApi } from '../../../sbe-core/src/types';
import type {
  PresentationGeneration,
  PresentationQuestionaire,
  PresentationTemplate,
  PresentationSlide,
} from '../types/presentations';
import { normalizeIllustrationPath } from './presentation-generator';

/** Потребитель сервиса sbe-llm: локальные промты генерации презентаций.
 *  Модель и промты живут здесь (в потребителе), центр их не знает. */
export class LlmConsumer {
  private getModel: () => string;
  private servicePromise: Promise<SbeLlmApi> | null = null;

  constructor(getModel: () => string) {
    this.getModel = getModel;
  }

  /** Ленивое получение сервиса: не в onload, а при первом использовании.
   *  При таймауте — понятное уведомление о необходимости включить sbe-llm. */
  private async llm(): Promise<SbeLlmApi> {
    if (!this.servicePromise) {
      this.servicePromise = getService('sbe-llm').catch((e: unknown) => {
        this.servicePromise = null;
        new Notice(`Презентации: включите плагин sbe-llm и настройте API-ключ (${errorMessage(e)})`);
        throw e;
      });
    }
    return this.servicePromise;
  }

  private resolveModel(model?: string): string {
    if (model && model.trim()) return model.trim();
    return this.getModel();
  }

  /** Генерация структуры презентации из анкеты по дизайн-скилу. */
  async generateSlides(
    q: PresentationQuestionaire,
    designRules: string,
    templateName: string,
    model?: string,
  ): Promise<PresentationGeneration> {
    const service = await this.llm();
    const resolvedModel = this.resolveModel(model);

    const system = `${designRules}

## Выходной формат
Ответь ТОЛЬКО JSON-объектом без markdown-обёртки и комментариев:
{
  "title": "Название презентации",
  "slides": [
    {
      "layout": "title|section|bullets|cards|table|photo|final",
      "heading1": "строка заголовка (акцентная)",
      "heading2": "строка заголовка (тёмная, опционально)",
      "subtitle": "повод/подзаголовок (для title и section)",
      "bullets": ["пункт 1", "пункт 2"],
      "cards": [{"title":"Заголовок карточки","body":"Текст карточки"}],
      "table": {"headers":["Колонка 1","Колонка 2"],"rows":[["значение","значение"]]},
      "speaker": "докладчик (для title и final)",
      "footer": "дата · название · №",
      "imageHint": "описание иллюстрации для слайда (если нужна)",
      "imagePath": "точный путь одной из доступных иллюстраций (если она подходит для слайда)"
    }
  ]
}

## Правила
- Первый слайд — layout "title", последний — "final".
- Финальный слайд (final) — центральный текст ВСЕГДА ровно «Спасибо за внимание»,
  без вариаций, сокращений и произвольных замен. Поле heading1 для final не заполняй
  (или ставь «Спасибо за внимание»), speaker — докладчик.
- Промежуточные слайды выбирай из: section (разделитель крупного раздела), bullets (пункты),
  cards (карточки), table (таблица), photo (фото как фон с короткими пунктами).
- Одна идея на слайд, максимум 5-6 пунктов по одной строке.
- Количество слайдов определи сам по контексту анкеты (6-16), если пользователь не указал иначе.
- footer для всех контентных слайдов: "дата · название · №" (№ заменится автоматически).
- speaker — на title и final.
- Не выдумывай факты сверх анкеты, формулируй осторожно.
- Для слайдов, где уместна иллюстрация из списка ниже, укажи её точный путь в "imagePath".
  Используй только пути из списка, не выдумывай. На один слайд — максимум одна иллюстрация.
  Титул (title) и финал (final) иллюстрации не требуют.`;

    const illList = (q.illustrations || []).map(ill => `- ${ill.path}: ${ill.description || 'без описания'}`).join('\n');

    const user = `## АНКЕТА
Тема: ${q.topic}
Аудитория: ${q.audience}
Цель: ${q.purpose}
Структура: ${q.structure}
Ключевые сообщения: ${q.keyMessages || '—'}
Тон: ${q.tone || '—'}
Докладчик: ${q.presenter || '—'}
Телефон докладчика: ${q.presenterPhone || '—'}
Email докладчика: ${q.presenterEmail || '—'}
Дата: ${q.date || '—'}
Повод (кикер): ${q.kicker || '—'}
Ориентировочное число слайдов: ${q.slideCountHint || 'по контексту'}
Шаблон оформления: ${templateName}
${illList ? `\n## ДОСТУПНЫЕ ИЛЛЮСТРАЦИИ (путь — описание)\n${illList}\n\nИспользуй их пути в поле imagePath слайдов, где они уместны.` : ''}

Сгенерируй JSON презентации. Поле subtitle титульного слайда заполни поводом (кикером), если он указан; иначе пусто.`;

    const obj = await service.completeJson<Partial<PresentationGeneration>>(system, user, { model: resolvedModel });
    if (!obj || !Array.isArray(obj.slides)) throw new Error('LLM вернул некорректную структуру презентации');
    const illPaths = (q.illustrations || []).map(ill => ill.path);
    const contentLayouts = ['bullets', 'cards', 'table'];
    const slides = (obj.slides as PresentationSlide[]).map(s => {
      if (s.imagePath && illPaths.length > 0) {
        const norm = normalizeIllustrationPath(s.imagePath);
        const targetBase = norm.split('/').pop() || norm;
        const targetStem = targetBase.replace(/\.[a-z0-9]+$/, '');
        const matched = illPaths.find(p => normalizeIllustrationPath(p) === norm)
          || illPaths.find(p => {
            const base = normalizeIllustrationPath(p).split('/').pop() || '';
            return base === targetBase || base.replace(/\.[a-z0-9]+$/, '') === targetStem;
          });
        if (matched) s.imagePath = matched;
      }
      return s;
    });
    // Иллюстрации отображаются только на контентных слайдах (bullets/cards/table) — картинкой справа.
    // На остальных layout (title/section/photo/final) imagePath не рендерится, поэтому:
    // 1) снимаем imagePath с таких слайдов;
    // 2) распределяем все свободные иллюстрации по контентным слайдам без картинки,
    //    чтобы каждая загруженная иллюстрация гарантированно попала в презентацию.
    const used = new Set<string>(
      slides.filter(s => contentLayouts.includes(s.layout) && s.imagePath).map(s => s.imagePath as string));
    for (const s of slides) {
      if (s.imagePath && !contentLayouts.includes(s.layout)) s.imagePath = undefined;
    }
    const freeIlls = illPaths.filter(p => !used.has(p));
    if (freeIlls.length > 0) {
      let i = 0;
      for (const s of slides) {
        if (i >= freeIlls.length) break;
        if (contentLayouts.includes(s.layout) && !s.imagePath) {
          s.imagePath = freeIlls[i++];
        }
      }
    }
    return {
      title: obj.title || q.topic,
      slides: slides as PresentationGeneration['slides'],
    };
  }

  /** Мозговой штурм: LLM задаёт по одному уточняющему вопросу, пока не соберёт детали. */
  async brainstormNext(
    q: PresentationQuestionaire,
    log: Array<{ role: 'user' | 'assistant'; text: string }>,
    designRules: string,
    round: number,
    maxRounds: number,
    model?: string,
  ): Promise<{ done: boolean; question?: string; summary?: string }> {
    const service = await this.llm();
    const resolvedModel = this.resolveModel(model);

    const system = `Ты — мастер мозгового штурма по подготовке презентаций.
Твоя цель — НЕ генерировать презентацию, а собрать от автора достаточно деталей, чтобы потом из них сделать убедительные слайды.

Этапы работы:
1. Сбор информации: задавай по одному целевому вопросу за раз на русском языке. Вопрос должен уточнять СОДЕРЖАНИЕ (факты, цифры, боли, аудиторию, цель, объём, ключевые сообщения, желаемую структуру), а не оформление.
   - Сначала спроси про цель и аудиторию, если их нет в анкете.
   - Затем про ключевые тезисы, которые обязательно должны попасть на слайды.
   - Потом про факты/цифры/сроки и открытые вопросы.
2. Когда решишь, что контекста достаточно — НЕ завершай штурм сразу. Сформулируй итоговый бриф (сжатое описание 3-6 строк со всеми уточнёнными деталями, которые лягут в генерацию) и представь его пользователю на подтверждение. Текст брифа обязательно начинай с «БРИФ:». Спроси, достаточно ли этой информации для генерации, или пользователь хочет что-то добавить или исключить.
3. Подтверждение брифа (если последним сообщением ты уже предложил бриф):
   - Если пользователь согласен (подтвердил, ответил «достаточно», «да», «ок», «сгенерируй» и т.п.) — верни done:true и summary (итоговый бриф с учётом внесённых правок).
   - Если пользователь дал комментарии, предполагающие внесение изменений — внеси эти уточнения в бриф и при необходимости задай дополнительные уточняющие вопросы, после чего снова представь обновлённый бриф на подтверждение (done:false).
   - Не возвращай done:true без подтверждения пользователем брифа.

Правила:
- Не задавай больше 1 вопроса за раз.
- Лимит раундов: ${maxRounds}.

## Дизайн-скил (структура, по которой будет строиться презентация)
${designRules}

## Формат ответа — только JSON без пояснений:
{"done": false, "question": "вопрос пользователю (или предложение брифа на подтверждение)"}
или
{"done": true, "summary": "итоговый бриф с деталями"}`;

    const transcript = log.map(m => `${m.role === 'assistant' ? 'Вопрос' : 'Ответ'}: ${m.text}`).join('\n');
    const lastAssistant = [...log].reverse().find(m => m.role === 'assistant');
    const awaitingApproval = !!lastAssistant && lastAssistant.text.includes('БРИФ:');
    const stage = awaitingApproval
      ? 'Бриф уже предложен, ждём подтверждения пользователя. Проанализируй его ответ и следуй этапу 3 инструкции.'
      : 'Идёт сбор информации. Следуй этапам 1-2 инструкции.';
    const user = `## АНКЕТА
Тема: ${q.topic || '—'}
Аудитория: ${q.audience || '—'}
Цель: ${q.purpose || '—'}
Ключевые сообщения: ${q.keyMessages || '—'}
Тон: ${q.tone || '—'}
Структура: ${q.structure || '—'}
Докладчик: ${q.presenter || '—'}
Дата: ${q.date || '—'}
Ориентировочное число слайдов: ${q.slideCountHint || '—'}
Повод (кикер): ${q.kicker || '—'}

## Ход беседы
${transcript || '—'}

## Текущая стадия
${stage}

Раунд ${round} из ${maxRounds}. Ответь JSON по схеме.`;

    try {
      const obj = await service.completeJson<{ done?: boolean; question?: string; summary?: string }>(
        system, user, { model: resolvedModel });
      return { done: !!obj.done, question: obj.question, summary: obj.summary };
    } catch {
      return { done: round >= maxRounds, question: 'Расскажите подробнее о содержании доклада?' };
    }
  }

  /** Извлечение шаблона (TemplateSpec) из примера презентации. */
  async extractTemplate(example: string, templateRules: string, model?: string): Promise<PresentationTemplate> {
    const service = await this.llm();
    const resolvedModel = this.resolveModel(model);
    const user = `## ПРИМЕР ПРЕЗЕНТАЦИИ\n\n${example.substring(0, 20000)}\n\nИзвлеки шаблон и верни JSON TemplateSpec.`;
    const obj = await service.completeJson<Partial<PresentationTemplate>>(templateRules, user, { model: resolvedModel });
    if (!obj || !obj.id || !obj.name) throw new Error('LLM вернул некорректный TemplateSpec');
    return obj as PresentationTemplate;
  }
}