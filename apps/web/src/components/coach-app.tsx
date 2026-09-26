"use client";
import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type FormEvent,
} from "react";
import Link from "next/link";
import {
  ArrowDown,
  ArrowRight,
  BookOpen,
  ChartNoAxesCombined,
  Check,
  ChevronLeft,
  ChevronRight,
  Flame,
  GraduationCap,
  House,
  MessageCircle,
  Plus,
  Send,
  Settings2,
  Sparkles,
  Target,
  TrendingUp,
  Zap,
  LoaderCircle,
} from "lucide-react";
import type { AppData, Settings } from "@engbot/core/schema";
import { settingsSchema } from "@engbot/core/schema";
import { loadTelegramWebApp } from "@/lib/telegram-web-app";
import { Button, Empty, Meter } from "./ui";
import { LanguageSelect, languageLabel } from "./language-select";
const navigation = [
  { path: "/", key: "home", label: "Головна", icon: House },
  { path: "/practice", key: "practice", label: "Практика", icon: Zap },
  { path: "/chat", key: "chat", label: "Розмова", icon: MessageCircle },
  {
    path: "/mistakes",
    key: "mistakes",
    label: "Мої помилки",
    icon: GraduationCap,
  },
  { path: "/vocabulary", key: "vocabulary", label: "Словник", icon: BookOpen },
  {
    path: "/progress",
    key: "progress",
    label: "Прогрес",
    icon: ChartNoAxesCombined,
  },
];
class ApiError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message);
  }
}
async function api<T>(
  path: string,
  body?: unknown,
  signal?: AbortSignal,
): Promise<T> {
  const response = await fetch(`/api/${path}`, {
    method: body === undefined ? "GET" : "POST",
    headers:
      body === undefined ? undefined : { "Content-Type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body),
    signal: signal ?? AbortSignal.timeout(60000),
  });
  const data = await response.json();
  if (!response.ok)
    throw new ApiError(
      response.status,
      data.error || "Не вдалося виконати запит.",
    );
  return data as T;
}
const errorText = (error: unknown) =>
  error instanceof Error
    ? error.name === "TimeoutError"
      ? "Відповідь забирає надто багато часу. Спробуйте ще раз."
      : error.message
    : "Не вдалося виконати запит.";
const number = (n: number) => new Intl.NumberFormat("uk-UA").format(n);
const pluralRules = new Intl.PluralRules("uk-UA");
function plural(n: number, one: string, few: string, many: string) {
  const form = pluralRules.select(n);
  return form === "one" ? one : form === "few" ? few : many;
}

function date(value: string) {
  return new Intl.DateTimeFormat("uk-UA", {
    day: "numeric",
    month: "short",
  }).format(new Date(value));
}
export function CoachApp({ page }: { page: string }) {
  const [data, setData] = useState<AppData | null>(null),
    [loading, setLoading] = useState(true),
    [error, setError] = useState(""),
    [bot, setBot] = useState<string | null>(null),
    [needsLogin, setNeedsLogin] = useState(false);
  const loginRequest = useRef<AbortController | null>(null);
  const reload = useCallback(async () => {
    const value = await api<AppData>("me");
    setData(value);
    setNeedsLogin(false);
  }, []);
  const login = useCallback(() => {
    loginRequest.current?.abort();
    const controller = new AbortController();
    loginRequest.current = controller;
    const timer = window.setTimeout(() => {
      controller.abort(new DOMException("Login timed out", "TimeoutError"));
    }, 25000);
    async function authenticate() {
      const tg = await loadTelegramWebApp();
      controller.signal.throwIfAborted();
      tg.ready();
      tg.expand();
      try {
        return await api<AppData>("me", undefined, controller.signal);
      } catch (error) {
        if (!(error instanceof ApiError) || error.status !== 401) throw error;
        if (!tg?.initData)
          throw new ApiError(401, "Відкрийте застосунок через Telegram.");
        await api(
          "auth/telegram",
          { initData: tg.initData },
          controller.signal,
        );
        return api<AppData>("me", undefined, controller.signal);
      }
    }
    return authenticate()
      .then((value) => {
        if (loginRequest.current !== controller) return;
        setData(value);
        setNeedsLogin(false);
      })
      .catch((error) => {
        if (loginRequest.current !== controller) return;
        setNeedsLogin(error instanceof ApiError && error.status === 401);
        setError(errorText(error));
      })
      .finally(() => {
        clearTimeout(timer);
        if (loginRequest.current === controller) setLoading(false);
      });
  }, []);
  useEffect(() => {
    void login();
    void api<{ botUsername: string | null }>("config")
      .then((c) => setBot(c.botUsername))
      .catch(() => {});
    return () => {
      loginRequest.current?.abort();
      loginRequest.current = null;
    };
  }, [login]);
  if (loading)
    return (
      <main className="gate">
        <LoaderCircle className="spin" />
        <p role="status">Відкриваємо ваш навчальний кабінет…</p>
      </main>
    );
  if (!data)
    return (
      <main className="gate">
        <div className="brand">
          <span className="brand-mark">e.</span> English Coach
        </div>
        <div className="gate-content">
          <span className="eyebrow">ВАША АНГЛІЙСЬКА. ВАШ ШЛЯХ.</span>
          <h1>
            Помилятися —<br />
            <em>означає вчитися.</em>
          </h1>
          <p>
            Спілкуйтеся англійською. Отримуйте зрозумілі виправлення й практику,
            яка допомагає саме вам.
          </p>
          <div className="sentence-demo">
            <span>I go yesterday to shop</span>
            <ArrowDown size={18} />
            <strong>I went to the shop yesterday.</strong>
          </div>
          {bot ? (
            <a className="button" href={`https://t.me/${bot}?start=web`}>
              Відкрити в Telegram <Send size={17} />
            </a>
          ) : (
            <p className="muted">
              Вхід стане доступним після підключення Telegram-бота.
            </p>
          )}
          <p className="helper">
            Відкрийте Mini App за допомогою кнопки в боті.
          </p>
          {error && (
            <p className="error" role="alert">
              {error}
            </p>
          )}
          {(!needsLogin || error) && (
            <Button
              className="secondary"
              onClick={() => {
                setLoading(true);
                setError("");
                void login();
              }}
            >
              Повторити вхід
            </Button>
          )}
        </div>
        <p className="gate-footer">
          Розмова → ваші помилки → персональна практика
        </p>
      </main>
    );
  const title = navigation.find((n) => n.key === page)?.label || "Профіль";
  return (
    <div className="app-shell">
      <aside className="sidebar">
        <Link className="brand" href="/">
          <span className="brand-mark">e.</span> English Coach
        </Link>
        <div className="sidebar-caption">ОСОБИСТИЙ КАБІНЕТ</div>
        <nav aria-label="Головна навігація">
          {navigation.map((n) => (
            <Link
              key={n.key}
              href={n.path}
              aria-current={page === n.key ? "page" : undefined}
              className={page === n.key ? "nav-item active" : "nav-item"}
            >
              <n.icon size={20} />
              <span>{n.label}</span>
              {n.key === "mistakes" && data.counts.mistakes > 0 && (
                <small>{data.counts.mistakes}</small>
              )}
            </Link>
          ))}
        </nav>
        <div className="sidebar-note">
          <Sparkles size={21} />
          <strong>Не ідеально. Але краще.</strong>
          <p>Кожна помилка — підказка, чого вчитися далі.</p>
        </div>
        <Link href="/profile" className="profile-link">
          <span className="avatar">{data.user.name.slice(0, 1)}</span>
          <span>
            <strong>{data.user.name}</strong>
            <small>
              {data.user.settings?.englishLevel === "unknown"
                ? "Рівень не визначено"
                : data.user.settings?.englishLevel || "Налаштувати профіль"}
            </small>
          </span>
          <Settings2 size={17} />
        </Link>
      </aside>
      <div className="workspace">
        <header className="topbar">
          <span>{title}</span>
          <div>
            <span className="streak">
              <Flame size={17} />
              {data.user.streak} дн.
            </span>
            <span className="xp">
              <Zap size={16} />
              {number(data.user.xp)} XP
            </span>
            <Link
              className="mobile-profile avatar"
              href="/profile"
              aria-label="Профіль"
            >
              {data.user.name.slice(0, 1)}
            </Link>
          </div>
        </header>
        <main id="main-content" className="main-content">
          {!data.user.settings || page === "profile" ? (
            <Profile data={data} reload={reload} />
          ) : page === "home" ? (
            <Dashboard data={data} />
          ) : page === "chat" ? (
            <Chat data={data} reload={reload} />
          ) : page === "mistakes" ? (
            <Mistakes data={data} />
          ) : page === "vocabulary" ? (
            <Vocabulary data={data} />
          ) : page === "practice" ? (
            <Practice reload={reload} data={data} />
          ) : (
            <Progress data={data} />
          )}
        </main>
        <footer className="app-footer">
          Трохи практики. Помітні зміни.<span>English Coach</span>
        </footer>
      </div>
      <nav className="bottom-nav" aria-label="Мобільна навігація">
        {navigation.slice(0, 5).map((n) => (
          <Link
            key={n.key}
            href={n.path}
            aria-current={page === n.key ? "page" : undefined}
          >
            <n.icon size={21} />
            <span>{n.label}</span>
          </Link>
        ))}
      </nav>
    </div>
  );
}
function Heading({
  eyebrow,
  title,
  children,
}: {
  eyebrow: string;
  title: string;
  children?: React.ReactNode;
}) {
  return (
    <div className="heading">
      <span className="eyebrow">{eyebrow}</span>
      <h1>{title}</h1>
      {children && <p>{children}</p>}
    </div>
  );
}
function skills(data: AppData) {
  const groups = new Map<
    string,
    { total: number; count: number; occurrences: number }
  >();
  for (const m of data.mistakes) {
    const g = groups.get(m.category) || { total: 0, count: 0, occurrences: 0 };
    g.total += m.mastery;
    g.count++;
    g.occurrences += m.occurrences;
    groups.set(m.category, g);
  }
  return [...groups]
    .map(([name, g]) => ({
      name,
      mastery: Math.round(g.total / g.count),
      occurrences: g.occurrences,
    }))
    .sort((a, b) => a.mastery - b.mastery);
}
function Dashboard({ data }: { data: AppData }) {
  const weak = skills(data).slice(0, 3);
  const messages = data.activity.reduce((n, d) => n + d.messages, 0);
  const accurate = data.activity.reduce((n, d) => n + d.accurate, 0);
  const today = data.activity.find((a) => a.day === data.today);
  return (
    <>
      <Heading
        eyebrow="ЩОРАЗУ ТРОХИ ВПЕВНЕНІШЕ"
        title={`${data.user.name}, продовжимо?`}
      >
        Ваші розмови стають планом навчання. Один маленький крок на сьогодні.
      </Heading>
      <div className="dashboard-grid">
        <section className="hero-card">
          <div className="hero-copy">
            <span className="pill">
              <Sparkles size={14} /> ВАША ПРАКТИКА НА СЬОГОДНІ
            </span>
            <h2>
              {data.counts.due
                ? "Перетворіть «майже»\nна «вийшло»."
                : "Почніть із кількох\nпростих фраз."}
            </h2>
            <p>
              {data.counts.due
                ? `${number(data.counts.due)} ${plural(data.counts.due, "завдання", "завдання", "завдань")} для повторення. Поверніться до своїх помилок, поки вони не стали звичкою.`
                : "Розкажіть, як минув ваш день. Тренер помітить, що вже вдається і що варто повторити."}
            </p>
            <Link
              className="button light"
              href={data.counts.due ? "/practice" : "/chat"}
            >
              {data.counts.due ? "Почати практику" : "Почати розмову"}
              <ArrowRight size={18} />
            </Link>
          </div>
          <div className="hero-visual" aria-hidden="true">
            <span className="paper-label">A LITTLE BETTER, EVERY DAY</span>
            <div className="paper">
              <span className="paper-kicker">Yesterday…</span>
              <span className="crossed">I go to the shop.</span>
              <span className="hand-arrow">↳</span>
              <strong>
                I went to
                <br />
                the shop.
              </strong>
              <span className="paper-check">
                <Check size={20} />
              </span>
            </div>
            <span className="visual-caption">Помилки — це початок.</span>
          </div>
        </section>
        <section className="daily-card">
          <div className="section-heading">
            <h3>Ваш ритм</h3>
            <Flame size={22} />
          </div>
          <div className="streak-number">
            {data.user.streak}
            <span>
              {plural(data.user.streak, "день", "дні", "днів")} поспіль
            </span>
          </div>
          <div className="week-dots">
            {Array.from({ length: 7 }, (_, i) => {
              const d = new Date(`${data.today}T12:00:00Z`);
              d.setUTCDate(d.getUTCDate() - 6 + i);
              const key = d.toISOString().slice(0, 10);
              const active = data.activity.some((a) => a.day === key);
              return (
                <div key={key}>
                  <span>
                    {new Intl.DateTimeFormat("uk-UA", {
                      weekday: "narrow",
                      timeZone: "UTC",
                    }).format(d)}
                  </span>
                  <i className={active ? "done" : ""}>
                    {active ? <Check size={14} /> : <span>·</span>}
                  </i>
                </div>
              );
            })}
          </div>
          <p>
            {today
              ? "Ви вже зробили крок сьогодні. Так тримати!"
              : `Ваша мета — ${data.user.settings?.dailyGoal} хвилин на день. Почніть з однієї розмови.`}
          </p>
        </section>
      </div>
      <div className="stats-grid">
        <Stat
          icon={<GraduationCap />}
          label="Ваш рівень"
          value={
            data.user.settings?.englishLevel === "unknown"
              ? "—"
              : data.user.settings?.englishLevel || "—"
          }
          note="Зазначено в профілі"
        />
        <Stat
          icon={<BookOpen />}
          label="Особистий словник"
          value={number(data.counts.words)}
          note="Слова з ваших розмов"
        />
        <Stat
          icon={<Target />}
          label="Без помилок"
          value={messages ? `${Math.round((accurate / messages) * 100)}%` : "—"}
          note="Повідомлення · останні 30 активних днів"
        />
        <Stat
          icon={<Zap />}
          label="Досвід навчання"
          value={number(data.user.xp)}
          note={`Рівень практики ${Math.floor(data.user.xp / 500) + 1} · XP`}
        />
      </div>
      <Link className="text-link progress-link" href="/progress">
        Переглянути весь прогрес <ArrowRight size={16} />
      </Link>
      <div className="two-columns">
        <section className="panel">
          <div className="section-heading">
            <h2>На чому зосередитися</h2>
            <span className="tag">ВАШ ФОКУС</span>
          </div>
          {weak.length ? (
            weak.map((s) => (
              <Link className="skill-row" href="/practice" key={s.name}>
                <div>
                  <strong>{s.name}</strong>
                  <small>
                    {number(s.occurrences)}{" "}
                    {plural(s.occurrences, "помилка", "помилки", "помилок")} у
                    розмовах
                  </small>
                </div>
                <div>
                  <span>{s.mastery}%</span>
                  <Meter value={s.mastery} label={s.name} />
                </div>
                <ChevronRight size={17} />
              </Link>
            ))
          ) : (
            <Empty title="Дізнаймося про ваші сильні сторони">
              Після першої розмови тут з’являться теми для практики.
            </Empty>
          )}
          <p className="helper">
            Опанування оцінюється за результатами повторень.
          </p>
        </section>
        <section className="panel">
          <div className="section-heading">
            <h2>Із ваших розмов</h2>
            <Link href="/mistakes">
              Усі помилки <ArrowRight size={15} />
            </Link>
          </div>
          {data.mistakes.length ? (
            data.mistakes.slice(0, 2).map((m) => (
              <div className="mini-mistake" key={m._id}>
                <span className="tag">{m.category}</span>
                <p>
                  <del>{m.wrong}</del>
                  <ArrowRight size={16} />
                  <strong>{m.correct}</strong>
                </p>
                <small>
                  Траплялося {number(m.occurrences)}{" "}
                  {plural(m.occurrences, "раз", "рази", "разів")}
                </small>
              </div>
            ))
          ) : (
            <Empty
              title="Тут починається ваш прогрес"
              href="/chat"
              label="Поговорити з тренером"
            >
              Напишіть кілька речень — збережемо те, що варто повторити.
            </Empty>
          )}
        </section>
      </div>
    </>
  );
}
function Stat({
  icon,
  label,
  value,
  note,
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
  note: string;
}) {
  return (
    <section className="stat">
      <div>
        {icon}
        <span>{label}</span>
      </div>
      <strong>{value}</strong>
      <small>{note}</small>
    </section>
  );
}
const profileLevels = ["A1", "A2", "B1", "B2", "C1", "unknown"] as const;
const profileMinutes = [5, 10, 15, 20, 30, 60];
const profileGoals = [
  ["Speak confidently", "Говорити впевненіше"],
  ["Travel", "Подорожувати"],
  ["Work", "Для роботи"],
  ["Job interviews", "Проходити співбесіди"],
  ["Move abroad", "Переїхати за кордон"],
  ["Understand content", "Розуміти фільми й відео"],
  ["Improve grammar", "Покращити граматику"],
  ["Expand vocabulary", "Розширити словник"],
] as const;
const onboardingQuestions = [
  "Яка мова для вас рідна?",
  "Який у вас рівень англійської?",
  "Скільки хвилин на день готові займатися?",
  "Навіщо вам англійська?",
  "Що вам цікаво?",
];
function OnboardingChoices<T extends string | number>({
  options,
  value,
  onChange,
}: {
  options: readonly { value: T; label: string }[];
  value: T;
  onChange: (value: T) => void;
}) {
  return (
    <div
      className="onboarding-choices"
      role="group"
      aria-labelledby="onboarding-question"
    >
      {options.map((option) => (
        <button
          key={option.value}
          type="button"
          className="onboarding-choice"
          aria-pressed={value === option.value}
          onClick={() => onChange(option.value)}
        >
          <span>{option.label}</span>
          <span className="onboarding-choice-mark" aria-hidden="true">
            {value === option.value && <Check size={16} />}
          </span>
        </button>
      ))}
    </div>
  );
}
function Profile({
  data,
  reload,
}: {
  data: AppData;
  reload: () => Promise<void>;
}) {
  const onboarding = !data.user.settings;
  const [step, setStep] = useState(0);
  const questionRef = useRef<HTMLHeadingElement>(null);
  useEffect(() => {
    if (onboarding) questionRef.current?.focus();
  }, [step, onboarding]);
  const draftKey = `engbot:profile:${data.user._id}`;
  const [form, setForm] = useState<Settings>(() => {
    try {
      const raw = sessionStorage.getItem(draftKey);
      if (raw) {
        const restored = settingsSchema.safeParse(JSON.parse(raw));
        if (restored.success)
          return {
            ...restored.data,
            nativeLanguage: languageLabel(restored.data.nativeLanguage),
          };
      }
    } catch {}
    return data.user.settings
      ? {
          ...data.user.settings,
          nativeLanguage: languageLabel(data.user.settings.nativeLanguage),
        }
      : {
          nativeLanguage: "Українська",
          englishLevel: "A2",
          goal: "Speak confidently",
          interests: "",
          dailyGoal: 10,
          timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
        };
  });
  const [busy, setBusy] = useState(false),
    [error, setError] = useState(""),
    [saved, setSaved] = useState(false);
  const ref = useRef<HTMLFormElement>(null);
  useEffect(() => {
    try {
      if (JSON.stringify(form) === JSON.stringify(data.user.settings))
        sessionStorage.removeItem(draftKey);
      else sessionStorage.setItem(draftKey, JSON.stringify(form));
    } catch {}
  }, [form, data.user.settings, draftKey]);
  const dirty = JSON.stringify(form) !== JSON.stringify(data.user.settings);
  useEffect(() => {
    if (!dirty) return;
    const warn = (e: BeforeUnloadEvent) => {
      e.preventDefault();
    };
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [dirty]);
  async function submit(e: FormEvent) {
    e.preventDefault();
    if (busy) return;
    setError("");
    setSaved(false);
    if (onboarding && step < onboardingQuestions.length - 1) {
      if (
        step === 0 &&
        !settingsSchema.shape.nativeLanguage.safeParse(form.nativeLanguage)
          .success
      ) {
        setError("Виберіть рідну мову зі списку.");
        ref.current?.querySelector<HTMLInputElement>("input")?.focus();
        return;
      }
      setStep((current) => current + 1);
      return;
    }
    const valid = settingsSchema.safeParse(form);
    if (!valid.success) {
      setError("Укажіть рідну мову й перевірте решту полів.");
      ref.current?.querySelector<HTMLInputElement>("input")?.focus();
      return;
    }
    setBusy(true);
    try {
      await api("profile", form);
      await reload();
      setSaved(true);
    } catch (e) {
      setError(errorText(e));
    } finally {
      setBusy(false);
    }
  }
  return (
    <>
      <Heading
        eyebrow={data.user.settings ? "ВАШІ ВПОДОБАННЯ" : "НУМО ЗНАЙОМИТИСЯ"}
        title={
          data.user.settings
            ? "Налаштуймо навчання під вас"
            : "Із чого почнемо?"
        }
      >
        Кілька деталей допоможуть тренеру підібрати пояснення й завдання.
      </Heading>
      <form
        ref={ref}
        className="panel profile-form"
        noValidate
        onSubmit={submit}
      >
        {onboarding ? (
          <>
            <div className="onboarding-progress">
              <span>
                Крок {step + 1} із {onboardingQuestions.length}
              </span>
              <Meter
                value={((step + 1) / onboardingQuestions.length) * 100}
                label={`Крок ${step + 1} із ${onboardingQuestions.length}`}
              />
            </div>
            <div className="onboarding-step" key={step}>
              <h2 id="onboarding-question" ref={questionRef} tabIndex={-1}>
                {onboardingQuestions[step]}
              </h2>
              {step === 0 && (
                <LanguageSelect
                  labelledBy="onboarding-question"
                  describedBy="profile-status"
                  invalid={!!error}
                  value={form.nativeLanguage}
                  onChange={(nativeLanguage) => {
                    setForm({ ...form, nativeLanguage });
                    setError("");
                  }}
                />
              )}
              {step === 1 && (
                <OnboardingChoices
                  options={profileLevels.map((value) => ({
                    value,
                    label: value === "unknown" ? "Поки що не знаю" : value,
                  }))}
                  value={form.englishLevel}
                  onChange={(englishLevel) =>
                    setForm({ ...form, englishLevel })
                  }
                />
              )}
              {step === 2 && (
                <>
                  <OnboardingChoices
                    options={profileMinutes.map((value) => ({
                      value,
                      label: `${value} хвилин`,
                    }))}
                    value={form.dailyGoal}
                    onChange={(dailyGoal) => setForm({ ...form, dailyGoal })}
                  />
                  <p className="helper">
                    Це ваш орієнтир. Час занять поки що не відстежується.
                  </p>
                </>
              )}
              {step === 3 && (
                <OnboardingChoices
                  options={profileGoals.map(([value, label]) => ({
                    value,
                    label,
                  }))}
                  value={form.goal}
                  onChange={(goal) => setForm({ ...form, goal })}
                />
              )}
              {step === 4 && (
                <>
                  <input
                    aria-labelledby="onboarding-question"
                    aria-describedby="onboarding-interests-help"
                    placeholder="Наприклад: технології, музика, подорожі"
                    value={form.interests}
                    maxLength={300}
                    onChange={(e) =>
                      setForm({ ...form, interests: e.target.value })
                    }
                  />
                  <p id="onboarding-interests-help" className="helper">
                    Необов’язково. Підберемо теми для розмов за вашими
                    інтересами.
                  </p>
                  <p className="helper">
                    Часовий пояс: {form.timezone}. Використовуємо для підрахунку
                    днів практики.
                  </p>
                </>
              )}
            </div>
          </>
        ) : (
          <>
            <label>
              Рідна мова
              <input
                value={form.nativeLanguage}
                maxLength={40}
                aria-invalid={!!error && !form.nativeLanguage.trim()}
                aria-describedby="profile-status"
                onChange={(e) =>
                  setForm({ ...form, nativeLanguage: e.target.value })
                }
              />
            </label>
            <div className="form-grid">
              <label>
                Рівень англійської
                <select
                  value={form.englishLevel}
                  onChange={(e) =>
                    setForm({
                      ...form,
                      englishLevel: e.target.value as Settings["englishLevel"],
                    })
                  }
                >
                  {profileLevels.map((v) => (
                    <option key={v} value={v}>
                      {v === "unknown" ? "Поки що не знаю" : v}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                Щоденна мета
                <select
                  value={form.dailyGoal}
                  onChange={(e) =>
                    setForm({ ...form, dailyGoal: Number(e.target.value) })
                  }
                >
                  {profileMinutes.map((v) => (
                    <option key={v} value={v}>
                      {v} хвилин
                    </option>
                  ))}
                </select>
              </label>
            </div>
            <label>
              Навіщо вам англійська
              <select
                value={form.goal}
                onChange={(e) =>
                  setForm({ ...form, goal: e.target.value as Settings["goal"] })
                }
              >
                {profileGoals.map(([value, label]) => (
                  <option key={value} value={value}>
                    {label}
                  </option>
                ))}
              </select>
            </label>
            <label>
              Що вам цікаво?
              <input
                placeholder="Наприклад: технології, музика, подорожі"
                value={form.interests}
                maxLength={300}
                onChange={(e) =>
                  setForm({ ...form, interests: e.target.value })
                }
              />
            </label>
            <p className="helper">
              Часовий пояс: {form.timezone}. Використовуємо для підрахунку днів
              практики. Мета у хвилинах — ваш орієнтир, час поки що не
              відстежується.
            </p>
          </>
        )}
        <div id="profile-status" className="form-status" role="status">
          {error ? (
            <span className="error">{error}</span>
          ) : saved ? (
            "Профіль збережено. Можна переходити до розмови."
          ) : dirty && data.user.settings ? (
            "Є незбережені зміни."
          ) : (
            ""
          )}
        </div>
        <div className={onboarding ? "onboarding-actions" : undefined}>
          {onboarding && step > 0 && (
            <Button
              type="button"
              className="secondary"
              disabled={busy}
              onClick={() => {
                setError("");
                setStep((current) => current - 1);
              }}
            >
              <ChevronLeft size={17} />
              Назад
            </Button>
          )}
          <Button busy={busy} type="submit">
            {onboarding
              ? step === onboardingQuestions.length - 1
                ? "Почати навчання"
                : "Далі"
              : "Зберегти профіль"}
            <ArrowRight size={17} />
          </Button>
        </div>
        {saved && (
          <Link className="text-link" href="/chat">
            Перейти до розмови →
          </Link>
        )}
      </form>
    </>
  );
}
function Chat({
  data,
  reload,
}: {
  data: AppData;
  reload: () => Promise<void>;
}) {
  const [text, setText] = useState(""),
    [busy, setBusy] = useState(false),
    [error, setError] = useState(""),
    [saving, setSaving] = useState("");
  const request = useRef<{ text: string; id: string } | null>(null);
  const bottom = useRef<HTMLDivElement>(null);
  const input = useRef<HTMLTextAreaElement>(null);
  useEffect(() => {
    bottom.current?.scrollIntoView({ block: "nearest" });
  }, [data.messages.length]);
  async function send(e: FormEvent) {
    e.preventDefault();
    if (busy) return;
    if (!text.trim()) {
      setError("Напишіть хоча б одне речення.");
      input.current?.focus();
      return;
    }
    setBusy(true);
    setError("");
    if (request.current?.text !== text)
      request.current = { text, id: crypto.randomUUID() };
    try {
      await api("chat", { text, requestId: request.current.id });
      await reload();
      setText("");
      request.current = null;
    } catch (e) {
      setError(errorText(e));
    } finally {
      setBusy(false);
    }
  }
  async function save(messageId: string, index: number) {
    if (saving) return;
    setSaving(`${messageId}:${index}`);
    setError("");
    try {
      await api("vocabulary", { messageId, index });
      await reload();
    } catch (e) {
      setError(errorText(e));
    } finally {
      setSaving("");
    }
  }
  return (
    <>
      <Heading eyebrow="РОЗМОВА З ТРЕНЕРОМ" title="Просто почніть говорити.">
        Як минув ваш день? Пишіть як виходить — розберемося разом.
      </Heading>
      <section className="chat-panel panel">
        <div className="coach-label">
          <span className="coach-icon">
            <Sparkles size={20} />
          </span>
          <div>
            <strong>English Coach</strong>
            <small>Короткі пояснення. Жива розмова.</small>
          </div>
        </div>
        <div className="messages">
          {!data.messages.length && (
            <div className="assistant-message">
              <span className="message-label">ТРЕНЕР</span>
              <p>Hi! Tell me a little about your day. What did you do today?</p>
              <span className="helper">Можна почати з «Today I…»</span>
            </div>
          )}
          {data.messages.map((m) => (
            <div className="message-pair" key={m._id}>
              <div className="user-message">
                <span className="message-label">ВИ</span>
                <p>{m.text}</p>
              </div>
              <div className="assistant-message">
                <span className="message-label">ТРЕНЕР</span>
                <p>{m.analysis.reply}</p>
                {m.analysis.mistakes.length > 0 && (
                  <div className="corrections">
                    <span className="tag">ЗРОБІМО ТРОХИ КРАЩЕ</span>
                    {m.analysis.mistakes.slice(0, 3).map((c, i) => (
                      <div key={i}>
                        <p>
                          <del>{c.wrong}</del> <ArrowRight size={15} />{" "}
                          <strong>{c.correct}</strong>
                        </p>
                        <small>{c.explanation}</small>
                      </div>
                    ))}
                  </div>
                )}
                {m.analysis.naturalVersion &&
                  m.analysis.naturalVersion !== m.analysis.corrected && (
                    <p className="natural">
                      <Sparkles size={15} /> {m.analysis.naturalVersion}
                    </p>
                  )}
                {m.analysis.words.length > 0 && (
                  <div className="learn-words">
                    {m.analysis.words.map((word, i) => {
                      const saved = data.words.some(
                        (w) => w.word.toLowerCase() === word.word.toLowerCase(),
                      );
                      return (
                        <Button
                          key={i}
                          className="secondary small"
                          disabled={saved || !!saving}
                          busy={saving === `${m._id}:${i}`}
                          onClick={() => void save(m._id, i)}
                        >
                          {saved ? <Check size={14} /> : <Plus size={14} />}{" "}
                          {word.word}
                        </Button>
                      );
                    })}
                  </div>
                )}
              </div>
            </div>
          ))}
          {busy && (
            <p className="muted" role="status">
              Тренер обмірковує відповідь…
            </p>
          )}
          <div ref={bottom} />
        </div>
        <form className="composer" noValidate onSubmit={send}>
          <label className="sr-only" htmlFor="message">
            Повідомлення англійською
          </label>
          <textarea
            ref={input}
            id="message"
            rows={3}
            maxLength={2000}
            className="resize-none"
            value={text}
            aria-describedby="chat-status"
            placeholder="Tell me about your day…"
            onChange={(e) => setText(e.target.value)}
          />
          <Button type="submit" busy={busy}>
            <Send size={17} />
            <span>Надіслати</span>
          </Button>
        </form>
        <div id="chat-status" className="form-status" role="status">
          {error ? (
            <span className="error">{error}</span>
          ) : (
            "10 XP за повідомлення · ШІ може помилятися"
          )}
        </div>
      </section>
    </>
  );
}
const legacyFilters: Record<string, string> = {
  Все: "Усі",
  Грамматика: "Граматика",
  Словарь: "Словник",
  Артикли: "Артиклі",
  Времена: "Часи",
  Предлоги: "Прийменники",
  "Порядок слов": "Порядок слів",
  "Повторить сегодня": "Повторити сьогодні",
  Освоено: "Опановано",
};
function useFilter() {
  const [filter, setFilter] = useState(() =>
    typeof window === "undefined"
      ? "Усі"
      : new URLSearchParams(window.location.search).get("filter") || "Усі",
  );
  return [
    legacyFilters[filter] || filter,
    (value: string) => {
      setFilter(value);
      const url = new URL(window.location.href);
      url.searchParams.set("filter", value);
      window.history.replaceState(null, "", url);
    },
  ] as const;
}
function Filters({
  values,
  active,
  onChange,
}: {
  values: string[];
  active: string;
  onChange: (v: string) => void;
}) {
  return (
    <div className="filters" aria-label="Фільтри">
      {values.map((v) => (
        <button
          key={v}
          aria-pressed={v === active}
          className={v === active ? "selected" : ""}
          onClick={() => onChange(v)}
        >
          {v}
        </button>
      ))}
    </div>
  );
}
function Mistakes({ data }: { data: AppData }) {
  const [filter, setFilter] = useFilter();
  const [page, setPage] = useState(0);
  const types: Record<string, string> = {
    Граматика: "Grammar",
    Словник: "Vocabulary",
    Артиклі: "Articles",
    Часи: "Tenses",
    Прийменники: "Prepositions",
    "Порядок слів": "Word order",
  };
  const items = data.mistakes.filter(
    (m) => filter === "Усі" || m.type === types[filter],
  );
  return (
    <>
      <Heading
        eyebrow="ВАШ ПЕРСОНАЛЬНИЙ БАНК ПОМИЛОК"
        title="Тут помилки працюють на вас."
      >
        Повторюйте те, що трапляється у ваших розмовах, і помічайте зміни.
      </Heading>
      <div className="toolbar">
        <Filters
          values={["Усі", ...Object.keys(types)]}
          active={filter}
          onChange={(v) => {
            setFilter(v);
            setPage(0);
          }}
        />
        {data.mistakes.length > 0 && (
          <Link className="button" href="/practice">
            Практикувати <ArrowRight size={16} />
          </Link>
        )}
      </div>
      {!items.length ? (
        <section className="panel">
          <Empty
            title={
              data.mistakes.length
                ? "У цій категорії немає помилок"
                : "Поки що тут чистий аркуш"
            }
            href="/chat"
            label="Почати розмову"
          >
            Поговоріть із тренером — суттєві помилки автоматично з’являться тут.
          </Empty>
        </section>
      ) : (
        <>
          <div className="mistakes-list">
            {items.slice(page * 10, page * 10 + 10).map((m) => (
              <article className="panel mistake-card" key={m._id}>
                <div className="section-heading">
                  <span className="tag">{m.category}</span>
                  <small>
                    Траплялося {number(m.occurrences)}{" "}
                    {plural(m.occurrences, "раз", "рази", "разів")}
                  </small>
                </div>
                <div className="correction-pair">
                  <div>
                    <span>ВАША ФРАЗА</span>
                    <p>
                      <del>{m.original}</del>
                    </p>
                  </div>
                  <ArrowRight size={20} />
                  <div>
                    <span>ТАК ПРАВИЛЬНО</span>
                    <p>{m.corrected}</p>
                  </div>
                </div>
                <p className="explanation">{m.explanation}</p>
                <div className="mistake-bottom">
                  <div>
                    <small>Опанування · {m.mastery}%</small>
                    <Meter
                      value={m.mastery}
                      label={`Опанування ${m.category}`}
                    />
                  </div>
                  <Link
                    className="text-link"
                    href={`/practice?source=mistake&id=${m._id}`}
                  >
                    Повторити <ArrowRight size={16} />
                  </Link>
                </div>
              </article>
            ))}
          </div>
          <Pagination page={page} count={items.length} setPage={setPage} />
        </>
      )}
      <p className="helper">
        Показано до 500 частих помилок із {data.counts.mistakes}. Практика
        враховує весь банк.
      </p>
    </>
  );
}
function Vocabulary({ data }: { data: AppData }) {
  const [filter, setFilter] = useFilter();
  const [page, setPage] = useState(0);
  const items = data.words.filter((w) =>
    filter === "Опановано"
      ? w.mastery === 100
      : filter === "Повторити сьогодні"
        ? new Date(w.nextReview) <= new Date()
        : true,
  );
  return (
    <>
      <Heading
        eyebrow="СЛОВА З ВАШОГО ЖИТТЯ"
        title="Не випадковий список. Ваш словник."
      >
        Зберігайте слова з розмови кнопкою «+» і повертайтеся до них вчасно.
      </Heading>
      <div className="toolbar">
        <Filters
          values={["Усі", "Повторити сьогодні", "Опановано"]}
          active={filter}
          onChange={(v) => {
            setFilter(v);
            setPage(0);
          }}
        />
        {data.words.length > 0 && (
          <Link className="button" href="/practice?source=word">
            Повторити слова <ArrowRight size={16} />
          </Link>
        )}
      </div>
      {!items.length ? (
        <section className="panel">
          <Empty
            title="У цьому розділі поки що немає слів"
            href="/chat"
            label="Перейти до розмови"
          >
            Додайте цікаві слова з відповідей тренера до свого словника.
          </Empty>
        </section>
      ) : (
        <>
          <div className="word-grid">
            {items.slice(page * 10, page * 10 + 10).map((w) => (
              <article className="panel word-card" key={w._id}>
                <div className="section-heading">
                  <h2>{w.word}</h2>
                  <BookOpen size={18} />
                </div>
                <p className="translation">{w.translation}</p>
                <p className="muted">{w.definition}</p>
                <blockquote>{w.example}</blockquote>
                <Meter value={w.mastery} label={`Опанування ${w.word}`} />
                <div className="section-heading">
                  <small>
                    {w.mastery}% · Повторення {date(w.nextReview)}
                  </small>
                  <Link
                    className="text-link"
                    href={`/practice?source=word&id=${w._id}`}
                  >
                    Повторити
                  </Link>
                </div>
              </article>
            ))}
          </div>
          <Pagination page={page} count={items.length} setPage={setPage} />
        </>
      )}
      <p className="helper">
        У списку до 500 останніх слів із {data.counts.words}. Повторення
        враховують увесь словник.
      </p>
    </>
  );
}
function Pagination({
  page,
  count,
  setPage,
}: {
  page: number;
  count: number;
  setPage: (v: number) => void;
}) {
  return (
    <div className="pagination">
      <small>
        {page * 10 + 1}–{Math.min((page + 1) * 10, count)} із {count}
      </small>
      <Button
        className="secondary small"
        disabled={page === 0}
        onClick={() => setPage(page - 1)}
        aria-label="Попередня сторінка"
      >
        <ChevronLeft size={16} />
      </Button>
      <Button
        className="secondary small"
        disabled={(page + 1) * 10 >= count}
        onClick={() => setPage(page + 1)}
        aria-label="Наступна сторінка"
      >
        <ChevronRight size={16} />
      </Button>
    </div>
  );
}
interface Task {
  id: string;
  type: "translation" | "gap" | "fix" | "choice" | "free";
  prompt: string;
  options: string[];
}
function Practice({
  reload,
  data,
}: {
  reload: () => Promise<void>;
  data: AppData;
}) {
  const [task, setTask] = useState<Task | null>(null),
    [answer, setAnswer] = useState(""),
    [result, setResult] = useState<{
      correct: boolean;
      feedback: string;
      answer: string;
    } | null>(null),
    [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  const input = useRef<HTMLTextAreaElement>(null);
  async function start() {
    if (busy) return;
    setBusy(true);
    setError("");
    try {
      const params = new URLSearchParams(window.location.search);
      setTask(
        await api<Task>("practice", {
          sourceType:
            params.get("source") === "word" ||
            (!params.get("source") && data.counts.mistakes === 0)
              ? "word"
              : "mistake",
          sourceId: params.get("id") || undefined,
        }),
      );
      setResult(null);
      setAnswer("");
    } catch (e) {
      setError(errorText(e));
    } finally {
      setBusy(false);
    }
  }
  async function submit(e: FormEvent) {
    e.preventDefault();
    if (busy || !task || result) return;
    if (!answer.trim()) {
      setError("Введіть відповідь або виберіть варіант.");
      input.current?.focus();
      return;
    }
    setBusy(true);
    setError("");
    try {
      setResult(await api("practice/answer", { id: task.id, answer }));
      await reload();
    } catch (e) {
      setError(errorText(e));
    } finally {
      setBusy(false);
    }
  }
  return (
    <>
      <Heading
        eyebrow="ПЕРСОНАЛЬНА ПРАКТИКА"
        title="Ще одна спроба. Уже краще."
      >
        Завдання на основі ваших помилок і слів. Без перегонів і зайвої теорії.
      </Heading>
      <section className="panel practice-panel">
        {!task ? (
          <>
            <span className="practice-icon">
              <Target size={32} />
            </span>
            <h2>Закріпімо те, що стане вам у пригоді</h2>
            <p>
              Почнімо з того, що час повторити. За правильну відповідь — 20 XP,
              за спробу — 5 XP.
            </p>
            <Button busy={busy} onClick={() => void start()}>
              Отримати завдання <ArrowRight size={17} />
            </Button>
          </>
        ) : (
          <form noValidate onSubmit={submit}>
            <span className="tag">
              {
                {
                  translation: "ПЕРЕКЛАД",
                  gap: "ЗАПОВНІТЬ ПРОПУСК",
                  fix: "ВИПРАВТЕ ПОМИЛКУ",
                  choice: "ВИБЕРІТЬ ВАРІАНТ",
                  free: "ВІЛЬНА ВІДПОВІДЬ",
                }[task.type]
              }
            </span>
            <h2>{task.prompt}</h2>
            {task.options.length ? (
              <fieldset disabled={busy || !!result}>
                <legend>Ваша відповідь</legend>
                {task.options.map((option, i) => (
                  <label className="option" key={i}>
                    <input
                      type="radio"
                      name="answer"
                      checked={answer === option}
                      onChange={() => setAnswer(option)}
                    />
                    {option}
                  </label>
                ))}
              </fieldset>
            ) : (
              <label>
                Ваша відповідь
                <textarea
                  ref={input}
                  rows={4}
                  className="resize-none"
                  maxLength={2000}
                  value={answer}
                  disabled={!!result}
                  onChange={(e) => setAnswer(e.target.value)}
                  aria-describedby="practice-status"
                />
              </label>
            )}
            {result ? (
              <div
                className={`practice-result ${result.correct ? "success" : ""}`}
                role="status"
              >
                <strong>
                  {result.correct ? "Вийшло! +20 XP" : "Гарна спроба. +5 XP"}
                </strong>
                <p>{result.feedback}</p>
                <small>Приклад відповіді</small>
                <p>{result.answer}</p>
                <Button busy={busy} onClick={() => void start()} type="button">
                  Наступне завдання <ArrowRight size={17} />
                </Button>
              </div>
            ) : (
              <Button busy={busy} type="submit">
                Перевірити відповідь <Check size={17} />
              </Button>
            )}
          </form>
        )}
        <div id="practice-status" className="form-status" role="status">
          {error && <span className="error">{error}</span>}
        </div>
        <Link className="text-link" href="/chat">
          Повернутися до розмови
        </Link>
      </section>
    </>
  );
}
function Progress({ data }: { data: AppData }) {
  const list = skills(data);
  const total = data.activity.reduce((n, a) => n + a.exercises, 0),
    correct = data.activity.reduce((n, a) => n + a.correct, 0);
  const days = Array.from({ length: 14 }, (_, i) => {
    const day = new Date(`${data.today}T12:00:00Z`);
    day.setUTCDate(day.getUTCDate() - 13 + i);
    const key = day.toISOString().slice(0, 10);
    return { day: key, xp: data.activity.find((a) => a.day === key)?.xp || 0 };
  });
  const max = Math.max(20, ...days.map((d) => d.xp));
  return (
    <>
      <Heading
        eyebrow="ВАЖЛИВО НЕ ІДЕАЛЬНО. ВАЖЛИВО РЕГУЛЯРНО."
        title="Ваша англійська розвивається."
      >
        Реальні результати розмов і повторень.
      </Heading>
      <div className="stats-grid">
        <Stat
          icon={<Flame />}
          label="Найкраща серія"
          value={`${data.user.longestStreak}`}
          note="Днів практики поспіль"
        />
        <Stat
          icon={<MessageCircle />}
          label="Повідомлення"
          value={number(data.activity.reduce((n, a) => n + a.messages, 0))}
          note="За 30 активних днів"
        />
        <Stat
          icon={<Check />}
          label="Вправи"
          value={number(total)}
          note="За 30 активних днів"
        />
        <Stat
          icon={<TrendingUp />}
          label="Правильні відповіді"
          value={total ? `${Math.round((correct / total) * 100)}%` : "—"}
          note="За 30 активних днів"
        />
      </div>
      <section className="panel">
        <div className="section-heading">
          <h2>Потроху, щодня</h2>
          <span className="tag">14 ДНІВ · XP</span>
        </div>
        <div className="activity-chart">
          {days.map((d) => (
            <div className="chart-column" key={d.day}>
              <span>{d.xp}</span>
              <div className="bar-track">
                <div
                  className="bar"
                  style={{ height: `${(d.xp / max) * 100}%` }}
                />
              </div>
              <small>{d.day.slice(8)}</small>
              <span className="sr-only">
                {d.day}: {d.xp} XP
              </span>
            </div>
          ))}
        </div>
      </section>
      <section className="panel">
        <div className="section-heading">
          <h2>Опанування тем</h2>
          <span className="muted">За вашими повтореннями</span>
        </div>
        {list.length ? (
          list.map((s) => (
            <div className="skill-row" key={s.name}>
              <strong>{s.name}</strong>
              <div>
                <span>{s.mastery}%</span>
                <Meter value={s.mastery} label={s.name} />
              </div>
            </div>
          ))
        ) : (
          <Empty title="Спочатку трохи практики">
            Після розмов і вправ тут з’явиться прогрес за темами.
          </Empty>
        )}
        <p className="helper">
          Це проста оцінка роботи над помилками, а не тест рівня CEFR.
        </p>
      </section>
      <Link className="text-link" href="/profile">
        Налаштування навчання <ArrowRight size={16} />
      </Link>
    </>
  );
}
