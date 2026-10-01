import { useEffect, useMemo, useState } from 'react';
import { DragDropProvider, useDraggable, useDroppable } from '@dnd-kit/react';

type DayKey = 'mon' | 'tue' | 'wed' | 'thu' | 'fri';
type AppTab = 'schedule' | 'staff';

type Staff = {
  id: string;
  name: string;
  color: string;
  days: Record<DayKey, boolean>;
};

type Assignment = {
  employeeId: string;
  date: string;
};

const WORK_START = '08:00';
const WORK_END = '16:30';
const LUNCH_START = '12:00';
const LUNCH_END = '12:30';
const PIXELS_PER_MINUTE = 1.25;

const DAY_KEYS: DayKey[] = ['mon', 'tue', 'wed', 'thu', 'fri'];
const DAY_LABELS: Record<DayKey, string> = {
  mon: 'Mån',
  tue: 'Tis',
  wed: 'Ons',
  thu: 'Tor',
  fri: 'Fre',
};

const SWEDISH_DAY_TO_KEY: Record<string, DayKey> = {
  måndag: 'mon',
  måndagar: 'mon',
  måndagen: 'mon',
  tisdag: 'tue',
  tisdagar: 'tue',
  tisdagen: 'tue',
  onsdag: 'wed',
  onsdagar: 'wed',
  onsdagen: 'wed',
  torsdag: 'thu',
  torsdagar: 'thu',
  torsdagen: 'thu',
  fredag: 'fri',
  fredagar: 'fri',
  fredagen: 'fri',
};

const COLORS = ['#2563eb', '#7c3aed', '#db2777', '#059669', '#d97706', '#0891b2', '#dc2626', '#4f46e5'];

const defaultStaff: Staff[] = [
  {
    id: 'anna',
    name: 'Anna',
    color: COLORS[0],
    days: { mon: true, tue: true, wed: true, thu: true, fri: true },
  },
  {
    id: 'erik',
    name: 'Erik',
    color: COLORS[1],
    days: { mon: true, tue: true, wed: true, thu: true, fri: true },
  },
  {
    id: 'sara',
    name: 'Sara',
    color: COLORS[2],
    days: { mon: true, tue: true, wed: true, thu: true, fri: true },
  },
];

function localDateKey(date: Date) {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

function startOfWeek(date: Date) {
  const copy = new Date(date);
  const day = (copy.getDay() + 6) % 7;
  copy.setDate(copy.getDate() - day);
  copy.setHours(0, 0, 0, 0);
  return copy;
}

function addDays(date: Date, amount: number) {
  const copy = new Date(date);
  copy.setDate(copy.getDate() + amount);
  return copy;
}

function getDayKey(date: Date): DayKey {
  const index = (date.getDay() + 6) % 7;
  return DAY_KEYS[Math.min(index, 4)];
}

function toMinutes(time: string) {
  const [h, m] = time.split(':').map(Number);
  return h * 60 + m;
}

function minutesToTime(minutes: number) {
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
}

function getIsoWeek(date: Date) {
  const target = new Date(date);
  target.setHours(0, 0, 0, 0);
  target.setDate(target.getDate() + 3 - ((target.getDay() + 6) % 7));
  const week1 = new Date(target.getFullYear(), 0, 4);
  return 1 + Math.round(((target.getTime() - week1.getTime()) / 86400000 - 3 + ((week1.getDay() + 6) % 7)) / 7);
}

function DraggableStaff({ person }: { person: Staff }) {
  const { ref, handleRef } = useDraggable({ id: `staff:${person.id}` });

  return (
    <div ref={ref} className="staff-chip" style={{ borderLeftColor: person.color }}>
      <button ref={handleRef} className="drag-handle" aria-label={`Dra ${person.name}`}>⋮⋮</button>
      <div>
        <strong>{person.name}</strong>
        <span>{DAY_KEYS.filter((day) => person.days[day]).map((day) => DAY_LABELS[day]).join(' · ')}</span>
      </div>
    </div>
  );
}

function DayColumn({
  date,
  staff,
  assignments,
  onRemove,
}: {
  date: Date;
  staff: Staff[];
  assignments: Assignment[];
  onRemove: (employeeId: string, date: string) => void;
}) {
  const dateKey = localDateKey(date);
  const dayKey = getDayKey(date);
  const { ref, isDropTarget } = useDroppable({ id: `day:${dateKey}` });
  const people = assignments
    .map((assignment) => staff.find((person) => person.id === assignment.employeeId))
    .filter(Boolean) as Staff[];

  const startMin = toMinutes(WORK_START);
  const endMin = toMinutes(WORK_END);
  const totalHeight = (endMin - startMin) * PIXELS_PER_MINUTE;
  const lunchTop = (toMinutes(LUNCH_START) - startMin) * PIXELS_PER_MINUTE;
  const lunchHeight = (toMinutes(LUNCH_END) - toMinutes(LUNCH_START)) * PIXELS_PER_MINUTE;

  return (
    <section className="day-column">
      <header className="day-header">
        <div>
          <strong>{DAY_LABELS[dayKey]}</strong>
          <span>{WORK_START}–{WORK_END}</span>
        </div>
        <b>{date.getDate()}</b>
      </header>

      <div ref={ref} className={`day-track ${isDropTarget ? 'drop-active' : ''}`} style={{ height: totalHeight }}>
        {Array.from({ length: 10 }, (_, index) => startMin + index * 60)
          .filter((minute) => minute <= endMin)
          .map((minute) => (
            <div
              key={minute}
              className="hour-line"
              style={{ top: (minute - startMin) * PIXELS_PER_MINUTE }}
            />
          ))}

        <div className="lunch-band" style={{ top: lunchTop, height: lunchHeight }}>
          Lunch {LUNCH_START}–{LUNCH_END}
        </div>

        {people.length === 0 && <div className="empty-day">Dra hit personal</div>}

        <div className="assignment-layer">
          {people.map((person, index) => {
            const width = 100 / Math.max(1, people.length);
            return (
              <div
                key={person.id}
                className="assignment-card"
                style={{
                  left: `calc(${index * width}% + 4px)`,
                  width: `calc(${width}% - 8px)`,
                  borderTopColor: person.color,
                }}
              >
                <button
                  className="remove-assignment"
                  title="Ta bort"
                  onClick={() => onRemove(person.id, dateKey)}
                >
                  ×
                </button>
                <strong>{person.name}</strong>
                <span>{WORK_START}–{WORK_END}</span>
              </div>
            );
          })}
        </div>
      </div>
    </section>
  );
}

export default function App() {
  const [tab, setTab] = useState<AppTab>('schedule');
  const [cursorDate, setCursorDate] = useState(new Date());
  const [prompt, setPrompt] = useState('');
  const [message, setMessage] = useState('');

  const [staff, setStaff] = useState<Staff[]>(() => {
    const saved = localStorage.getItem('scheduler-simple-staff-v1');
    if (saved) return JSON.parse(saved);

    const old = localStorage.getItem('scheduler-employees-v4');
    if (old) {
      try {
        const parsed = JSON.parse(old);
        return parsed.map((person: any, index: number) => ({
          id: person.id ?? `person-${index}`,
          name: person.name ?? `Person ${index + 1}`,
          color: person.color ?? COLORS[index % COLORS.length],
          days: {
            mon: person.days?.mon ?? true,
            tue: person.days?.tue ?? true,
            wed: person.days?.wed ?? true,
            thu: person.days?.thu ?? true,
            fri: person.days?.fri ?? true,
          },
        }));
      } catch {
        return defaultStaff;
      }
    }

    return defaultStaff;
  });

  const [assignments, setAssignments] = useState<Assignment[]>(() => {
    const saved = localStorage.getItem('scheduler-simple-assignments-v1');
    return saved ? JSON.parse(saved) : [];
  });

  useEffect(() => {
    localStorage.setItem('scheduler-simple-staff-v1', JSON.stringify(staff));
  }, [staff]);

  useEffect(() => {
    localStorage.setItem('scheduler-simple-assignments-v1', JSON.stringify(assignments));
  }, [assignments]);

  const weekStart = useMemo(() => startOfWeek(cursorDate), [cursorDate]);
  const visibleDates = useMemo(
    () => DAY_KEYS.map((_, index) => addDays(weekStart, index)),
    [weekStart]
  );

  function assignPerson(employeeId: string, dateKey: string) {
    const person = staff.find((item) => item.id === employeeId);
    if (!person) return;

    const date = new Date(`${dateKey}T12:00:00`);
    const day = getDayKey(date);

    if (!person.days[day]) {
      setMessage(`${person.name} är markerad som ledig ${DAY_LABELS[day]}.`);
      return;
    }

    setAssignments((current) => {
      const exists = current.some(
        (assignment) => assignment.employeeId === employeeId && assignment.date === dateKey
      );
      if (exists) return current;
      return [...current, { employeeId, date: dateKey }];
    });

    setMessage(`${person.name} lades till ${DAY_LABELS[day]}.`);
  }

  function removeAssignment(employeeId: string, date: string) {
    setAssignments((current) =>
      current.filter(
        (assignment) => !(assignment.employeeId === employeeId && assignment.date === date)
      )
    );
  }

  function handleDragEnd(event: any) {
    if (event.canceled) return;

    const sourceId = String(event.operation.source?.id ?? '');
    const targetId = String(event.operation.target?.id ?? '');

    if (!sourceId.startsWith('staff:') || !targetId.startsWith('day:')) return;

    assignPerson(sourceId.replace('staff:', ''), targetId.replace('day:', ''));
  }

  function generateSimpleSchedule() {
    const weekKeys = visibleDates.map(localDateKey);
    const generated: Assignment[] = [];
    const counts: Record<string, number> = Object.fromEntries(staff.map((person) => [person.id, 0]));

    for (const date of visibleDates) {
      const day = getDayKey(date);
      const dateKey = localDateKey(date);
      const available = staff
        .filter((person) => person.days[day])
        .sort((a, b) => (counts[a.id] ?? 0) - (counts[b.id] ?? 0) || a.name.localeCompare(b.name, 'sv'));

      const chosen = available[0];
      if (!chosen) continue;

      generated.push({ employeeId: chosen.id, date: dateKey });
      counts[chosen.id] = (counts[chosen.id] ?? 0) + 1;
    }

    setAssignments((current) => [
      ...current.filter((assignment) => !weekKeys.includes(assignment.date)),
      ...generated,
    ]);
    setMessage('Veckoschemat skapades med en person per vardag.');
  }

  function parsePrompt() {
    const text = prompt.trim().toLocaleLowerCase('sv-SE');
    if (!text) return;

    if (/^(generera|generera schema|skapa schema|gör schema|full schema|fyll schema|schemalägg)$/.test(text)) {
      generateSimpleSchedule();
      setPrompt('');
      return;
    }

    if (/^(rensa|töm|nollställ)\s*(schema|schemat)?$/.test(text)) {
      const keys = visibleDates.map(localDateKey);
      setAssignments((current) => current.filter((assignment) => !keys.includes(assignment.date)));
      setMessage('Veckoschemat rensades.');
      setPrompt('');
      return;
    }

    const person = staff.find((item) => text.includes(item.name.toLocaleLowerCase('sv-SE')));
    const dayWord = Object.keys(SWEDISH_DAY_TO_KEY).find((word) => text.includes(word));
    const dayKey = dayWord ? SWEDISH_DAY_TO_KEY[dayWord] : undefined;

    if (person && dayKey) {
      const date = addDays(weekStart, DAY_KEYS.indexOf(dayKey));
      const dateKey = localDateKey(date);

      if (/sjuk|ledig|vab|semester|ta bort|borta|frånvarande/.test(text)) {
        removeAssignment(person.id, dateKey);
        setMessage(`${person.name} togs bort från ${DAY_LABELS[dayKey]}.`);
        setPrompt('');
        return;
      }

      if (/lägg till|jobbar|arbetar|sätt|boka|schemalägg/.test(text) || text === `${person.name.toLocaleLowerCase('sv-SE')} ${dayWord}`) {
        assignPerson(person.id, dateKey);
        setPrompt('');
        return;
      }
    }

    setMessage('Prova t.ex. “skapa schema”, “lägg till Erik måndag”, “Sara sjuk tisdag” eller “rensa schema”.');
  }

  function addStaff() {
    const id = `person-${Date.now()}`;
    const person: Staff = {
      id,
      name: `Person ${staff.length + 1}`,
      color: COLORS[staff.length % COLORS.length],
      days: { mon: true, tue: true, wed: true, thu: true, fri: true },
    };
    setStaff((current) => [...current, person]);
  }

  function updateStaff(id: string, patch: Partial<Staff>) {
    setStaff((current) =>
      current.map((person) => (person.id === id ? { ...person, ...patch } : person))
    );
  }

  function deleteStaff(id: string) {
    setStaff((current) => current.filter((person) => person.id !== id));
    setAssignments((current) => current.filter((assignment) => assignment.employeeId !== id));
  }

  return (
    <DragDropProvider onDragEnd={handleDragEnd}>
      <div className="app">
        <section className="prompt-bar">
          <div className="prompt-copy">
            <strong>Vad vill du göra?</strong>
            <span>Exempel: “skapa schema”, “lägg till Erik måndag”, “Sara sjuk tisdag”</span>
          </div>
          <div className="prompt-input-row">
            <input
              value={prompt}
              onChange={(event) => setPrompt(event.target.value)}
              onKeyDown={(event) => event.key === 'Enter' && parsePrompt()}
              placeholder="Skriv en instruktion…"
            />
            <button className="primary" onClick={parsePrompt}>Kör</button>
          </div>
          {message && <div className="message">{message}</div>}
        </section>

        <header className="app-header">
          <div>
            <p>Schemaplaneraren</p>
            <h1>Enkelt veckoschema</h1>
          </div>
          <nav className="tabs">
            <button className={tab === 'schedule' ? 'active' : ''} onClick={() => setTab('schedule')}>Schema</button>
            <button className={tab === 'staff' ? 'active' : ''} onClick={() => setTab('staff')}>Personal</button>
          </nav>
        </header>

        {tab === 'schedule' && (
          <main className="schedule-layout">
            <aside className="staff-panel">
              <div className="panel-title">
                <div>
                  <strong>Personal</strong>
                  <span>Dra en person till en dag</span>
                </div>
              </div>
              <div className="staff-list">
                {staff.map((person) => <DraggableStaff key={person.id} person={person} />)}
              </div>
            </aside>

            <section className="schedule-panel">
              <div className="schedule-toolbar">
                <div className="week-nav">
                  <button onClick={() => setCursorDate(addDays(cursorDate, -7))}>←</button>
                  <button onClick={() => setCursorDate(new Date())}>Idag</button>
                  <button onClick={() => setCursorDate(addDays(cursorDate, 7))}>→</button>
                </div>
                <h2>Vecka {getIsoWeek(cursorDate)}</h2>
                <button className="secondary" onClick={generateSimpleSchedule}>Skapa schema</button>
              </div>

              <div className="timeline-grid">
                <div className="time-column">
                  <div className="time-header" />
                  <div className="time-track" style={{ height: (toMinutes(WORK_END) - toMinutes(WORK_START)) * PIXELS_PER_MINUTE }}>
                    {Array.from({ length: 10 }, (_, index) => toMinutes(WORK_START) + index * 60)
                      .filter((minute) => minute <= toMinutes(WORK_END))
                      .map((minute) => (
                        <span key={minute} style={{ top: (minute - toMinutes(WORK_START)) * PIXELS_PER_MINUTE }}>
                          {minutesToTime(minute)}
                        </span>
                      ))}
                  </div>
                </div>

                {visibleDates.map((date) => (
                  <DayColumn
                    key={localDateKey(date)}
                    date={date}
                    staff={staff}
                    assignments={assignments.filter((assignment) => assignment.date === localDateKey(date))}
                    onRemove={removeAssignment}
                  />
                ))}
              </div>
            </section>
          </main>
        )}

        {tab === 'staff' && (
          <main className="staff-settings">
            <div className="settings-heading">
              <div>
                <h2>Personal</h2>
                <p>Redigera namn och vilka vardagar personen kan arbeta.</p>
              </div>
              <button className="primary" onClick={addStaff}>+ Lägg till person</button>
            </div>

            <div className="staff-settings-list">
              {staff.map((person) => (
                <article className="staff-settings-card" key={person.id}>
                  <div className="staff-settings-top">
                    <span className="color-dot" style={{ background: person.color }} />
                    <input
                      value={person.name}
                      onChange={(event) => updateStaff(person.id, { name: event.target.value })}
                    />
                    <button className="delete-person" onClick={() => deleteStaff(person.id)}>Ta bort</button>
                  </div>

                  <div className="day-toggles">
                    {DAY_KEYS.map((day) => (
                      <label key={day}>
                        <input
                          type="checkbox"
                          checked={person.days[day]}
                          onChange={(event) =>
                            updateStaff(person.id, {
                              days: { ...person.days, [day]: event.target.checked },
                            })
                          }
                        />
                        {DAY_LABELS[day]}
                      </label>
                    ))}
                  </div>
                </article>
              ))}
            </div>
          </main>
        )}
      </div>
    </DragDropProvider>
  );
}
