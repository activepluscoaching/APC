/** Shared renderer for the Active Plus Color icon family.
 * Services get the new layered illustrations; small navigation/control icons
 * get matching simplified glyphs. The existing renderer API and semantic names
 * are retained so changing artwork never changes a route or permission.
 * SVGs are decorative: visible labels/aria-labels name their parent controls. */
import { ICON_SET, ICON_SET_VERSION, iconArtwork } from './icon-set.js';

const escape = value => String(value).replace(/[&<>"']/g, c => ({ '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;' }[c]));
const compactClass = /(?:^|\s)(?:nav-icon|app-topbar-icon|topbar-icon|admin-hero-icon-svg|admin-tile-icon-svg|admin-stat-icon-svg)(?:\s|$)/;

export function iconMarkup(name, className = 'apc-icon-svg', options = {}) {
  const key = String(name).replace(/^icon-/, '');
  const variant = options.variant || (compactClass.test(String(className)) ? 'glyph' : 'color');
  const artwork = iconArtwork(key, variant);
  const classes = `${className || ''} apc-${artwork.style}-icon`.trim();
  return `<svg class="${escape(classes)}" data-icon="${escape(key)}" data-icon-set="${ICON_SET}" data-icon-version="${ICON_SET_VERSION}" data-icon-style="${artwork.style}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false">${artwork.markup}</svg>`;
}
export function iconElement(name, className, options) {
  const template = document.createElement('template');
  template.innerHTML = iconMarkup(name, className, options);
  return template.content.firstElementChild;
}
export function paintIcon(container, name, className, options) {
  if (!container) return null;
  const compact = container.closest?.('.nav-chip,.app-topbar-icon,.admin-hero-icon,.tile-icon,.admin-stat-icon,.input-wrap,.admin-btn,.mini-btn');
  container.replaceChildren(iconElement(name, className, options || (compact ? { variant: 'glyph' } : undefined)));
  return container;
}
