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
import { trackEvent } from "@/lib/track-event";
import { Button, Empty, Meter, Pagination } from "./ui";
import { LanguageSelect, languageLabel } from "./language-select";
const navigation = [
  { path: "/", key: "home", label: "Home", icon: House },
  { path: "/practice", key: "practice", label: "Practice", icon: Zap },
  { path: "/chat", key: "chat", label: "Conversation", icon: MessageCircle },
  {
    path: "/mistakes",
    key: "mistakes",
    label: "My mistakes",
    icon: GraduationCap,
  },
  {
    path: "/vocabulary",
    key: "vocabulary",
    label: "Vocabulary",
    icon: BookOpen,
  },
  {
    path: "/progress",
    key: "progress",
    label: "Progress",
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
      data.error || "Could not complete the request.",
    );
  return data as T;
}
const errorText = (error: unknown) =>
  error instanceof Error
    ? error.name === "TimeoutError"
      ? "The response is taking too long. Please try again."
      : error.message
    : "Could not complete the request.";
const number = (n: number) => new Intl.NumberFormat("en-US").format(n);
const pluralRules = new Intl.PluralRules("en-US");
function plural(n: number, one: string, many: string) {
  return pluralRules.select(n) === "one" ? one : many;
}

function date(value: string) {
  return new Intl.DateTimeFormat("en-US", {
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
  const trackedPage = useRef<string | null>(null);
  const authenticatedUserId = data?.user._id;
  useEffect(() => {
    if (!authenticatedUserId) return;
    if (trackedPage.current === page) return;
    trackedPage.current = page;
    if (page === "home" || page === "profile")
      trackEvent("profile_visit", crypto.randomUUID());
  }, [authenticatedUserId, page]);
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
          throw new ApiError(401, "Open the app through Telegram.");
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
        <p role="status">Opening your learning space…</p>
      </main>
    );
  if (!data)
    return (
      <main className="gate">
        <div className="brand">
          <span className="brand-mark">e.</span> English Coach
        </div>
        <div className="gate-content">
          <span className="eyebrow">YOUR ENGLISH. YOUR JOURNEY.</span>
          <h1>
            Making mistakes means
            <br />
            <em>learning.</em>
          </h1>
          <p>
            Speak English. Get clear corrections and practice tailored to you.
          </p>
          <div className="sentence-demo">
            <span>I go yesterday to shop</span>
            <ArrowDown size={18} />
            <strong>I went to the shop yesterday.</strong>
          </div>
          {bot ? (
            <a className="button" href={`https://t.me/${bot}?start=web`}>
              Open in Telegram <Send size={17} />
            </a>
          ) : (
            <p className="muted">
              Sign-in will be available once the Telegram bot is connected.
            </p>
          )}
          <p className="helper">
            Open the Mini App using the button in the bot.
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
              Try signing in again
            </Button>
          )}
        </div>
        <p className="gate-footer">
          Conversation → your mistakes → personal practice
        </p>
      </main>
    );
  const title = navigation.find((n) => n.key === page)?.label || "Profile";
  return (
    <div className="app-shell">
      <aside className="sidebar">
        <Link className="brand" href="/">
          <span className="brand-mark">e.</span> English Coach
        </Link>
        <div className="sidebar-caption">YOUR LEARNING SPACE</div>
        <nav aria-label="Main navigation">
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
          <strong>A little better every day.</strong>
          <p>Every mistake shows you what to learn next.</p>
        </div>
        <Link href="/profile" className="profile-link">
          <span className="avatar">{data.user.name.slice(0, 1)}</span>
          <span>
            <strong>{data.user.name}</strong>
            <small>
              {data.user.settings?.englishLevel === "unknown"
                ? "Level not set"
                : data.user.settings?.englishLevel || "Set up your profile"}
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
              {data.user.streak} {plural(data.user.streak, "day", "days")}
            </span>
            <span className="xp">
              <Zap size={16} />
              {number(data.user.xp)} XP
            </span>
            <Link
              className="mobile-profile avatar"
              href="/profile"
              aria-label="Profile"
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
          A little practice. Noticeable progress.<span>English Coach</span>
        </footer>
      </div>
      <nav className="bottom-nav" aria-label="Mobile navigation">
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
        eyebrow="MORE CONFIDENT EACH TIME"
        title={`${data.user.name}, ready to continue?`}
      >
        Your conversations become your learning plan. One small step for today.
      </Heading>
      <div className="dashboard-grid">
        <section className="hero-card">
          <div className="hero-copy">
            <span className="pill">
              <Sparkles size={14} /> YOUR PRACTICE FOR TODAY
            </span>
            <h2>
              {data.counts.due
                ? "Turn “almost”\ninto “got it”."
                : "Start with a few\nsimple sentences."}
            </h2>
            <p>
              {data.counts.due
                ? `${number(data.counts.due)} ${plural(data.counts.due, "exercise", "exercises")} to review. Revisit your mistakes before they become habits.`
                : "Share how your day went. Your coach will spot what you do well and what needs practice."}
            </p>
            <Link
              className="button light"
              href={data.counts.due ? "/practice" : "/chat"}
            >
              {data.counts.due ? "Start practicing" : "Start a conversation"}
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
            <span className="visual-caption">
              Mistakes are a starting point.
            </span>
          </div>
        </section>
        <section className="daily-card">
          <div className="section-heading">
            <h3>Your rhythm</h3>
            <Flame size={22} />
          </div>
          <div className="streak-number">
            {data.user.streak}
            <span>{plural(data.user.streak, "day", "days")} in a row</span>
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
                    {new Intl.DateTimeFormat("en-US", {
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
              ? "You have already taken a step today. Keep it up!"
              : `Your goal is ${data.user.settings?.dailyGoal} minutes a day. Start with one conversation.`}
          </p>
        </section>
      </div>
      <div className="stats-grid">
        <Stat
          icon={<GraduationCap />}
          label="Your level"
          value={
            data.user.settings?.englishLevel === "unknown"
              ? "—"
              : data.user.settings?.englishLevel || "—"
          }
          note="As selected in your profile"
        />
        <Stat
          icon={<BookOpen />}
          label="Personal vocabulary"
          value={number(data.counts.words)}
          note="Words from your conversations"
        />
        <Stat
          icon={<Target />}
          label="Error-free messages"
          value={messages ? `${Math.round((accurate / messages) * 100)}%` : "—"}
          note="Messages · last 30 active days"
        />
        <Stat
          icon={<Zap />}
          label="Learning experience"
          value={number(data.user.xp)}
          note={`Practice level ${Math.floor(data.user.xp / 500) + 1} · XP`}
        />
      </div>
      <Link className="text-link progress-link" href="/progress">
        View all progress <ArrowRight size={16} />
      </Link>
      <div className="two-columns">
        <section className="panel">
          <div className="section-heading">
            <h2>What to focus on</h2>
            <span className="tag">YOUR FOCUS</span>
          </div>
          {weak.length ? (
            weak.map((s) => (
              <Link className="skill-row" href="/practice" key={s.name}>
                <div>
                  <strong>{s.name}</strong>
                  <small>
                    {number(s.occurrences)}{" "}
                    {plural(s.occurrences, "mistake", "mistakes")} in
                    conversations
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
            <Empty title="Let’s discover your strengths">
              Practice topics will appear here after your first conversation.
            </Empty>
          )}
          <p className="helper">Mastery reflects your review results.</p>
        </section>
        <section className="panel">
          <div className="section-heading">
            <h2>From your conversations</h2>
            <Link href="/mistakes">
              All mistakes <ArrowRight size={15} />
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
                  Occurred {number(m.occurrences)}{" "}
                  {plural(m.occurrences, "time", "times")}
                </small>
              </div>
            ))
          ) : (
            <Empty
              title="Your progress starts here"
              href="/chat"
              label="Talk to your coach"
            >
              Write a few sentences and we’ll save what needs practice.
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
  ["Speak confidently", "Speak confidently"],
  ["Travel", "Travel"],
  ["Work", "Work"],
  ["Job interviews", "Job interviews"],
  ["Move abroad", "Move abroad"],
  ["Understand content", "Understand movies and videos"],
  ["Improve grammar", "Improve grammar"],
  ["Expand vocabulary", "Expand vocabulary"],
] as const;
const onboardingQuestions = [
  "What is your native language?",
  "What is your English level?",
  "How many minutes a day would you like to practice?",
  "Why are you learning English?",
  "What are you interested in?",
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
          nativeLanguage: "Ukrainian",
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
        setError("Choose your native language from the list.");
        ref.current?.querySelector<HTMLInputElement>("input")?.focus();
        return;
      }
      setStep((current) => current + 1);
      return;
    }
    const valid = settingsSchema.safeParse(form);
    if (!valid.success) {
      setError("Select your native language and check the other fields.");
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
          data.user.settings ? "YOUR PREFERENCES" : "LET’S GET TO KNOW YOU"
        }
        title={
          data.user.settings
            ? "Make learning work for you"
            : "Where shall we start?"
        }
      >
        A few details will help your coach tailor explanations and exercises.
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
                Step {step + 1} of {onboardingQuestions.length}
              </span>
              <Meter
                value={((step + 1) / onboardingQuestions.length) * 100}
                label={`Step ${step + 1} of ${onboardingQuestions.length}`}
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
                    label: value === "unknown" ? "I’m not sure yet" : value,
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
                      label: `${value} minutes`,
                    }))}
                    value={form.dailyGoal}
                    onChange={(dailyGoal) => setForm({ ...form, dailyGoal })}
                  />
                  <p className="helper">
                    This is your target. Study time is not tracked yet.
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
                    placeholder="For example: technology, music, travel"
                    value={form.interests}
                    maxLength={300}
                    onChange={(e) =>
                      setForm({ ...form, interests: e.target.value })
                    }
                  />
                  <p id="onboarding-interests-help" className="helper">
                    Optional. We’ll suggest conversation topics based on your
                    interests.
                  </p>
                  <p className="helper">
                    Time zone: {form.timezone}. Used to count your practice
                    days.
                  </p>
                </>
              )}
            </div>
          </>
        ) : (
          <>
            <label>
              Native language
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
                English level
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
                      {v === "unknown" ? "I’m not sure yet" : v}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                Daily goal
                <select
                  value={form.dailyGoal}
                  onChange={(e) =>
                    setForm({ ...form, dailyGoal: Number(e.target.value) })
                  }
                >
                  {profileMinutes.map((v) => (
                    <option key={v} value={v}>
                      {v} minutes
                    </option>
                  ))}
                </select>
              </label>
            </div>
            <label>
              Why you’re learning English
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
              What are you interested in?
              <input
                placeholder="For example: technology, music, travel"
                value={form.interests}
                maxLength={300}
                onChange={(e) =>
                  setForm({ ...form, interests: e.target.value })
                }
              />
            </label>
            <p className="helper">
              Time zone: {form.timezone}. Used to count your practice days. Your
              goal in minutes is a target; study time is not tracked yet.
            </p>
          </>
        )}
        <div id="profile-status" className="form-status" role="status">
          {error ? (
            <span className="error">{error}</span>
          ) : saved ? (
            "Profile saved. You’re ready to start a conversation."
          ) : dirty && data.user.settings ? (
            "You have unsaved changes."
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
              Back
            </Button>
          )}
          <Button busy={busy} type="submit">
            {onboarding
              ? step === onboardingQuestions.length - 1
                ? "Start learning"
                : "Next"
              : "Save profile"}
            <ArrowRight size={17} />
          </Button>
        </div>
        {saved && (
          <Link className="text-link" href="/chat">
            Go to conversation →
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
      setError("Write at least one sentence.");
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
      <Heading eyebrow="TALK TO YOUR COACH" title="Just start talking.">
        How was your day? Write what you can and we’ll work through it together.
      </Heading>
      <section className="chat-panel panel">
        <div className="coach-label">
          <span className="coach-icon">
            <Sparkles size={20} />
          </span>
          <div>
            <strong>English Coach</strong>
            <small>Brief explanations. Natural conversation.</small>
          </div>
        </div>
        <div className="messages">
          {!data.messages.length && (
            <div className="assistant-message">
              <span className="message-label">COACH</span>
              <p>Hi! Tell me a little about your day. What did you do today?</p>
              <span className="helper">You can start with “Today I…”</span>
            </div>
          )}
          {data.messages.map((m) => (
            <div className="message-pair" key={m._id}>
              <div className="user-message">
                <span className="message-label">YOU</span>
                <p>{m.text}</p>
              </div>
              <div className="assistant-message">
                <span className="message-label">COACH</span>
                <p>{m.analysis.reply}</p>
                {m.analysis.mistakes.length > 0 && (
                  <div className="corrections">
                    <span className="tag">LET’S MAKE IT A LITTLE BETTER</span>
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
              Your coach is thinking…
            </p>
          )}
          <div ref={bottom} />
        </div>
        <form className="composer" noValidate onSubmit={send}>
          <label className="sr-only" htmlFor="message">
            Message in English
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
            <span>Send</span>
          </Button>
        </form>
        <div id="chat-status" className="form-status" role="status">
          {error ? (
            <span className="error">{error}</span>
          ) : (
            "10 XP per message · AI can make mistakes"
          )}
        </div>
      </section>
    </>
  );
}
// Preserve filters in links created before the English interface.
const legacyFilters: Record<string, string> = {
  Усі: "All",
  Граматика: "Grammar",
  Словник: "Vocabulary",
  Артиклі: "Articles",
  Часи: "Tenses",
  Прийменники: "Prepositions",
  "Порядок слів": "Word order",
  "Повторити сьогодні": "Due today",
  Опановано: "Mastered",
  Все: "All",
  Грамматика: "Grammar",
  Словарь: "Vocabulary",
  Артикли: "Articles",
  Времена: "Tenses",
  Предлоги: "Prepositions",
  "Порядок слов": "Word order",
  "Повторить сегодня": "Due today",
  Освоено: "Mastered",
};
function useFilter() {
  const [filter, setFilter] = useState(() =>
    typeof window === "undefined"
      ? "All"
      : new URLSearchParams(window.location.search).get("filter") || "All",
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
    <div className="filters" aria-label="Filters">
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
    Grammar: "Grammar",
    Vocabulary: "Vocabulary",
    Articles: "Articles",
    Tenses: "Tenses",
    Prepositions: "Prepositions",
    "Word order": "Word order",
  };
  const items = data.mistakes.filter(
    (m) => filter === "All" || m.type === types[filter],
  );
  return (
    <>
      <Heading
        eyebrow="YOUR PERSONAL MISTAKE BANK"
        title="Make your mistakes work for you."
      >
        Review what comes up in your conversations and watch your progress.
      </Heading>
      <div className="toolbar">
        <Filters
          values={["All", ...Object.keys(types)]}
          active={filter}
          onChange={(v) => {
            setFilter(v);
            setPage(0);
          }}
        />
        {data.mistakes.length > 0 && (
          <Link className="button" href="/practice">
            Practice <ArrowRight size={16} />
          </Link>
        )}
      </div>
      {!items.length ? (
        <section className="panel">
          <Empty
            title={
              data.mistakes.length
                ? "No mistakes in this category"
                : "A fresh page for now"
            }
            href="/chat"
            label="Start a conversation"
          >
            Talk to your coach and significant mistakes will appear here
            automatically.
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
                    Occurred {number(m.occurrences)}{" "}
                    {plural(m.occurrences, "time", "times")}
                  </small>
                </div>
                <div className="correction-pair">
                  <div>
                    <span>YOUR SENTENCE</span>
                    <p>
                      <del>{m.original}</del>
                    </p>
                  </div>
                  <ArrowRight size={20} />
                  <div>
                    <span>CORRECTED VERSION</span>
                    <p>{m.corrected}</p>
                  </div>
                </div>
                <p className="explanation">{m.explanation}</p>
                <div className="mistake-bottom">
                  <div>
                    <small>Mastery · {m.mastery}%</small>
                    <Meter value={m.mastery} label={`Mastery ${m.category}`} />
                  </div>
                  <Link
                    className="text-link"
                    href={`/practice?source=mistake&id=${m._id}`}
                  >
                    Review <ArrowRight size={16} />
                  </Link>
                </div>
              </article>
            ))}
          </div>
          <Pagination page={page} count={items.length} setPage={setPage} />
        </>
      )}
      <p className="helper">
        Showing up to 500 frequent mistakes out of {data.counts.mistakes}.
        Practice uses your entire mistake bank.
      </p>
    </>
  );
}
function Vocabulary({ data }: { data: AppData }) {
  const [filter, setFilter] = useFilter();
  const [page, setPage] = useState(0);
  const items = data.words.filter((w) =>
    filter === "Mastered"
      ? w.mastery === 100
      : filter === "Due today"
        ? new Date(w.nextReview) <= new Date()
        : true,
  );
  return (
    <>
      <Heading
        eyebrow="WORDS FROM YOUR LIFE"
        title="Your words. Your vocabulary."
      >
        Save words from conversations with “+” and review them when they’re due.
      </Heading>
      <div className="toolbar">
        <Filters
          values={["All", "Due today", "Mastered"]}
          active={filter}
          onChange={(v) => {
            setFilter(v);
            setPage(0);
          }}
        />
        {data.words.length > 0 && (
          <Link className="button" href="/practice?source=word">
            Review words <ArrowRight size={16} />
          </Link>
        )}
      </div>
      {!items.length ? (
        <section className="panel">
          <Empty
            title="No words here yet"
            href="/chat"
            label="Go to conversation"
          >
            Add useful words from your coach’s replies to your vocabulary.
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
                <Meter value={w.mastery} label={`Mastery ${w.word}`} />
                <div className="section-heading">
                  <small>
                    {w.mastery}% · Review {date(w.nextReview)}
                  </small>
                  <Link
                    className="text-link"
                    href={`/practice?source=word&id=${w._id}`}
                  >
                    Review
                  </Link>
                </div>
              </article>
            ))}
          </div>
          <Pagination page={page} count={items.length} setPage={setPage} />
        </>
      )}
      <p className="helper">
        Showing up to 500 recent words out of {data.counts.words}. Reviews use
        your entire vocabulary.
      </p>
    </>
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
      setError("Enter an answer or choose an option.");
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
        eyebrow="PERSONAL PRACTICE"
        title="Another try. A little better."
      >
        Exercises based on your mistakes and words. Learn at your pace, with
        just the theory you need.
      </Heading>
      <section className="panel practice-panel">
        {!task ? (
          <>
            <span className="practice-icon">
              <Target size={32} />
            </span>
            <h2>Practice what you’ll actually use</h2>
            <p>
              Start with what’s due for review. Earn 20 XP for a correct answer
              or 5 XP for trying.
            </p>
            <Button busy={busy} onClick={() => void start()}>
              Get an exercise <ArrowRight size={17} />
            </Button>
          </>
        ) : (
          <form noValidate onSubmit={submit}>
            <span className="tag">
              {
                {
                  translation: "TRANSLATION",
                  gap: "FILL IN THE GAP",
                  fix: "FIX THE MISTAKE",
                  choice: "CHOOSE AN OPTION",
                  free: "FREE RESPONSE",
                }[task.type]
              }
            </span>
            <h2>{task.prompt}</h2>
            {task.options.length ? (
              <fieldset disabled={busy || !!result}>
                <legend>Your answer</legend>
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
                Your answer
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
                  {result.correct ? "You got it! +20 XP" : "Good try. +5 XP"}
                </strong>
                <p>{result.feedback}</p>
                <small>Example answer</small>
                <p>{result.answer}</p>
                <Button busy={busy} onClick={() => void start()} type="button">
                  Next exercise <ArrowRight size={17} />
                </Button>
              </div>
            ) : (
              <Button busy={busy} type="submit">
                Check answer <Check size={17} />
              </Button>
            )}
          </form>
        )}
        <div id="practice-status" className="form-status" role="status">
          {error && <span className="error">{error}</span>}
        </div>
        <Link className="text-link" href="/chat">
          Back to conversation
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
        eyebrow="KEEP SHOWING UP. KEEP IMPROVING."
        title="Your English is growing."
      >
        Real results from your conversations and reviews.
      </Heading>
      <div className="stats-grid">
        <Stat
          icon={<Flame />}
          label="Longest streak"
          value={`${data.user.longestStreak}`}
          note="Consecutive practice days"
        />
        <Stat
          icon={<MessageCircle />}
          label="Messages"
          value={number(data.activity.reduce((n, a) => n + a.messages, 0))}
          note="Over 30 active days"
        />
        <Stat
          icon={<Check />}
          label="Exercises"
          value={number(total)}
          note="Over 30 active days"
        />
        <Stat
          icon={<TrendingUp />}
          label="Correct answers"
          value={total ? `${Math.round((correct / total) * 100)}%` : "—"}
          note="Over 30 active days"
        />
      </div>
      <section className="panel">
        <div className="section-heading">
          <h2>A little every day</h2>
          <span className="tag">14 DAYS · XP</span>
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
          <h2>Topic mastery</h2>
          <span className="muted">Based on your reviews</span>
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
          <Empty title="Start with a little practice">
            Your progress by topic will appear here after conversations and
            exercises.
          </Empty>
        )}
        <p className="helper">
          This estimates your progress in reviewing mistakes; it is not a CEFR
          assessment.
        </p>
      </section>
      <Link className="text-link" href="/profile">
        Learning settings <ArrowRight size={16} />
      </Link>
    </>
  );
}
