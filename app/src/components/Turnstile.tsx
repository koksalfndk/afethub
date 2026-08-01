import { useEffect, useRef, useState } from 'react';
import { C } from '../theme';
import { tr } from '../i18n/strings';

// Cloudflare Turnstile — the bot check on the public contact form.
//
// Two things this component does NOT do, on purpose:
//
//  * It is not the protection. The token it produces means nothing until the Edge
//    Function checks it with Cloudflare using the secret key. A widget on its own is a
//    picture of a checkbox (rules/03 §Server-Side Authorization).
//  * It does not block the form when the site key is missing. The key arrives through
//    the build (`VITE_TURNSTILE_SITE_KEY`); before it is set the widget simply does not
//    render and the form keeps working — with no bot protection, which is stated in the
//    report rather than hidden behind a checkbox that never appears.
//
// Turnstile is used rather than reCAPTCHA because it does not require the visitor to
// solve puzzles and does not profile them across sites; on a phone, outdoors, in an
// emergency, an image grid is a wall (rules/01 §Emergency First).

export const TURNSTILE_SITE_KEY = (import.meta.env.VITE_TURNSTILE_SITE_KEY as string | undefined) ?? '';
export const turnstileEnabled = TURNSTILE_SITE_KEY !== '';

const SCRIPT_ID = 'cf-turnstile-script';
const SCRIPT_SRC = 'https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit';

interface TurnstileApi {
  render: (el: HTMLElement, opts: Record<string, unknown>) => string;
  remove: (id: string) => void;
  reset: (id?: string) => void;
}
type WithTurnstile = typeof globalThis & { turnstile?: TurnstileApi };

// One script tag for the page, however many widgets ask for it.
function loadScript(): Promise<TurnstileApi> {
  return new Promise((resolve, reject) => {
    const w = globalThis as WithTurnstile;
    if (w.turnstile) return resolve(w.turnstile);
    let el = document.getElementById(SCRIPT_ID) as HTMLScriptElement | null;
    if (!el) {
      el = document.createElement('script');
      el.id = SCRIPT_ID;
      el.src = SCRIPT_SRC;
      el.async = true;
      el.defer = true;
      document.head.appendChild(el);
    }
    const done = () => (w.turnstile ? resolve(w.turnstile) : reject(new Error('no-turnstile')));
    el.addEventListener('load', done, { once: true });
    el.addEventListener('error', () => reject(new Error('script-failed')), { once: true });
    // Already loaded by an earlier mount.
    if (w.turnstile) resolve(w.turnstile);
  });
}

export function Turnstile({ onToken }: { onToken: (token: string) => void }) {
  const box = useRef<HTMLDivElement>(null);
  const widget = useRef<string>('');
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    if (!turnstileEnabled) return;
    let alive = true;
    loadScript()
      .then((api) => {
        if (!alive || !box.current || widget.current) return;
        widget.current = api.render(box.current, {
          sitekey: TURNSTILE_SITE_KEY,
          language: 'tr',
          theme: 'light',
          callback: (token: string) => onToken(token),
          // A token is good for a few minutes. When it expires the answer is cleared, so
          // the form asks again rather than sending something the server will refuse.
          'expired-callback': () => onToken(''),
          'error-callback': () => { onToken(''); setFailed(true); },
        });
      })
      .catch(() => { if (alive) setFailed(true); });
    return () => {
      alive = false;
      const w = globalThis as WithTurnstile;
      if (widget.current && w.turnstile) {
        try { w.turnstile.remove(widget.current); } catch { /* already gone */ }
        widget.current = '';
      }
    };
    // onToken is stable enough here: re-rendering the widget on every keystroke would
    // reset the challenge the visitor just passed.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  if (!turnstileEnabled) return null;

  return (
    <div style={{ gridColumn: '1 / -1', marginTop: 2 }}>
      <div ref={box} />
      {failed && (
        <p role="alert" style={{ margin: '8px 0 0', fontSize: 12.5, color: C.muted2 }}>
          {tr.contact.captchaFailed}
        </p>
      )}
    </div>
  );
}
