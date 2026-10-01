import { useEffect, useMemo, useState } from 'react';
import { DragDropProvider, useDraggable, useDroppable } from '@dnd-kit/react';

type DayKey = 'mon' | 'tue' | 'wed' | 'thu' | 'fri';
type AppTab = 'schedule' | 'staff';

type WorkTime = {
  start: string;
  end: string;
};

type Staff = {
  id: string;
  name: string;
  color: string;
  days: Record<DayKey, boolean>;
  workTimes: Record<DayKey, WorkTime>;
};

type Assignment = {
  id: string;
  employeeId: string;
  date: string;
  start: string;
  end: string;
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

const COLORS = ['#60a5fa', '#a78bfa', '#f472b6', '#34d399', '#fbbf24', '#22d3ee', '#f87171', '#818cf8'];

function defaultWorkTimes(): Record<DayKey, WorkTime> {
  return {
    mon: { start: WORK_START, end: WORK_END },
    tue: { start: WORK_START, end: WORK_END },
    wed: { start: WORK_START, end: WORK_END },
    thu: { start: WORK_START, end: WORK_END },
    fri: { start: WORK_START, end: WORK_END },
  };
}

function lunchMinutesInside(start: string, end: string) {
  const overlapStart = Math.max(toMinutes(start), toMinutes(LUNCH_START));
  const overlapEnd = Math.min(toMinutes(end), toMinutes(LUNCH_END));
  return Math.max(0, overlapEnd - overlapStart);
}

function netWorkMinutes(start: string, end: string) {
  return Math.max(0, toMinutes(end) - toMinutes(start) - lunchMinutesInside(start, end));
}

function formatHours(start: string, end: string) {
  return netWorkMinutes(start, end) / 60;
}

function durationLabel(minutes: number) {
  const hours = Math.floor(minutes / 60);
  const mins = minutes % 60;
  return `${String(hours).padStart(2, '0')}:${String(mins).padStart(2, '0')}`;
}

function parseDuration(value: string) {
  const match = value.trim().match(/^(\d{1,2}):([0-5]\d)$/);
  if (!match) return null;
  return Number(match[1]) * 60 + Number(match[2]);
}

function endForNetDuration(start: string, availableEnd: string, desiredNetMinutes: number) {
  const startMin = toMinutes(start);
  const maxEnd = toMinutes(availableEnd);
  let current = startMin;
  let worked = 0;

  while (current < maxEnd && worked < desiredNetMinutes) {
    const next = Math.min(current + 5, maxEnd);
    const segmentStart = minutesToTime(current);
    const segmentEnd = minutesToTime(next);
    worked += (next - current) - lunchMinutesInside(segmentStart, segmentEnd);
    current = next;
  }

  return minutesToTime(current);
}

const defaultStaff: Staff[] = [
  {
    id: 'anna',
    name: 'Anna',
    color: COLORS[0],
    days: { mon: true, tue: true, wed: true, thu: true, fri: true },
    workTimes: defaultWorkTimes(),
  },
  {
    id: 'erik',
    name: 'Erik',
    color: COLORS[1],
    days: { mon: true, tue: true, wed: true, thu: true, fri: true },
    workTimes: defaultWorkTimes(),
  },
  {
    id: 'sara',
    name: 'Sara',
    color: COLORS[2],
    days: { mon: true, tue: true, wed: true, thu: true, fri: true },
    workTimes: defaultWorkTimes(),
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
        <small>Standard {person.workTimes.mon.start}–{person.workTimes.mon.end}</small>
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
  onRemove: (assignmentId: string) => void;
}) {
  const dateKey = localDateKey(date);
  const dayKey = getDayKey(date);
  const { ref, isDropTarget } = useDroppable({ id: `day:${dateKey}` });
  const scheduled = assignments
    .map((assignment) => {
      const person = staff.find((item) => item.id === assignment.employeeId);
      return person ? { person, assignment } : null;
    })
    .filter(Boolean) as Array<{ person: Staff; assignment: Assignment }>;

  const laneEnds: number[] = [];
  const scheduledWithLanes = [...scheduled]
    .sort((a, b) => toMinutes(a.assignment.start) - toMinutes(b.assignment.start))
    .map((item) => {
      const start = toMinutes(item.assignment.start);
      const end = toMinutes(item.assignment.end);
      let lane = laneEnds.findIndex((laneEnd) => start >= laneEnd);
      if (lane === -1) {
        lane = laneEnds.length;
        laneEnds.push(end);
      } else {
        laneEnds[lane] = end;
      }
      return { ...item, lane };
    });
  const laneCount = Math.max(1, laneEnds.length);

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

        {scheduledWithLanes.length === 0 && <div className="empty-day">Dra hit personal</div>}

        <div className="assignment-layer">
          {scheduledWithLanes.map(({ person, assignment, lane }) => {
            const width = 100 / laneCount;
            const top = Math.max(0, (toMinutes(assignment.start) - startMin) * PIXELS_PER_MINUTE);
            const bottom = Math.min(totalHeight, (toMinutes(assignment.end) - startMin) * PIXELS_PER_MINUTE);
            const height = Math.max(34, bottom - top);
            const hours = formatHours(assignment.start, assignment.end);
            const lunch = lunchMinutesInside(assignment.start, assignment.end);

            return (
              <div
                key={assignment.id}
                className="assignment-card"
                style={{
                  top,
                  height,
                  left: `calc(${lane * width}% + 4px)`,
                  width: `calc(${width}% - 8px)`,
                  borderTopColor: person.color,
                }}
              >
                <button
                  className="remove-assignment"
                  title="Ta bort"
                  onClick={() => onRemove(assignment.id)}
                >
                  ×
                </button>
                <strong>{person.name}</strong>
                <span>{assignment.start}–{assignment.end}</span>
                <small>{hours.toFixed(hours % 1 === 0 ? 0 : 1)} h arbete{lunch ? ` · lunch ${lunch} min` : ''}</small>
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
  const [selectedStaffId, setSelectedStaffId] = useState<string | null>(null);
  const [shiftLengthMinutes, setShiftLengthMinutes] = useState<number>(() => {
    const saved = localStorage.getItem('scheduler-simple-shift-length-v1');
    return saved ? Math.max(30, Number(saved)) : 180;
  });
  const [shiftLengthText, setShiftLengthText] = useState(() => durationLabel(
    Number(localStorage.getItem('scheduler-simple-shift-length-v1') ?? 180)
  ));

  const [staff, setStaff] = useState<Staff[]>(() => {
    const saved = localStorage.getItem('scheduler-simple-staff-v1');
    if (saved) {
      const parsed: Staff[] = JSON.parse(saved);
      return parsed.map((person) => ({
        ...person,
        workTimes: {
          mon: person.workTimes?.mon ?? { start: '08:00', end: '16:30' },
          tue: person.workTimes?.tue ?? { start: '08:00', end: '16:30' },
          wed: person.workTimes?.wed ?? { start: '08:00', end: '16:30' },
          thu: person.workTimes?.thu ?? { start: '08:00', end: '16:30' },
          fri: person.workTimes?.fri ?? { start: '08:00', end: '16:30' },
        },
      }));
    }

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
          workTimes: defaultWorkTimes(),
        }));
      } catch {
        return defaultStaff;
      }
    }

    return defaultStaff;
  });

  const [assignments, setAssignments] = useState<Assignment[]>(() => {
    const saved = localStorage.getItem('scheduler-simple-assignments-v1');
    if (!saved) return [];
    const parsed: Array<Partial<Assignment> & { employeeId: string; date: string }> = JSON.parse(saved);
    return parsed.map((assignment, index) => ({
      id: assignment.id ?? `legacy-${assignment.date}-${assignment.employeeId}-${index}`,
      employeeId: assignment.employeeId,
      date: assignment.date,
      start: assignment.start ?? WORK_START,
      end: assignment.end ?? WORK_END,
    }));
  });

  useEffect(() => {
    localStorage.setItem('scheduler-simple-staff-v1', JSON.stringify(staff));
  }, [staff]);

  useEffect(() => {
    localStorage.setItem('scheduler-simple-assignments-v1', JSON.stringify(assignments));
  }, [assignments]);

  useEffect(() => {
    localStorage.setItem('scheduler-simple-shift-length-v1', String(shiftLengthMinutes));
    setShiftLengthText(durationLabel(shiftLengthMinutes));
  }, [shiftLengthMinutes]);

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

    const workTime = person.workTimes[day] ?? { start: WORK_START, end: WORK_END };
    const end = endForNetDuration(workTime.start, workTime.end, shiftLengthMinutes);

    setAssignments((current) => {
      const exists = current.some(
        (assignment) => assignment.employeeId === employeeId && assignment.date === dateKey
      );
      if (exists) return current;
      return [...current, {
        id: `manual-${Date.now()}-${employeeId}`,
        employeeId,
        date: dateKey,
        start: workTime.start,
        end,
      }];
    });

    setMessage(`${person.name} lades till ${DAY_LABELS[day]}.`);
  }

  function removeAssignment(assignmentId: string) {
    setAssignments((current) => current.filter((assignment) => assignment.id !== assignmentId));
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
    const assignedMinutes: Record<string, number> = Object.fromEntries(staff.map((person) => [person.id, 0]));
    const closingCounts: Record<string, number> = Object.fromEntries(staff.map((person) => [person.id, 0]));
    const lastWorkedSlot: Record<string, { date: string; end: string } | undefined> = {};
    const lastClosingDate: Record<string, string | undefined> = {};
    const coverageGaps: string[] = [];

    for (const date of visibleDates) {
      const day = getDayKey(date);
      const dateKey = localDateKey(date);
      const previousDateKey = localDateKey(addDays(date, -1));
      let slotStart = toMinutes(WORK_START);
      const workdayEnd = toMinutes(WORK_END);
      let slotIndex = 0;

      while (slotStart < workdayEnd) {
        const slotStartTime = minutesToTime(slotStart);
        const slotEndTime = endForNetDuration(slotStartTime, WORK_END, shiftLengthMinutes);
        const slotEnd = Math.min(workdayEnd, toMinutes(slotEndTime));
        const actualEndTime = minutesToTime(slotEnd);

        if (slotEnd <= slotStart) break;

        const isClosingShift = slotEnd === workdayEnd;

        const candidates = staff
          .filter((person) => {
            if (!person.days[day]) return false;
            const availability = person.workTimes[day] ?? { start: WORK_START, end: WORK_END };
            return toMinutes(availability.start) <= slotStart && toMinutes(availability.end) >= slotEnd;
          })
          .map((person) => {
            const previous = lastWorkedSlot[person.id];

            // Starkt undvik flera pass direkt efter varandra samma dag.
            const backToBackPenalty =
              previous?.date === dateKey && previous.end === slotStartTime ? 100000 : 0;

            // Undvik att samma person får sista passet flera dagar i rad.
            const consecutiveClosePenalty =
              isClosingShift && lastClosingDate[person.id] === previousDateKey ? 80000 : 0;

            // Sprid generellt stängningspassen jämnt över veckan.
            const closingLoadPenalty =
              isClosingShift ? (closingCounts[person.id] ?? 0) * 20000 : 0;

            // Baspoäng för jämn total arbetstid.
            const fairnessScore = assignedMinutes[person.id] ?? 0;

            return {
              person,
              score:
                fairnessScore +
                backToBackPenalty +
                consecutiveClosePenalty +
                closingLoadPenalty,
            };
          })
          .sort((a, b) => a.score - b.score || a.person.name.localeCompare(b.person.name, 'sv'));

        const chosen = candidates[0]?.person;

        if (chosen) {
          generated.push({
            id: `auto-${dateKey}-${slotIndex}-${chosen.id}`,
            employeeId: chosen.id,
            date: dateKey,
            start: slotStartTime,
            end: actualEndTime,
          });

          assignedMinutes[chosen.id] =
            (assignedMinutes[chosen.id] ?? 0) +
            netWorkMinutes(slotStartTime, actualEndTime);

          lastWorkedSlot[chosen.id] = {
            date: dateKey,
            end: actualEndTime,
          };

          if (isClosingShift) {
            closingCounts[chosen.id] = (closingCounts[chosen.id] ?? 0) + 1;
            lastClosingDate[chosen.id] = dateKey;
          }
        } else {
          coverageGaps.push(`${DAY_LABELS[day]} ${slotStartTime}–${actualEndTime}`);
        }

        slotStart = slotEnd;
        slotIndex += 1;
      }
    }

    setAssignments((current) => [
      ...current.filter((assignment) => !weekKeys.includes(assignment.date)),
      ...generated,
    ]);

    if (coverageGaps.length) {
      setMessage(`Schemat skapades, men följande tider saknar tillgänglig personal: ${coverageGaps.join(', ')}.`);
    } else {
      setMessage(`Hela arbetsdagen 08:00–16:30 bemannades med passlängd ${durationLabel(shiftLengthMinutes)} och hänsyn till jämn fördelning, flera pass i rad och avslutande pass.`);
    }
  }

  function resetVisibleSchedule() {
    const keys = visibleDates.map(localDateKey);
    setAssignments((current) => current.filter((assignment) => !keys.includes(assignment.date)));
    setMessage('Veckoschemat nollställdes.');
  }

  function applyShiftLengthText() {
    const parsed = parseDuration(shiftLengthText);
    if (parsed === null || parsed < 30) {
      setMessage('Skriv passlängd som HH:MM, t.ex. 03:00.');
      setShiftLengthText(durationLabel(shiftLengthMinutes));
      return;
    }
    const clamped = Math.min(8 * 60, Math.max(30, parsed));
    setShiftLengthMinutes(clamped);
    if (clamped !== parsed) setMessage('Passlängden begränsades till intervallet 00:30–08:00.');
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
      resetVisibleSchedule();
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
        setAssignments((current) =>
          current.filter((assignment) => !(assignment.employeeId === person.id && assignment.date === dateKey))
        );
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
    workTimes: defaultWorkTimes(),
    };
    setStaff((current) => [...current, person]);
  }

  function updateStaff(id: string, patch: Partial<Staff>) {
    setStaff((current) =>
      current.map((person) => (person.id === id ? { ...person, ...patch } : person))
    );
  }

  function updateWorkTime(id: string, day: DayKey, patch: Partial<WorkTime>) {
    setStaff((current) =>
      current.map((person) =>
        person.id === id
          ? {
              ...person,
              workTimes: {
                ...person.workTimes,
                [day]: { ...person.workTimes[day], ...patch },
              },
            }
          : person
      )
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

              <div className="shift-length-control">
                <div className="shift-length-copy">
                  <strong>Passlängd</strong>
                  <span>Arbetstid. Lunch räknas inte in.</span>
                </div>

                <input
                  className="shift-slider"
                  type="range"
                  min="30"
                  max="480"
                  step="30"
                  value={shiftLengthMinutes}
                  onChange={(event) => setShiftLengthMinutes(Number(event.target.value))}
                />

                <div className="shift-duration-input">
                  <input
                    value={shiftLengthText}
                    onChange={(event) => setShiftLengthText(event.target.value)}
                    onBlur={applyShiftLengthText}
                    onKeyDown={(event) => {
                      if (event.key === 'Enter') {
                        event.currentTarget.blur();
                      }
                    }}
                    aria-label="Passlängd i timmar och minuter"
                  />
                  <span>HH:MM</span>
                </div>
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

              <div className="schedule-footer-actions">
                <button className="reset-button" onClick={resetVisibleSchedule}>Nollställ schema</button>
              </div>
            </section>
          </main>
        )}

        {tab === 'staff' && (
          <main className="staff-settings">
            <div className="settings-heading">
              <div>
                <h2>Personal</h2>
                <p>Klicka på en person för att redigera namn, arbetsdagar och arbetstider.</p>
              </div>
              <button className="primary" onClick={addStaff}>+ Lägg till person</button>
            </div>

            <div className="staff-settings-list">
              {staff.map((person) => {
                const selected = selectedStaffId === person.id;
                return (
                  <article className={`staff-settings-card ${selected ? 'selected' : ''}`} key={person.id}>
                    <button className="person-summary" onClick={() => setSelectedStaffId(selected ? null : person.id)}>
                      <span className="color-dot" style={{ background: person.color }} />
                      <div>
                        <strong>{person.name}</strong>
                        <span>{DAY_KEYS.filter((day) => person.days[day]).map((day) => DAY_LABELS[day]).join(' · ')}</span>
                      </div>
                      <b>{selected ? '−' : '+'}</b>
                    </button>

                    {selected && (
                      <div className="person-editor">
                        <div className="staff-settings-top">
                          <label>
                            Namn
                            <input
                              value={person.name}
                              onChange={(event) => updateStaff(person.id, { name: event.target.value })}
                            />
                          </label>
                          <button className="delete-person" onClick={() => deleteStaff(person.id)}>Ta bort</button>
                        </div>

                        <div className="worktime-list">
                          {DAY_KEYS.map((day) => {
                            const time = person.workTimes[day];
                            const hours = formatHours(time.start, time.end);
                            const lunch = lunchMinutesInside(time.start, time.end);
                            return (
                              <div className={`worktime-row ${person.days[day] ? '' : 'disabled'}`} key={day}>
                                <label className="day-check">
                                  <input
                                    type="checkbox"
                                    checked={person.days[day]}
                                    onChange={(event) =>
                                      updateStaff(person.id, {
                                        days: { ...person.days, [day]: event.target.checked },
                                      })
                                    }
                                  />
                                  <strong>{DAY_LABELS[day]}</strong>
                                </label>

                                <label>
                                  Från
                                  <input
                                    type="time"
                                    disabled={!person.days[day]}
                                    value={time.start}
                                    onChange={(event) => updateWorkTime(person.id, day, { start: event.target.value })}
                                  />
                                </label>

                                <label>
                                  Till
                                  <input
                                    type="time"
                                    disabled={!person.days[day]}
                                    value={time.end}
                                    onChange={(event) => updateWorkTime(person.id, day, { end: event.target.value })}
                                  />
                                </label>

                                <div className="shift-length">
                                  <span>Passlängd</span>
                                  <strong>{hours.toFixed(hours % 1 === 0 ? 0 : 1)} h</strong>
                                  <small>Lunch {lunch} min</small>
                                </div>
                              </div>
                            );
                          })}
                        </div>
                      </div>
                    )}
                  </article>
                );
              })}
            </div>
          </main>
        )}
      </div>
    </DragDropProvider>
  );
}
