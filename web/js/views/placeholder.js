import { h } from '../dom.js';

export function renderPlaceholder(el, heading, text) {
  el.appendChild(h('section', { class: 'screen' },
    h('h1', null, heading),
    h('p', { class: 'muted' }, text),
    h('p', null, h('a', { class: 'link-btn', href: '#/' }, 'กลับคลังโพสต์'))
  ));
}
