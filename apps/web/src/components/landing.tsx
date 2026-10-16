"use client";

import {
  ArrowRight,
  BatteryFull,
  BookOpen,
  Check,
  CheckCheck,
  ChevronLeft,
  MessageCircle,
  Mic,
  MoreVertical,
  Paperclip,
  Signal,
  Smile,
  Sparkles,
  Wifi,
} from "lucide-react";
import Link from "next/link";
import { trackEvent } from "@/lib/track-event";

function TelegramLogo({ size = 24 }: { size?: number }) {
  return (
    <svg
      className="landing-telegram-logo"
      width={size}
      height={size}
      viewBox="0 0 24 24"
      aria-hidden="true"
    >
      <circle cx="12" cy="12" r="12" fill="#229ED9" />
      <path
        d="m5.1 11.5 13-5c.6-.2 1 .1.8.9l-2.2 10.3c-.2.7-.6.9-1.2.5l-3.4-2.5-1.6 1.6c-.2.2-.3.3-.6.3l.2-3.5 6.4-5.8c.3-.3-.1-.4-.4-.2l-7.9 5-3.4-1.1c-.7-.2-.7-.6.3-.9Z"
        fill="#fff"
      />
    </svg>
  );
}

function BotAvatar({ className = "" }: { className?: string }) {
  return (
    <svg
      className={`landing-bot-avatar ${className}`}
      viewBox="0 0 120 120"
      aria-hidden="true"
    >
      <circle cx="60" cy="60" r="60" fill="var(--primary)" />
      <path
        d="M60 22C36 22 18 38 18 59c0 12 5 22 14 29l-6 14 19-8c5 2 10 2 15 2 24 0 43-16 43-37S84 22 60 22Z"
        fill="var(--ink)"
      />
      <text
        x="34"
        y="78"
        fill="var(--primary)"
        fontFamily="Georgia, serif"
        fontSize="76"
        fontWeight="700"
        letterSpacing="-5"
      >
        e.
      </text>
    </svg>
  );
}

function TelegramPreview() {
  return (
    <figure className="landing-phone-preview">
      <div className="landing-phone">
        <div className="landing-phone-screen">
          <div className="landing-phone-status" aria-hidden="true">
            <span>9:41</span>
            <span className="landing-phone-island" />
            <span className="landing-phone-status-icons">
              <Signal size={14} />
              <Wifi size={14} />
              <BatteryFull size={19} />
            </span>
          </div>
          <div className="landing-telegram-header">
            <ChevronLeft
              className="landing-telegram-icon"
              size={24}
              aria-hidden="true"
            />
            <BotAvatar />
            <div className="landing-telegram-identity">
              <strong>English Mova Bot</strong>
              <span>bot</span>
            </div>
            <MoreVertical
              className="landing-telegram-icon"
              size={20}
              aria-hidden="true"
            />
          </div>
          <div
            className="landing-telegram-chat"
            role="group"
            aria-label="Example conversation with English Mova Bot"
          >
            <span className="landing-chat-day">Today</span>
            <div className="landing-chat-message landing-chat-incoming">
              <p>Hey! Tell me about your day. What did you do? 💬</p>
              <span className="landing-chat-time">9:41</span>
            </div>
            <div className="landing-chat-message landing-chat-outgoing">
              <p>Yesterday I go to the shop and buy a book.</p>
              <span className="landing-chat-time">
                9:41 <CheckCheck size={14} aria-hidden="true" />
              </span>
            </div>
            <div className="landing-chat-message landing-chat-incoming">
              <p>Nice! Here’s a small correction ✨</p>
              <p className="landing-chat-correction">
                Yesterday I <strong>went</strong> to the shop and{" "}
                <strong>bought</strong> a book.
              </p>
              <p className="landing-chat-explanation" lang="uk">
                Коли говоримо про минуле, використовуємо Past Simple: go → went,
                buy → bought.
              </p>
              <p>What kind of book did you buy?</p>
              <span className="landing-chat-time">9:41</span>
            </div>
            <div className="landing-chat-message landing-chat-outgoing">
              <p>A detective story! I love mysteries 🔍</p>
              <span className="landing-chat-time">
                9:42 <CheckCheck size={14} aria-hidden="true" />
              </span>
            </div>
          </div>
          <div className="landing-telegram-composer" aria-hidden="true">
            <Paperclip size={21} />
            <span>Message</span>
            <Smile size={21} />
            <Mic size={21} />
          </div>
          <div className="landing-phone-home" aria-hidden="true">
            <span />
          </div>
        </div>
      </div>
      <figcaption className="landing-example-caption">
        A little practice. A real conversation.
        <span>Example chat · explanations in your language</span>
      </figcaption>
    </figure>
  );
}

function BotLink({ botUrl }: { botUrl: string | null }) {
  return botUrl ? (
    <a
      className="button landing-cta"
      href={botUrl}
      onClick={() => trackEvent("telegram_click", crypto.randomUUID())}
    >
      Open bot in Telegram
      <ArrowRight size={19} aria-hidden="true" />
    </a>
  ) : (
    <p className="landing-unavailable" role="status">
      The bot will be available soon. Please check back later.
    </p>
  );
}

export function Landing({ botUrl }: { botUrl: string | null }) {
  return (
    <div className="landing">
      <header className="landing-header">
        <Link className="brand" href="/" aria-label="English Mova Bot — home">
          <BotAvatar className="landing-brand-avatar" /> English Mova Bot
        </Link>
        <span className="landing-header-note">
          Your English-learning Telegram bot
        </span>
      </header>

      <main id="main-content">
        <section className="landing-hero" aria-labelledby="landing-title">
          <div className="landing-intro">
            <span className="landing-eyebrow">
              <TelegramLogo size={28} /> Your English coach is a Telegram bot
            </span>
            <h1 id="landing-title">
              Better English.
              <br />
              <span>With a Telegram bot.</span>
            </h1>
            <p className="landing-lead">
              Meet English Mova Bot, your personal English coach in Telegram.
              Message the bot, get clear corrections, and practice what you
              learn — right in your Telegram chat.
            </p>
            <ul className="landing-benefits" aria-label="Key benefits">
              <li>
                <Check size={17} aria-hidden="true" /> Conversations for your
                level and interests
              </li>
              <li>
                <Check size={17} aria-hidden="true" /> Clear explanations of
                your mistakes
              </li>
              <li>
                <Check size={17} aria-hidden="true" /> Practice focused on what
                you need
              </li>
            </ul>
            <BotLink botUrl={botUrl} />
            <p className="landing-cta-note">
              Open Telegram → tap “Start” in the bot → chat in English
            </p>
          </div>

          <TelegramPreview />
        </section>

        <section
          className="landing-details"
          aria-labelledby="landing-details-title"
        >
          <div className="landing-section-heading">
            <span className="eyebrow">FROM CONVERSATION TO CONFIDENCE</span>
            <h2 id="landing-details-title">
              More than corrections.
              <br />A clear next step.
            </h2>
          </div>
          <div className="landing-detail-grid">
            <article>
              <MessageCircle size={24} aria-hidden="true" />
              <h3>Something to talk about</h3>
              <p>
                The bot chooses topics for your interests and level. Practice
                English through conversation as well as focused exercises.
              </p>
            </article>
            <article>
              <Sparkles size={24} aria-hidden="true" />
              <h3>Mistakes become guidance</h3>
              <p>
                Get corrections and explanations in a language you understand.
                Your mistakes are saved in your learning space.
              </p>
            </article>
            <article>
              <BookOpen size={24} aria-hidden="true" />
              <h3>Make learning stick</h3>
              <p>
                Review words and practice your own mistakes in the Mini App.
                Track your progress and revisit what needs attention.
              </p>
            </article>
          </div>
        </section>

        <section
          className="landing-finish"
          aria-labelledby="landing-finish-title"
        >
          <div>
            <h2 id="landing-finish-title">Start with one message.</h2>
            <p>
              Choose your level and interests in the bot. It will suggest your
              first topic.
            </p>
          </div>
          <BotLink botUrl={botUrl} />
        </section>
      </main>
      <footer className="landing-footer">
        <span>English Mova Bot</span>
        <span>Conversation → your mistakes → personal practice</span>
      </footer>
    </div>
  );
}
