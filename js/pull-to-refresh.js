const REFRESH_THRESHOLD = 76;
const SCROLL_PANELS = ['#appMain', '#adminMain', '#teacherMain', '#managerMain', '.pay-main'];

export function initPullToRefresh() {
  const panels = SCROLL_PANELS.map(selector => document.querySelector(selector)).filter(Boolean);
  if (!panels.length) return;

  const indicator = document.createElement('div');
  indicator.className = 'pull-refresh-indicator';
  indicator.setAttribute('role', 'status');
  indicator.setAttribute('aria-live', 'polite');
  indicator.innerHTML = '<span class="pull-refresh-spinner" aria-hidden="true"></span><span data-pull-refresh-label>নিচে টেনে রিফ্রেশ করুন</span>';
  document.body.append(indicator);

  let startY = 0;
  let distance = 0;
  let tracking = false;
  let refreshing = false;

  const reset = () => {
    tracking = false;
    distance = 0;
    indicator.classList.remove('is-pulling', 'is-ready');
    indicator.style.setProperty('--pull-distance', '0px');
  };

  for (const panel of panels) {
    panel.addEventListener('touchstart', event => {
      if (refreshing || event.touches.length !== 1 || panel.scrollTop > 0) return;
      startY = event.touches[0].clientY;
      distance = 0;
      tracking = true;
    }, { passive: true });

    panel.addEventListener('touchmove', event => {
      if (!tracking || event.touches.length !== 1) return;
      distance = Math.max(0, event.touches[0].clientY - startY);
      if (distance <= 0) return reset();
      event.preventDefault();
      indicator.style.setProperty('--pull-distance', `${Math.min(distance * 0.55, 88)}px`);
      indicator.classList.add('is-pulling');
      indicator.classList.toggle('is-ready', distance >= REFRESH_THRESHOLD);
      indicator.querySelector('[data-pull-refresh-label]').textContent = distance >= REFRESH_THRESHOLD
        ? 'রিফ্রেশ করতে ছেড়ে দিন'
        : 'নিচে টেনে রিফ্রেশ করুন';
    }, { passive: false });

    panel.addEventListener('touchend', () => {
      if (!tracking) return;
      if (distance >= REFRESH_THRESHOLD) {
        refreshing = true;
        indicator.classList.add('is-refreshing');
        indicator.querySelector('[data-pull-refresh-label]').textContent = 'রিফ্রেশ হচ্ছে…';
        window.setTimeout(() => window.location.reload(), 120);
      } else reset();
    }, { passive: true });

    panel.addEventListener('touchcancel', reset, { passive: true });
  }
}

initPullToRefresh();
