// ============================================
// Statistikas.lt - Main JavaScript
// ============================================

document.addEventListener('DOMContentLoaded', function() {
  initReveal();
  initHeroFigure();
  initTopicFromUrl();
  initFormHandling();
});

// ============================================
// Gentle reveal of blocks on scroll
// ============================================
function initReveal() {
  const targets = document.querySelectorAll('.tier, .aud, .step, .service-block, .quarto-grid-item');
  if (!('IntersectionObserver' in window) || targets.length === 0) return;

  const observer = new IntersectionObserver((entries) => {
    entries.forEach(entry => {
      if (entry.isIntersecting) {
        entry.target.classList.add('is-visible');
        observer.unobserve(entry.target);
      }
    });
  }, { rootMargin: '0px 0px -40px 0px', threshold: 0.1 });

  targets.forEach((el) => {
    // Only animate what starts below the fold, so nothing flashes on load
    if (el.getBoundingClientRect().top < window.innerHeight) return;
    const siblings = Array.from(el.parentElement.children);
    el.classList.add('reveal');
    el.style.transitionDelay = `${(siblings.indexOf(el) % 4) * 0.08}s`;
    observer.observe(el);
  });
}

// ============================================
// Hero figure: "jūsų" histogram reshuffles; hovering it replays the others
// ============================================
function initHeroFigure() {
  const figure = document.querySelector('.hero-figure');
  const cell = figure && figure.querySelector('.m-yours');
  if (!cell) return;

  const bars = Array.from(cell.querySelectorAll('.yours-bars i'));
  const k = bars.length;
  const gauss = (x, mu, sd) => Math.exp(-0.5 * ((x - mu) / sd) ** 2);
  const rand = (a, b) => a + Math.random() * (b - a);

  // Plausible shapes for "your" data, evaluated at bin centres x in (0, 1)
  const shapes = [
    () => { const mu = rand(0.35, 0.65), sd = rand(0.12, 0.2); return x => gauss(x, mu, sd); },
    () => { const r = rand(3, 6); return x => Math.exp(-r * x); },
    () => { const r = rand(3, 6); return x => Math.exp(-r * (1 - x)); },
    () => { const a = rand(0.15, 0.35), b = rand(0.6, 0.85), w = rand(0.5, 1); return x => gauss(x, a, 0.09) + w * gauss(x, b, 0.1); },
    () => { const s = rand(0.25, 0.45); return x => x ** 1.5 * Math.exp(-x / s * 2); },
    () => () => 1,
  ];

  let last = -1;
  function shuffle() {
    let pick;
    do { pick = Math.floor(Math.random() * shapes.length); } while (pick === last);
    last = pick;
    const f = shapes[pick]();
    const raw = bars.map((_, i) => f((i + 0.5) / k) * rand(0.85, 1.15));
    const max = Math.max(...raw);
    bars.forEach((bar, i) => {
      bar.style.setProperty('--h', Math.max(5, Math.round(raw[i] / max * 92)));
    });
  }

  const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  // Reshuffle on a loop, only while the hero is on screen and the tab is visible
  let timer = null;
  let onScreen = true;
  let ready = false;
  const stop = () => { clearInterval(timer); timer = null; };
  const start = () => {
    if (reduceMotion || !ready || timer || !onScreen || document.hidden) return;
    timer = setInterval(shuffle, 2600);
  };

  if ('IntersectionObserver' in window) {
    new IntersectionObserver(([entry]) => {
      onScreen = entry.isIntersecting;
      onScreen ? start() : stop();
    }).observe(cell);
  }
  document.addEventListener('visibilitychange', () => (document.hidden ? stop() : start()));
  // Let the entrance animation finish before the first reshuffle
  setTimeout(() => { ready = true; start(); }, 2000);

  // Replay the four histograms (throttled so it can't stutter)
  let replayFlip = false;
  let lastReplay = 0;
  function replay() {
    const now = Date.now();
    if (reduceMotion || now - lastReplay < 1600) return;
    lastReplay = now;
    replayFlip = !replayFlip;
    figure.classList.toggle('replay-a', replayFlip);
    figure.classList.toggle('replay-b', !replayFlip);
    shuffle();
    stop();
    start();
  }

  cell.addEventListener('pointerenter', replay);
  cell.addEventListener('click', replay);
}

// ============================================
// Contact page: preselect topic from ?tema=...
// ============================================
function initTopicFromUrl() {
  const topic = new URLSearchParams(window.location.search).get('tema');
  if (!topic) return;

  const input = document.querySelector(`input[name="tema"][value="${CSS.escape(topic)}"]`);
  if (input) input.checked = true;
}

// ============================================
// Formspree submission with inline feedback
// ============================================
function initFormHandling() {
  const forms = document.querySelectorAll('form[action*="formspree"]');

  forms.forEach(form => {
    form.addEventListener('submit', async function(e) {
      e.preventDefault();

      const submitBtn = form.querySelector('button[type="submit"]');
      const originalText = submitBtn.innerHTML;

      submitBtn.innerHTML = '<span class="loading-spinner"></span> Siunčiama...';
      submitBtn.disabled = true;

      const data = new FormData(form);
      const topicLabel = form.querySelector('input[name="tema"]:checked')?.dataset.label;
      if (topicLabel) data.set('_subject', `Statistikas.lt užklausa: ${topicLabel}`);

      try {
        const response = await fetch(form.action, {
          method: 'POST',
          body: data,
          headers: { 'Accept': 'application/json' }
        });

        if (!response.ok) throw new Error('Form submission failed');

        showFormMessage(form, 'success', 'Ačiū! Žinutė gauta – netrukus su jumis susisieksiu.');
        form.reset();
      } catch (error) {
        showFormMessage(form, 'error', 'Nepavyko išsiųsti žinutės. Bandykite dar kartą arba rašykite info@statistikas.lt.');
      } finally {
        submitBtn.innerHTML = originalText;
        submitBtn.disabled = false;
      }
    });
  });
}

function showFormMessage(form, type, message) {
  form.querySelectorAll('.form-message').forEach(el => el.remove());

  const messageEl = document.createElement('div');
  messageEl.className = `form-message form-message-${type}`;
  messageEl.setAttribute('role', 'status');
  messageEl.textContent = message;
  form.appendChild(messageEl);
}
