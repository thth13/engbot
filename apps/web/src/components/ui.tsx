import type { ButtonHTMLAttributes, ReactNode } from "react";
import {
  ArrowRight,
  LoaderCircle,
  ChevronLeft,
  ChevronRight,
} from "lucide-react";
import Link from "next/link";
export function Button({
  busy,
  children,
  className = "",
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & { busy?: boolean }) {
  return (
    <button
      {...props}
      disabled={props.disabled || busy}
      aria-busy={busy}
      className={`button ${className}`}
    >
      <span className={busy ? "invisible" : ""}>{children}</span>
      {busy && <LoaderCircle className="button-spinner spin" size={18} />}
    </button>
  );
}
export function Empty({
  title,
  children,
  href,
  label,
}: {
  title: string;
  children: ReactNode;
  href?: string;
  label?: string;
}) {
  return (
    <div className="empty">
      <div className="empty-mark">Aa</div>
      <h3>{title}</h3>
      <p>{children}</p>
      {href && (
        <Link className="button" href={href}>
          {label}
          <ArrowRight size={17} />
        </Link>
      )}
    </div>
  );
}
export function Meter({ value, label }: { value: number; label: string }) {
  return (
    <div
      className="meter"
      role="progressbar"
      aria-label={label}
      aria-valuenow={value}
      aria-valuemin={0}
      aria-valuemax={100}
    >
      <span style={{ width: `${Math.max(0, Math.min(100, value))}%` }} />
    </div>
  );
}

export function Pagination({
  page,
  count,
  setPage,
  pageSize = 10,
  busy = false,
}: {
  page: number;
  count: number;
  setPage: (v: number) => void;
  pageSize?: number;
  busy?: boolean;
}) {
  return (
    <div className="pagination" aria-label="Pagination">
      <small role="status">
        {busy
          ? "—"
          : `${count ? page * pageSize + 1 : 0}–${Math.min((page + 1) * pageSize, count)} of ${count}`}
      </small>
      <Button
        className="secondary small"
        disabled={busy || page === 0}
        onClick={() => setPage(page - 1)}
        aria-label="Previous page"
      >
        <ChevronLeft size={16} />
      </Button>
      <Button
        className="secondary small"
        disabled={busy || (page + 1) * pageSize >= count}
        onClick={() => setPage(page + 1)}
        aria-label="Next page"
      >
        <ChevronRight size={16} />
      </Button>
    </div>
  );
}
