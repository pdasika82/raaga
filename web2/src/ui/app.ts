import { tanpura } from '@audio/tanpura';
import { startingMidi } from '@core/swara';
import type { Lesson } from '@core/lesson';
import { scaleById } from '@core/scale';
import type { PracticeSession } from '@core/session';
import { requestPersistence } from '@storage/db';
import { loadPrefs, savePrefs, type Prefs } from '../storage/prefs';
import { practiceById, PRACTICES, type Practice } from '../core/practices';
import { h } from './dom';
import { FreePracticeView } from './free';
import { PracticeView } from './practice';
import { SessionDetailView, SessionsView } from './sessions';
import { SettingsView } from './settings';
import { topBar } from './setup';

export type Route = 'practice' | 'free' | 'sessions' | 'session' | 'settings';

/** Listen & repeat app shell. */
export class App {
  prefs: Prefs = loadPrefs();
  /** lessons list is what the shared review page expects */
  lessons: Lesson[] = PRACTICES;
  drill: Lesson | null = null;
  private root: HTMLElement;
  private content = h('main', { class: 'content lr' });
  private bar = h('div');
  private route: Route = 'practice';
  private practice!: PracticeView;
  private sessions = new SessionsView(this as never);
  private detail = new SessionDetailView(this as never);
  private settings = new SettingsView(this);
  private free = new FreePracticeView(this);

  constructor(root: HTMLElement) {
    this.root = root;
  }

  async init(): Promise<void> {
    this.practice = new PracticeView(this);
    this.root.replaceChildren(this.bar, this.content);
    this.renderBar();
    void requestPersistence();
    window.addEventListener('hashchange', () => this.applyHash());
    this.applyHash();
  }

  renderBar(): void {
    this.bar.replaceChildren(topBar(this, this.route, scaleById(this.practice_().scaleId).tradition));
  }

  practice_(): Practice {
    return practiceById(this.prefs.practiceId);
  }

  /** The shared review page calls this; map to the current practice. */
  lesson(): Lesson {
    return this.drill ?? this.practice_();
  }

  lessonGroups(): { label: string; lessons: Lesson[] }[] {
    return [{ label: 'Practices', lessons: PRACTICES }];
  }

  update(patch: Partial<Prefs>): void {
    this.prefs = { ...this.prefs, ...patch };
    savePrefs(this.prefs);
    if (tanpura.running && ('tonic' in patch || 'saOctave' in patch || 'a4' in patch)) tanpura.retune(startingMidi(this.prefs.tonic, this.prefs.saOctave), this.prefs.a4);
    this.renderBar();
    this.practice?.refresh();
  }

  setPractice(id: string): void {
    this.update({ practiceId: id });
  }

  setLesson(id: string): void {
    this.setPractice(id);
  }

  setTonic(tonic: number): void {
    this.update({ tonic });
  }

  /** Review page "Retry": run the phrase around a swara as a one-off practice. */
  startDrill(session: PracticeSession, sequence: string, title: string, hold = 1): void {
    void hold;
    this.drill = { id: `drill-${Date.now()}`, title, instructions: 'Listen, then sing it back one swara per beat.', scaleId: session.scaleId, isBuiltIn: false, sequence };
    if (this.prefs.tonic !== session.tonic) this.update({ tonic: session.tonic });
    this.navigate('practice');
    this.practice.refresh();
  }

  clearDrill(): void {
    this.drill = null;
    this.practice.refresh();
  }

  async reloadLessons(): Promise<void> {
    /* built-in only in v2 */
  }

  openSession(id: string): void {
    location.hash = `#/session/${id}`;
  }

  navigate(route: Route | 'tune'): void {
    if (route === 'tune') {
      this.practice.openPitchSetup();
      return;
    }
    const target = route === 'practice' ? '' : `#/${route}`;
    if (location.hash === target || (route === 'practice' && location.hash === '')) void this.show('practice');
    else location.hash = target;
  }

  private applyHash(): void {
    const m = location.hash.match(/^#\/session\/(.+)$/);
    if (m) void this.show('session', m[1]);
    else if (location.hash === '#/sessions') void this.show('sessions');
    else if (location.hash === '#/settings') void this.show('settings');
    else if (location.hash === '#/free') void this.show('free');
    else void this.show('practice');
  }

  private async show(route: Route, id?: string): Promise<void> {
    if (this.route === 'practice' && route !== 'practice') await this.practice.leave();
    if (this.route === 'free' && route !== 'free') await this.free.leave();
    this.route = route;
    this.renderBar();
    let view: HTMLElement;
    switch (route) {
      case 'practice':
        this.practice.refresh();
        view = this.practice.el;
        break;
      case 'sessions':
        await this.sessions.refresh();
        view = h('div', { class: 'page' }, this.sessions.el);
        break;
      case 'session':
        await this.detail.show(id!);
        view = h('div', { class: 'page' }, this.detail.el);
        break;
      case 'settings':
        await this.settings.refresh();
        view = h('div', { class: 'page' }, this.settings.el);
        break;
      case 'free':
        await this.free.show();
        view = this.free.el;
        break;
    }
    this.content.replaceChildren(view);
    this.content.scrollTop = 0;
  }
}
