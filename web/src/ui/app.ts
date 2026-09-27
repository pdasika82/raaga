import { BUILT_IN_LESSONS, FREE_PRACTICE, type Lesson } from '../core/lesson';
import { scaleById } from '../core/scale';
import type { PracticeSession } from '../core/session';
import { LessonStore, requestPersistence } from '../storage/db';
import { loadPrefs, savePrefs, type Prefs } from '../storage/prefs';
import { tanpura } from '../audio/tanpura';
import { startingMidi } from '../core/swara';
import { h } from './dom';
import { PitchFinderView } from './finder';
import { PracticeView } from './practice';
import { SessionDetailView, SessionsView } from './sessions';
import { SettingsView } from './settings';

export type Route = 'practice' | 'sessions' | 'session' | 'settings' | 'tune';

export class App {
  prefs: Prefs = loadPrefs();
  lessons: Lesson[] = [...BUILT_IN_LESSONS, FREE_PRACTICE];
  /** A one-off exercise built from a review suggestion; not persisted. */
  drill: Lesson | null = null;

  private root: HTMLElement;
  private content = h('main', { class: 'content' });
  private tabs = new Map<Route, HTMLButtonElement>();
  private route: Route = 'practice';

  private practice!: PracticeView;
  private sessions = new SessionsView(this);
  private detail = new SessionDetailView(this);
  private settings = new SettingsView(this);
  private finder = new PitchFinderView(this);

  constructor(root: HTMLElement) {
    this.root = root;
  }

  async init(): Promise<void> {
    await this.reloadLessons(false);
    this.practice = new PracticeView(this);
    const nav = h('nav', { class: 'tabs' });
    for (const [route, label, icon] of [
      ['practice', 'Practice', '🎙️'],
      ['sessions', 'Sessions', '📈'],
      ['settings', 'Settings', '⚙️'],
    ] as [Route, string, string][]) {
      const btn = h('button', { class: 'tab', onClick: () => this.navigate(route) }, h('span', { class: 'tab-icon' }, icon), h('span', {}, label));
      this.tabs.set(route, btn);
      nav.append(btn);
    }
    this.root.replaceChildren(h('header', { class: 'top' }, h('h1', {}, 'Raaga Steps')), this.content, nav);
    void requestPersistence();
    window.addEventListener('hashchange', () => this.applyHash());
    this.applyHash();
  }

  lesson(): Lesson {
    return this.drill ?? this.lessons.find((l) => l.id === this.prefs.lessonId) ?? this.lessons[0];
  }

  /** Lessons grouped for the picker: Carnatic first, then Hindustani, Western, custom. */
  lessonGroups(): { label: string; lessons: Lesson[] }[] {
    const groups: { label: string; lessons: Lesson[] }[] = [];
    const push = (label: string, ls: Lesson[]) => { if (ls.length) groups.push({ label, lessons: ls }); };
    const byTradition = (tr: string) => this.lessons.filter((l) => l.isBuiltIn && l.id !== FREE_PRACTICE.id && scaleById(l.scaleId).tradition === tr);
    push('Carnatic', byTradition('Carnatic'));
    push('Hindustani', byTradition('Hindustani'));
    push('Western', byTradition('Western'));
    push('My lessons', this.lessons.filter((l) => !l.isBuiltIn));
    push('Other', [FREE_PRACTICE]);
    return groups;
  }

  /** Start a focus drill: a short sequence judged against the session's scale, with its Sa. */
  startDrill(session: PracticeSession, sequence: string, title: string, hold = 1): void {
    this.drill = { id: `drill-${Date.now()}`, title, instructions: `Sing ${sequence.replace(/'/g, '˙').replace(/,/g, '̣')} slowly. Hold each note until it turns green, then move on.`, scaleId: session.scaleId, isBuiltIn: false, sequence, hold };
    if (this.prefs.tonic !== session.tonic) this.update({ tonic: session.tonic });
    this.goPractice();
  }

  /** Practise one swara on its own: three holds of the same note in the lesson's scale. */
  startSwaraDrill(lesson: Lesson, token: string, spoken: string): void {
    this.drill = { id: `drill-${Date.now()}`, title: `${spoken} only`, instructions: `Sing ${spoken} three times. Hold each one until it turns green.`, scaleId: lesson.scaleId, isBuiltIn: false, sequence: `${token} ${token} ${token}`, hold: lesson.hold ?? 1 };
    this.goPractice();
  }

  clearDrill(): void {
    this.drill = null;
    this.practice?.refresh();
  }

  private goPractice(): void {
    if (this.route === 'practice') this.practice.refresh();
    else this.navigate('practice');
  }

  update(patch: Partial<Prefs>): void {
    this.prefs = { ...this.prefs, ...patch };
    savePrefs(this.prefs);
    if (tanpura.running && ('tonic' in patch || 'saOctave' in patch || 'a4' in patch)) tanpura.retune(startingMidi(this.prefs.tonic, this.prefs.saOctave), this.prefs.a4);
    this.practice?.refresh();
  }

  setLesson(id: string): void {
    this.update({ lessonId: id });
  }

  setTonic(tonic: number): void {
    this.update({ tonic });
  }

  async reloadLessons(refresh = true): Promise<void> {
    const custom = await LessonStore.custom();
    this.lessons = [...BUILT_IN_LESSONS, ...custom, FREE_PRACTICE];
    if (refresh) {
      this.practice?.refresh();
      if (this.route === 'settings') await this.settings.refresh();
    }
  }

  openSession(id: string): void {
    location.hash = `#/session/${id}`;
  }

  navigate(route: Route): void {
    location.hash = route === 'practice' ? '' : `#/${route}`;
  }

  private applyHash(): void {
    const m = location.hash.match(/^#\/session\/(.+)$/);
    if (m) void this.show('session', m[1]);
    else if (location.hash === '#/sessions') void this.show('sessions');
    else if (location.hash === '#/settings') void this.show('settings');
    else if (location.hash === '#/tune') void this.show('tune');
    else void this.show('practice');
  }

  private async show(route: Route, id?: string): Promise<void> {
    if (this.route === 'practice' && route !== 'practice') await this.practice.leave();
    if (this.route === 'tune' && route !== 'tune') await this.finder.leave();
    this.route = route;
    for (const [r, btn] of this.tabs) btn.classList.toggle('active', r === route || (route === 'session' && r === 'sessions') || (route === 'tune' && r === 'practice'));
    let view: HTMLElement;
    switch (route) {
      case 'practice':
        this.practice.refresh();
        view = this.practice.el;
        break;
      case 'sessions':
        await this.sessions.refresh();
        view = this.sessions.el;
        break;
      case 'session':
        await this.detail.show(id!);
        view = this.detail.el;
        break;
      case 'settings':
        await this.settings.refresh();
        view = this.settings.el;
        break;
      case 'tune':
        await this.finder.show();
        view = this.finder.el;
        break;
    }
    this.content.replaceChildren(view);
    this.content.scrollTop = 0;
  }
}
