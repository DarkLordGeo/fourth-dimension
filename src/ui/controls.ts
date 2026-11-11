import { PLANES, type Plane } from '../math/rotation';
import { MAX_DISTANCE, MIN_DISTANCE, type Settings } from '../app/state';
import { STAGES } from '../app/sequence';

export interface Actions {
  /** A setting changed; `engage` means the user took over the rotation. */
  changed(engage: boolean): void;
  jumpToStage(index: number): void;
  resetOrientation(): void;
  resetAll(): void;
}

export interface Controls {
  sync(): void;
  setStage(index: number): void;
  /** Screen area currently taken by the open panel, in CSS pixels. */
  inset(): { right: number; bottom: number };
  dispose(): void;
}

const icon = (d: string) =>
  `<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${d}</svg>`;
const ICONS = {
  pause: icon('<path d="M9 6v12M15 6v12"/>'),
  play: icon('<path d="M8 5.5v13l10.5-6.5z"/>'),
  reset: icon('<path d="M4.5 12a7.5 7.5 0 1 0 2.4-5.5"/><path d="M4.5 4.5v4h4"/>'),
  tune: icon('<path d="M4 7h9M17 7h3M4 17h3M11 17h9"/><circle cx="15" cy="7" r="2"/><circle cx="9" cy="17" r="2"/>'),
};

const ORDER: Plane[] = ['xw', 'yw', 'zw', 'xy', 'xz', 'yz'];

export function createControls(root: HTMLElement, s: Settings, actions: Actions): Controls {
  root.innerHTML = `
    <aside class="panel" id="panel" aria-label="Settings" hidden>
      <section>
        <label class="row"><span>Speed</span><input type="range" data-k="speed" min="0" max="3" step="0.01"></label>
        <label class="row"><span>4D distance</span><input type="range" data-k="distance" min="${MIN_DISTANCE}" max="${MAX_DISTANCE}" step="0.01"></label>
      </section>
      <section>
        <h2>Rotation planes</h2>
        ${ORDER.map(
          (p, i) => `${i === 3 ? '<hr>' : ''}
          <div class="row">
            <button class="chip" data-plane="${p}" aria-pressed="false" title="Rotate in the ${p.toUpperCase()} plane">${p.toUpperCase()}</button>
            <input type="range" data-rate="${p}" min="-1" max="1" step="0.01" aria-label="${p.toUpperCase()} rotation rate">
          </div>`,
        ).join('')}
      </section>
      <section>
        <div class="row seg" role="group" aria-label="Representation">
          <button class="chip" data-mode="wireframe" aria-pressed="false">Wireframe</button>
          <button class="chip" data-mode="solid" aria-pressed="false">Solid</button>
        </div>
        <div class="row seg">
          <button class="chip" data-toggle="showVertices" aria-pressed="false">Vertices</button>
          <button class="chip" data-toggle="showEdges" aria-pressed="false">Edges</button>
        </div>
      </section>
      <section>
        <div class="row seg"><button class="chip plain" data-act="orient">Original orientation</button></div>
        <div class="row seg"><button class="chip plain" data-act="reset">Reset all</button></div>
      </section>
    </aside>
    <nav class="bar" aria-label="Playback">
      <div class="stages" role="group" aria-label="Sequence">
        ${STAGES.map((st, i) => `<button class="dot" data-stage="${i}" title="${st.label}" aria-label="${st.label}"><i></i></button>`).join('')}
      </div>
      <span class="sep"></span>
      <button class="ib" data-act="pause" title="Pause (space)" aria-label="Pause"></button>
      <button class="ib" data-act="reset" title="Reset" aria-label="Reset everything">${ICONS.reset}</button>
      <button class="ib" data-act="panel" title="Settings" aria-label="Settings" aria-expanded="false" aria-controls="panel">${ICONS.tune}</button>
    </nav>`;

  const $ = <T extends HTMLElement>(q: string) => root.querySelector<T>(q)!;
  const $$ = <T extends HTMLElement>(q: string) => Array.from(root.querySelectorAll<T>(q));
  const panel = $('#panel');
  const pauseBtn = $<HTMLButtonElement>('[data-act="pause"]');
  const panelBtn = $<HTMLButtonElement>('[data-act="panel"]');

  function sync() {
    $$<HTMLInputElement>('[data-k]').forEach((el) => (el.value = String(s[el.dataset.k as 'speed' | 'distance'])));
    for (const p of PLANES) {
      $(`[data-plane="${p}"]`).setAttribute('aria-pressed', String(s.planes[p].enabled));
      const r = $<HTMLInputElement>(`[data-rate="${p}"]`);
      r.value = String(s.planes[p].rate);
      r.classList.toggle('off', !s.planes[p].enabled);
    }
    $$('[data-mode]').forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.mode === s.mode)));
    $$('[data-toggle]').forEach((b) =>
      b.setAttribute('aria-pressed', String(s[b.dataset.toggle as 'showVertices' | 'showEdges'])),
    );
    pauseBtn.innerHTML = s.paused ? ICONS.play : ICONS.pause;
    pauseBtn.setAttribute('aria-label', s.paused ? 'Resume' : 'Pause');
    pauseBtn.title = s.paused ? 'Resume (space)' : 'Pause (space)';
  }

  function togglePause() {
    s.paused = !s.paused;
    sync();
    actions.changed(false);
  }

  function onInput(e: Event) {
    const el = e.target as HTMLInputElement;
    const v = parseFloat(el.value);
    if (el.dataset.k === 'speed') {
      s.speed = v;
      actions.changed(false);
    } else if (el.dataset.k === 'distance') {
      s.distance = v;
      actions.changed(true);
    } else if (el.dataset.rate) {
      const plane = s.planes[el.dataset.rate as Plane];
      plane.rate = v;
      plane.enabled = true;
      sync();
      actions.changed(true);
    }
  }

  function onClick(e: Event) {
    const b = (e.target as HTMLElement).closest('button');
    if (!b) return;
    const d = b.dataset;
    if (d.stage) actions.jumpToStage(Number(d.stage));
    else if (d.plane) {
      const plane = s.planes[d.plane as Plane];
      plane.enabled = !plane.enabled;
      actions.changed(true);
    } else if (d.mode) {
      s.mode = d.mode as Settings['mode'];
      actions.changed(false);
    } else if (d.toggle) {
      const k = d.toggle as 'showVertices' | 'showEdges';
      s[k] = !s[k];
      actions.changed(false);
    } else if (d.act === 'pause') return togglePause();
    else if (d.act === 'orient') actions.resetOrientation();
    else if (d.act === 'reset') actions.resetAll();
    else if (d.act === 'panel') {
      panel.hidden = !panel.hidden;
      panelBtn.setAttribute('aria-expanded', String(!panel.hidden));
    }
    sync();
  }

  function onKey(e: KeyboardEvent) {
    const tag = (e.target as HTMLElement).tagName;
    if (e.code === 'Space' && tag !== 'BUTTON' && tag !== 'INPUT') {
      e.preventDefault();
      togglePause();
    }
  }

  root.addEventListener('input', onInput);
  root.addEventListener('click', onClick);
  window.addEventListener('keydown', onKey);
  sync();

  return {
    sync,
    setStage(index) {
      $$('.dot').forEach((d, i) => {
        d.classList.toggle('on', i === index);
        d.classList.toggle('done', i < index);
      });
    },
    inset() {
      if (panel.hidden) return { right: 0, bottom: 0 };
      const r = panel.getBoundingClientRect();
      return window.innerWidth >= 720
        ? { right: window.innerWidth - r.left, bottom: 0 }
        : { right: 0, bottom: window.innerHeight - r.top };
    },
    dispose() {
      root.removeEventListener('input', onInput);
      root.removeEventListener('click', onClick);
      window.removeEventListener('keydown', onKey);
      root.innerHTML = '';
    },
  };
}
