import { $, toast, isStandalone } from './dom.ts';

interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>;
}

let deferredPrompt: BeforeInstallPromptEvent | null = null;

export function initPwaInstall(): void {
  const banner = $<HTMLElement>('#pwaInstall');
  const btn = $<HTMLButtonElement>('#pwaInstallBtn');
  const standalone = isStandalone();

  const onPrompt = (e: Event): void => {
    e.preventDefault();
    deferredPrompt = e as BeforeInstallPromptEvent;
    if (!standalone && banner) banner.hidden = false;
  };
  window.addEventListener('beforeinstallprompt', onPrompt);

  window.addEventListener('appinstalled', () => {
    if (banner) banner.hidden = true;
    toast('تم تثبيت تطبيق سَنا 🎉');
    try { localStorage.setItem('sana.pwa.installed', '1'); } catch { /* ignore */ }
  });

  btn?.addEventListener('click', async () => {
    if (!deferredPrompt) {
      toast('للتثبيت: من قائمة المتصفح ← إضافة إلى الشاشة الرئيسية');
      return;
    }
    await deferredPrompt.prompt();
    const { outcome } = await deferredPrompt.userChoice;
    if (outcome === 'accepted') {
      try { localStorage.setItem('sana.pwa.installed', '1'); } catch { /* ignore */ }
    }
    deferredPrompt = null;
    if (banner) banner.hidden = true;
  });

  // إظهار البانر مرة واحدة إن لم يثبت بعد
  try {
    if (!localStorage.getItem('sana.pwa.installed') && !standalone && !deferredPrompt) {
      window.setTimeout(() => {
        if (banner && !deferredPrompt) banner.hidden = false;
      }, 4000);
    }
  } catch { /* ignore */ }
}
