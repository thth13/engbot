"use client";

import { useEffect, useRef, useState, type FormEvent } from "react";
import { LoaderCircle, Search, X } from "lucide-react";
import { adminTables, type AdminData } from "@/lib/uzerz-schema";
import { Button, Empty, Pagination } from "./ui";

const formatNumber = (value: number) =>
  new Intl.NumberFormat("en-US").format(value);
const formatDate = (value: string) => {
  const date = new Date(value);
  return Number.isNaN(date.getTime())
    ? value
    : new Intl.DateTimeFormat("en-US", {
        dateStyle: "medium",
        timeStyle: "short",
        timeZone: "Europe/Kyiv",
      }).format(date);
};
const systemCollections: Record<string, string> = {
  eventLimits: "Event logging limits",
  limits: "Daily AI limits",
  trialUsage: "Trial usage",
  telegramInbox: "Telegram inbox",
  notifications: "Admin notifications",
  notificationLimits: "Notification limits",
  updates: "Telegram updates",
};

function initialState() {
  const params = new URLSearchParams(
    typeof window === "undefined" ? "" : window.location.search,
  );
  const table = adminTables.some((t) => t.key === params.get("table"))
    ? params.get("table")!
    : "users";
  return {
    table,
    page: Math.min(
      1000000,
      Math.max(0, Math.floor(Number(params.get("page")) || 0)),
    ),
    pageSize: [10, 25, 50].includes(Number(params.get("size")))
      ? Number(params.get("size"))
      : 25,
    direction: params.get("order") === "oldest" ? "oldest" : "newest",
  };
}

export function Uzerz() {
  const [view, setView] = useState(initialState);
  const [query, setQuery] = useState("");
  const [committedQuery, setCommittedQuery] = useState("");
  const [data, setData] = useState<AdminData | null>(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(true);
  const [retry, setRetry] = useState(0);
  const input = useRef<HTMLInputElement>(null);
  const table = adminTables.find((t) => t.key === view.table)!;

  useEffect(() => {
    const onPopState = () => {
      setData(null);
      setBusy(true);
      setError("");
      setView(initialState());
      setQuery("");
      setCommittedQuery("");
    };
    window.addEventListener("popstate", onPopState);
    return () => window.removeEventListener("popstate", onPopState);
  }, []);

  useEffect(() => {
    const url = new URL(window.location.href);
    url.searchParams.set("table", view.table);
    url.searchParams.set("page", String(view.page));
    url.searchParams.set("size", String(view.pageSize));
    url.searchParams.set("order", view.direction);
    window.history.replaceState(null, "", url);
    let active = true;
    const controller = new AbortController();
    const timeout = window.setTimeout(
      () =>
        controller.abort(new DOMException("Request timed out", "TimeoutError")),
      25000,
    );
    fetch("/api/uzerz", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ...view, query: committedQuery }),
      signal: controller.signal,
      cache: "no-store",
    })
      .then(async (response) => {
        const result = await response.json();
        if (!active || controller.signal.aborted) return;
        if (!response.ok) {
          throw new Error(result.error || "Could not load the table.");
        }
        setData(result as AdminData);
        if (result.page !== view.page) {
          const currentUrl = new URL(window.location.href);
          currentUrl.searchParams.set("page", String(result.page));
          window.history.replaceState(null, "", currentUrl);
        }
      })
      .catch((cause: unknown) => {
        if (!active) return;
        if (
          controller.signal.aborted &&
          controller.signal.reason?.name !== "TimeoutError"
        )
          return;
        setData(null);
        setError(
          controller.signal.reason?.name === "TimeoutError"
            ? "The request timed out. Try again."
            : cause instanceof Error
              ? cause.message
              : "Could not load the table. Try again.",
        );
      })
      .finally(() => {
        clearTimeout(timeout);
        if (
          active &&
          (!controller.signal.aborted ||
            controller.signal.reason?.name === "TimeoutError")
        )
          setBusy(false);
      });
    return () => {
      active = false;
      clearTimeout(timeout);
      controller.abort();
    };
  }, [view, committedQuery, retry]);

  function beginRequest() {
    setBusy(true);
    setError("");
    setData(null);
  }
  function refresh() {
    beginRequest();
    setRetry((n) => n + 1);
  }
  function changeView(next: Partial<typeof view>) {
    beginRequest();
    setView((current) => ({ ...current, ...next, page: 0 }));
  }
  function search(event: FormEvent) {
    event.preventDefault();
    beginRequest();
    setView((current) => ({ ...current, page: 0 }));
    setCommittedQuery(query.trim());
  }
  function clearSearch() {
    setQuery("");
    setCommittedQuery("");
    changeView({});
    input.current?.focus();
  }

  return (
    <div className="admin-page">
      <div className="heading">
        <span className="eyebrow">ADMINISTRATION · READ ONLY</span>
        <h1>Uzerz</h1>
        <p>
          Users and the learning activity behind English Coach. All timestamps
          are in Kyiv time (Europe/Kyiv).
        </p>
      </div>
      <div className="filters admin-tabs" aria-label="Data tables">
        {adminTables.map((item) => (
          <button
            key={item.key}
            aria-pressed={view.table === item.key}
            className={view.table === item.key ? "selected" : ""}
            onClick={() => {
              setQuery("");
              setCommittedQuery("");
              changeView({ table: item.key });
            }}
          >
            {item.label}
            {data && (
              <span className="admin-count">
                {formatNumber(data.counts[item.key] || 0)}
              </span>
            )}
          </button>
        ))}
      </div>
      <section
        className="panel admin-panel"
        aria-labelledby="admin-table-title"
      >
        <div className="admin-table-heading">
          <div>
            <h2 id="admin-table-title">{table.label}</h2>
            <p className="helper">
              {view.direction === "newest" ? "Newest first" : "Oldest first"} ·
              Scroll horizontally to see every column.
            </p>
          </div>
          <Button className="secondary small" busy={busy} onClick={refresh}>
            Refresh
          </Button>
        </div>
        <div className="admin-toolbar">
          <form noValidate onSubmit={search} className="admin-search">
            <label htmlFor="admin-search">
              Search {table.label.toLowerCase()}
            </label>
            <div className="admin-search-controls">
              <div className="admin-search-input">
                <Search size={17} aria-hidden="true" />
                <input
                  ref={input}
                  id="admin-search"
                  value={query}
                  maxLength={150}
                  placeholder={
                    table.key === "users"
                      ? "Name or Telegram ID"
                      : "Telegram ID or table text"
                  }
                  onChange={(event) => {
                    setQuery(event.target.value);
                    if (!event.target.value) {
                      setCommittedQuery("");
                      changeView({});
                    }
                  }}
                />
                {query && (
                  <button
                    type="button"
                    aria-label="Clear search"
                    onClick={clearSearch}
                  >
                    <X size={17} />
                  </button>
                )}
              </div>
              <Button type="submit" className="secondary small" busy={busy}>
                Search
              </Button>
            </div>
          </form>
          <label className="admin-select">
            Order
            <select
              value={view.direction}
              onChange={(event) =>
                changeView({ direction: event.target.value })
              }
            >
              <option value="newest">Newest first</option>
              <option value="oldest">Oldest first</option>
            </select>
          </label>
          <label className="admin-select">
            Rows per page
            <select
              value={view.pageSize}
              onChange={(event) =>
                changeView({ pageSize: Number(event.target.value) })
              }
            >
              {[10, 25, 50].map((size) => (
                <option key={size} value={size}>
                  {size}
                </option>
              ))}
            </select>
          </label>
        </div>
        <div className="admin-table-frame" aria-busy={busy}>
          {busy ? (
            <div className="admin-state" role="status">
              <LoaderCircle className="spin" size={22} />
              <p>Loading {table.label.toLowerCase()}…</p>
            </div>
          ) : error ? (
            <div className="admin-state">
              <p className="error" role="alert">
                {error}
              </p>
              <Button className="secondary" onClick={refresh}>
                Try again
              </Button>
            </div>
          ) : !data?.rows.length ? (
            <Empty
              title={committedQuery ? "No matching records" : "No records yet"}
            >
              {committedQuery
                ? "Try another search or clear the search field."
                : `Saved ${table.label.toLowerCase()} will appear here.`}
            </Empty>
          ) : (
            <div
              className="admin-table-scroll"
              tabIndex={0}
              role="region"
              aria-label={`${table.label} table, scroll to see more columns`}
            >
              <table className="admin-table">
                <caption className="sr-only">
                  {table.label}. Timestamps use Kyiv time (Europe/Kyiv).
                </caption>
                <thead>
                  <tr>
                    {table.columns.map((column) => (
                      <th key={column.key} scope="col">
                        {column.label}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {data.rows.map((row, index) => (
                    <tr key={row._id || index}>
                      {table.columns.map((column) => {
                        const raw = row[column.key];
                        const value =
                          raw === null || raw === undefined
                            ? "—"
                            : column.date
                              ? formatDate(raw)
                              : raw;
                        return (
                          <td key={column.key}>
                            {value.length > 180 ? (
                              <details>
                                <summary>View full content</summary>
                                <pre>{value}</pre>
                              </details>
                            ) : (
                              value
                            )}
                          </td>
                        );
                      })}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
        <Pagination
          page={data?.page ?? view.page}
          count={data?.total ?? 0}
          pageSize={view.pageSize}
          busy={busy || !data}
          setPage={(page) => {
            beginRequest();
            setView((current) => ({ ...current, page }));
          }}
        />
      </section>
      {data && !busy && (
        <section className="panel" aria-labelledby="admin-system-title">
          <h2 id="admin-system-title">System collections</h2>
          <p className="helper">
            Approximate record counts. Delivery payloads and internal request
            data stay on the server.
          </p>
          <dl className="admin-system-counts">
            {Object.entries(systemCollections).map(([key, label]) => (
              <div key={key}>
                <dt>{label}</dt>
                <dd>{formatNumber(data.counts[key] || 0)}</dd>
              </div>
            ))}
          </dl>
        </section>
      )}
    </div>
  );
}
