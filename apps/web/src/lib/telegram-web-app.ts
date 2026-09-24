type TelegramWebApp = {
  initData: string;
  ready: () => void;
  expand: () => void;
};

declare global {
  interface Window {
    Telegram?: { WebApp?: TelegramWebApp };
  }
}

let pending: Promise<TelegramWebApp> | undefined;

export function loadTelegramWebApp(): Promise<TelegramWebApp> {
  if (window.Telegram?.WebApp) return Promise.resolve(window.Telegram.WebApp);
  if (pending) return pending;

  pending = new Promise<TelegramWebApp>((resolve, reject) => {
    const script = document.createElement("script");
    const fail = () => {
      clearTimeout(timer);
      script.onload = null;
      script.onerror = null;
      script.remove();
      reject(
        new Error(
          "Не удалось подключиться к Telegram. Проверьте интернет и повторите вход.",
        ),
      );
    };
    const timer = window.setTimeout(fail, 10000);
    script.src = "https://telegram.org/js/telegram-web-app.js";
    script.async = true;
    script.onerror = fail;
    script.onload = () => {
      const app = window.Telegram?.WebApp;
      if (!app) return fail();
      clearTimeout(timer);
      script.onload = null;
      script.onerror = null;
      resolve(app);
    };
    document.head.appendChild(script);
  }).catch((error: unknown) => {
    pending = undefined;
    throw error;
  });
  return pending;
}
