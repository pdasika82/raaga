import { clear, h } from './dom';

const ONBOARDING_KEY = 'raaga_onboarding_seen';

export function hasSeenOnboarding(): boolean {
  return localStorage.getItem(ONBOARDING_KEY) === 'true';
}

export function markOnboardingSeen(): void {
  localStorage.setItem(ONBOARDING_KEY, 'true');
}

export function showOnboarding(onDismiss: () => void): void {
  const overlay = h('div', { class: 'overlay modal' });
  const close = () => {
    overlay.remove();
    markOnboardingSeen();
    onDismiss?.();
  };

  const steps = [
    {
      title: 'Welcome to Raaga',
      content: 'A singing practice app that listens to your voice, shows which note you are on, and helps you improve your pitch accuracy.',
      icon: '🎵'
    },
    {
      title: 'Choose Your Sa',
      content: 'Sa is your starting note. Use the chip in the top bar to find a comfortable pitch you can sing easily.',
      icon: '🎯'
    },
    {
      title: 'Three-Step Practice',
      content: ['1. Listen to the phrase', '2. Sing it back with live feedback', '3. Compare your results and get a score'],
      icon: '🔄'
    },
    {
      title: 'Live Feedback',
      content: 'The gauge shows how close you are to the target note. Green means you\'re in tune, yellow is close, orange or red means you need to adjust.',
      icon: '📊'
    },
    {
      title: 'Save Your Sessions',
      content: 'Turn on "Save takes" to keep your recordings for later review. Use the Sessions tab to see your progress over time.',
      icon: '💾'
    },
    {
      title: 'Get AI Guidance',
      content: 'After a session, ask Claude for personalized practice tips based on your pitch analysis. Add your API key in Settings.',
      icon: '🤖'
    }
  ];

  let currentStep = 0;
  const content = h('div', { class: 'onboarding-content' });

  const renderStep = () => {
    const step = steps[currentStep];
    const textContainer = h('div', { class: 'onboarding-text' });
    if (Array.isArray(step.content)) {
      step.content.forEach((line) => textContainer.append(h('div', {}, line)));
    } else {
      textContainer.textContent = step.content;
    }
    clear(content).append(
      h('div', { class: 'onboarding-icon' }, step.icon),
      h('h2', {}, step.title),
      textContainer,
      h('div', { class: 'onboarding-dots' }, ...steps.map((_, i) => h('span', { class: `dot${i === currentStep ? ' active' : ''}` }))),
      h('div', { class: 'onboarding-buttons' },
        currentStep > 0 ? h('button', { class: 'btn btn-secondary', onClick: () => { currentStep--; renderStep(); } }, 'Back') : null,
        currentStep < steps.length - 1
          ? h('button', { class: 'btn', onClick: () => { currentStep++; renderStep(); } }, 'Next')
          : h('button', { class: 'btn', onClick: close }, 'Get started')
      )
    );
  };

  overlay.append(h('div', { class: 'card modal-card onboarding-card' },
    h('button', { class: 'icon-btn', 'aria-label': 'Skip', onClick: close }, '✕'),
    content
  ));

  document.body.append(overlay);
  renderStep();
}
