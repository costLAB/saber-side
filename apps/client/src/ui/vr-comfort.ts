import { type Comfort, parseComfort, VIGNETTE_STEPS } from '@saber-side/shared';

// The VR comfort settings (shared/sim/vr-comfort.ts), kept in this browser. Until the wrist panel (quest-vr PR 3) has
// a page for them, they're set on the flat page, in a small panel above Enter VR that only shows on a device that can
// run VR. VR mode reads the same object every frame, so a change takes effect at once.

const KEY = 'saber-side.vr-comfort';

export function loadComfort(): Comfort {
  try {
    return parseComfort(JSON.parse(localStorage.getItem(KEY) ?? 'null'));
  } catch {
    return parseComfort(null);
  }
}

export function saveComfort(c: Comfort) {
  try {
    localStorage.setItem(KEY, JSON.stringify(c));
  } catch {
    // private browsing: the settings last until the page closes
  }
}

/** Builds the settings panel (hidden until `show`), changing `comfort` in place. */
export function comfortPanel(comfort: Comfort) {
  const box = document.createElement('details');
  box.id = 'vr-comfort';
  box.className = 'hud';
  box.hidden = true;
  const vignette = (Object.entries(VIGNETTE_STEPS) as [string, number][])
    .map(
      ([name, v]) =>
        `<label><input type="radio" name="vr-vignette" value="${v}"${comfort.vignette === v ? ' checked' : ''}> ${name}</label>`,
    )
    .join('');
  box.innerHTML = `<summary>VR comfort</summary>
<div class="opts">
  <span class="opt">Turning</span>
  <span><label><input type="radio" name="vr-turning" value="snap"${comfort.turning === 'snap' ? ' checked' : ''}> snap</label><label><input type="radio" name="vr-turning" value="smooth"${comfort.turning === 'smooth' ? ' checked' : ''}> smooth</label></span>
  <span class="opt">Vignette</span><span>${vignette}</span>
  <label class="wide"><input type="checkbox" name="vr-seated"${comfort.seated ? ' checked' : ''}> Seated</label>
  <label class="wide"><input type="checkbox" name="vr-arms"${comfort.armWalking ? ' checked' : ''}> Move with your arms, Gorilla Tag style (off: the left stick drives)</label>
</div>`;
  box.addEventListener('change', (e) => {
    const t = e.target as HTMLInputElement;
    if (t.name === 'vr-turning') comfort.turning = t.value === 'smooth' ? 'smooth' : 'snap';
    else if (t.name === 'vr-vignette') comfort.vignette = Number(t.value);
    else if (t.name === 'vr-seated') comfort.seated = t.checked;
    else if (t.name === 'vr-arms') comfort.armWalking = t.checked;
    saveComfort(comfort);
  });
  document.body.appendChild(box);
  return {
    show() {
      box.hidden = false;
    },
  };
}
