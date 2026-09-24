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
import { LanguageSelect } from "./language-select";
const navigation = [
  { path: "/", key: "home", label: "Главная", icon: House },
  { path: "/practice", key: "practice", label: "Практика", icon: Zap },
  { path: "/chat", key: "chat", label: "Разговор", icon: MessageCircle },
  {
    path: "/mistakes",
    key: "mistakes",
    label: "Мои ошибки",
    icon: GraduationCap,
  },
  { path: "/vocabulary", key: "vocabulary", label: "Словарь", icon: BookOpen },
  {
    path: "/progress",
    key: "progress",
    label: "Прогресс",
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
      data.error || "Не удалось выполнить запрос.",
    );
  return data as T;
}
const errorText = (error: unknown) =>
  error instanceof Error
    ? error.name === "TimeoutError"
      ? "Ответ занимает слишком много времени. Повторите попытку."
      : error.message
    : "Не удалось выполнить запрос.";
const number = (n: number) => new Intl.NumberFormat("ru-RU").format(n);
function date(value: string) {
  return new Intl.DateTimeFormat("ru-RU", {
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
          throw new ApiError(401, "Откройте приложение через Telegram.");
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
        <p role="status">Открываем ваш учебный кабинет…</p>
      </main>
    );
  if (!data)
    return (
      <main className="gate">
        <div className="brand">
          <span className="brand-mark">e.</span> English Coach
        </div>
        <div className="gate-content">
          <span className="eyebrow">ВАШ АНГЛИЙСКИЙ. ВАШ ПУТЬ.</span>
          <h1>
            Ошибаться —<br />
            <em>значит учиться.</em>
          </h1>
          <p>
            Разговаривайте по-английски. Получайте понятные исправления и
            практику, которая помогает именно вам.
          </p>
          <div className="sentence-demo">
            <span>I go yesterday to shop</span>
            <ArrowDown size={18} />
            <strong>I went to the shop yesterday.</strong>
          </div>
          {bot ? (
            <a className="button" href={`https://t.me/${bot}?start=web`}>
              Открыть в Telegram <Send size={17} />
            </a>
          ) : (
            <p className="muted">
              Вход станет доступен после подключения Telegram-бота.
            </p>
          )}
          <p className="helper">Откройте Mini App через кнопку в боте.</p>
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
              Повторить вход
            </Button>
          )}
        </div>
        <p className="gate-footer">
          Разговор → ваши ошибки → персональная практика
        </p>
      </main>
    );
  const title = navigation.find((n) => n.key === page)?.label || "Профиль";
  return (
    <div className="app-shell">
      <aside className="sidebar">
        <Link className="brand" href="/">
          <span className="brand-mark">e.</span> English Coach
        </Link>
        <div className="sidebar-caption">ЛИЧНЫЙ КАБИНЕТ</div>
        <nav aria-label="Главная навигация">
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
          <strong>Не идеально. Но лучше.</strong>
          <p>Каждая ошибка — подсказка, чему учиться дальше.</p>
        </div>
        <Link href="/profile" className="profile-link">
          <span className="avatar">{data.user.name.slice(0, 1)}</span>
          <span>
            <strong>{data.user.name}</strong>
            <small>
              {data.user.settings?.englishLevel === "unknown"
                ? "Уровень не определён"
                : data.user.settings?.englishLevel || "Настроить профиль"}
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
              aria-label="Профиль"
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
          Маленькая практика. Заметные перемены.<span>English Coach</span>
        </footer>
      </div>
      <nav className="bottom-nav" aria-label="Мобильная навигация">
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
        eyebrow="КАЖДЫЙ РАЗ НЕМНОГО УВЕРЕННЕЕ"
        title={`${data.user.name}, продолжим?`}
      >
        Ваши разговоры становятся планом обучения. Один маленький шаг на
        сегодня.
      </Heading>
      <div className="dashboard-grid">
        <section className="hero-card">
          <div className="hero-copy">
            <span className="pill">
              <Sparkles size={14} /> ВАША ПРАКТИКА НА СЕГОДНЯ
            </span>
            <h2>
              {data.counts.due
                ? "Превратите «почти»\nв «получилось»."
                : "Начните с пары\nпростых фраз."}
            </h2>
            <p>
              {data.counts.due
                ? `${data.counts.due} заданий к повторению. Вернитесь к своим ошибкам, пока они не стали привычкой.`
                : "Расскажите, как прошёл ваш день. Тренер заметит, что уже получается и что стоит повторить."}
            </p>
            <Link
              className="button light"
              href={data.counts.due ? "/practice" : "/chat"}
            >
              {data.counts.due ? "Начать практику" : "Начать разговор"}
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
            <span className="visual-caption">Ошибки — это начало.</span>
          </div>
        </section>
        <section className="daily-card">
          <div className="section-heading">
            <h3>Ваш ритм</h3>
            <Flame size={22} />
          </div>
          <div className="streak-number">
            {data.user.streak}
            <span>дней подряд</span>
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
                    {new Intl.DateTimeFormat("ru-RU", {
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
              ? "Вы уже сделали шаг сегодня. Так держать!"
              : `Ваша цель — ${data.user.settings?.dailyGoal} минут в день. Начните с одного разговора.`}
          </p>
        </section>
      </div>
      <div className="stats-grid">
        <Stat
          icon={<GraduationCap />}
          label="Ваш уровень"
          value={
            data.user.settings?.englishLevel === "unknown"
              ? "—"
              : data.user.settings?.englishLevel || "—"
          }
          note="Указан в профиле"
        />
        <Stat
          icon={<BookOpen />}
          label="Личный словарь"
          value={number(data.counts.words)}
          note="Слова из ваших разговоров"
        />
        <Stat
          icon={<Target />}
          label="Без ошибок"
          value={messages ? `${Math.round((accurate / messages) * 100)}%` : "—"}
          note="Сообщения · последние 30 активных дней"
        />
        <Stat
          icon={<Zap />}
          label="Опыт обучения"
          value={number(data.user.xp)}
          note={`Уровень практики ${Math.floor(data.user.xp / 500) + 1} · XP`}
        />
      </div>
      <Link className="text-link progress-link" href="/progress">
        Посмотреть весь прогресс <ArrowRight size={16} />
      </Link>
      <div className="two-columns">
        <section className="panel">
          <div className="section-heading">
            <h2>На чём сосредоточиться</h2>
            <span className="tag">ВАШ ФОКУС</span>
          </div>
          {weak.length ? (
            weak.map((s) => (
              <Link className="skill-row" href="/practice" key={s.name}>
                <div>
                  <strong>{s.name}</strong>
                  <small>{s.occurrences} ошибок в разговорах</small>
                </div>
                <div>
                  <span>{s.mastery}%</span>
                  <Meter value={s.mastery} label={s.name} />
                </div>
                <ChevronRight size={17} />
              </Link>
            ))
          ) : (
            <Empty title="Узнаем ваши сильные стороны">
              После первого разговора здесь появятся темы для практики.
            </Empty>
          )}
          <p className="helper">
            Освоение оценивается по результатам повторений.
          </p>
        </section>
        <section className="panel">
          <div className="section-heading">
            <h2>Из ваших разговоров</h2>
            <Link href="/mistakes">
              Все ошибки <ArrowRight size={15} />
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
                <small>Встречалось {m.occurrences} раз</small>
              </div>
            ))
          ) : (
            <Empty
              title="Здесь начинается ваш прогресс"
              href="/chat"
              label="Поговорить с тренером"
            >
              Напишите пару предложений — сохраним то, что стоит повторить.
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
  ["Speak confidently", "Говорить увереннее"],
  ["Travel", "Путешествовать"],
  ["Work", "Для работы"],
  ["Job interviews", "Проходить собеседования"],
  ["Move abroad", "Переехать за границу"],
  ["Understand content", "Понимать фильмы и видео"],
  ["Improve grammar", "Улучшить грамматику"],
  ["Expand vocabulary", "Расширить словарь"],
] as const;
const onboardingQuestions = [
  "Какой язык для вас родной?",
  "Какой у вас уровень английского?",
  "Сколько минут в день готовы заниматься?",
  "Зачем вам английский?",
  "Что вам интересно?",
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
        if (restored.success) return restored.data;
      }
    } catch {}
    return (
      data.user.settings || {
        nativeLanguage: "Русский",
        englishLevel: "A2",
        goal: "Speak confidently",
        interests: "",
        dailyGoal: 10,
        timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
      }
    );
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
        setError("Выберите родной язык из списка.");
        ref.current?.querySelector<HTMLInputElement>("input")?.focus();
        return;
      }
      setStep((current) => current + 1);
      return;
    }
    const valid = settingsSchema.safeParse(form);
    if (!valid.success) {
      setError("Укажите родной язык и проверьте остальные поля.");
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
        eyebrow={
          data.user.settings ? "ВАШИ ПРЕДПОЧТЕНИЯ" : "ДАВАЙТЕ ПОЗНАКОМИМСЯ"
        }
        title={
          data.user.settings ? "Настроим обучение под вас" : "С чего начнём?"
        }
      >
        Несколько деталей помогут тренеру подобрать объяснения и задания.
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
                Шаг {step + 1} из {onboardingQuestions.length}
              </span>
              <Meter
                value={((step + 1) / onboardingQuestions.length) * 100}
                label={`Шаг ${step + 1} из ${onboardingQuestions.length}`}
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
                    label: value === "unknown" ? "Пока не знаю" : value,
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
                      label: `${value} минут`,
                    }))}
                    value={form.dailyGoal}
                    onChange={(dailyGoal) => setForm({ ...form, dailyGoal })}
                  />
                  <p className="helper">
                    Это ваш ориентир. Таймер занятий пока не ведётся.
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
                    placeholder="Например: технологии, музыка, путешествия"
                    value={form.interests}
                    maxLength={300}
                    onChange={(e) =>
                      setForm({ ...form, interests: e.target.value })
                    }
                  />
                  <p id="onboarding-interests-help" className="helper">
                    Необязательно. Подберём темы для разговоров по вашим
                    интересам.
                  </p>
                  <p className="helper">
                    Часовой пояс: {form.timezone}. Используем для подсчёта дней
                    практики.
                  </p>
                </>
              )}
            </div>
          </>
        ) : (
          <>
            <label>
              Родной язык
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
                Уровень английского
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
                      {v === "unknown" ? "Пока не знаю" : v}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                Ежедневная цель
                <select
                  value={form.dailyGoal}
                  onChange={(e) =>
                    setForm({ ...form, dailyGoal: Number(e.target.value) })
                  }
                >
                  {profileMinutes.map((v) => (
                    <option key={v} value={v}>
                      {v} минут
                    </option>
                  ))}
                </select>
              </label>
            </div>
            <label>
              Зачем вам английский
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
              Что вам интересно?
              <input
                placeholder="Например: технологии, музыка, путешествия"
                value={form.interests}
                maxLength={300}
                onChange={(e) =>
                  setForm({ ...form, interests: e.target.value })
                }
              />
            </label>
            <p className="helper">
              Часовой пояс: {form.timezone}. Используем для подсчёта дней
              практики. Цель в минутах — ваш ориентир, таймер пока не ведётся.
            </p>
          </>
        )}
        <div id="profile-status" className="form-status" role="status">
          {error ? (
            <span className="error">{error}</span>
          ) : saved ? (
            "Профиль сохранён. Можно переходить к разговору."
          ) : dirty && data.user.settings ? (
            "Есть несохранённые изменения."
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
                ? "Начать обучение"
                : "Далее"
              : "Сохранить профиль"}
            <ArrowRight size={17} />
          </Button>
        </div>
        {saved && (
          <Link className="text-link" href="/chat">
            Перейти к разговору →
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
      setError("Напишите хотя бы одно предложение.");
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
      <Heading eyebrow="РАЗГОВОР С ТРЕНЕРОМ" title="Just start talking.">
        Как прошёл ваш день? Пишите как получается — разберёмся вместе.
      </Heading>
      <section className="chat-panel panel">
        <div className="coach-label">
          <span className="coach-icon">
            <Sparkles size={20} />
          </span>
          <div>
            <strong>English Coach</strong>
            <small>Короткие объяснения. Живой разговор.</small>
          </div>
        </div>
        <div className="messages">
          {!data.messages.length && (
            <div className="assistant-message">
              <span className="message-label">COACH</span>
              <p>Hi! Tell me a little about your day. What did you do today?</p>
              <span className="helper">Можно начать с «Today I…»</span>
            </div>
          )}
          {data.messages.map((m) => (
            <div className="message-pair" key={m._id}>
              <div className="user-message">
                <span className="message-label">ВЫ</span>
                <p>{m.text}</p>
              </div>
              <div className="assistant-message">
                <span className="message-label">COACH</span>
                <p>{m.analysis.reply}</p>
                {m.analysis.mistakes.length > 0 && (
                  <div className="corrections">
                    <span className="tag">СДЕЛАЕМ ЧУТЬ ЛУЧШЕ</span>
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
              Тренер обдумывает ответ…
            </p>
          )}
          <div ref={bottom} />
        </div>
        <form className="composer" noValidate onSubmit={send}>
          <label className="sr-only" htmlFor="message">
            Сообщение на английском
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
            <span>Отправить</span>
          </Button>
        </form>
        <div id="chat-status" className="form-status" role="status">
          {error ? (
            <span className="error">{error}</span>
          ) : (
            "10 XP за сообщение · AI может ошибаться"
          )}
        </div>
      </section>
    </>
  );
}
function useFilter() {
  const [filter, setFilter] = useState(() =>
    typeof window === "undefined"
      ? "Все"
      : new URLSearchParams(window.location.search).get("filter") || "Все",
  );
  return [
    filter,
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
    <div className="filters" aria-label="Фильтры">
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
    Грамматика: "Grammar",
    Словарь: "Vocabulary",
    Артикли: "Articles",
    Времена: "Tenses",
    Предлоги: "Prepositions",
    "Порядок слов": "Word order",
  };
  const items = data.mistakes.filter(
    (m) => filter === "Все" || m.type === types[filter],
  );
  return (
    <>
      <Heading
        eyebrow="ВАШ ПЕРСОНАЛЬНЫЙ БАНК ОШИБОК"
        title="Здесь ошибки работают на вас."
      >
        Повторяйте то, что встречается в ваших разговорах, и замечайте перемены.
      </Heading>
      <div className="toolbar">
        <Filters
          values={["Все", ...Object.keys(types)]}
          active={filter}
          onChange={(v) => {
            setFilter(v);
            setPage(0);
          }}
        />
        {data.mistakes.length > 0 && (
          <Link className="button" href="/practice">
            Практиковать <ArrowRight size={16} />
          </Link>
        )}
      </div>
      {!items.length ? (
        <section className="panel">
          <Empty
            title={
              data.mistakes.length
                ? "В этой категории ошибок нет"
                : "Пока здесь чистый лист"
            }
            href="/chat"
            label="Начать разговор"
          >
            Поговорите с тренером — значимые ошибки автоматически появятся
            здесь.
          </Empty>
        </section>
      ) : (
        <>
          <div className="mistakes-list">
            {items.slice(page * 10, page * 10 + 10).map((m) => (
              <article className="panel mistake-card" key={m._id}>
                <div className="section-heading">
                  <span className="tag">{m.category}</span>
                  <small>Встречалось {m.occurrences} раз</small>
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
                    <small>Освоение · {m.mastery}%</small>
                    <Meter value={m.mastery} label={`Освоение ${m.category}`} />
                  </div>
                  <Link
                    className="text-link"
                    href={`/practice?source=mistake&id=${m._id}`}
                  >
                    Повторить <ArrowRight size={16} />
                  </Link>
                </div>
              </article>
            ))}
          </div>
          <Pagination page={page} count={items.length} setPage={setPage} />
        </>
      )}
      <p className="helper">
        Показаны до 500 частых ошибок из {data.counts.mistakes}. Практика
        учитывает весь банк.
      </p>
    </>
  );
}
function Vocabulary({ data }: { data: AppData }) {
  const [filter, setFilter] = useFilter();
  const [page, setPage] = useState(0);
  const items = data.words.filter((w) =>
    filter === "Освоено"
      ? w.mastery === 100
      : filter === "Повторить сегодня"
        ? new Date(w.nextReview) <= new Date()
        : true,
  );
  return (
    <>
      <Heading
        eyebrow="СЛОВА ИЗ ВАШЕЙ ЖИЗНИ"
        title="Не случайный список. Ваш словарь."
      >
        Сохраняйте слова из разговора кнопкой «+» и возвращайтесь к ним вовремя.
      </Heading>
      <div className="toolbar">
        <Filters
          values={["Все", "Повторить сегодня", "Освоено"]}
          active={filter}
          onChange={(v) => {
            setFilter(v);
            setPage(0);
          }}
        />
        {data.words.length > 0 && (
          <Link className="button" href="/practice?source=word">
            Повторить слова <ArrowRight size={16} />
          </Link>
        )}
      </div>
      {!items.length ? (
        <section className="panel">
          <Empty
            title="Пока нет слов в этом разделе"
            href="/chat"
            label="Перейти к разговору"
          >
            Добавьте интересные слова из ответов тренера в свой словарь.
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
                <Meter value={w.mastery} label={`Освоение ${w.word}`} />
                <div className="section-heading">
                  <small>
                    {w.mastery}% · Повторение {date(w.nextReview)}
                  </small>
                  <Link
                    className="text-link"
                    href={`/practice?source=word&id=${w._id}`}
                  >
                    Повторить
                  </Link>
                </div>
              </article>
            ))}
          </div>
          <Pagination page={page} count={items.length} setPage={setPage} />
        </>
      )}
      <p className="helper">
        В списке до 500 последних слов из {data.counts.words}. Повторения
        учитывают весь словарь.
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
        {page * 10 + 1}–{Math.min((page + 1) * 10, count)} из {count}
      </small>
      <Button
        className="secondary small"
        disabled={page === 0}
        onClick={() => setPage(page - 1)}
        aria-label="Предыдущая страница"
      >
        <ChevronLeft size={16} />
      </Button>
      <Button
        className="secondary small"
        disabled={(page + 1) * 10 >= count}
        onClick={() => setPage(page + 1)}
        aria-label="Следующая страница"
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
      setError("Введите ответ или выберите вариант.");
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
        eyebrow="ПЕРСОНАЛЬНАЯ ПРАКТИКА"
        title="Ещё одна попытка. Уже лучше."
      >
        Задания на основе ваших ошибок и слов. Без гонки и лишней теории.
      </Heading>
      <section className="panel practice-panel">
        {!task ? (
          <>
            <span className="practice-icon">
              <Target size={32} />
            </span>
            <h2>Закрепим то, что пригодится вам</h2>
            <p>
              Начнём с того, что пора повторить. За правильный ответ — 20 XP, за
              попытку — 5 XP.
            </p>
            <Button busy={busy} onClick={() => void start()}>
              Получить задание <ArrowRight size={17} />
            </Button>
          </>
        ) : (
          <form noValidate onSubmit={submit}>
            <span className="tag">
              {
                {
                  translation: "ПЕРЕВОД",
                  gap: "ЗАПОЛНИТЕ ПРОПУСК",
                  fix: "ИСПРАВЬТЕ ОШИБКУ",
                  choice: "ВЫБЕРИТЕ ВАРИАНТ",
                  free: "СВОБОДНЫЙ ОТВЕТ",
                }[task.type]
              }
            </span>
            <h2>{task.prompt}</h2>
            {task.options.length ? (
              <fieldset disabled={busy || !!result}>
                <legend>Ваш ответ</legend>
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
                Ваш ответ
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
                  {result.correct
                    ? "Получилось! +20 XP"
                    : "Хорошая попытка. +5 XP"}
                </strong>
                <p>{result.feedback}</p>
                <small>Пример ответа</small>
                <p>{result.answer}</p>
                <Button busy={busy} onClick={() => void start()} type="button">
                  Следующее задание <ArrowRight size={17} />
                </Button>
              </div>
            ) : (
              <Button busy={busy} type="submit">
                Проверить ответ <Check size={17} />
              </Button>
            )}
          </form>
        )}
        <div id="practice-status" className="form-status" role="status">
          {error && <span className="error">{error}</span>}
        </div>
        <Link className="text-link" href="/chat">
          Вернуться к разговору
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
        eyebrow="ВАЖНО НЕ ИДЕАЛЬНО. ВАЖНО РЕГУЛЯРНО."
        title="Ваш английский в движении."
      >
        Реальные результаты разговоров и повторений.
      </Heading>
      <div className="stats-grid">
        <Stat
          icon={<Flame />}
          label="Лучшая серия"
          value={`${data.user.longestStreak}`}
          note="Дней практики подряд"
        />
        <Stat
          icon={<MessageCircle />}
          label="Сообщения"
          value={number(data.activity.reduce((n, a) => n + a.messages, 0))}
          note="За 30 активных дней"
        />
        <Stat
          icon={<Check />}
          label="Упражнения"
          value={number(total)}
          note="За 30 активных дней"
        />
        <Stat
          icon={<TrendingUp />}
          label="Верные ответы"
          value={total ? `${Math.round((correct / total) * 100)}%` : "—"}
          note="За 30 активных дней"
        />
      </div>
      <section className="panel">
        <div className="section-heading">
          <h2>Понемногу, каждый день</h2>
          <span className="tag">14 ДНЕЙ · XP</span>
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
          <h2>Освоение тем</h2>
          <span className="muted">По вашим повторениям</span>
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
          <Empty title="Сначала немного практики">
            После разговоров и упражнений здесь появится прогресс по темам.
          </Empty>
        )}
        <p className="helper">
          Это простая оценка закрепления ошибок, а не тест уровня CEFR.
        </p>
      </section>
      <Link className="text-link" href="/profile">
        Настройки обучения <ArrowRight size={16} />
      </Link>
    </>
  );
}
