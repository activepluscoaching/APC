/** Presentation-only status area. Uses no transport, auth or storage APIs.
 * Keep notices in document flow rather than covering forms and navigation.
 */
export function mountStatusNotice(element) {
  let surface = document.getElementById('appStatusSurface');
  if (!surface) {
    surface = document.createElement('aside');
    surface.id = 'appStatusSurface';
    surface.setAttribute('aria-label', 'সংযোগ ও নোটিফিকেশন');
    const auth = document.getElementById('authScreen');
    if (auth && !auth.hidden) auth.append(surface);
    else document.body.prepend(surface);
    if (auth) new MutationObserver(() => {
      if (auth.hidden) document.body.prepend(surface);
      else auth.append(surface);
    }).observe(auth, {attributes:true, attributeFilter:['hidden']});
  }
  surface.append(element);
}
