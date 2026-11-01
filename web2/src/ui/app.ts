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
import { hasSeenOnboarding, showOnboarding } from './onboarding';
import { PracticeView } from './practice';
import { SessionDetailView, SessionsView } from './sessions';
import { SettingsView } from './settings';
import { topBar } from './setup';
import { auth } from '../auth/service';
import { isSignedIn, protectedPage } from '../auth/access';
import { AccountView } from './account';
import { artsBar, artsHome, isMusicRoute } from './arts';
import { KuchipudiView } from '../modules/kuchipudi/view';
import { RecordingGradeView } from './recordingGrade';
import type { Art } from '../core/aiGrading';

export type Route = 'arts' | 'kuchipudi' | 'account' | 'practice' | 'free' | 'sessions' | 'session' | 'settings' | 'grade-raaga' | 'grade-kuchipudi';

/** Listen & repeat app shell. */
export class App {
  prefs: Prefs = loadPrefs();
  /** lessons list is what the shared review page expects */
  lessons: Lesson[] = PRACTICES;
  drill: Lesson | null = null;
  private root: HTMLElement;
  private content = h('main', { class: 'content lr' });
  private bar = h('div');
  private route: Route = 'arts';
  private navigationVersion = 0;
  private uid: string | null = null;
  private signInDestination: { route: Route; id?: string } | null = null;
  private tourOpen = false;
  private practice!: PracticeView;
  private sessions = new SessionsView(this as never);
  private detail = new SessionDetailView(this as never);
  private settings = new SettingsView(this);
  private free = new FreePracticeView(this);
  private account = new AccountView(this);
  private kuchipudi = new KuchipudiView(this);
  private grading = new RecordingGradeView(this);

  constructor(root: HTMLElement) {
    this.root = root;
  }

  async init(): Promise<void> {
    this.practice = new PracticeView(this);
    this.root.replaceChildren(this.bar, this.content);
    this.renderBar();
    void requestPersistence();
    window.addEventListener('hashchange', () => this.applyHash());
    auth.subscribe(state => {
      const uid = state.user?.uid ?? null;
      if (uid !== this.uid) {
        this.uid = uid;
        this.kuchipudi.leave();
      }
      if (this.route === 'kuchipudi') this.kuchipudi.refresh();
      this.renderBar();
      if (this.route === 'account') this.account.refresh();
      if (this.route === 'account' && isSignedIn(state) && this.signInDestination) {
        const { route, id } = this.signInDestination;
        this.signInDestination = null;
        if (route === 'session' && id) this.openSession(id);
        else if (route === 'grade-raaga' || route === 'grade-kuchipudi') this.openGrader(route === 'grade-raaga' ? 'raaga' : 'kuchipudi', id);
        else this.navigate(route);
      } else if (protectedPage(this.route)) {
        // Recheck restored sessions, cross-tab sign-out, and account switches.
        this.detail.leave();
        this.grading.leave();
        this.sessions.leave();
        this.settings.el.replaceChildren();
        this.content.replaceChildren();
        document.querySelectorAll('.overlay').forEach(overlay => {
          // Let dialogs stop their microphone/tone resources before removal.
          overlay.querySelector<HTMLButtonElement>('[aria-label="Close"]')?.click();
          overlay.remove();
        });
        this.applyHash();
      }
    });
    auth.init();
    this.applyHash();
  }

  renderBar(): void {
    this.bar.replaceChildren(artsBar(this, this.route));
    if (isMusicRoute(this.route)) this.bar.append(topBar(this, this.route, scaleById(this.practice_().scaleId).tradition));
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

  openGrader(art: Art, lessonId?: string): void {
    location.hash = `#/grade-${art}${lessonId ? `/${encodeURIComponent(lessonId)}` : ''}`;
  }

  get signInReason(): string | null {
    return this.signInDestination ? protectedPage(this.signInDestination.route) : null;
  }

  private requestSignIn(route: Route, id?: string): void {
    this.signInDestination = { route, id };
    this.navigate('account');
  }

  navigate(route: Route | 'tune'): void {
    if (route === 'tune') {
      this.practice.openPitchSetup();
      return;
    }
    const target = route === 'arts' ? '' : `#/${route}`;
    if (location.hash === target) void this.show(route);
    else location.hash = target;
  }

  private applyHash(): void {
    const m = location.hash.match(/^#\/session\/(.+)$/);
    const grade = location.hash.match(/^#\/(grade-raaga|grade-kuchipudi)(?:\/([^/]+))?$/);
    if (grade) void this.show(grade[1] as Route, grade[2]);
    else if (m) void this.show('session', m[1]);
    else if (location.hash === '#/sessions') void this.show('sessions');
    else if (location.hash === '#/settings') void this.show('settings');
    else if (location.hash === '#/free') void this.show('free');
    else if (location.hash === '#/practice') void this.show('practice');
    else if (location.hash === '#/kuchipudi') void this.show('kuchipudi');
    else if (location.hash === '#/account') void this.show('account');
    else void this.show('arts');
  }

  private async show(route: Route, id?: string): Promise<void> {
    const version = ++this.navigationVersion;
    if (route !== 'account') this.signInDestination = null;
    if (this.route === 'session') this.detail.leave();
    if (this.route === 'sessions') this.sessions.leave();
    if (this.route === 'grade-raaga' || this.route === 'grade-kuchipudi') this.grading.leave();
    // Remove protected content before waiting for media teardown or storage.
    if (protectedPage(this.route)) this.content.replaceChildren();
    if (this.route === 'practice' && route !== 'practice') await this.practice.leave();
    if (this.route === 'free' && route !== 'free') await this.free.leave();
    if (version !== this.navigationVersion) return;
    if (this.route === 'kuchipudi' && route !== 'kuchipudi') this.kuchipudi.leave();
    if (!isMusicRoute(route)) tanpura.stop();
    this.route = route;
    this.renderBar();
    const protectedTitle = protectedPage(route);
    if (protectedTitle && !isSignedIn(auth.state)) {
      const loading = auth.state.status === 'loading';
      this.content.replaceChildren(h('div', { class: 'page' }, h('section', { class: 'card access-gate' },
        h('span', { class: 'eyebrow accent' }, route === 'grade-kuchipudi' ? 'YOUR KUCHIPUDI SPACE' : 'YOUR RAAGA SPACE'),
        h('h1', {}, loading ? 'Checking your sign-in…' : `Sign in for ${protectedTitle}`),
        h('p', { class: 'muted', role: 'status' }, loading ? 'Restoring your account before opening this page.' : 'Use your LMS for Arts account to continue. Practice, pitch feedback, and YouTube example searches are available to guests.'),
        !loading ? h('button', { class: 'btn', onClick: () => this.requestSignIn(route, id) }, 'Sign in to continue') : null,
        h('button', { class: 'link', onClick: () => this.navigate(route === 'grade-kuchipudi' ? 'kuchipudi' : 'practice') }, 'Back to practice'))));
      document.title = `${loading ? 'Checking sign-in' : 'Sign in'} · LMS for Arts`;
      return;
    }
    let view: HTMLElement;
    switch (route) {
      case 'arts':
        view = artsHome(this);
        break;
      case 'kuchipudi':
        this.kuchipudi.refresh();
        view = this.kuchipudi.el;
        break;
      case 'account':
        this.account.refresh();
        view = this.account.el;
        break;
      case 'grade-raaga':
      case 'grade-kuchipudi':
        this.grading.show(route === 'grade-raaga' ? 'raaga' : 'kuchipudi', id);
        view = this.grading.el;
        break;
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
    if (version !== this.navigationVersion) return;
    this.content.replaceChildren(view);
    this.content.scrollTop = 0;
    document.title = `${route.startsWith('grade-') ? 'Grade this lesson' : route === 'kuchipudi' ? 'Kuchipudi' : route === 'account' ? 'Account' : isMusicRoute(route) ? 'Raaga' : 'Explore'} · LMS for Arts`;
    // The existing singing tour belongs to Raaga, not to the arts home or dance module.
    if (route === 'practice' && !this.tourOpen && !hasSeenOnboarding()) {
      this.tourOpen = true;
      showOnboarding(() => { this.tourOpen = false; });
    }
  }
}
