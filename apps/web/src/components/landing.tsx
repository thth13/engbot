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
      Start in Telegram
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
        <Link className="brand" href="/" aria-label="English Coach — home">
          <span className="brand-mark">e.</span> English Coach
        </Link>
        <span className="landing-header-note">
          Your English coach in Telegram
        </span>
      </header>

      <main id="main-content">
        <section className="landing-hero" aria-labelledby="landing-title">
          <div className="landing-intro">
            <span className="landing-eyebrow">
              <MessageCircle size={15} aria-hidden="true" /> English starts with
              a conversation
            </span>
            <h1 id="landing-title">
              Your English.
              <br />
              <span>Better with every message.</span>
            </h1>
            <p className="landing-lead">
              Chat with the bot in English, understand your mistakes, and put
              what you learn into practice. Right in Telegram.
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
              Open the bot → tap “Start” → begin a conversation
            </p>
          </div>

          <aside
            className="landing-example"
            aria-label="Example of an English sentence correction"
          >
            <div className="landing-example-heading">
              <Sparkles size={18} aria-hidden="true" />
              <span>One mistake. A new insight.</span>
            </div>
            <p className="landing-example-label">You write</p>
            <p className="landing-sentence" lang="en">
              Yesterday I <del>go</del> to the shop.
            </p>
            <ArrowDown
              className="landing-example-arrow"
              size={20}
              aria-hidden="true"
            />
            <p className="landing-example-label">Now it makes sense</p>
            <p className="landing-sentence landing-corrected" lang="en">
              Yesterday I <strong>went</strong> to the shop.
            </p>
            <p className="landing-explanation">
              <span lang="en">Yesterday</span> refers to the past, so we use{" "}
              <strong lang="en">went</strong> instead of{" "}
              <span lang="en">go</span>.
            </p>
            <div className="landing-example-footer">
              <BookOpen size={16} aria-hidden="true" /> Next: practice based on
              your mistakes
            </div>
            <span className="landing-example-caption">
              Learning example, not a user’s history
            </span>
          </aside>
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
        <span>English Coach</span>
        <span>Conversation → your mistakes → personal practice</span>
      </footer>
    </div>
  );
}
