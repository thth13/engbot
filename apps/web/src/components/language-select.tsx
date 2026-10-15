"use client";

import { useEffect, useId, useRef, useState } from "react";
import { Check, ChevronDown, X } from "lucide-react";

const languages = [
  "Ukrainian",
  "Russian",
  "English",
  "Belarusian",
  "Polish",
  "German",
  "French",
  "Spanish",
  "Italian",
  "Portuguese",
  "Arabic",
  "Armenian",
  "Azerbaijani",
  "Albanian",
  "Amharic",
  "Afrikaans",
  "Basque",
  "Bengali",
  "Burmese",
  "Bulgarian",
  "Bosnian",
  "Hungarian",
  "Vietnamese",
  "Greek",
  "Georgian",
  "Gujarati",
  "Danish",
  "Zulu",
  "Hebrew",
  "Indonesian",
  "Irish",
  "Icelandic",
  "Kazakh",
  "Kannada",
  "Catalan",
  "Kyrgyz",
  "Chinese",
  "Korean",
  "Kurdish",
  "Khmer",
  "Lao",
  "Latvian",
  "Lithuanian",
  "Macedonian",
  "Malay",
  "Malayalam",
  "Maltese",
  "Marathi",
  "Mongolian",
  "Nepali",
  "Dutch",
  "Norwegian",
  "Punjabi",
  "Persian",
  "Pashto",
  "Romanian",
  "Serbian",
  "Sinhala",
  "Slovak",
  "Slovenian",
  "Somali",
  "Swahili",
  "Tajik",
  "Thai",
  "Tamil",
  "Tatar",
  "Telugu",
  "Turkish",
  "Turkmen",
  "Uzbek",
  "Urdu",
  "Filipino",
  "Finnish",
  "Hindi",
  "Croatian",
  "Czech",
  "Swedish",
  "Estonian",
  "Japanese",
];

// Keep saved Ukrainian and Russian profile values readable in English.
const languageLabels: Record<string, string> = {
  Українська: "Ukrainian",
  Російська: "Russian",
  Англійська: "English",
  Білоруська: "Belarusian",
  Польська: "Polish",
  Німецька: "German",
  Французька: "French",
  Іспанська: "Spanish",
  Італійська: "Italian",
  Португальська: "Portuguese",
  Арабська: "Arabic",
  Вірменська: "Armenian",
  Азербайджанська: "Azerbaijani",
  Албанська: "Albanian",
  Амхарська: "Amharic",
  Африкаанс: "Afrikaans",
  Баскська: "Basque",
  Бенгальська: "Bengali",
  Бірманська: "Burmese",
  Болгарська: "Bulgarian",
  Боснійська: "Bosnian",
  Угорська: "Hungarian",
  "В’єтнамська": "Vietnamese",
  Грецька: "Greek",
  Грузинська: "Georgian",
  Гуджараті: "Gujarati",
  Данська: "Danish",
  Зулу: "Zulu",
  Іврит: "Hebrew",
  Індонезійська: "Indonesian",
  Ірландська: "Irish",
  Ісландська: "Icelandic",
  Казахська: "Kazakh",
  Каннада: "Kannada",
  Каталанська: "Catalan",
  Киргизька: "Kyrgyz",
  Китайська: "Chinese",
  Корейська: "Korean",
  Курдська: "Kurdish",
  Кхмерська: "Khmer",
  Лаоська: "Lao",
  Латиська: "Latvian",
  Литовська: "Lithuanian",
  Македонська: "Macedonian",
  Малайська: "Malay",
  Малаялам: "Malayalam",
  Мальтійська: "Maltese",
  Маратхі: "Marathi",
  Монгольська: "Mongolian",
  Непальська: "Nepali",
  Нідерландська: "Dutch",
  Норвезька: "Norwegian",
  Панджабі: "Punjabi",
  Перська: "Persian",
  Пушту: "Pashto",
  Румунська: "Romanian",
  Сербська: "Serbian",
  Сингальська: "Sinhala",
  Словацька: "Slovak",
  Словенська: "Slovenian",
  Сомалійська: "Somali",
  Суахілі: "Swahili",
  Таджицька: "Tajik",
  Тайська: "Thai",
  Тамільська: "Tamil",
  Татарська: "Tatar",
  Телугу: "Telugu",
  Турецька: "Turkish",
  Туркменська: "Turkmen",
  Узбецька: "Uzbek",
  Урду: "Urdu",
  Філіппінська: "Filipino",
  Фінська: "Finnish",
  Гінді: "Hindi",
  Хорватська: "Croatian",
  Чеська: "Czech",
  Шведська: "Swedish",
  Естонська: "Estonian",
  Японська: "Japanese",
  Русский: "Russian",
  Украинский: "Ukrainian",
  Английский: "English",
  Белорусский: "Belarusian",
  Польский: "Polish",
  Немецкий: "German",
  Французский: "French",
  Испанский: "Spanish",
  Итальянский: "Italian",
  Португальский: "Portuguese",
  Арабский: "Arabic",
  Армянский: "Armenian",
  Азербайджанский: "Azerbaijani",
  Албанский: "Albanian",
  Амхарский: "Amharic",
  Баскский: "Basque",
  Бенгальский: "Bengali",
  Бирманский: "Burmese",
  Болгарский: "Bulgarian",
  Боснийский: "Bosnian",
  Венгерский: "Hungarian",
  Вьетнамский: "Vietnamese",
  Греческий: "Greek",
  Грузинский: "Georgian",
  Гуджарати: "Gujarati",
  Датский: "Danish",
  Иврит: "Hebrew",
  Индонезийский: "Indonesian",
  Ирландский: "Irish",
  Исландский: "Icelandic",
  Казахский: "Kazakh",
  Каталанский: "Catalan",
  Киргизский: "Kyrgyz",
  Китайский: "Chinese",
  Корейский: "Korean",
  Курдский: "Kurdish",
  Кхмерский: "Khmer",
  Лаосский: "Lao",
  Латышский: "Latvian",
  Литовский: "Lithuanian",
  Македонский: "Macedonian",
  Малайский: "Malay",
  Мальтийский: "Maltese",
  Маратхи: "Marathi",
  Монгольский: "Mongolian",
  Непальский: "Nepali",
  Нидерландский: "Dutch",
  Норвежский: "Norwegian",
  Панджаби: "Punjabi",
  Персидский: "Persian",
  Румынский: "Romanian",
  Сербский: "Serbian",
  Сингальский: "Sinhala",
  Словацкий: "Slovak",
  Словенский: "Slovenian",
  Сомалийский: "Somali",
  Суахили: "Swahili",
  Таджикский: "Tajik",
  Тайский: "Thai",
  Тамильский: "Tamil",
  Татарский: "Tatar",
  Турецкий: "Turkish",
  Туркменский: "Turkmen",
  Узбекский: "Uzbek",
  Филиппинский: "Filipino",
  Финский: "Finnish",
  Хинди: "Hindi",
  Хорватский: "Croatian",
  Чешский: "Czech",
  Шведский: "Swedish",
  Эстонский: "Estonian",
  Японский: "Japanese",
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
          .toLocaleLowerCase("en")
          .includes(query.trim().toLocaleLowerCase("en")),
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
          placeholder="Find your language"
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
                        language.toLocaleLowerCase("en") ===
                        query.trim().toLocaleLowerCase("en"),
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
              aria-label="Clear language"
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
            aria-label={open ? "Hide language list" : "Show language list"}
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
            <p role="status">Language not found. Try another name.</p>
          )}
        </div>
      )}
    </div>
  );
}
