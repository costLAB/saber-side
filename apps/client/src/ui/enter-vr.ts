import type { XR } from 'three';

/**
 * Shows the Enter VR button, but only on a device that can run VR (a Meta Quest in Quest Browser). Tapping it starts
 * the session: browsers only allow that from a tap. If the headset turns it down (the player declined, or another
 * app has the headset), the button just comes back.
 */
export function offerVr(button: HTMLButtonElement | null, xr: XR | undefined, enter: () => Promise<void>) {
  if (!button || !xr) return;
  xr.isSessionSupported('immersive-vr').then(
    (supported) => {
      if (!supported) return;
      button.hidden = false;
      button.addEventListener('click', () => {
        if (button.disabled) return;
        button.disabled = true;
        enter()
          .catch((e: unknown) => console.warn('Could not enter VR:', e))
          .finally(() => {
            button.disabled = false;
          });
      });
    },
    () => {
      // not supported here
    },
  );
}
