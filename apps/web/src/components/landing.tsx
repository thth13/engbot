"use client";

import {
  ArrowDown,
  ArrowRight,
  BookOpen,
  Check,
  MessageCircle,
  Send,
  Sparkles,
} from "lucide-react";
import Link from "next/link";
import { trackEvent } from "@/lib/track-event";

function BotLink({ botUrl }: { botUrl: string | null }) {
  return botUrl ? (
    <a
      className="button landing-cta"
      href={botUrl}
      onClick={() => trackEvent("telegram_click", crypto.randomUUID())}
    >
      <Send size={19} aria-hidden="true" />
      Почати в Telegram
      <ArrowRight size={19} aria-hidden="true" />
    </a>
  ) : (
    <p className="landing-unavailable" role="status">
      Бот незабаром буде доступний. Завітайте пізніше.
    </p>
  );
}

export function Landing({ botUrl }: { botUrl: string | null }) {
  return (
    <div className="landing">
      <header className="landing-header">
        <Link className="brand" href="/" aria-label="English Coach — головна">
          <span className="brand-mark">e.</span> English Coach
        </Link>
        <span className="landing-header-note">
          Ваш English coach у Telegram
        </span>
      </header>

      <main id="main-content">
        <section className="landing-hero" aria-labelledby="landing-title">
          <div className="landing-intro">
            <span className="landing-eyebrow">
              <MessageCircle size={15} aria-hidden="true" /> Англійська
              починається з розмови
            </span>
            <h1 id="landing-title">
              Ваша англійська.
              <br />
              <span>Краща з кожним повідомленням.</span>
            </h1>
            <p className="landing-lead">
              Спілкуйтеся з ботом англійською, розбирайте свої помилки й
              закріплюйте їх у практиці. Просто у вашому Telegram.
            </p>
            <ul className="landing-benefits" aria-label="Головні переваги">
              <li>
                <Check size={17} aria-hidden="true" /> Розмови під ваш рівень та
                інтереси
              </li>
              <li>
                <Check size={17} aria-hidden="true" /> Зрозумілі пояснення
                помилок
              </li>
              <li>
                <Check size={17} aria-hidden="true" /> Практика саме того, що
                вам потрібно
              </li>
            </ul>
            <BotLink botUrl={botUrl} />
            <p className="landing-cta-note">
              Відкрийте бота → натисніть «Старт» → почніть розмову
            </p>
          </div>

          <aside
            className="landing-example"
            aria-label="Приклад виправлення англійського речення"
          >
            <div className="landing-example-heading">
              <Sparkles size={18} aria-hidden="true" />
              <span>Одна помилка. Нове розуміння.</span>
            </div>
            <p className="landing-example-label">Ви пишете</p>
            <p className="landing-sentence" lang="en">
              Yesterday I <del>go</del> to the shop.
            </p>
            <ArrowDown
              className="landing-example-arrow"
              size={20}
              aria-hidden="true"
            />
            <p className="landing-example-label">Тепер зрозуміло</p>
            <p className="landing-sentence landing-corrected" lang="en">
              Yesterday I <strong>went</strong> to the shop.
            </p>
            <p className="landing-explanation">
              <span lang="en">Yesterday</span> — це минуле. Тому замість{" "}
              <span lang="en">go</span> використовуємо{" "}
              <strong lang="en">went</strong>.
            </p>
            <div className="landing-example-footer">
              <BookOpen size={16} aria-hidden="true" /> Далі — практика на ваших
              помилках
            </div>
            <span className="landing-example-caption">
              Приклад навчання, а не історія користувача
            </span>
          </aside>
        </section>

        <section
          className="landing-details"
          aria-labelledby="landing-details-title"
        >
          <div className="landing-section-heading">
            <span className="eyebrow">ВІД РОЗМОВИ ДО ВПЕВНЕНОСТІ</span>
            <h2 id="landing-details-title">
              Не просто виправлення.
              <br />
              Зрозумілий наступний крок.
            </h2>
          </div>
          <div className="landing-detail-grid">
            <article>
              <MessageCircle size={24} aria-hidden="true" />
              <h3>Є про що поговорити</h3>
              <p>
                Бот підбирає теми під ваші інтереси й рівень. Практикуйте
                англійську в розмові, а не лише в окремих вправах.
              </p>
            </article>
            <article>
              <Sparkles size={24} aria-hidden="true" />
              <h3>Помилки стають підказками</h3>
              <p>
                Отримуйте виправлення та пояснення зрозумілою мовою. Ваші
                помилки зберігаються в особистому кабінеті.
              </p>
            </article>
            <article>
              <BookOpen size={24} aria-hidden="true" />
              <h3>Знання залишаються з вами</h3>
              <p>
                Повторюйте слова й тренуйте власні помилки у Mini App.
                Відстежуйте прогрес і повертайтеся до того, що потребує уваги.
              </p>
            </article>
          </div>
        </section>

        <section
          className="landing-finish"
          aria-labelledby="landing-finish-title"
        >
          <div>
            <h2 id="landing-finish-title">Почніть з одного повідомлення.</h2>
            <p>Оберіть рівень та інтереси в боті. Він запропонує першу тему.</p>
          </div>
          <BotLink botUrl={botUrl} />
        </section>
      </main>
      <footer className="landing-footer">
        <span>English Coach</span>
        <span>Розмова → ваші помилки → персональна практика</span>
      </footer>
    </div>
  );
}
