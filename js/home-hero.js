/* Shared hero carousel implementation. Each slide keeps its illustration,
   heading and message together so autoplay/manual navigation cannot desync. */
import { quoteDateKey } from './daily-quote.js';

export const HERO_FIRST_DELAY_MS = 5000;
export const HERO_AUTOPLAY_MS = 5000;
export const HERO_TRANSITION_MS = 380;

const SLIDES = Object.freeze([
  {
    id: 'own-pace',
    title: 'নিজের ছন্দে',
    description: 'অন্যের সঙ্গে নয়, গতকালের নিজের সঙ্গে প্রতিযোগিতা করো।',
    image: 'assets/home-hero/hero-own-pace.webp',
    imageAlt: 'বাংলাদেশি এক ছাত্র খোলা বই পড়ছে, পাশে ছাত্রী খাতায় নোট লিখছে; টেবিলে বই, পেন্সিল বক্স ও স্কুলব্যাগ।'
  },
  {
    id: 'daily-goal',
    title: 'আজকের লক্ষ্য',
    description: 'আজ অন্তত ২০ মিনিট মনোযোগ দিয়ে পড়ো।',
    image: 'assets/home-hero/hero-daily-goal.webp',
    imageAlt: 'বাংলাদেশি স্কুলছাত্রী খোলা বইয়ের পাশে নোটবুকে দিনের পড়ার পরিকল্পনা লিখছে; পাশে ঘড়ি, বই ও টিক দেওয়া চেকলিস্ট।'
  },
  {
    id: 'joy-of-learning',
    title: 'শেখার আনন্দ',
    description: 'প্রতিটি নতুন বিষয় তোমার দক্ষতা আরও বাড়ায়।',
    image: 'assets/home-hero/hero-joy-of-learning.webp',
    imageAlt: 'বাংলাদেশি ছাত্র ও ছাত্রী খোলা বইয়ের বিজ্ঞানচিত্র নিয়ে আলোচনা করছে; টেবিলে বিজ্ঞান মডেল, জ্যামিতি বক্স ও খাতা।'
  },
  {
    id: 'daily-tip',
    title: 'আজকের পরামর্শ',
    description: 'পড়া শেষে বই বন্ধ করে, নিজের ভাষায় বিষয়টি মনে করো।',
    image: 'assets/home-hero/hero-daily-tip.webp',
    imageAlt: 'বাংলাদেশি স্কুলছাত্র নিজের ভাষায় মনে করে খাতায় লিখছে; পাশে বন্ধ বই ও পড়ার সামগ্রী।'
  }
]);

function bnNumber(value) {
  return String(value).replace(/\d/g, digit => '০১২৩৪৫৬৭৮৯'[Number(digit)]);
}

function formatDhakaDate(now = new Date()) {
  try {
    return new Intl.DateTimeFormat('bn-BD', {
      timeZone: 'Asia/Dhaka', weekday: 'long', day: 'numeric', month: 'long', year: 'numeric'
    }).format(now);
  } catch {
    return new Intl.DateTimeFormat('bn-BD', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' }).format(now);
  }
}

function needsLowMotion(view) {
  const navigator = view?.navigator || globalThis.navigator;
  const connection = navigator?.connection || navigator?.mozConnection || navigator?.webkitConnection;
  return Boolean(connection?.saveData || ['slow-2g', '2g'].includes(connection?.effectiveType) ||
    (Number(navigator?.deviceMemory) > 0 && Number(navigator.deviceMemory) <= 2) ||
    (Number(navigator?.hardwareConcurrency) > 0 && Number(navigator.hardwareConcurrency) <= 2));
}

function createElement(documentRef, tag, className, text = '') {
  const node = documentRef.createElement(tag);
  if (className) node.className = className;
  if (text) node.textContent = text;
  return node;
}

function ensureHeroMarkup(root, documentRef, slideSpecs) {
  let context = root.querySelector('[data-home-hero-context]');
  if (!context) {
    context = createElement(documentRef, 'div', 'hero-slider__context');
    context.dataset.homeHeroContext = '';
  }
  context.classList.add('hero-slider__context');
  let kicker = context.querySelector('.pay-portal-kicker, [data-hero-kicker]');
  if (!kicker) {
    const label = createElement(documentRef, 'p', 'pay-portal-kicker', 'আজকের পড়ার অনুপ্রেরণা');
    label.dataset.heroKicker = '';
    context.prepend(label);
    kicker = label;
  } else {
    kicker.textContent = 'আজকের পড়ার অনুপ্রেরণা';
  }

  let date = context.querySelector('[data-home-hero-date]');
  if (!date) {
    date = createElement(documentRef, 'time', 'hero-slider__date');
    date.dataset.homeHeroDate = '';
    context.append(date);
  }

  let stage = root.querySelector('[data-home-hero-slides]');
  if (!stage) {
    stage = createElement(documentRef, 'div', 'hero-slider__slides');
    stage.dataset.homeHeroSlides = '';
  }
  stage.classList.add('hero-slider__slides');

  const controls = createElement(documentRef, 'div', 'hero-slider__controls');
  controls.dataset.heroControls = '';
  controls.setAttribute('role', 'group');
  controls.setAttribute('aria-label', 'স্লাইড নিয়ন্ত্রণ');

  const previous = createElement(documentRef, 'button', 'hero-slider__arrow hero-slider__previous');
  previous.type = 'button';
  previous.dataset.heroPrevious = '';
  previous.setAttribute('aria-label', 'আগের স্লাইড');
  previous.append(createElement(documentRef, 'span', '', '‹'));

  const indicators = createElement(documentRef, 'div', 'hero-slider__indicators');
  indicators.dataset.heroIndicators = '';
  indicators.setAttribute('aria-hidden', 'true');
  slideSpecs.forEach((slide, index) => {
    const dot = createElement(documentRef, 'span', 'hero-slider__dot');
    dot.dataset.heroDot = '';
    dot.dataset.slideIndex = String(index);
    dot.setAttribute('aria-label', `${bnNumber(index + 1)} নম্বর স্লাইড`);
    indicators.append(dot);
  });

  const next = createElement(documentRef, 'button', 'hero-slider__arrow hero-slider__next');
  next.type = 'button';
  next.dataset.heroNext = '';
  next.setAttribute('aria-label', 'পরের স্লাইড');
  next.append(createElement(documentRef, 'span', '', '›'));
  controls.append(previous, indicators, next);

  root.replaceChildren(context, stage, controls);
  return { context, stage, controls, previous, next, indicators };
}

function createSlide(documentRef, spec, index, slideCount) {
  const slide = createElement(documentRef, 'article', `hero-slide hero-slide--${spec.id}`);
  slide.dataset.heroSlide = '';
  slide.dataset.heroId = spec.id;
  slide.setAttribute('role', 'group');
  slide.setAttribute('aria-roledescription', 'স্লাইড');
  slide.setAttribute('aria-label', `${bnNumber(index + 1)} / ${bnNumber(slideCount)}: ${spec.title}`);
  slide.setAttribute('aria-hidden', 'true');

  const picture = createElement(documentRef, 'picture', 'hero-slide__art');
  const image = createElement(documentRef, 'img');
  image.src = spec.image;
  image.width = 1280;
  image.height = 720;
  image.alt = spec.imageAlt;
  image.decoding = 'async';
  image.setAttribute('loading', index === 0 ? 'eager' : 'lazy');
  if (index === 0) image.setAttribute('fetchpriority', 'high');
  picture.append(image);

  const copy = createElement(documentRef, 'div', 'hero-slide__copy');
  const title = createElement(documentRef, 'h2', '', spec.title);
  title.dataset.heroTitle = '';
  const description = createElement(documentRef, 'p', 'hero-slide__description', spec.description);
  description.dataset.heroDescription = '';
  copy.append(title, description);
  slide.append(picture, copy);
  image.addEventListener('error', () => slide.classList.add('has-art-fallback'), { once: true });
  return slide;
}

/** Mounts the shared carousel into an existing hero hook. */
export function initHomeHero(rootOrSelector, options = {}) {
  const root = typeof rootOrSelector === 'string' ? document.querySelector(rootOrSelector) : rootOrSelector;
  if (!root || root.dataset.heroReady === '1') return { stop() {}, show() {} };
  const documentRef = root.ownerDocument || globalThis.document;
  const view = documentRef?.defaultView || globalThis;
  if (!documentRef) return { stop() {}, show() {} };
  const slideSpecs = Array.isArray(options?.slides) && options.slides.length ? options.slides : SLIDES;

  root.dataset.heroReady = '1';
  root.classList.add('hero-slider');
  root.setAttribute('role', 'region');
  root.setAttribute('aria-label', 'শিক্ষার্থীদের পড়াশোনার অনুপ্রেরণা');
  root.setAttribute('aria-roledescription', 'carousel');
  root.setAttribute('aria-live', 'off');
  root.dataset.direction = 'next';

  const { stage, controls, previous, next, indicators } = ensureHeroMarkup(root, documentRef, slideSpecs);
  stage.replaceChildren(...slideSpecs.map((spec, index) => createSlide(documentRef, spec, index, slideSpecs.length)));
  const slides = [...stage.querySelectorAll('[data-hero-slide]')];
  const dots = [...indicators.querySelectorAll('[data-hero-dot]')];
  const dateNodes = [...root.querySelectorAll('[data-home-hero-date]')];

  let active = -1;
  let timer = 0;
  let stopped = false;
  let pressed = false;
  let hovering = false;
  let outsideViewport = false;
  let pointerOrigin = null;
  let reducedMotion = Boolean(view.matchMedia?.('(prefers-reduced-motion: reduce)')?.matches);
  const noAnimation = needsLowMotion(view);
  root.classList.toggle('is-no-motion', noAnimation);

  function updateDate(now = new Date()) {
    const key = quoteDateKey(now.getTime());
    const label = formatDhakaDate(now);
    dateNodes.forEach(node => {
      node.textContent = label;
      if (node.tagName === 'TIME') node.dateTime = key;
    });
  }

  function setActive(index, direction = 'next') {
    if (!slides.length) return;
    const nextIndex = ((Number(index) % slides.length) + slides.length) % slides.length;
    if (nextIndex !== active) root.dataset.direction = direction;
    active = nextIndex;
    slides.forEach((slide, slot) => {
      const selected = slot === active;
      slide.classList.toggle('is-active', selected);
      slide.setAttribute('aria-hidden', String(!selected));
    });
    dots.forEach((dot, slot) => {
      dot.classList.toggle('is-active', slot === active);
      if (slot === active) dot.setAttribute('aria-current', 'true');
      else dot.removeAttribute('aria-current');
    });
    root.dataset.activeSlide = slides[active].dataset.heroId;
    root.classList.toggle('is-static', slides.length < 2 || reducedMotion);
  }

  function clearTimer() {
    if (timer) view.clearTimeout(timer);
    timer = 0;
  }

  function canAdvance() {
    return !stopped && !reducedMotion && !pressed && !hovering && !outsideViewport &&
      documentRef.visibilityState !== 'hidden' && !documentRef.hidden && slides.length > 1;
  }

  function schedule() {
    clearTimer();
    if (!canAdvance()) return;
    timer = view.setTimeout(() => {
      timer = 0;
      if (!canAdvance()) { schedule(); return; }
      setActive(active + 1, 'next');
      schedule();
    }, active < 0 ? HERO_FIRST_DELAY_MS : HERO_AUTOPLAY_MS);
  }

  function updateMotionPreference(value) {
    reducedMotion = Boolean(value);
    root.classList.toggle('is-reduced-motion', reducedMotion);
    setActive(active < 0 ? 0 : active);
    schedule();
  }

  updateDate();
  setActive(0, 'next');
  updateMotionPreference(reducedMotion);

  const previousClick = () => {
    setActive(active - 1, 'previous');
    schedule();
  };
  const nextClick = () => {
    setActive(active + 1, 'next');
    schedule();
  };
  previous.addEventListener('click', previousClick);
  next.addEventListener('click', nextClick);

  const visibilityChange = () => {
    if (documentRef.visibilityState !== 'hidden') updateDate();
    schedule();
  };
  documentRef.addEventListener('visibilitychange', visibilityChange);
  const motionQuery = view.matchMedia?.('(prefers-reduced-motion: reduce)');
  const motionChange = event => updateMotionPreference(event.matches);
  if (typeof motionQuery?.addEventListener === 'function') motionQuery.addEventListener('change', motionChange);
  else motionQuery?.addListener?.(motionChange);

  const pointerDown = event => {
    if (event.isPrimary === false) return;
    pressed = true;
    const target = event.target;
    const onArrow = target?.closest?.('[data-hero-previous], [data-hero-next]');
    pointerOrigin = event.pointerType === 'touch' && !onArrow
      ? { x: event.clientX, y: event.clientY }
      : null;
    schedule();
  };
  const pointerRelease = event => {
    if (!pressed) return;
    const start = pointerOrigin;
    pointerOrigin = null;
    pressed = false;
    if (start && event.type === 'pointerup') {
      const deltaX = Number(event.clientX) - start.x;
      const deltaY = Number(event.clientY) - start.y;
      if (Math.abs(deltaX) >= 44 && Math.abs(deltaX) > Math.abs(deltaY) * 1.25) {
        const direction = deltaX < 0 ? 'next' : 'previous';
        setActive(active + (direction === 'next' ? 1 : -1), direction);
      }
    }
    schedule();
  };
  const pointerEnter = event => {
    if (event.pointerType === 'mouse' || event.type === 'mouseenter') { hovering = true; schedule(); }
  };
  const pointerLeave = event => {
    if (event.pointerType === 'mouse' || event.type === 'mouseleave') { hovering = false; schedule(); }
  };
  root.addEventListener('pointerdown', pointerDown, { passive: true });
  documentRef.addEventListener('pointerup', pointerRelease, { passive: true });
  documentRef.addEventListener('pointercancel', pointerRelease, { passive: true });
  root.addEventListener('pointerenter', pointerEnter, { passive: true });
  root.addEventListener('pointerleave', pointerLeave, { passive: true });
  root.addEventListener('mouseenter', pointerEnter, { passive: true });
  root.addEventListener('mouseleave', pointerLeave, { passive: true });

  let intersectionObserver = null;
  let scrollFallback = null;
  if (typeof view.IntersectionObserver === 'function') {
    intersectionObserver = new view.IntersectionObserver(entries => {
      outsideViewport = !entries.some(entry => entry.isIntersecting && entry.intersectionRatio > 0);
      schedule();
    }, { threshold: 0.01 });
    intersectionObserver.observe(root);
  } else {
    scrollFallback = () => {
      const rect = root.getBoundingClientRect();
      const viewportHeight = Number(view.innerHeight) || 0;
      outsideViewport = rect.bottom <= 0 || rect.top >= viewportHeight;
      schedule();
    };
    view.addEventListener?.('scroll', scrollFallback, { passive: true });
    view.addEventListener?.('resize', scrollFallback, { passive: true });
    scrollFallback();
  }

  function stop() {
    if (stopped) return;
    stopped = true;
    clearTimer();
    intersectionObserver?.disconnect();
    if (scrollFallback) {
      view.removeEventListener?.('scroll', scrollFallback);
      view.removeEventListener?.('resize', scrollFallback);
    }
    documentRef.removeEventListener('visibilitychange', visibilityChange);
    documentRef.removeEventListener('pointerup', pointerRelease);
    documentRef.removeEventListener('pointercancel', pointerRelease);
    root.removeEventListener('pointerdown', pointerDown);
    root.removeEventListener('pointerenter', pointerEnter);
    root.removeEventListener('pointerleave', pointerLeave);
    root.removeEventListener('mouseenter', pointerEnter);
    root.removeEventListener('mouseleave', pointerLeave);
    previous.removeEventListener('click', previousClick);
    next.removeEventListener('click', nextClick);
    if (typeof motionQuery?.removeEventListener === 'function') motionQuery.removeEventListener('change', motionChange);
    else motionQuery?.removeListener?.(motionChange);
    view.removeEventListener?.('pagehide', stop);
  }

  view.addEventListener?.('pagehide', stop, { once: true });
  return {
    stop,
    show(index) {
      const target = ((Number(index) % slides.length) + slides.length) % slides.length;
      const forward = (target - active + slides.length) % slides.length;
      setActive(target, forward > slides.length / 2 ? 'previous' : 'next');
      schedule();
    }
  };
}
