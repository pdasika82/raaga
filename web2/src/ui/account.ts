import { auth } from '../auth/service';
import { authErrorMessage } from '../auth/config';
import type { App } from './app';
import { h } from './dom';

export class AccountView {
  readonly el = h('div', { class: 'arts-page account-page' });
  private mode: 'signin' | 'signup' | 'reset' = 'signin';
  private busy = false;
  private notice = '';
  private failed = false;
  private email = '';

  constructor(private app: App) {}

  private async run(action: () => Promise<unknown>, success = ''): Promise<void> {
    if (this.busy) return;
    this.busy = true;
    this.notice = '';
    this.failed = false;
    const status = this.el.querySelector('[role="status"]');
    if (status) status.textContent = 'Please wait…';
    this.el.setAttribute('aria-busy', 'true');
    this.el.querySelectorAll<HTMLButtonElement>('button').forEach(button => { button.disabled = true; });
    try {
      await action();
      this.notice = success;
    } catch (error) {
      this.failed = true;
      this.notice = authErrorMessage(error);
    } finally {
      this.busy = false;
      this.el.removeAttribute('aria-busy');
      this.refresh();
    }
  }

  refresh(): void {
    const { user, status, message } = auth.state;
    const ready = status === 'ready' && !this.busy;
    const switchMode = (mode: typeof this.mode) => {
      this.mode = mode; this.notice = ''; this.refresh();
    };
    const notice = h('p', { class: `account-notice${this.failed ? ' warn' : ''}`, role: 'status', 'aria-live': 'polite' }, this.busy ? 'Please wait…' : this.notice);
    const card = h('section', { class: 'card account-card' },
      h('span', { class: 'eyebrow accent' }, 'YOUR ARTS JOURNEY'),
      h('h1', {}, user ? 'Your account' : this.mode === 'signup' ? 'Make room for your art.' : this.mode === 'reset' ? 'Reset your password' : 'Welcome back.'),
      h('p', { class: 'muted' }, user ? 'One account for Raaga and Kuchipudi.' : this.app.signInReason ? `Sign in to open ${this.app.signInReason}. We’ll take you back after sign-in.` : 'One account. More ways to learn and practice.'));

    if (user) {
      card.append(
        h('div', { class: 'account-identity' }, h('span', { class: 'account-avatar', 'aria-hidden': 'true' }, (user.displayName || user.email || 'A').slice(0, 1).toUpperCase()),
          h('div', {}, h('strong', {}, user.displayName || 'Arts learner'), h('div', { class: 'muted small' }, user.email || 'Signed in'))),
        h('p', { class: 'muted small' }, user.emailVerified ? 'Email verified' : 'Email not yet verified'),
        ...(!user.emailVerified ? [h('button', { class: 'btn btn-secondary', disabled: !ready, onClick: () => void this.run(() => auth.verifyEmail(), 'Verification email sent. Follow the link in your inbox.') }, 'Send verification email')] : []),
        h('button', { class: 'btn btn-secondary', disabled: !ready, onClick: () => void this.run(() => auth.signOut(), 'You are signed out.') }, 'Sign out'));
    } else if (status !== 'ready') {
      card.append(h('p', { class: 'account-notice', role: 'status' }, status === 'loading' ? 'Checking your account…' : message));
    } else {
      if (this.mode !== 'reset') card.append(h('button', { class: 'btn btn-secondary google-signin', disabled: !ready, onClick: () => void this.run(() => auth.google()) }, 'Continue with Google'), h('div', { class: 'auth-divider' }, 'or use your email'));
      const email = h('input', { class: 'input', type: 'email', required: true, autocomplete: 'email', value: this.email, placeholder: 'you@example.com', disabled: !ready });
      email.addEventListener('input', () => { this.email = email.value; });
      const password = h('input', { class: 'input', type: 'password', required: true, minlength: this.mode === 'signup' ? 6 : undefined, autocomplete: this.mode === 'signup' ? 'new-password' : 'current-password', disabled: !ready });
      const confirmation = h('input', { class: 'input', type: 'password', required: true, autocomplete: 'new-password', disabled: !ready });
      const form = h('form', { class: 'auth-form' },
        h('label', { class: 'field col' }, h('span', {}, 'Email'), email),
        this.mode !== 'reset' ? h('label', { class: 'field col' }, h('span', {}, 'Password'), password) : null,
        this.mode === 'signup' ? h('label', { class: 'field col' }, h('span', {}, 'Confirm password'), confirmation) : null,
        h('button', { class: 'btn', type: 'submit', disabled: !ready }, this.mode === 'signup' ? 'Create account' : this.mode === 'reset' ? 'Send reset link' : 'Sign in'));
      form.addEventListener('submit', event => {
        event.preventDefault();
        if (this.mode === 'signup' && password.value !== confirmation.value) {
          confirmation.setCustomValidity('Passwords do not match.'); confirmation.reportValidity(); return;
        }
        if (this.mode === 'reset') void this.run(() => auth.resetPassword(email.value), 'If an account exists for this email, a password reset link has been sent.');
        else void this.run(() => auth.email(email.value, password.value, this.mode === 'signup'));
      });
      confirmation.addEventListener('input', () => confirmation.setCustomValidity(''));
      password.addEventListener('input', () => confirmation.setCustomValidity(''));
      card.append(form, h('div', { class: 'row space' },
        h('button', { class: 'link small', disabled: !ready, onClick: () => switchMode(this.mode === 'signin' ? 'signup' : 'signin') }, this.mode === 'signin' ? 'Create an account' : 'Back to sign in'),
        this.mode === 'signin' ? h('button', { class: 'link small', disabled: !ready, onClick: () => switchMode('reset') }, 'Forgot password?') : null));
    }
    card.append(notice,
      h('p', { class: 'muted small account-storage' }, 'Practice stays on this device. Kuchipudi journals are separate for each account; Raaga recordings remain shared within this browser. Signing in does not upload or sync recordings.'),
      h('button', { class: 'link account-continue', disabled: this.busy, onClick: () => this.app.navigate('arts') }, user ? 'Explore your arts →' : 'Continue as a guest →'));
    this.el.replaceChildren(card);
  }
}
