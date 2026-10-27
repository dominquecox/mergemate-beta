(() => {
  const forms = [...document.querySelectorAll('[data-waitlist]')];
  if (!forms.length) return;
  const widgets = new Map();
  const states = new Map();
  const messages = {
    email: 'Enter a valid email address.',
    challenge: 'Please complete the check and try again.',
    server: 'Something went wrong on our side. Try again in a minute.',
    success: "You're on the list. Check your inbox for a confirmation.",
  };
  function announce(form, message, state) {
    const status = form.querySelector('[role="status"]');
    status.textContent = message;
    status.dataset.state = state;
  }
  forms.forEach(form => {
    states.set(form, '');
    form.addEventListener('submit', async event => {
      event.preventDefault();
      const email = form.querySelector('input[type="email"]');
      const normalized = email.value.trim();
      if (normalized.length > 254 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalized)) {
        announce(form, messages.email, 'error'); email.setAttribute('aria-invalid', 'true'); email.focus(); return;
      }
      email.removeAttribute('aria-invalid');
      if (!states.get(form)) { announce(form, messages.challenge, 'error'); return; }
      const button = form.querySelector('button[type="submit"]');
      button.disabled = true;
      button.textContent = 'Joining…';
      form.setAttribute('aria-busy', 'true');
      announce(form, 'Adding you to the waitlist…', 'loading');
      try {
        const response = await fetch('/api/waitlist', {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ email: normalized, source: form.dataset.waitlist, turnstileToken: states.get(form) }),
          signal: AbortSignal.timeout(20000),
        });
        const result = await response.json();
        if (response.ok && result.ok === true) {
          announce(form, messages.success, 'success'); email.value = '';
        } else {
          announce(form, result.error === 'invalid_email' ? messages.email : result.error === 'invalid_challenge' ? messages.challenge : response.status === 429 ? 'Too many attempts. Please wait a minute and try again.' : messages.server, 'error');
        }
      } catch { announce(form, messages.server, 'error'); }
      finally {
        states.set(form, '');
        if (widgets.has(form)) window.turnstile?.reset(widgets.get(form));
        button.disabled = false; button.textContent = 'Join the waitlist'; form.removeAttribute('aria-busy');
      }
    });
  });
  window.onWaitlistTurnstile = () => {
    forms.forEach(form => {
      const widget = window.turnstile.render(form.querySelector('[data-challenge]'), {
        sitekey: window.waitlistSiteKey, action: 'waitlist', theme: 'auto', size: 'flexible',
        callback: token => { states.set(form, token); },
        'expired-callback': () => { states.set(form, ''); announce(form, messages.challenge, 'error'); },
        'error-callback': () => { states.set(form, ''); announce(form, messages.challenge, 'error'); },
      });
      widgets.set(form, widget);
    });
  };
  fetch('/api/config', { cache: 'no-store' }).then(response => response.ok ? response.json() : Promise.reject()).then(config => {
    if (!config.siteKey) throw new Error('unavailable');
    window.waitlistSiteKey = config.siteKey;
    const script = document.createElement('script');
    script.src = 'https://challenges.cloudflare.com/turnstile/v0/api.js?onload=onWaitlistTurnstile&render=explicit';
    script.async = true; script.defer = true;
    script.onerror = () => forms.forEach(form => announce(form, messages.challenge, 'error'));
    document.head.appendChild(script);
  }).catch(() => forms.forEach(form => announce(form, 'The signup check is temporarily unavailable. Please try again shortly.', 'error')));
})();
