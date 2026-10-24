/* Reserve the actual fixed-bar heights, including safe areas and loaded fonts.
   Only the main panel scrolls; neither view animations nor long forms move the bars. */
export function initFixedShell() {
  const bars = [];
  for (const [shellSelector, headerSelector, footerSelector] of [
    ['#appShell', '#studentHeader', '.bottom-nav'],
    ['#adminShell', '.app-topbar', '.admin-bottom'],
    ['#teacherShell', '.app-topbar', '.admin-bottom'],
    ['#managerShell', '.app-topbar', '.admin-bottom']
  ]) {
    const shell = document.querySelector(shellSelector);
    if (!shell) continue;
    for (const [selector, variable] of [[headerSelector, '--shell-header-height'], [footerSelector, '--shell-footer-height']]) {
      const element = shell.querySelector(selector);
      if (element) bars.push({ shell, element, variable });
    }
  }
  const studentShell = document.querySelector('#appShell');
  const studentMain = document.querySelector('#appMain');
  const setSize = (shell, name, value) => {
    if (shell.style.getPropertyValue(name) !== value) shell.style.setProperty(name, value);
  };
  const measure = () => {
    // A truthful sync/status notice is outside the student shell. Its height
    // must be deducted too, otherwise a 100dvh shell extends under the footer.
    if (studentShell && !studentShell.hidden) {
      const top = Math.max(0, Math.ceil(studentShell.getBoundingClientRect().top + window.scrollY));
      setSize(studentShell, '--shell-top-offset', `${top}px`);
      const available = Math.floor(studentMain?.getBoundingClientRect().height || 0);
      if (available > 0) setSize(studentShell, '--student-home-height', `${available}px`);
    }
    for (const { shell, element, variable } of bars) {
      const height = Math.ceil(element.getBoundingClientRect().height);
      // Keep sensible fallbacks while login/pending screens hide the app bars.
      if (height > 0) setSize(shell, variable, `${height}px`);
    }
  };
  if (typeof ResizeObserver === 'function') {
    const observer = new ResizeObserver(measure);
    bars.forEach(({ element }) => observer.observe(element, { box: 'border-box' }));
    if (studentShell) observer.observe(document.body);
    if (studentMain) observer.observe(studentMain, { box: 'border-box' });
  }
  window.addEventListener('resize', measure, { passive: true });
  document.fonts?.ready.then(measure);
  measure();
}
