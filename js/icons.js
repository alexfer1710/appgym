// Inline SVG icons. Line icons follow the SF Symbols used by the original Swift app
// (paths adapted from Lucide, ISC licence). Muscle icons are ported from the Swift
// app's MuscleIcon artwork: a grey body silhouette with the worked muscle in colour.

const line = {
  house: '<path d="M3 10.5 12 3l9 7.5V20a1 1 0 0 1-1 1h-5v-6H9v6H4a1 1 0 0 1-1-1z"/>',
  calendar: '<rect x="3" y="5" width="18" height="16" rx="3"/><path d="M3 10h18M8 3v4M16 3v4"/>',
  dumbbell: '<path d="M6.5 6v12M3.5 9v6M17.5 6v12M20.5 9v6M6.5 12h11"/>',
  gear: '<path d="M12.22 2h-.44a2 2 0 0 0-2 2v.18a2 2 0 0 1-1 1.73l-.43.25a2 2 0 0 1-2 0l-.15-.08a2 2 0 0 0-2.73.73l-.22.38a2 2 0 0 0 .73 2.73l.15.1a2 2 0 0 1 1 1.72v.51a2 2 0 0 1-1 1.74l-.15.09a2 2 0 0 0-.73 2.73l.22.38a2 2 0 0 0 2.73.73l.15-.08a2 2 0 0 1 2 0l.43.25a2 2 0 0 1 1 1.73V20a2 2 0 0 0 2 2h.44a2 2 0 0 0 2-2v-.18a2 2 0 0 1 1-1.73l.43-.25a2 2 0 0 1 2 0l.15.08a2 2 0 0 0 2.73-.73l.22-.39a2 2 0 0 0-.73-2.73l-.15-.08a2 2 0 0 1-1-1.74v-.5a2 2 0 0 1 1-1.74l.15-.09a2 2 0 0 0 .73-2.73l-.22-.38a2 2 0 0 0-2.73-.73l-.15.08a2 2 0 0 1-2 0l-.43-.25a2 2 0 0 1-1-1.73V4a2 2 0 0 0-2-2z"/><circle cx="12" cy="12" r="3"/>',
  flame: '<path d="M8.5 14.5A2.5 2.5 0 0 0 11 12c0-1.38-.5-2-1-3-1.072-2.143-.224-4.054 2-6 .5 2.5 2 4.9 4 6.5 2 1.6 3 3.5 3 5.5a7 7 0 1 1-14 0c0-1.153.433-2.294 1-3a2.5 2.5 0 0 0 2.5 2.5z"/>',
  history: '<path d="M3 12a9 9 0 1 0 9-9 9.75 9.75 0 0 0-6.74 2.74L3 8"/><path d="M3 3v5h5M12 7v5l4 2"/>',
  search: '<circle cx="11" cy="11" r="7.5"/><path d="m21 21-4.7-4.7"/>',
  plus: '<path d="M5 12h14M12 5v14"/>',
  minus: '<path d="M5 12h14"/>',
  check: '<path d="M20 6 9 17l-5-5"/>',
  'chevron-right': '<path d="m9 18 6-6-6-6"/>',
  'chevron-left': '<path d="m15 18-6-6 6-6"/>',
  'chevron-up': '<path d="m18 15-6-6-6 6"/>',
  'chevron-down': '<path d="m6 9 6 6 6-6"/>',
  'arrow-right': '<path d="M5 12h14M13 6l6 6-6 6"/>',
  'arrow-up': '<path d="M12 19V5M6 11l6-6 6 6"/>',
  'arrow-down': '<path d="M12 5v14M6 13l6 6 6-6"/>',
  equal: '<path d="M6 9.5h12M6 14.5h12"/>',
  smile: '<circle cx="12" cy="12" r="9.5"/><path d="M8 14s1.5 2 4 2 4-2 4-2M9 9.5h.01M15 9.5h.01"/>',
  'check-circle': '<circle cx="12" cy="12" r="9.5"/><path d="m8.5 12.2 2.4 2.4 4.6-5"/>',
  'alert-circle': '<circle cx="12" cy="12" r="9.5"/><path d="M12 7.5v5M12 16.2h.01"/>',
  grid: '<rect x="3.5" y="3.5" width="7" height="7" rx="1.6"/><rect x="13.5" y="3.5" width="7" height="7" rx="1.6"/><rect x="3.5" y="13.5" width="7" height="7" rx="1.6"/><rect x="13.5" y="13.5" width="7" height="7" rx="1.6"/>',
  list: '<path d="M8.5 6H21M8.5 12H21M8.5 18H21M3.5 6h.01M3.5 12h.01M3.5 18h.01"/>',
  cloud: '<path d="M17.5 19H9a7 7 0 1 1 6.71-9h1.79a4.5 4.5 0 1 1 0 9Z"/>',
  trash: '<path d="M3 6h18M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/>',
  x: '<path d="M18 6 6 18M6 6l12 12"/>',
};
const solid = {
  play: '<path d="M7 4.6v14.8a1 1 0 0 0 1.5.86l12.3-7.4a1 1 0 0 0 0-1.72L8.5 3.74A1 1 0 0 0 7 4.6z"/>',
};

export function icon(name, cls = '') {
  if (solid[name]) return `<svg class="icon ${cls}" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">${solid[name]}</svg>`;
  return `<svg class="icon ${cls}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${line[name] || ''}</svg>`;
}

// Very light tint of a muscle colour, used as the background behind exercise illustrations.
export function muscleTint(group, amount = 0.16) {
  const hex = (muscleColors[group] || '#9AA0A6').slice(1), c = [0, 2, 4].map(i => parseInt(hex.slice(i, i + 2), 16));
  return '#' + c.map(v => Math.round(255 - (255 - v) * amount).toString(16).padStart(2, '0')).join('');
}
export const muscleColors = {
  Pecho: '#E85D64', Espalda: '#E5B93F', 'Tríceps': '#D6AD32', 'Bíceps': '#36A782', Hombro: '#508BE8',
  Pierna: '#4CAF70', Abdomen: '#35A6B5', 'Glúteo': '#E874B0', Antebrazo: '#8B69C6',
};

const torso = [[42,12],[58,12],[61,22],[77,27],[87,49],[77,55],[68,39],[64,66],[66,87],[34,87],[36,66],[32,39],[23,55],[13,49],[23,27],[39,22]];
const arm = [[35,14],[53,15],[64,28],[59,52],[68,72],[80,77],[78,87],[61,85],[45,60],[29,43],[26,29]];
const armTop = [[32,23],[42,18],[53,23],[58,32],[51,39],[33,36]];
const abs = [43, 55, 67].flatMap(y => [[[40,y],[48,y],[48,y+9],[40,y+9]], [[52,y],[60,y],[60,y+9],[52,y+9]]]);
// [body shapes, highlighted shapes]
const artwork = {
  Pecho: [[torso], [[[33,28],[47,27],[48,46],[37,49],[30,39]], [[53,27],[67,28],[70,39],[63,49],[52,46]]]],
  Espalda: [[torso], [[[32,29],[47,34],[48,70],[39,61],[32,43]], [[53,34],[68,29],[68,43],[61,61],[52,70]]]],
  Hombro: [[torso], [[[24,28],[33,26],[35,34],[28,44],[20,43]], [[67,26],[76,28],[80,43],[72,44],[65,34]]]],
  Abdomen: [[torso], abs],
  Pierna: [[[[29,13],[71,13],[76,30],[69,61],[65,88],[54,88],[50,52],[46,88],[35,88],[31,61],[24,30]]],
    [[[29,24],[47,27],[46,53],[38,65],[31,52]], [[53,27],[71,24],[69,52],[62,65],[54,53]], [[36,68],[45,65],[44,85],[37,85]], [[55,65],[64,68],[63,85],[56,85]]]],
  'Glúteo': [[[[32,13],[68,13],[76,37],[69,63],[65,88],[54,88],[50,57],[46,88],[35,88],[31,63],[24,37]]],
    [[[30,29],[46,27],[49,37],[47,52],[35,55],[27,44]], [[54,27],[70,29],[73,44],[65,55],[53,52],[51,37]]]],
  'Bíceps': [[arm, armTop], [[[48,35],[58,34],[55,50],[49,56],[41,46]]]],
  'Tríceps': [[arm, armTop], [[[31,35],[43,38],[49,56],[40,51],[30,43]]]],
  Antebrazo: [[arm, armTop], [[[47,56],[61,70],[79,77],[78,86],[61,84],[43,61]]]],
};
const poly = (points, fill) => `<polygon points="${points.map(p => p.join(',')).join(' ')}" fill="${fill}"/>`;

export function muscleIcon(group, cls = '') {
  const [body, marked] = artwork[group] || [[torso], []];
  const color = muscleColors[group] || '#64748B';
  return `<svg class="muscle-icon ${cls}" viewBox="0 0 100 100" aria-hidden="true"><rect width="100" height="100" rx="26" fill="var(--icon-bg,#f2f2f7)"/><g stroke="#fff" stroke-width="1.5" stroke-linejoin="round">${body.map(p => poly(p, 'rgba(60,60,67,.3)')).join('')}${marked.map(p => poly(p, color)).join('')}</g></svg>`;
}
