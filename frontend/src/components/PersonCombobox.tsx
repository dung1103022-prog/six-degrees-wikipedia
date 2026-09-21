// The Start/End Person field with an A–Z suggestion dropdown (design request, 2026-09-21). Opens on
// focus, filters by substring as the user types, arrow keys + Enter/Escape, click or mousedown to
// pick. The list itself comes from ../lib/people (one GET /api/people, cached, filtered client-side —
// no new backend surface, see that file's comment and SPEC.md v2.16).
import { useEffect, useMemo, useRef, useState } from "react";
import { loadPeople } from "../lib/people";

const MAX_SUGGESTIONS = 30;

interface Props {
  id: string;
  label: string;
  value: string;
  onChange: (value: string) => void;
}

export default function PersonCombobox({ id, label, value, onChange }: Props) {
  const [people, setPeople] = useState<readonly string[]>([]);
  const [open, setOpen] = useState(false);
  const [highlight, setHighlight] = useState(0);
  const root = useRef<HTMLDivElement>(null);
  const listboxId = `${id}-listbox`;

  useEffect(() => {
    let active = true;
    loadPeople().then((names) => {
      if (active) setPeople(names);
    });
    return () => {
      active = false;
    };
  }, []);

  const matches = useMemo(() => {
    const q = value.trim().toLowerCase();
    const pool = q === "" ? people : people.filter((name) => name.toLowerCase().includes(q));
    return pool.slice(0, MAX_SUGGESTIONS);
  }, [people, value]);

  useEffect(() => {
    if (!open) return;
    function onDocPointerDown(event: PointerEvent): void {
      if (root.current && !root.current.contains(event.target as Node)) setOpen(false);
    }
    document.addEventListener("pointerdown", onDocPointerDown);
    return () => document.removeEventListener("pointerdown", onDocPointerDown);
  }, [open]);

  function select(name: string): void {
    onChange(name);
    setOpen(false);
  }

  function onKeyDown(event: React.KeyboardEvent<HTMLInputElement>): void {
    if (!open) {
      if (event.key === "ArrowDown" || event.key === "ArrowUp") setOpen(true);
      return;
    }
    if (event.key === "ArrowDown") {
      event.preventDefault();
      setHighlight((h) => Math.min(h + 1, Math.max(matches.length - 1, 0)));
    } else if (event.key === "ArrowUp") {
      event.preventDefault();
      setHighlight((h) => Math.max(h - 1, 0));
    } else if (event.key === "Enter") {
      if (matches[highlight]) {
        event.preventDefault();
        select(matches[highlight]!);
      }
    } else if (event.key === "Escape") {
      setOpen(false);
    }
  }

  return (
    <div className="field combobox" ref={root}>
      <label htmlFor={id}>{label}</label>
      <input
        id={id}
        role="combobox"
        aria-expanded={open}
        aria-controls={listboxId}
        aria-autocomplete="list"
        autoComplete="off"
        value={value}
        onChange={(e) => {
          onChange(e.target.value);
          setOpen(true);
          setHighlight(0);
        }}
        onFocus={() => setOpen(true)}
        onClick={() => setOpen(true)} // clicking an already-focused input fires no new focus event
        onKeyDown={onKeyDown}
      />
      {open && matches.length > 0 ? (
        <ul id={listboxId} role="listbox" className="combobox-list">
          {matches.map((name, i) => (
            <li
              key={name}
              role="option"
              aria-selected={i === highlight}
              className={i === highlight ? "combobox-option combobox-option--active" : "combobox-option"}
              onMouseDown={(e) => {
                e.preventDefault(); // keep focus on the input; a blur before the click would drop the selection
                select(name);
              }}
              onMouseEnter={() => setHighlight(i)}
            >
              {name}
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}
