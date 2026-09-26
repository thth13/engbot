"use client";

import { useEffect, useId, useRef, useState } from "react";
import { Check, ChevronDown, X } from "lucide-react";

const languages = [
  "Українська",
  "Російська",
  "Англійська",
  "Білоруська",
  "Польська",
  "Німецька",
  "Французька",
  "Іспанська",
  "Італійська",
  "Португальська",
  "Арабська",
  "Вірменська",
  "Азербайджанська",
  "Албанська",
  "Амхарська",
  "Африкаанс",
  "Баскська",
  "Бенгальська",
  "Бірманська",
  "Болгарська",
  "Боснійська",
  "Угорська",
  "В’єтнамська",
  "Грецька",
  "Грузинська",
  "Гуджараті",
  "Данська",
  "Зулу",
  "Іврит",
  "Індонезійська",
  "Ірландська",
  "Ісландська",
  "Казахська",
  "Каннада",
  "Каталанська",
  "Киргизька",
  "Китайська",
  "Корейська",
  "Курдська",
  "Кхмерська",
  "Лаоська",
  "Латиська",
  "Литовська",
  "Македонська",
  "Малайська",
  "Малаялам",
  "Мальтійська",
  "Маратхі",
  "Монгольська",
  "Непальська",
  "Нідерландська",
  "Норвезька",
  "Панджабі",
  "Перська",
  "Пушту",
  "Румунська",
  "Сербська",
  "Сингальська",
  "Словацька",
  "Словенська",
  "Сомалійська",
  "Суахілі",
  "Таджицька",
  "Тайська",
  "Тамільська",
  "Татарська",
  "Телугу",
  "Турецька",
  "Туркменська",
  "Узбецька",
  "Урду",
  "Філіппінська",
  "Фінська",
  "Гінді",
  "Хорватська",
  "Чеська",
  "Шведська",
  "Естонська",
  "Японська",
];

// Legacy profile values remain valid; render their Ukrainian labels.
const languageLabels: Record<string, string> = {
  Русский: "Російська",
  Украинский: "Українська",
  Английский: "Англійська",
  Белорусский: "Білоруська",
  Польский: "Польська",
  Немецкий: "Німецька",
  Французский: "Французька",
  Испанский: "Іспанська",
  Итальянский: "Італійська",
  Португальский: "Португальська",
  Арабский: "Арабська",
  Армянский: "Вірменська",
  Азербайджанский: "Азербайджанська",
  Албанский: "Албанська",
  Амхарский: "Амхарська",
  Африкаанс: "Африкаанс",
  Баскский: "Баскська",
  Бенгальский: "Бенгальська",
  Бирманский: "Бірманська",
  Болгарский: "Болгарська",
  Боснийский: "Боснійська",
  Венгерский: "Угорська",
  Вьетнамский: "В’єтнамська",
  Греческий: "Грецька",
  Грузинский: "Грузинська",
  Гуджарати: "Гуджараті",
  Датский: "Данська",
  Зулу: "Зулу",
  Иврит: "Іврит",
  Индонезийский: "Індонезійська",
  Ирландский: "Ірландська",
  Исландский: "Ісландська",
  Казахский: "Казахська",
  Каннада: "Каннада",
  Каталанский: "Каталанська",
  Киргизский: "Киргизька",
  Китайский: "Китайська",
  Корейский: "Корейська",
  Курдский: "Курдська",
  Кхмерский: "Кхмерська",
  Лаосский: "Лаоська",
  Латышский: "Латиська",
  Литовский: "Литовська",
  Македонский: "Македонська",
  Малайский: "Малайська",
  Малаялам: "Малаялам",
  Мальтийский: "Мальтійська",
  Маратхи: "Маратхі",
  Монгольский: "Монгольська",
  Непальский: "Непальська",
  Нидерландский: "Нідерландська",
  Норвежский: "Норвезька",
  Панджаби: "Панджабі",
  Персидский: "Перська",
  Пушту: "Пушту",
  Румынский: "Румунська",
  Сербский: "Сербська",
  Сингальский: "Сингальська",
  Словацкий: "Словацька",
  Словенский: "Словенська",
  Сомалийский: "Сомалійська",
  Суахили: "Суахілі",
  Таджикский: "Таджицька",
  Тайский: "Тайська",
  Тамильский: "Тамільська",
  Татарский: "Татарська",
  Телугу: "Телугу",
  Турецкий: "Турецька",
  Туркменский: "Туркменська",
  Узбекский: "Узбецька",
  Урду: "Урду",
  Филиппинский: "Філіппінська",
  Финский: "Фінська",
  Хинди: "Гінді",
  Хорватский: "Хорватська",
  Чешский: "Чеська",
  Шведский: "Шведська",
  Эстонский: "Естонська",
  Японский: "Японська",
  Ukrainian: "Українська",
  Russian: "Російська",
  English: "Англійська",
  Polish: "Польська",
};
export const languageLabel = (value: string) => languageLabels[value] || value;

export function LanguageSelect({
  value,
  onChange,
  labelledBy,
  invalid,
  describedBy,
}: {
  value: string;
  onChange: (value: string) => void;
  labelledBy: string;
  invalid?: boolean;
  describedBy?: string;
}) {
  const id = useId();
  const input = useRef<HTMLInputElement>(null);
  const list = useRef<HTMLUListElement>(null);
  const [query, setQuery] = useState(languageLabel(value));
  const [open, setOpen] = useState(false);
  const [filtering, setFiltering] = useState(false);
  const [active, setActive] = useState(-1);
  const options = filtering
    ? languages.filter((language) =>
        language
          .toLocaleLowerCase("uk")
          .includes(query.trim().toLocaleLowerCase("uk")),
      )
    : languages;
  const activeOption =
    open && active >= 0 && active < options.length ? active : -1;

  useEffect(() => {
    if (activeOption >= 0)
      list.current?.children[activeOption]?.scrollIntoView({
        block: "nearest",
      });
  }, [activeOption]);

  function choose(language: string) {
    onChange(language);
    setQuery(language);
    setOpen(false);
    setFiltering(false);
    setActive(-1);
  }

  return (
    <div
      className="language-select"
      onBlur={(event) => {
        if (!event.currentTarget.contains(event.relatedTarget)) setOpen(false);
      }}
    >
      <div className="language-select-control">
        <input
          ref={input}
          role="combobox"
          aria-autocomplete="list"
          aria-expanded={open}
          aria-controls={`${id}-list`}
          aria-activedescendant={
            activeOption >= 0 ? `${id}-${activeOption}` : undefined
          }
          aria-labelledby={labelledBy}
          aria-describedby={describedBy}
          aria-invalid={invalid}
          autoComplete="off"
          placeholder="Знайдіть свою мову"
          value={query}
          maxLength={40}
          onFocus={() => {
            setOpen(true);
            setFiltering(false);
            setActive(-1);
          }}
          onClick={() => setOpen(true)}
          onChange={(event) => {
            setQuery(event.target.value);
            onChange("");
            setFiltering(true);
            setOpen(true);
            setActive(-1);
          }}
          onKeyDown={(event) => {
            if (event.nativeEvent.isComposing) return;
            if (event.key === "ArrowDown" || event.key === "ArrowUp") {
              event.preventDefault();
              setOpen(true);
              setActive((current) =>
                event.key === "ArrowDown"
                  ? Math.min(current + 1, options.length - 1)
                  : Math.max(current < 0 ? options.length - 1 : current - 1, 0),
              );
            } else if (event.key === "Enter" && open) {
              event.preventDefault();
              const match =
                activeOption >= 0
                  ? options[activeOption]
                  : options.find(
                      (language) =>
                        language.toLocaleLowerCase("uk") ===
                        query.trim().toLocaleLowerCase("uk"),
                    );
              if (match) choose(match);
            } else if (event.key === "Escape" && open) {
              event.preventDefault();
              event.stopPropagation();
              setOpen(false);
              setActive(-1);
            }
          }}
        />
        <div className="language-select-tools">
          {query && (
            <button
              type="button"
              aria-label="Очистити мову"
              onClick={() => {
                setQuery("");
                onChange("");
                input.current?.focus();
                setFiltering(true);
                setActive(-1);
                setOpen(true);
              }}
            >
              <X size={16} />
            </button>
          )}
          <button
            type="button"
            aria-label={open ? "Приховати список мов" : "Показати список мов"}
            aria-expanded={open}
            aria-controls={`${id}-list`}
            onClick={() => {
              input.current?.focus();
              setOpen(!open);
              setFiltering(false);
              setActive(-1);
            }}
          >
            <ChevronDown size={18} />
          </button>
        </div>
      </div>
      {open && (
        <div className="language-select-popup">
          <ul
            id={`${id}-list`}
            role="listbox"
            aria-labelledby={labelledBy}
            ref={list}
          >
            {options.map((language, index) => (
              <li
                key={language}
                id={`${id}-${index}`}
                role="option"
                tabIndex={-1}
                aria-selected={languageLabel(value) === language}
                className={activeOption === index ? "active" : undefined}
                onPointerDown={(event) => {
                  if (event.pointerType === "mouse") event.preventDefault();
                }}
                onClick={() => {
                  input.current?.focus();
                  choose(language);
                }}
              >
                <span>{language}</span>
                {languageLabel(value) === language && (
                  <Check size={16} aria-hidden="true" />
                )}
              </li>
            ))}
          </ul>
          {!options.length && (
            <p role="status">Мову не знайдено. Спробуйте іншу назву.</p>
          )}
        </div>
      )}
    </div>
  );
}
