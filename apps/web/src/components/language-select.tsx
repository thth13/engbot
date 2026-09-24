"use client";

import { useEffect, useId, useRef, useState } from "react";
import { Check, ChevronDown, X } from "lucide-react";

const languages = [
  "Русский",
  "Украинский",
  "Английский",
  "Белорусский",
  "Польский",
  "Немецкий",
  "Французский",
  "Испанский",
  "Итальянский",
  "Португальский",
  "Арабский",
  "Армянский",
  "Азербайджанский",
  "Албанский",
  "Амхарский",
  "Африкаанс",
  "Баскский",
  "Бенгальский",
  "Бирманский",
  "Болгарский",
  "Боснийский",
  "Венгерский",
  "Вьетнамский",
  "Греческий",
  "Грузинский",
  "Гуджарати",
  "Датский",
  "Зулу",
  "Иврит",
  "Индонезийский",
  "Ирландский",
  "Исландский",
  "Казахский",
  "Каннада",
  "Каталанский",
  "Киргизский",
  "Китайский",
  "Корейский",
  "Курдский",
  "Кхмерский",
  "Лаосский",
  "Латышский",
  "Литовский",
  "Македонский",
  "Малайский",
  "Малаялам",
  "Мальтийский",
  "Маратхи",
  "Монгольский",
  "Непальский",
  "Нидерландский",
  "Норвежский",
  "Панджаби",
  "Персидский",
  "Пушту",
  "Румынский",
  "Сербский",
  "Сингальский",
  "Словацкий",
  "Словенский",
  "Сомалийский",
  "Суахили",
  "Таджикский",
  "Тайский",
  "Тамильский",
  "Татарский",
  "Телугу",
  "Турецкий",
  "Туркменский",
  "Узбекский",
  "Урду",
  "Филиппинский",
  "Финский",
  "Хинди",
  "Хорватский",
  "Чешский",
  "Шведский",
  "Эстонский",
  "Японский",
];

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
  const [query, setQuery] = useState(value);
  const [open, setOpen] = useState(false);
  const [filtering, setFiltering] = useState(false);
  const [active, setActive] = useState(-1);
  const options = filtering
    ? languages.filter((language) =>
        language
          .toLocaleLowerCase("ru")
          .includes(query.trim().toLocaleLowerCase("ru")),
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
          placeholder="Найдите свой язык"
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
                        language.toLocaleLowerCase("ru") ===
                        query.trim().toLocaleLowerCase("ru"),
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
              aria-label="Очистить язык"
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
            aria-label={
              open ? "Скрыть список языков" : "Показать список языков"
            }
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
                aria-selected={value === language}
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
                {value === language && <Check size={16} aria-hidden="true" />}
              </li>
            ))}
          </ul>
          {!options.length && (
            <p role="status">Язык не найден. Попробуйте другое название.</p>
          )}
        </div>
      )}
    </div>
  );
}
