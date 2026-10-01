import { useEffect, useMemo, useState } from 'react';
import { DragDropProvider, useDraggable, useDroppable } from '@dnd-kit/react';

type DayKey = 'mon' | 'tue' | 'wed' | 'thu' | 'fri';
type AppTab = 'schedule' | 'month' | 'staff';

type WorkTime = {
  start: string;
  end: string;
};

type BlockedTime = {
  start: string;
  end: string;
};

type Staff = {
  id: string;
  name: string;
  color: string;
  days: Record<DayKey, boolean>;
  workTimes: Record<DayKey, WorkTime>;
  blockedTimes: Record<DayKey, BlockedTime[]>;
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
const APP_VERSION = '0.1.12';

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
  tordag: 'thu',
  tordagar: 'thu',
  tordagen: 'thu',
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

function defaultBlockedTimes(): Record<DayKey, BlockedTime[]> {
  return {
    mon: [],
    tue: [],
    wed: [],
    thu: [],
    fri: [],
  };
}

function overlapsTime(start: string, end: string, blocked: BlockedTime) {
  return toMinutes(start) < toMinutes(blocked.end) && toMinutes(end) > toMinutes(blocked.start);
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

function normalizeClock(hourText: string, minuteText?: string) {
  const hour = Number(hourText);
  const minute = Number(minuteText ?? 0);
  if (!Number.isInteger(hour) || !Number.isInteger(minute) || hour < 0 || hour > 23 || minute < 0 || minute > 59) {
    return null;
  }
  return `${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')}`;
}

function contiguousShiftEnd(start: string, availableEnd: string, desiredMinutes: number) {
  const startMin = toMinutes(start);
  const maxEnd = toMinutes(availableEnd);
  const lunchStart = toMinutes(LUNCH_START);
  const lunchEnd = toMinutes(LUNCH_END);

  if (startMin >= lunchStart && startMin < lunchEnd) {
    return LUNCH_END;
  }

  let limit = maxEnd;
  if (startMin < lunchStart) {
    limit = Math.min(limit, lunchStart);
  }

  return minutesToTime(Math.min(limit, startMin + desiredMinutes));
}

function softColor(hex: string, alpha = 0.24) {
  const clean = hex.replace('#', '');
  const full = clean.length === 3 ? clean.split('').map((c) => c + c).join('') : clean;
  const r = parseInt(full.slice(0, 2), 16);
  const g = parseInt(full.slice(2, 4), 16);
  const b = parseInt(full.slice(4, 6), 16);
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

function getAssignmentWarnings(
  assignment: Assignment,
  person: Staff,
  allAssignments: Assignment[],
  weekDateKeys: string[],
  allStaff: Staff[]
) {
  const warnings: string[] = [];
  const date = new Date(`${assignment.date}T12:00:00`);
  const day = getDayKey(date);
  const previousDateKey = localDateKey(addDays(date, -1));
  const nextDateKey = localDateKey(addDays(date, 1));
  const workTime = person.workTimes[day] ?? { start: WORK_START, end: WORK_END };
  const blocked = person.blockedTimes?.[day] ?? [];

  if (
    toMinutes(assignment.start) < toMinutes(workTime.start) ||
    toMinutes(assignment.end) > toMinutes(workTime.end)
  ) {
    warnings.push(`Passet ligger utanför ${person.name}s arbetstid ${workTime.start}–${workTime.end}.`);
  }

  if (blocked.some((period) => overlapsTime(assignment.start, assignment.end, period))) {
    warnings.push('Passet krockar med en registrerad tidsbegränsning.');
  }

  const previous = allAssignments.filter(
    (item) => item.employeeId === person.id && item.date === previousDateKey
  );
  const next = allAssignments.filter(
    (item) => item.employeeId === person.id && item.date === nextDateKey
  );

  if (
    assignment.start === WORK_START &&
    previous.some((item) => item.end === WORK_END)
  ) {
    warnings.push('Morgonpass direkt efter ett avslutande pass föregående arbetsdag.');
  }

  if (
    assignment.end === WORK_END &&
    next.some((item) => item.start === WORK_START)
  ) {
    warnings.push('Avslutande pass följs av morgonpass nästa arbetsdag.');
  }

  if (
    assignment.start === WORK_START &&
    previous.some((item) => item.start === WORK_START)
  ) {
    warnings.push('Första passet två arbetsdagar i rad.');
  }

  if (
    assignment.end === WORK_END &&
    previous.some((item) => item.end === WORK_END)
  ) {
    warnings.push('Avslutande pass två arbetsdagar i rad.');
  }

  const weeklyTotals = Object.fromEntries(allStaff.map((item) => [item.id, 0])) as Record<string, number>;
  for (const item of allAssignments) {
    if (!weekDateKeys.includes(item.date)) continue;
    weeklyTotals[item.employeeId] =
      (weeklyTotals[item.employeeId] ?? 0) + netWorkMinutes(item.start, item.end) / 60;
  }

  const averageHours =
    allStaff.length > 0
      ? Object.values(weeklyTotals).reduce((sum, hours) => sum + hours, 0) / allStaff.length
      : 0;
  const personHours = weeklyTotals[person.id] ?? 0;

  if (averageHours > 0 && personHours >= averageHours * 1.25 && personHours - averageHours >= 1) {
    warnings.push(
      `Många timmar denna vecka: ${personHours.toFixed(1)} h jämfört med snittet ${averageHours.toFixed(1)} h.`
    );
  }

  return [...new Set(warnings)];
}

const defaultStaff: Staff[] = [
  {
    id: 'anna',
    name: 'Anna',
    color: COLORS[0],
    days: { mon: true, tue: true, wed: true, thu: true, fri: true },
    workTimes: defaultWorkTimes(),
    blockedTimes: defaultBlockedTimes(),
  },
  {
    id: 'erik',
    name: 'Erik',
    color: COLORS[1],
    days: { mon: true, tue: true, wed: true, thu: true, fri: true },
    workTimes: defaultWorkTimes(),
    blockedTimes: defaultBlockedTimes(),
  },
  {
    id: 'sara',
    name: 'Sara',
    color: COLORS[2],
    days: { mon: true, tue: true, wed: true, thu: true, fri: true },
    workTimes: defaultWorkTimes(),
    blockedTimes: defaultBlockedTimes(),
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

function addMonths(date: Date, amount: number) {
  const copy = new Date(date);
  copy.setDate(1);
  copy.setMonth(copy.getMonth() + amount);
  return copy;
}

function monthWeekdays(date: Date) {
  const year = date.getFullYear();
  const month = date.getMonth();
  const first = new Date(year, month, 1);
  const last = new Date(year, month + 1, 0);
  const firstWeek = startOfWeek(first);
  const weeks: Date[][] = [];

  for (let weekStartDate = new Date(firstWeek); weekStartDate <= last; weekStartDate = addDays(weekStartDate, 7)) {
    const days = DAY_KEYS.map((_, index) => addDays(weekStartDate, index));
    if (days.some((day) => day.getMonth() === month)) weeks.push(days);
  }

  return weeks;
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

  const setRefs = (node: HTMLDivElement | null) => {
    ref(node);
    handleRef(node);
  };

  return (
    <div
      ref={setRefs}
      className="staff-chip staff-chip-draggable"
      style={{ borderLeftColor: person.color }}
      aria-label={`Dra ${person.name}`}
      title={`Dra ${person.name} till ett ledigt pass`}
    >
      <span className="drag-handle" aria-hidden="true">⋮⋮</span>
      <div>
        <strong>{person.name}</strong>
        <span>{DAY_KEYS.filter((day) => person.days[day]).map((day) => DAY_LABELS[day]).join(' · ')}</span>
        <small>Standard {person.workTimes.mon.start}–{person.workTimes.mon.end}</small>
      </div>
    </div>
  );
}

function DraggableAssignmentCard({
  person,
  assignment,
  lane,
  laneCount,
  startMin,
  totalHeight,
  onRemove,
  warnings,
}: {
  person: Staff;
  assignment: Assignment;
  lane: number;
  laneCount: number;
  startMin: number;
  totalHeight: number;
  onRemove: (assignmentId: string) => void;
  warnings: string[];
}) {
  const { ref: dragRef, handleRef } = useDraggable({ id: `assignment:${assignment.id}` });
  const { ref: dropRef, isDropTarget } = useDroppable({ id: `assignment:${assignment.id}` });

  const width = 100 / laneCount;
  const top = Math.max(0, (toMinutes(assignment.start) - startMin) * PIXELS_PER_MINUTE);
  const bottom = Math.min(totalHeight, (toMinutes(assignment.end) - startMin) * PIXELS_PER_MINUTE);
  const height = Math.max(34, bottom - top);
  const hours = formatHours(assignment.start, assignment.end);

  const setRefs = (node: HTMLDivElement | null) => {
    dragRef(node);
    dropRef(node);
  };

  return (
    <div
      ref={setRefs}
      className={`assignment-card draggable-assignment ${isDropTarget ? 'assignment-drop-target' : ''}`}
      style={{
        top,
        height,
        left: `calc(${lane * width}% + 4px)`,
        width: `calc(${width}% - 8px)`,
        borderTopColor: person.color,
        background: softColor(person.color, 0.28),
      }}
    >
      <button
        className="remove-assignment"
        title="Ta bort"
        onClick={(event) => {
          event.stopPropagation();
          onRemove(assignment.id);
        }}
      >
        ×
      </button>
      {warnings.length > 0 && (
        <span
          className="assignment-warning"
          aria-label={`Varning: ${warnings.join(' ')}`}
          tabIndex={0}
        >
          <span className="assignment-warning-icon" aria-hidden="true">!</span>
          <span className="assignment-warning-tooltip" role="tooltip">
            {warnings.map((warning) => (
              <span key={warning}>{warning}</span>
            ))}
          </span>
        </span>
      )}
      <div ref={handleRef} className="assignment-drag-area" title="Dra till ett annat pass för att byta plats">
        <strong className="assignment-name">{person.name}</strong>
        <span>{assignment.start}–{assignment.end}</span>
        <small>{hours.toFixed(hours % 1 === 0 ? 0 : 1)} h arbete</small>
      </div>
    </div>
  );
}

function EmptyShiftDropZone({
  dateKey,
  start,
  end,
  startMin,
}: {
  dateKey: string;
  start: string;
  end: string;
  startMin: number;
}) {
  const slotId = `slot:${dateKey}:${start.replace(':', '.') }:${end.replace(':', '.')}`;
  const { ref, isDropTarget } = useDroppable({ id: slotId });
  const top = (toMinutes(start) - startMin) * PIXELS_PER_MINUTE;
  const height = Math.max(34, (toMinutes(end) - toMinutes(start)) * PIXELS_PER_MINUTE);

  return (
    <div
      ref={ref}
      className={`empty-shift-drop-zone ${isDropTarget ? 'slot-drop-active' : ''}`}
      style={{ top, height }}
    >
      <span>Ledigt {start}–{end}</span>
    </div>
  );
}

function DayColumn({
  date,
  staff,
  assignments,
  onRemove,
  shiftLengthMinutes,
  allAssignments,
  weekDateKeys,
}: {
  date: Date;
  staff: Staff[];
  assignments: Assignment[];
  onRemove: (assignmentId: string) => void;
  shiftLengthMinutes: number;
  allAssignments: Assignment[];
  weekDateKeys: string[];
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

  const openSlots: Array<{ start: string; end: string }> = [];
  let openSlotStart = startMin;

  while (openSlotStart < endMin) {
    if (openSlotStart >= toMinutes(LUNCH_START) && openSlotStart < toMinutes(LUNCH_END)) {
      openSlotStart = toMinutes(LUNCH_END);
      continue;
    }

    const start = minutesToTime(openSlotStart);
    const end = contiguousShiftEnd(start, WORK_END, shiftLengthMinutes);
    const endMinutes = Math.min(endMin, toMinutes(end));

    if (endMinutes <= openSlotStart) break;

    const slot = { start, end: minutesToTime(endMinutes) };
    const occupied = assignments.some((assignment) =>
      overlapsTime(slot.start, slot.end, { start: assignment.start, end: assignment.end })
    );

    if (!occupied) openSlots.push(slot);

    openSlotStart = endMinutes;
    if (openSlotStart === toMinutes(LUNCH_START)) {
      openSlotStart = toMinutes(LUNCH_END);
    }
  }

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

        <div className="empty-slot-layer">
          {openSlots.map((slot) => (
            <EmptyShiftDropZone
              key={`${dateKey}-${slot.start}`}
              dateKey={dateKey}
              start={slot.start}
              end={slot.end}
              startMin={startMin}
            />
          ))}
        </div>

        {scheduledWithLanes.length === 0 && openSlots.length === 0 && <div className="empty-day">Dra hit personal</div>}

        <div className="assignment-layer">
          {scheduledWithLanes.map(({ person, assignment, lane }) => (
            <DraggableAssignmentCard
              key={assignment.id}
              person={person}
              assignment={assignment}
              lane={lane}
              laneCount={laneCount}
              startMin={startMin}
              totalHeight={totalHeight}
              onRemove={onRemove}
              warnings={getAssignmentWarnings(assignment, person, allAssignments, weekDateKeys, staff)}
            />
          ))}
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
  const [showPromptHelp, setShowPromptHelp] = useState(false);
  const [selectedStaffId, setSelectedStaffId] = useState<string | null>(null);
  const [shiftLengthMinutes, setShiftLengthMinutes] = useState<number>(() => {
    const saved = localStorage.getItem('scheduler-simple-shift-length-v1');
    return saved ? Math.max(30, Number(saved)) : 120;
  });
  const [shiftLengthText, setShiftLengthText] = useState(() => durationLabel(
    Number(localStorage.getItem('scheduler-simple-shift-length-v1') ?? 120)
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
        blockedTimes: {
          mon: person.blockedTimes?.mon ?? [],
          tue: person.blockedTimes?.tue ?? [],
          wed: person.blockedTimes?.wed ?? [],
          thu: person.blockedTimes?.thu ?? [],
          fri: person.blockedTimes?.fri ?? [],
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
    blockedTimes: defaultBlockedTimes(),
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
    return parsed.flatMap((assignment, index) => {
      const rawStart = assignment.start ?? WORK_START;
      const rawEnd = assignment.end ?? WORK_END;

      if (!/^\d{2}:\d{2}$/.test(rawStart) || !/^\d{2}:\d{2}$/.test(rawEnd)) {
        return [];
      }

      const base = {
        employeeId: assignment.employeeId,
        date: assignment.date,
        start: rawStart,
        end: rawEnd,
      };

      if (toMinutes(base.start) < toMinutes(LUNCH_START) && toMinutes(base.end) > toMinutes(LUNCH_START)) {
        const parts: Assignment[] = [];
        if (toMinutes(base.start) < toMinutes(LUNCH_START)) {
          parts.push({
            id: `${assignment.id ?? `legacy-${index}`}-before-lunch`,
            employeeId: base.employeeId,
            date: base.date,
            start: base.start,
            end: LUNCH_START,
          });
        }
        if (toMinutes(base.end) > toMinutes(LUNCH_END)) {
          parts.push({
            id: `${assignment.id ?? `legacy-${index}`}-after-lunch`,
            employeeId: base.employeeId,
            date: base.date,
            start: LUNCH_END,
            end: base.end,
          });
        }
        return parts;
      }

      if (toMinutes(base.start) >= toMinutes(LUNCH_START) && toMinutes(base.start) < toMinutes(LUNCH_END)) {
        base.start = LUNCH_END;
      }

      return [{
        id: assignment.id ?? `legacy-${assignment.date}-${assignment.employeeId}-${index}`,
        ...base,
      }];
    });
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

  useEffect(() => {
    if (!message) return;

    const timer = window.setTimeout(() => {
      setMessage('');
    }, 4000);

    return () => window.clearTimeout(timer);
  }, [message]);

  const weekStart = useMemo(() => startOfWeek(cursorDate), [cursorDate]);
  const visibleDates = useMemo(
    () => DAY_KEYS.map((_, index) => addDays(weekStart, index)),
    [weekStart]
  );

  const visibleDateKeys = useMemo(() => visibleDates.map(localDateKey), [visibleDates]);

  const scheduledHoursByPerson = useMemo(() => {
    const totals: Record<string, number> = Object.fromEntries(staff.map((person) => [person.id, 0]));

    for (const assignment of assignments) {
      if (!visibleDateKeys.includes(assignment.date)) continue;
      totals[assignment.employeeId] =
        (totals[assignment.employeeId] ?? 0) +
        netWorkMinutes(assignment.start, assignment.end) / 60;
    }

    return totals;
  }, [assignments, staff, visibleDateKeys]);

  const monthlyHoursByPerson = useMemo(() => {
    const totals: Record<string, number> = Object.fromEntries(staff.map((person) => [person.id, 0]));
    const year = cursorDate.getFullYear();
    const month = cursorDate.getMonth();

    for (const assignment of assignments) {
      const date = new Date(`${assignment.date}T12:00:00`);
      if (date.getFullYear() !== year || date.getMonth() !== month) continue;

      totals[assignment.employeeId] =
        (totals[assignment.employeeId] ?? 0) +
        netWorkMinutes(assignment.start, assignment.end) / 60;
    }

    return totals;
  }, [assignments, staff, cursorDate]);

  const selectedMonthLabel = useMemo(
    () => cursorDate.toLocaleDateString('sv-SE', { month: 'long', year: 'numeric' }),
    [cursorDate]
  );

  const monthWeeks = useMemo(() => monthWeekdays(cursorDate), [cursorDate]);

  const hourImbalanceNote = useMemo(() => {
    if (staff.length < 2) return '';

    const ranked = staff
      .map((person) => ({ person, hours: scheduledHoursByPerson[person.id] ?? 0 }))
      .sort((a, b) => b.hours - a.hours);

    const highest = ranked[0];
    const lowest = ranked[ranked.length - 1];

    if (!highest || !lowest || highest.hours <= 0) return '';

    const differencePercent =
      lowest.hours <= 0
        ? 100
        : ((highest.hours - lowest.hours) / lowest.hours) * 100;

    if (differencePercent < 25) return '';

    const reasons: string[] = [];
    const highDays = DAY_KEYS.filter((day) => highest.person.days[day]).length;
    const lowDays = DAY_KEYS.filter((day) => lowest.person.days[day]).length;
    const lowBlocked = DAY_KEYS.reduce(
      (sum, day) => sum + (lowest.person.blockedTimes?.[day]?.length ?? 0),
      0
    );

    if (lowDays < highDays) reasons.push(`${lowest.person.name} är tillgänglig färre dagar`);
    if (lowBlocked > 0) reasons.push(`${lowest.person.name} har tidsbegränsningar`);

    const lowHasShorterDays = DAY_KEYS.some((day) => {
      if (!lowest.person.days[day]) return false;
      const lowTime = lowest.person.workTimes[day];
      const highTime = highest.person.workTimes[day];
      return (
        lowTime &&
        highTime &&
        netWorkMinutes(lowTime.start, lowTime.end) < netWorkMinutes(highTime.start, highTime.end)
      );
    });

    if (lowHasShorterDays) reasons.push(`${lowest.person.name} har kortare arbetstider vissa dagar`);

    if (reasons.length === 0) {
      reasons.push('reglerna om max ett pass per dag och jämn fördelning begränsar alternativen');
    }

    const percentText = lowest.hours <= 0 ? 'klart fler' : `${Math.round(differencePercent)} % fler`;

    return `${highest.person.name} har ${percentText} schemalagda timmar än ${lowest.person.name}, främst eftersom ${reasons.join(' och ')}.`;
  }, [staff, scheduledHoursByPerson]);

  function assignPersonToSlot(employeeId: string, dateKey: string, slotStart: string, slotEnd: string) {
    if (!/^\d{2}:\d{2}$/.test(slotStart) || !/^\d{2}:\d{2}$/.test(slotEnd)) {
      setMessage('Ogiltig passtid. Försök igen.');
      return;
    }

    const person = staff.find((item) => item.id === employeeId);
    if (!person) return;

    const date = new Date(`${dateKey}T12:00:00`);
    const day = getDayKey(date);

    if (!person.days[day]) {
      setMessage(`${person.name} är markerad som ledig ${DAY_LABELS[day]}.`);
      return;
    }

    if (assignments.some((assignment) => assignment.employeeId === employeeId && assignment.date === dateKey)) {
      setMessage(`${person.name} har redan ett pass på ${DAY_LABELS[day]}. Max ett pass per dag.`);
      return;
    }

    const workTime = person.workTimes[day] ?? { start: WORK_START, end: WORK_END };
    const blocked = person.blockedTimes?.[day] ?? [];

    const occupied = assignments.some(
      (assignment) =>
        assignment.date === dateKey &&
        overlapsTime(slotStart, slotEnd, { start: assignment.start, end: assignment.end })
    );

    if (occupied) {
      assignPerson(employeeId, dateKey);
      return;
    }

    if (
      toMinutes(workTime.start) > toMinutes(slotStart) ||
      toMinutes(workTime.end) < toMinutes(slotEnd) ||
      blocked.some((period) => overlapsTime(slotStart, slotEnd, period))
    ) {
      setMessage(`${person.name} är inte tillgänglig ${slotStart}–${slotEnd} på ${DAY_LABELS[day]}.`);
      return;
    }

    setAssignments((current) => [
      ...current,
      {
        id: `manual-${Date.now()}-${employeeId}`,
        employeeId,
        date: dateKey,
        start: slotStart,
        end: slotEnd,
      },
    ]);

    setMessage(`${person.name} lades i det lediga passet ${slotStart}–${slotEnd} på ${DAY_LABELS[day]}.`);
  }

  function assignPerson(employeeId: string, dateKey: string) {
    const person = staff.find((item) => item.id === employeeId);
    if (!person) return;

    const date = new Date(`${dateKey}T12:00:00`);
    const day = getDayKey(date);

    if (!person.days[day]) {
      setMessage(`${person.name} är markerad som ledig ${DAY_LABELS[day]}.`);
      return;
    }

    if (assignments.some((assignment) => assignment.employeeId === employeeId && assignment.date === dateKey)) {
      setMessage(`${person.name} har redan ett pass på ${DAY_LABELS[day]}. Max ett pass per dag.`);
      return;
    }

    const dayAssignments = assignments.filter((assignment) => assignment.date === dateKey);
    const candidateSlots: Array<{ start: string; end: string }> = [];
    let slotStart = toMinutes(WORK_START);
    const workdayEnd = toMinutes(WORK_END);

    while (slotStart < workdayEnd) {
      if (slotStart >= toMinutes(LUNCH_START) && slotStart < toMinutes(LUNCH_END)) {
        slotStart = toMinutes(LUNCH_END);
        continue;
      }

      const start = minutesToTime(slotStart);
      const end = contiguousShiftEnd(start, WORK_END, shiftLengthMinutes);
      const endMinutes = Math.min(workdayEnd, toMinutes(end));

      if (endMinutes <= slotStart) break;

      candidateSlots.push({ start, end: minutesToTime(endMinutes) });
      slotStart = endMinutes;

      if (slotStart === toMinutes(LUNCH_START)) {
        slotStart = toMinutes(LUNCH_END);
      }
    }

    const workTime = person.workTimes[day] ?? { start: WORK_START, end: WORK_END };
    const blocked = person.blockedTimes?.[day] ?? [];

    const availableSlot = candidateSlots.find((slot) => {
      const alreadyScheduled = dayAssignments.some((assignment) =>
        overlapsTime(slot.start, slot.end, { start: assignment.start, end: assignment.end })
      );

      if (alreadyScheduled) return false;

      return (
        toMinutes(workTime.start) <= toMinutes(slot.start) &&
        toMinutes(workTime.end) >= toMinutes(slot.end) &&
        !blocked.some((period) => overlapsTime(slot.start, slot.end, period))
      );
    });

    if (!availableSlot) {
      const replacementTarget = [...dayAssignments]
        .sort((a, b) => toMinutes(a.start) - toMinutes(b.start))
        .find((assignment) =>
          toMinutes(workTime.start) <= toMinutes(assignment.start) &&
          toMinutes(workTime.end) >= toMinutes(assignment.end) &&
          !blocked.some((period) => overlapsTime(assignment.start, assignment.end, period))
        );

      if (replacementTarget) {
        replaceAssignmentWithPerson(employeeId, replacementTarget.id);
        return;
      }

      const hasAnyGap = candidateSlots.some((slot) =>
        !dayAssignments.some((assignment) =>
          overlapsTime(slot.start, slot.end, { start: assignment.start, end: assignment.end })
        )
      );

      setMessage(
        hasAnyGap
          ? `Det finns ett ledigt pass på ${DAY_LABELS[day]}, men ${person.name} är inte tillgänglig då.`
          : `${person.name} kan inte ta något av passen på ${DAY_LABELS[day]} enligt sin tillgänglighet.`
      );
      return;
    }

    setAssignments((current) => [
      ...current,
      {
        id: `manual-${Date.now()}-${employeeId}`,
        employeeId,
        date: dateKey,
        start: availableSlot.start,
        end: availableSlot.end,
      },
    ]);

    setMessage(
      `${person.name} lades i det lediga passet ${availableSlot.start}–${availableSlot.end} på ${DAY_LABELS[day]}.`
    );
  }

  function removeAssignment(assignmentId: string) {
    setAssignments((current) => current.filter((assignment) => assignment.id !== assignmentId));
  }

  function hasBoundaryConflict(
    employeeId: string,
    dateKey: string,
    start: string,
    end: string,
    ignoreIds: string[] = []
  ) {
    const date = new Date(`${dateKey}T12:00:00`);
    const previousDateKey = localDateKey(addDays(date, -1));
    const nextDateKey = localDateKey(addDays(date, 1));

    const relevant = assignments.filter(
      (assignment) =>
        assignment.employeeId === employeeId &&
        !ignoreIds.includes(assignment.id)
    );

    const previousAssignments = relevant.filter((assignment) => assignment.date === previousDateKey);
    const nextAssignments = relevant.filter((assignment) => assignment.date === nextDateKey);

    const isOpening = start === WORK_START;
    const isClosing = end === WORK_END;

    if (
      isOpening &&
      (
        previousAssignments.some((assignment) => assignment.start === WORK_START) ||
        previousAssignments.some((assignment) => assignment.end === WORK_END) ||
        nextAssignments.some((assignment) => assignment.start === WORK_START)
      )
    ) {
      return true;
    }

    if (
      isClosing &&
      (
        previousAssignments.some((assignment) => assignment.end === WORK_END) ||
        nextAssignments.some((assignment) => assignment.end === WORK_END) ||
        nextAssignments.some((assignment) => assignment.start === WORK_START)
      )
    ) {
      return true;
    }

    return false;
  }

  function replaceAssignmentWithPerson(employeeId: string, assignmentId: string) {
    const person = staff.find((item) => item.id === employeeId);
    const target = assignments.find((assignment) => assignment.id === assignmentId);
    if (!person || !target) return;

    if (target.employeeId === employeeId) {
      setMessage(`${person.name} har redan det passet.`);
      return;
    }

    const date = new Date(`${target.date}T12:00:00`);
    const day = getDayKey(date);

    if (!person.days[day]) {
      setMessage(`${person.name} är markerad som ledig ${DAY_LABELS[day]}.`);
      return;
    }

    const existingSameDay = assignments.find(
      (assignment) =>
        assignment.id !== target.id &&
        assignment.employeeId === employeeId &&
        assignment.date === target.date
    );

    if (existingSameDay) {
      setMessage(`${person.name} har redan ett pass på ${DAY_LABELS[day]}. Max ett pass per dag.`);
      return;
    }

    const workTime = person.workTimes[day] ?? { start: WORK_START, end: WORK_END };
    const blocked = person.blockedTimes?.[day] ?? [];

    if (
      toMinutes(workTime.start) > toMinutes(target.start) ||
      toMinutes(workTime.end) < toMinutes(target.end) ||
      blocked.some((period) => overlapsTime(target.start, target.end, period))
    ) {
      setMessage(`${person.name} är inte tillgänglig ${target.start}–${target.end} på ${DAY_LABELS[day]}.`);
      return;
    }

    const previousPerson = staff.find((item) => item.id === target.employeeId);

    setAssignments((current) =>
      current.map((assignment) =>
        assignment.id === target.id
          ? { ...assignment, employeeId }
          : assignment
      )
    );

    setMessage(
      previousPerson
        ? `${person.name} ersatte ${previousPerson.name} på passet ${target.start}–${target.end}.`
        : `${person.name} tog passet ${target.start}–${target.end}.`
    );
  }

  function handleDragEnd(event: any) {
    if (event.canceled) return;

    const sourceId = String(event.operation.source?.id ?? '');
    const targetId = String(event.operation.target?.id ?? '');

    if (sourceId.startsWith('assignment:') && targetId.startsWith('slot:')) {
      const sourceAssignmentId = sourceId.replace('assignment:', '');
      const [, dateKey, encodedStart, encodedEnd] = targetId.split(':');
      const slotStart = encodedStart?.replace('.', ':');
      const slotEnd = encodedEnd?.replace('.', ':');

      if (!dateKey || !slotStart || !slotEnd || !/^\d{2}:\d{2}$/.test(slotStart) || !/^\d{2}:\d{2}$/.test(slotEnd)) {
        setMessage('Kunde inte läsa det lediga passet. Försök igen.');
        return;
      }

      const sourceAssignment = assignments.find((assignment) => assignment.id === sourceAssignmentId);
      if (!sourceAssignment || sourceAssignment.date !== dateKey) {
        setMessage('Pass kan bara flyttas till en annan ledig tid samma dag.');
        return;
      }

      const person = staff.find((item) => item.id === sourceAssignment.employeeId);
      if (!person) return;

      const date = new Date(`${dateKey}T12:00:00`);
      const day = getDayKey(date);
      const workTime = person.workTimes[day] ?? { start: WORK_START, end: WORK_END };
      const blocked = person.blockedTimes?.[day] ?? [];

      const occupied = assignments.some(
        (assignment) =>
          assignment.id !== sourceAssignmentId &&
          assignment.date === dateKey &&
          overlapsTime(slotStart, slotEnd, { start: assignment.start, end: assignment.end })
      );

      if (occupied) {
        setMessage('Det passet är inte längre ledigt.');
        return;
      }

      if (
        toMinutes(workTime.start) > toMinutes(slotStart) ||
        toMinutes(workTime.end) < toMinutes(slotEnd) ||
        blocked.some((period) => overlapsTime(slotStart, slotEnd, period))
      ) {
        setMessage(`${person.name} är inte tillgänglig ${slotStart}–${slotEnd}.`);
        return;
      }

      if (hasBoundaryConflict(person.id, dateKey, slotStart, slotEnd, [sourceAssignmentId])) {
        setMessage(`Flytten stoppades för ${person.name}: undvik flera första/sista pass i rad.`);
        return;
      }

      setAssignments((current) =>
        current.map((assignment) =>
          assignment.id === sourceAssignmentId
            ? { ...assignment, start: slotStart, end: slotEnd }
            : assignment
        )
      );

      setMessage(
        `${person.name} flyttades från ${sourceAssignment.start}–${sourceAssignment.end} till ${slotStart}–${slotEnd}.`
      );
      return;
    }

    if (sourceId.startsWith('staff:') && targetId.startsWith('slot:')) {
      const [, dateKey, encodedStart, encodedEnd] = targetId.split(':');
      const slotStart = encodedStart?.replace('.', ':');
      const slotEnd = encodedEnd?.replace('.', ':');

      if (!dateKey || !slotStart || !slotEnd || !/^\d{2}:\d{2}$/.test(slotStart) || !/^\d{2}:\d{2}$/.test(slotEnd)) {
        setMessage('Kunde inte läsa det lediga passet. Försök igen.');
        return;
      }

      assignPersonToSlot(sourceId.replace('staff:', ''), dateKey, slotStart, slotEnd);
      return;
    }

    if (sourceId.startsWith('assignment:') && targetId.startsWith('assignment:')) {
      const sourceAssignmentId = sourceId.replace('assignment:', '');
      const targetAssignmentId = targetId.replace('assignment:', '');

      if (sourceAssignmentId === targetAssignmentId) return;

      const sourceAssignment = assignments.find((assignment) => assignment.id === sourceAssignmentId);
      const targetAssignment = assignments.find((assignment) => assignment.id === targetAssignmentId);

      if (!sourceAssignment || !targetAssignment) return;

      const sourcePerson = staff.find((person) => person.id === sourceAssignment.employeeId);
      const targetPerson = staff.find((person) => person.id === targetAssignment.employeeId);

      const sourceWouldDuplicate = assignments.some(
        (assignment) =>
          assignment.id !== sourceAssignmentId &&
          assignment.id !== targetAssignmentId &&
          assignment.employeeId === sourceAssignment.employeeId &&
          assignment.date === targetAssignment.date
      );
      const targetWouldDuplicate = assignments.some(
        (assignment) =>
          assignment.id !== sourceAssignmentId &&
          assignment.id !== targetAssignmentId &&
          assignment.employeeId === targetAssignment.employeeId &&
          assignment.date === sourceAssignment.date
      );

      if (sourceWouldDuplicate || targetWouldDuplicate) {
        setMessage('Bytet går inte: max ett pass per person och dag.');
        return;
      }

      const sourceBoundaryConflict = hasBoundaryConflict(
        sourceAssignment.employeeId,
        targetAssignment.date,
        targetAssignment.start,
        targetAssignment.end,
        [sourceAssignmentId, targetAssignmentId]
      );
      const targetBoundaryConflict = hasBoundaryConflict(
        targetAssignment.employeeId,
        sourceAssignment.date,
        sourceAssignment.start,
        sourceAssignment.end,
        [sourceAssignmentId, targetAssignmentId]
      );

      if (sourceBoundaryConflict || targetBoundaryConflict) {
        setMessage('Bytet stoppades: undvik flera första/sista pass i rad.');
        return;
      }

      setAssignments((current) =>
        current.map((assignment) => {
          if (assignment.id === sourceAssignmentId) {
            return { ...assignment, employeeId: targetAssignment.employeeId };
          }
          if (assignment.id === targetAssignmentId) {
            return { ...assignment, employeeId: sourceAssignment.employeeId };
          }
          return assignment;
        })
      );

      setMessage(
        sourcePerson && targetPerson
          ? `${sourcePerson.name} och ${targetPerson.name} bytte pass.`
          : 'Två personer bytte pass.'
      );
      return;
    }

    if (sourceId.startsWith('staff:') && targetId.startsWith('day:')) {
      assignPerson(sourceId.replace('staff:', ''), targetId.replace('day:', ''));
      return;
    }

    if (sourceId.startsWith('staff:') && targetId.startsWith('assignment:')) {
      replaceAssignmentWithPerson(
        sourceId.replace('staff:', ''),
        targetId.replace('assignment:', '')
      );
      return;
    }
  }

  function generateSimpleSchedule(
    staffSource: Staff[] = staff,
    excluded: Array<{ employeeId: string; date: string }> = [],
    reason?: string
  ) {
    const weekKeys = visibleDates.map(localDateKey);
    const currentMonth = weekStart.getMonth();
    const currentYear = weekStart.getFullYear();
    const weekStartKey = localDateKey(weekStart);

    const monthHistory = assignments
      .filter((assignment) => {
        const date = new Date(`${assignment.date}T12:00:00`);
        return (
          date.getFullYear() === currentYear &&
          date.getMonth() === currentMonth &&
          assignment.date < weekStartKey
        );
      })
      .map((assignment) => {
        const date = new Date(`${assignment.date}T12:00:00`);
        return {
          employeeId: assignment.employeeId,
          day: getDayKey(date),
          start: assignment.start,
          end: assignment.end,
        };
      });

    const generated: Assignment[] = [];
    const assignedMinutes: Record<string, number> = Object.fromEntries(
      staffSource.map((person) => [person.id, 0])
    );
    const closingCounts: Record<string, number> = Object.fromEntries(
      staffSource.map((person) => [person.id, 0])
    );
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
        if (slotStart >= toMinutes(LUNCH_START) && slotStart < toMinutes(LUNCH_END)) {
          slotStart = toMinutes(LUNCH_END);
          continue;
        }

        const slotStartTime = minutesToTime(slotStart);
        const slotEndTime = contiguousShiftEnd(slotStartTime, WORK_END, shiftLengthMinutes);
        const slotEnd = Math.min(workdayEnd, toMinutes(slotEndTime));
        const actualEndTime = minutesToTime(slotEnd);

        if (slotEnd <= slotStart) break;

        const isClosingShift = slotEnd === workdayEnd;
        const isOpeningShift = slotStart === toMinutes(WORK_START);

        const candidates = staffSource
          .filter((person) => {
            if (!person.days[day]) return false;
            if (excluded.some((entry) => entry.employeeId === person.id && entry.date === dateKey)) return false;
            if (generated.some((assignment) => assignment.employeeId === person.id && assignment.date === dateKey)) return false;

            const availability = person.workTimes[day] ?? { start: WORK_START, end: WORK_END };
            const blocked = person.blockedTimes?.[day] ?? [];

            return (
              toMinutes(availability.start) <= slotStart &&
              toMinutes(availability.end) >= slotEnd &&
              !blocked.some((period) => overlapsTime(slotStartTime, actualEndTime, period))
            );
          })
          .map((person) => {
            const consecutiveClosePenalty =
              isClosingShift && lastClosingDate[person.id] === previousDateKey ? 80000 : 0;

            const closeThenOpenPenalty =
              isOpeningShift && lastClosingDate[person.id] === previousDateKey ? 90000 : 0;

            const closingLoadPenalty =
              isClosingShift ? (closingCounts[person.id] ?? 0) * 20000 : 0;

            const sameSlotThisMonth = monthHistory.filter(
              (item) =>
                item.employeeId === person.id &&
                item.day === day &&
                item.start === slotStartTime &&
                item.end === actualEndTime
            ).length;

            const sameBoundaryThisMonth = monthHistory.filter(
              (item) =>
                item.employeeId === person.id &&
                item.day === day &&
                ((isOpeningShift && item.start === WORK_START) ||
                  (isClosingShift && item.end === WORK_END))
            ).length;

            // Mjuk månadsruljans: används för variation men får inte slå ut rättvis timfördelning.
            const monthlyRotationPenalty =
              sameSlotThisMonth * 3500 +
              sameBoundaryThisMonth * 1800;

            const fairnessScore = (assignedMinutes[person.id] ?? 0) * 100;

            return {
              person,
              score:
                fairnessScore +
                consecutiveClosePenalty +
                closeThenOpenPenalty +
                closingLoadPenalty +
                monthlyRotationPenalty,
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

          if (isClosingShift) {
            closingCounts[chosen.id] = (closingCounts[chosen.id] ?? 0) + 1;
            lastClosingDate[chosen.id] = dateKey;
          }
        } else {
          coverageGaps.push(`${DAY_LABELS[day]} ${slotStartTime}–${actualEndTime}`);
        }

        slotStart = slotEnd;
        if (slotStart === toMinutes(LUNCH_START)) {
          slotStart = toMinutes(LUNCH_END);
        }
        slotIndex += 1;
      }
    }

    setAssignments((current) => [
      ...current.filter((assignment) => !weekKeys.includes(assignment.date)),
      ...generated,
    ]);

    if (coverageGaps.length) {
      setMessage(
        `${reason ? reason + ' ' : ''}Schemat genererades om, men följande tider saknar tillgänglig personal: ${coverageGaps.join(', ')}.`
      );
    } else {
      setMessage(
        reason
          ? `${reason} Schemat genererades om automatiskt.`
          : `Schemat skapades med jämn fördelning och försöker variera passen mellan veckorna inom månaden.`
      );
    }
  }

  function generateMonthSchedule() {
    const year = cursorDate.getFullYear();
    const month = cursorDate.getMonth();
    const monthDates: Date[] = [];

    const lastDay = new Date(year, month + 1, 0).getDate();
    for (let dayNumber = 1; dayNumber <= lastDay; dayNumber += 1) {
      const date = new Date(year, month, dayNumber);
      const weekday = date.getDay();
      if (weekday >= 1 && weekday <= 5) monthDates.push(date);
    }

    const monthKeys = monthDates.map(localDateKey);
    const generated: Assignment[] = [];
    const assignedMinutes: Record<string, number> = Object.fromEntries(
      staff.map((person) => [person.id, 0])
    );
    const closingCounts: Record<string, number> = Object.fromEntries(
      staff.map((person) => [person.id, 0])
    );
    const lastClosingDate: Record<string, string | undefined> = {};
    const coverageGaps: string[] = [];

    for (const date of monthDates) {
      const day = getDayKey(date);
      const dateKey = localDateKey(date);
      const previousDateKey = localDateKey(addDays(date, -1));
      let slotStart = toMinutes(WORK_START);
      const workdayEnd = toMinutes(WORK_END);
      let slotIndex = 0;

      while (slotStart < workdayEnd) {
        if (slotStart >= toMinutes(LUNCH_START) && slotStart < toMinutes(LUNCH_END)) {
          slotStart = toMinutes(LUNCH_END);
          continue;
        }

        const slotStartTime = minutesToTime(slotStart);
        const slotEndTime = contiguousShiftEnd(slotStartTime, WORK_END, shiftLengthMinutes);
        const slotEnd = Math.min(workdayEnd, toMinutes(slotEndTime));
        const actualEndTime = minutesToTime(slotEnd);

        if (slotEnd <= slotStart) break;

        const isOpeningShift = slotStart === toMinutes(WORK_START);
        const isClosingShift = slotEnd === workdayEnd;

        const candidates = staff
          .filter((person) => {
            if (!person.days[day]) return false;
            if (generated.some((assignment) => assignment.employeeId === person.id && assignment.date === dateKey)) {
              return false;
            }

            const availability = person.workTimes[day] ?? { start: WORK_START, end: WORK_END };
            const blocked = person.blockedTimes?.[day] ?? [];

            return (
              toMinutes(availability.start) <= slotStart &&
              toMinutes(availability.end) >= slotEnd &&
              !blocked.some((period) => overlapsTime(slotStartTime, actualEndTime, period))
            );
          })
          .map((person) => {
            const consecutiveClosePenalty =
              isClosingShift && lastClosingDate[person.id] === previousDateKey ? 80000 : 0;

            const closeThenOpenPenalty =
              isOpeningShift && lastClosingDate[person.id] === previousDateKey ? 90000 : 0;

            const closingLoadPenalty =
              isClosingShift ? (closingCounts[person.id] ?? 0) * 20000 : 0;

            const sameSlotEarlierThisMonth = generated.filter((assignment) => {
              if (assignment.employeeId !== person.id) return false;
              const assignmentDate = new Date(`${assignment.date}T12:00:00`);
              return (
                getDayKey(assignmentDate) === day &&
                assignment.start === slotStartTime &&
                assignment.end === actualEndTime
              );
            }).length;

            const sameBoundaryEarlierThisMonth = generated.filter((assignment) => {
              if (assignment.employeeId !== person.id) return false;
              const assignmentDate = new Date(`${assignment.date}T12:00:00`);
              if (getDayKey(assignmentDate) !== day) return false;
              return (
                (isOpeningShift && assignment.start === WORK_START) ||
                (isClosingShift && assignment.end === WORK_END)
              );
            }).length;

            const monthlyRotationPenalty =
              sameSlotEarlierThisMonth * 3500 +
              sameBoundaryEarlierThisMonth * 1800;

            const fairnessScore = (assignedMinutes[person.id] ?? 0) * 100;

            return {
              person,
              score:
                fairnessScore +
                consecutiveClosePenalty +
                closeThenOpenPenalty +
                closingLoadPenalty +
                monthlyRotationPenalty,
            };
          })
          .sort((a, b) => a.score - b.score || a.person.name.localeCompare(b.person.name, 'sv'));

        const chosen = candidates[0]?.person;

        if (chosen) {
          generated.push({
            id: `auto-month-${dateKey}-${slotIndex}-${chosen.id}`,
            employeeId: chosen.id,
            date: dateKey,
            start: slotStartTime,
            end: actualEndTime,
          });

          assignedMinutes[chosen.id] =
            (assignedMinutes[chosen.id] ?? 0) +
            netWorkMinutes(slotStartTime, actualEndTime);

          if (isClosingShift) {
            closingCounts[chosen.id] = (closingCounts[chosen.id] ?? 0) + 1;
            lastClosingDate[chosen.id] = dateKey;
          }
        } else {
          coverageGaps.push(`${date.toLocaleDateString('sv-SE', { weekday: 'short', day: 'numeric', month: 'short' })} ${slotStartTime}–${actualEndTime}`);
        }

        slotStart = slotEnd;
        if (slotStart === toMinutes(LUNCH_START)) {
          slotStart = toMinutes(LUNCH_END);
        }
        slotIndex += 1;
      }
    }

    setAssignments((current) => [
      ...current.filter((assignment) => !monthKeys.includes(assignment.date)),
      ...generated,
    ]);

    setMessage(
      coverageGaps.length
        ? `Månadsschemat skapades för ${selectedMonthLabel}, men ${coverageGaps.length} pass saknar tillgänglig personal.`
        : `Månadsschemat skapades för ${selectedMonthLabel} med jämn fördelning och variation mellan veckorna.`
    );
  }

  function resetVisibleSchedule() {
    const confirmed = window.confirm(
      `Nollställ schema för vecka ${getIsoWeek(cursorDate)}?\n\nAlla pass i den här veckan tas bort. Personal och inställningar behålls.`
    );

    if (!confirmed) {
      setMessage('Nollställningen av schemat avbröts.');
      return;
    }

    const keys = visibleDates.map(localDateKey);
    setAssignments((current) => current.filter((assignment) => !keys.includes(assignment.date)));
    setMessage(`Schema för vecka ${getIsoWeek(cursorDate)} nollställdes.`);
  }

  function resetAllSchedules() {
    const confirmed = window.confirm(
      'Nollställ alla scheman?\n\nDetta tar bort alla schemalagda pass i alla veckor och månader. Personal, arbetstider, tidsbegränsningar och övriga inställningar behålls.'
    );

    if (!confirmed) {
      setMessage('Nollställ alla scheman avbröts.');
      return;
    }

    setAssignments([]);
    setMessage('Alla scheman nollställdes. Personal och inställningar behölls.');
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

  function findFirstAvailableSlotForPerson(
    person: Staff,
    dateKey: string,
    ignoreAssignmentIds: string[] = []
  ) {
    const date = new Date(`${dateKey}T12:00:00`);
    const day = getDayKey(date);
    if (!person.days[day]) return null;

    const workTime = person.workTimes[day] ?? { start: WORK_START, end: WORK_END };
    const blocked = person.blockedTimes?.[day] ?? [];
    const dayAssignments = assignments.filter(
      (assignment) => assignment.date === dateKey && !ignoreAssignmentIds.includes(assignment.id)
    );

    let slotStart = toMinutes(WORK_START);
    const workdayEnd = toMinutes(WORK_END);

    while (slotStart < workdayEnd) {
      if (slotStart >= toMinutes(LUNCH_START) && slotStart < toMinutes(LUNCH_END)) {
        slotStart = toMinutes(LUNCH_END);
        continue;
      }

      const start = minutesToTime(slotStart);
      const end = contiguousShiftEnd(start, WORK_END, shiftLengthMinutes);
      const endMinutes = Math.min(workdayEnd, toMinutes(end));
      if (endMinutes <= slotStart) break;

      const candidate = { start, end: minutesToTime(endMinutes) };
      const occupied = dayAssignments.some((assignment) =>
        overlapsTime(candidate.start, candidate.end, {
          start: assignment.start,
          end: assignment.end,
        })
      );

      const available =
        !occupied &&
        toMinutes(workTime.start) <= toMinutes(candidate.start) &&
        toMinutes(workTime.end) >= toMinutes(candidate.end) &&
        !blocked.some((period) => overlapsTime(candidate.start, candidate.end, period)) &&
        !hasBoundaryConflict(person.id, dateKey, candidate.start, candidate.end, ignoreAssignmentIds);

      if (available) return candidate;

      slotStart = endMinutes;
      if (slotStart === toMinutes(LUNCH_START)) {
        slotStart = toMinutes(LUNCH_END);
      }
    }

    return null;
  }

  function movePersonBetweenDays(person: Staff, fromDay: DayKey, toDay: DayKey) {
    const fromDateKey = localDateKey(addDays(weekStart, DAY_KEYS.indexOf(fromDay)));
    const toDateKey = localDateKey(addDays(weekStart, DAY_KEYS.indexOf(toDay)));

    const source = assignments.find(
      (assignment) => assignment.employeeId === person.id && assignment.date === fromDateKey
    );

    if (!source) {
      setMessage(`${person.name} har inget pass på ${DAY_LABELS[fromDay]}.`);
      return;
    }

    if (assignments.some((assignment) => assignment.employeeId === person.id && assignment.date === toDateKey)) {
      setMessage(`${person.name} har redan ett pass på ${DAY_LABELS[toDay]}.`);
      return;
    }

    const targetDate = new Date(`${toDateKey}T12:00:00`);
    const targetDayKey = getDayKey(targetDate);
    const workTime = person.workTimes[targetDayKey] ?? { start: WORK_START, end: WORK_END };
    const blocked = person.blockedTimes?.[targetDayKey] ?? [];

    const sameTimeFree = !assignments.some(
      (assignment) =>
        assignment.date === toDateKey &&
        overlapsTime(source.start, source.end, { start: assignment.start, end: assignment.end })
    );

    const sameTimeAllowed =
      person.days[targetDayKey] &&
      sameTimeFree &&
      toMinutes(workTime.start) <= toMinutes(source.start) &&
      toMinutes(workTime.end) >= toMinutes(source.end) &&
      !blocked.some((period) => overlapsTime(source.start, source.end, period)) &&
      !hasBoundaryConflict(person.id, toDateKey, source.start, source.end, [source.id]);

    const targetSlot = sameTimeAllowed
      ? { start: source.start, end: source.end }
      : findFirstAvailableSlotForPerson(person, toDateKey, [source.id]);

    if (!targetSlot) {
      setMessage(`Det finns inget giltigt ledigt pass för ${person.name} på ${DAY_LABELS[toDay]}.`);
      return;
    }

    setAssignments((current) =>
      current.map((assignment) =>
        assignment.id === source.id
          ? { ...assignment, date: toDateKey, start: targetSlot.start, end: targetSlot.end }
          : assignment
      )
    );

    setMessage(
      `${person.name} flyttades från ${DAY_LABELS[fromDay]} till ${DAY_LABELS[toDay]} ${targetSlot.start}–${targetSlot.end}.`
    );
  }

  function swapPeopleOnDay(first: Staff, second: Staff, day: DayKey) {
    const dateKey = localDateKey(addDays(weekStart, DAY_KEYS.indexOf(day)));
    const firstAssignment = assignments.find(
      (assignment) => assignment.employeeId === first.id && assignment.date === dateKey
    );
    const secondAssignment = assignments.find(
      (assignment) => assignment.employeeId === second.id && assignment.date === dateKey
    );

    if (!firstAssignment || !secondAssignment) {
      setMessage(`Både ${first.name} och ${second.name} måste ha ett pass på ${DAY_LABELS[day]}.`);
      return;
    }

    const firstConflict = hasBoundaryConflict(
      first.id,
      dateKey,
      secondAssignment.start,
      secondAssignment.end,
      [firstAssignment.id, secondAssignment.id]
    );
    const secondConflict = hasBoundaryConflict(
      second.id,
      dateKey,
      firstAssignment.start,
      firstAssignment.end,
      [firstAssignment.id, secondAssignment.id]
    );

    if (firstConflict || secondConflict) {
      setMessage('Bytet stoppades: undvik flera första/sista pass i rad.');
      return;
    }

    const firstWorkTime = first.workTimes[day] ?? { start: WORK_START, end: WORK_END };
    const secondWorkTime = second.workTimes[day] ?? { start: WORK_START, end: WORK_END };
    const firstBlocked = first.blockedTimes?.[day] ?? [];
    const secondBlocked = second.blockedTimes?.[day] ?? [];

    const firstCanTakeSecond =
      toMinutes(firstWorkTime.start) <= toMinutes(secondAssignment.start) &&
      toMinutes(firstWorkTime.end) >= toMinutes(secondAssignment.end) &&
      !firstBlocked.some((period) =>
        overlapsTime(secondAssignment.start, secondAssignment.end, period)
      );
    const secondCanTakeFirst =
      toMinutes(secondWorkTime.start) <= toMinutes(firstAssignment.start) &&
      toMinutes(secondWorkTime.end) >= toMinutes(firstAssignment.end) &&
      !secondBlocked.some((period) =>
        overlapsTime(firstAssignment.start, firstAssignment.end, period)
      );

    if (!firstCanTakeSecond || !secondCanTakeFirst) {
      setMessage('Bytet går inte eftersom någon inte är tillgänglig under det andra passet.');
      return;
    }

    setAssignments((current) =>
      current.map((assignment) => {
        if (assignment.id === firstAssignment.id) {
          return { ...assignment, employeeId: second.id };
        }
        if (assignment.id === secondAssignment.id) {
          return { ...assignment, employeeId: first.id };
        }
        return assignment;
      })
    );

    setMessage(`${first.name} och ${second.name} bytte plats på ${DAY_LABELS[day]}.`);
  }

  function clearDay(day: DayKey) {
    const dateKey = localDateKey(addDays(weekStart, DAY_KEYS.indexOf(day)));
    const hadAssignments = assignments.some((assignment) => assignment.date === dateKey);

    setAssignments((current) => current.filter((assignment) => assignment.date !== dateKey));
    setMessage(
      hadAssignments
        ? `${DAY_LABELS[day]} rensades.`
        : `${DAY_LABELS[day]} var redan tom.`
    );
  }

  function regenerateDay(day: DayKey) {
    const date = addDays(weekStart, DAY_KEYS.indexOf(day));
    const dateKey = localDateKey(date);
    const dayIndex = DAY_KEYS.indexOf(day);
    const previousDateKey = localDateKey(addDays(date, -1));
    const nextDateKey = localDateKey(addDays(date, 1));

    const outsideDay = assignments.filter((assignment) => assignment.date !== dateKey);
    const weeklyMinutes: Record<string, number> = Object.fromEntries(staff.map((person) => [person.id, 0]));

    for (const assignment of outsideDay) {
      if (!visibleDateKeys.includes(assignment.date)) continue;
      weeklyMinutes[assignment.employeeId] =
        (weeklyMinutes[assignment.employeeId] ?? 0) +
        netWorkMinutes(assignment.start, assignment.end);
    }

    const generated: Assignment[] = [];
    const used = new Set<string>();
    const gaps: string[] = [];
    let slotStart = toMinutes(WORK_START);
    const workdayEnd = toMinutes(WORK_END);
    let slotIndex = 0;

    while (slotStart < workdayEnd) {
      if (slotStart >= toMinutes(LUNCH_START) && slotStart < toMinutes(LUNCH_END)) {
        slotStart = toMinutes(LUNCH_END);
        continue;
      }

      const slotStartTime = minutesToTime(slotStart);
      const slotEndTime = contiguousShiftEnd(slotStartTime, WORK_END, shiftLengthMinutes);
      const slotEnd = Math.min(workdayEnd, toMinutes(slotEndTime));
      const actualEndTime = minutesToTime(slotEnd);

      if (slotEnd <= slotStart) break;

      const isOpening = slotStart === toMinutes(WORK_START);
      const isClosing = slotEnd === workdayEnd;

      const candidates = staff
        .filter((person) => {
          if (used.has(person.id) || !person.days[day]) return false;

          const availability = person.workTimes[day] ?? { start: WORK_START, end: WORK_END };
          const blocked = person.blockedTimes?.[day] ?? [];

          return (
            toMinutes(availability.start) <= slotStart &&
            toMinutes(availability.end) >= slotEnd &&
            !blocked.some((period) => overlapsTime(slotStartTime, actualEndTime, period))
          );
        })
        .map((person) => {
          const previousAssignments = outsideDay.filter(
            (assignment) => assignment.employeeId === person.id && assignment.date === previousDateKey
          );
          const nextAssignments = outsideDay.filter(
            (assignment) => assignment.employeeId === person.id && assignment.date === nextDateKey
          );

          const boundaryPenalty =
            (isOpening &&
            (
              previousAssignments.some((assignment) => assignment.start === WORK_START) ||
              previousAssignments.some((assignment) => assignment.end === WORK_END) ||
              nextAssignments.some((assignment) => assignment.start === WORK_START)
            )
              ? 100000
              : 0) +
            (isClosing &&
            (
              previousAssignments.some((assignment) => assignment.end === WORK_END) ||
              nextAssignments.some((assignment) => assignment.end === WORK_END) ||
              nextAssignments.some((assignment) => assignment.start === WORK_START)
            )
              ? 100000
              : 0);

          return {
            person,
            score:
              (weeklyMinutes[person.id] ?? 0) +
              boundaryPenalty,
          };
        })
        .sort((a, b) => a.score - b.score || a.person.name.localeCompare(b.person.name, 'sv'));

      const chosen = candidates[0]?.person;

      if (chosen) {
        generated.push({
          id: `auto-day-${dateKey}-${slotIndex}-${chosen.id}-${Date.now()}`,
          employeeId: chosen.id,
          date: dateKey,
          start: slotStartTime,
          end: actualEndTime,
        });
        used.add(chosen.id);
        weeklyMinutes[chosen.id] =
          (weeklyMinutes[chosen.id] ?? 0) + netWorkMinutes(slotStartTime, actualEndTime);
      } else {
        gaps.push(`${slotStartTime}–${actualEndTime}`);
      }

      slotStart = slotEnd;
      if (slotStart === toMinutes(LUNCH_START)) {
        slotStart = toMinutes(LUNCH_END);
      }
      slotIndex += 1;
    }

    setAssignments([...outsideDay, ...generated]);

    setMessage(
      gaps.length
        ? `${DAY_LABELS[day]} gjordes om, men följande tider saknar personal: ${gaps.join(', ')}.`
        : `${DAY_LABELS[day]} gjordes om med hänsyn till övriga schemaregler.`
    );
  }

  function updatePersonAvailability(
    person: Staff,
    day: DayKey,
    patch: Partial<WorkTime>,
    description: string
  ) {
    const dateKey = localDateKey(addDays(weekStart, DAY_KEYS.indexOf(day)));
    const currentTime = person.workTimes[day] ?? { start: WORK_START, end: WORK_END };
    const nextTime = { ...currentTime, ...patch };

    if (toMinutes(nextTime.start) >= toMinutes(nextTime.end)) {
      setMessage('Starttiden måste vara före sluttiden.');
      return;
    }

    const nextStaff = staff.map((item) =>
      item.id === person.id
        ? {
            ...item,
            days: { ...item.days, [day]: true },
            workTimes: { ...item.workTimes, [day]: nextTime },
          }
        : item
    );

    const currentAssignment = assignments.find(
      (assignment) => assignment.employeeId === person.id && assignment.date === dateKey
    );
    const hasConflict =
      currentAssignment &&
      (
        toMinutes(currentAssignment.start) < toMinutes(nextTime.start) ||
        toMinutes(currentAssignment.end) > toMinutes(nextTime.end)
      );

    setStaff(nextStaff);

    if (hasConflict) {
      generateSimpleSchedule(nextStaff, [], `${description}.`);
    } else {
      setMessage(`${description}. Gäller ${DAY_LABELS[day]} och ingen nuvarande schemakrock behövde rättas.`);
    }
  }

  function addBlockedRange(
    person: Staff,
    day: DayKey,
    start: string,
    end: string,
    description: string
  ) {
    if (toMinutes(start) >= toMinutes(end)) {
      setMessage('Starttiden måste vara före sluttiden.');
      return;
    }

    const dateKey = localDateKey(addDays(weekStart, DAY_KEYS.indexOf(day)));
    const existing = person.blockedTimes?.[day] ?? [];
    const duplicate = existing.some((period) => period.start === start && period.end === end);

    const nextStaff = staff.map((item) =>
      item.id === person.id
        ? {
            ...item,
            blockedTimes: {
              ...item.blockedTimes,
              [day]: duplicate ? existing : [...existing, { start, end }],
            },
          }
        : item
    );

    const hasConflict = assignments.some(
      (assignment) =>
        assignment.employeeId === person.id &&
        assignment.date === dateKey &&
        overlapsTime(assignment.start, assignment.end, { start, end })
    );

    setStaff(nextStaff);

    if (hasConflict) {
      generateSimpleSchedule(nextStaff, [], `${description}.`);
    } else {
      setMessage(`${description}. Ingen nuvarande schemakrock behövde rättas.`);
    }
  }

  function describeDay(day: DayKey) {
    const dateKey = localDateKey(addDays(weekStart, DAY_KEYS.indexOf(day)));
    const dayAssignments = assignments
      .filter((assignment) => assignment.date === dateKey)
      .sort((a, b) => toMinutes(a.start) - toMinutes(b.start));

    if (!dayAssignments.length) {
      setMessage(`${DAY_LABELS[day]} har inga schemalagda pass.`);
      return;
    }

    const description = dayAssignments
      .map((assignment) => {
        const person = staff.find((item) => item.id === assignment.employeeId);
        return `${assignment.start}–${assignment.end} ${person?.name ?? 'Okänd'}`;
      })
      .join(', ');

    setMessage(`${DAY_LABELS[day]}: ${description}.`);
  }

  function describeOpenSlots(day: DayKey) {
    const dateKey = localDateKey(addDays(weekStart, DAY_KEYS.indexOf(day)));
    const dayAssignments = assignments.filter((assignment) => assignment.date === dateKey);
    const open: string[] = [];
    let slotStart = toMinutes(WORK_START);

    while (slotStart < toMinutes(WORK_END)) {
      if (slotStart >= toMinutes(LUNCH_START) && slotStart < toMinutes(LUNCH_END)) {
        slotStart = toMinutes(LUNCH_END);
        continue;
      }

      const start = minutesToTime(slotStart);
      const end = contiguousShiftEnd(start, WORK_END, shiftLengthMinutes);
      const endMinutes = Math.min(toMinutes(WORK_END), toMinutes(end));
      if (endMinutes <= slotStart) break;

      const endText = minutesToTime(endMinutes);
      const occupied = dayAssignments.some((assignment) =>
        overlapsTime(start, endText, { start: assignment.start, end: assignment.end })
      );

      if (!occupied) open.push(`${start}–${endText}`);

      slotStart = endMinutes;
      if (slotStart === toMinutes(LUNCH_START)) slotStart = toMinutes(LUNCH_END);
    }

    setMessage(
      open.length
        ? `Lediga pass ${DAY_LABELS[day]}: ${open.join(', ')}.`
        : `Det finns inga lediga pass på ${DAY_LABELS[day]}.`
    );
  }

  function describePersonHours(person: Staff) {
    const hours = scheduledHoursByPerson[person.id] ?? 0;
    setMessage(`${person.name} har ${hours.toFixed(1)} schemalagda timmar den här veckan.`);
  }

  function describeBoundaryWorker(day: DayKey, boundary: 'first' | 'last') {
    const dateKey = localDateKey(addDays(weekStart, DAY_KEYS.indexOf(day)));
    const dayAssignments = assignments.filter((assignment) => assignment.date === dateKey);
    const assignment =
      boundary === 'first'
        ? dayAssignments.find((item) => item.start === WORK_START)
        : dayAssignments.find((item) => item.end === WORK_END);
    const person = assignment ? staff.find((item) => item.id === assignment.employeeId) : undefined;

    setMessage(
      assignment && person
        ? `${boundary === 'first' ? 'Första' : 'Sista'} passet på ${DAY_LABELS[day]} har ${person.name} (${assignment.start}–${assignment.end}).`
        : `Ingen är schemalagd på ${boundary === 'first' ? 'första' : 'sista'} passet på ${DAY_LABELS[day]}.`
    );
  }

  function movePersonToDay(person: Staff, toDay: DayKey) {
    const toDateKey = localDateKey(addDays(weekStart, DAY_KEYS.indexOf(toDay)));

    if (assignments.some((assignment) => assignment.employeeId === person.id && assignment.date === toDateKey)) {
      setMessage(`${person.name} har redan ett pass på ${DAY_LABELS[toDay]}.`);
      return;
    }

    const targetIndex = DAY_KEYS.indexOf(toDay);
    const sourceAssignments = assignments
      .filter(
        (assignment) =>
          assignment.employeeId === person.id &&
          visibleDateKeys.includes(assignment.date) &&
          assignment.date !== toDateKey
      )
      .map((assignment) => {
        const date = new Date(`${assignment.date}T12:00:00`);
        const day = getDayKey(date);
        return {
          assignment,
          day,
          distance: Math.abs(DAY_KEYS.indexOf(day) - targetIndex),
        };
      })
      .sort((a, b) => a.distance - b.distance || DAY_KEYS.indexOf(a.day) - DAY_KEYS.indexOf(b.day));

    if (!sourceAssignments.length) {
      assignPerson(person.id, toDateKey);
      return;
    }

    movePersonBetweenDays(person, sourceAssignments[0].day, toDay);
  }

  function parsePrompt() {
    const text = prompt.trim().toLocaleLowerCase('sv-SE');
    if (!text) return;

    if (/^(skapa|generera|fyll|schemalägg)\s+(månadschema|månadsschema|hela\s+månaden)$/.test(text)) {
      generateMonthSchedule();
      setPrompt('');
      return;
    }

    if (/^(generera|generera schema|skapa schema|skapa veckoschema|gör schema|full schema|fyll schema|schemalägg)$/.test(text)) {
      generateSimpleSchedule(staff);
      setPrompt('');
      return;
    }

    if (/^(nollställ|rensa|töm)\s+alla\s+scheman$/.test(text)) {
      resetAllSchedules();
      setPrompt('');
      return;
    }

    if (/^(rensa|töm|nollställ)\s*(schema|schemat)?$/.test(text)) {
      resetVisibleSchedule();
      setPrompt('');
      return;
    }

    const moveMatch = text.match(/^flytta\s+(.+?)\s+från\s+(måndag|tisdag|onsdag|torsdag|fredag)(?:en)?\s+till\s+(måndag|tisdag|onsdag|torsdag|fredag)(?:en)?\.?$/);
    if (moveMatch) {
      const personName = moveMatch[1].trim();
      const personToMove = staff.find(
        (item) => item.name.toLocaleLowerCase('sv-SE') === personName
      );
      const fromDay = SWEDISH_DAY_TO_KEY[moveMatch[2]];
      const toDay = SWEDISH_DAY_TO_KEY[moveMatch[3]];

      if (!personToMove || !fromDay || !toDay) {
        setMessage('Kunde inte hitta personen eller dagen i flyttkommandot.');
      } else {
        movePersonBetweenDays(personToMove, fromDay, toDay);
      }
      setPrompt('');
      return;
    }

    const moveToMatch = text.match(
      /^flytta(?:\s+över)?\s+(.+?)\s+(?:till|på)\s+(måndag|tisdag|onsdag|torsdag|fredag)(?:en)?\.?$/
    );
    if (moveToMatch) {
      const personName = moveToMatch[1].trim();
      const personToMove = staff.find(
        (item) => item.name.toLocaleLowerCase('sv-SE') === personName
      );
      const toDay = SWEDISH_DAY_TO_KEY[moveToMatch[2]];

      if (!personToMove || !toDay) {
        setMessage('Kunde inte hitta personen eller dagen i flyttkommandot.');
      } else {
        movePersonToDay(personToMove, toDay);
      }
      setPrompt('');
      return;
    }

    const dayCommandWord = Object.keys(SWEDISH_DAY_TO_KEY).find((word) => text.includes(word));
    const dayCommandKey = dayCommandWord ? SWEDISH_DAY_TO_KEY[dayCommandWord] : undefined;

    const mentionedPeople = staff.filter((item) =>
      text.includes(item.name.toLocaleLowerCase('sv-SE'))
    );

    if (
      dayCommandKey &&
      mentionedPeople.length === 1 &&
      /^(ta\s+bort|plocka\s+bort|radera)\b/.test(text)
    ) {
      const personToRemove = mentionedPeople[0];
      const dateKey = localDateKey(addDays(weekStart, DAY_KEYS.indexOf(dayCommandKey)));
      const assignmentToRemove = assignments.find(
        (assignment) =>
          assignment.employeeId === personToRemove.id &&
          assignment.date === dateKey
      );

      if (!assignmentToRemove) {
        setMessage(`${personToRemove.name} har inget pass på ${DAY_LABELS[dayCommandKey]}.`);
      } else {
        setAssignments((current) =>
          current.filter((assignment) => assignment.id !== assignmentToRemove.id)
        );
        setMessage(
          `${personToRemove.name} togs bort från ${DAY_LABELS[dayCommandKey]}. Passet lämnades tomt.`
        );
      }

      setPrompt('');
      return;
    }

    if (dayCommandKey && /^(vem\s+jobbar|visa\s+(?:schema|schemat)|hur\s+ser\s+.+\s+ut)/.test(text)) {
      describeDay(dayCommandKey);
      setPrompt('');
      return;
    }

    if (dayCommandKey && /^(visa\s+)?(?:lediga|tomma)\s+pass|vilka\s+pass\s+är\s+lediga/.test(text)) {
      describeOpenSlots(dayCommandKey);
      setPrompt('');
      return;
    }

    if (dayCommandKey && /vem\s+(?:öppnar|har\s+första\s+passet)/.test(text)) {
      describeBoundaryWorker(dayCommandKey, 'first');
      setPrompt('');
      return;
    }

    if (dayCommandKey && /vem\s+(?:stänger|har\s+sista\s+passet)/.test(text)) {
      describeBoundaryWorker(dayCommandKey, 'last');
      setPrompt('');
      return;
    }

    if (mentionedPeople.length === 1 && /(?:hur\s+många\s+timmar|timmar\s+har|arbetstid)/.test(text)) {
      describePersonHours(mentionedPeople[0]);
      setPrompt('');
      return;
    }

    if (dayCommandKey && /^(rensa|töm|tömma|nollställ)\b/.test(text) && !/schema|schemat/.test(text)) {
      clearDay(dayCommandKey);
      setPrompt('');
      return;
    }

    if (
      dayCommandKey &&
      /^(gör\s+om|generera\s+om|skapa\s+om|lägg\s+om|schemalägg\s+om|fyll|skapa|schemalägg|generera|lägg\s+schema\s+för)\b/.test(text)
    ) {
      regenerateDay(dayCommandKey);
      setPrompt('');
      return;
    }

    if (/^byt\b/.test(text) && dayCommandKey) {
      if (mentionedPeople.length === 2) {
        swapPeopleOnDay(mentionedPeople[0], mentionedPeople[1], dayCommandKey);
      } else {
        setMessage('Skriv två personnamn och en dag, t.ex. “byt Erik med Sara på tisdag”.');
      }
      setPrompt('');
      return;
    }

    const person = staff.find((item) => text.includes(item.name.toLocaleLowerCase('sv-SE')));
    const dayWord = Object.keys(SWEDISH_DAY_TO_KEY).find((word) => text.includes(word));
    const dayKey = dayWord ? SWEDISH_DAY_TO_KEY[dayWord] : undefined;

    if (person && dayKey) {
      const date = addDays(weekStart, DAY_KEYS.indexOf(dayKey));
      const dateKey = localDateKey(date);

      const startsAt = text.match(/(?:börjar|startar|kan\s+börja|jobbar\s+från|arbetar\s+från)(?:\s+kl(?:ockan)?\.?)?\s*(\d{1,2})(?::(\d{2}))?/);
      if (startsAt) {
        const time = normalizeClock(startsAt[1], startsAt[2]);
        if (!time) {
          setMessage('Kunde inte läsa starttiden.');
        } else {
          updatePersonAvailability(person, dayKey, { start: time }, `${person.name} börjar ${time} på ${DAY_LABELS[dayKey]}`);
        }
        setPrompt('');
        return;
      }

      const endsAt = text.match(/(?:slutar|slutar\s+jobba|slutar\s+arbeta|kan\s+jobba\s+till|kan\s+arbeta\s+till|jobbar\s+till|arbetar\s+till)(?:\s+kl(?:ockan)?\.?)?\s*(\d{1,2})(?::(\d{2}))?/);
      if (endsAt) {
        const time = normalizeClock(endsAt[1], endsAt[2]);
        if (!time) {
          setMessage('Kunde inte läsa sluttiden.');
        } else {
          updatePersonAvailability(person, dayKey, { end: time }, `${person.name} slutar ${time} på ${DAY_LABELS[dayKey]}`);
        }
        setPrompt('');
        return;
      }

      const worksBetween =
        text.match(/(?:jobbar|arbetar|kan\s+jobba|kan\s+arbeta)\s+(?:mellan\s+)?(\d{1,2})(?::(\d{2}))?\s*(?:-|–|till|och)\s*(\d{1,2})(?::(\d{2}))?/);
      if (worksBetween) {
        const start = normalizeClock(worksBetween[1], worksBetween[2]);
        const end = normalizeClock(worksBetween[3], worksBetween[4]);
        if (!start || !end) {
          setMessage('Kunde inte läsa arbetstiden.');
        } else {
          updatePersonAvailability(
            person,
            dayKey,
            { start, end },
            `${person.name} jobbar ${start}–${end} på ${DAY_LABELS[dayKey]}`
          );
        }
        setPrompt('');
        return;
      }

      const notBefore = text.match(/kan\s+inte\s+(?:jobba|arbeta)\s+före(?:\s+kl(?:ockan)?\.?)?\s*(\d{1,2})(?::(\d{2}))?/);
      if (notBefore) {
        const time = normalizeClock(notBefore[1], notBefore[2]);
        if (!time) {
          setMessage('Kunde inte läsa tiden.');
        } else {
          updatePersonAvailability(person, dayKey, { start: time }, `${person.name} kan inte jobba före ${time} på ${DAY_LABELS[dayKey]}`);
        }
        setPrompt('');
        return;
      }

      const notAfter = text.match(/kan\s+inte\s+(?:jobba|arbeta)\s+efter(?:\s+kl(?:ockan)?\.?)?\s*(\d{1,2})(?::(\d{2}))?/);
      if (notAfter) {
        const time = normalizeClock(notAfter[1], notAfter[2]);
        if (!time) {
          setMessage('Kunde inte läsa tiden.');
        } else {
          updatePersonAvailability(person, dayKey, { end: time }, `${person.name} kan inte jobba efter ${time} på ${DAY_LABELS[dayKey]}`);
        }
        setPrompt('');
        return;
      }

      const blockedRange = text.match(/kan\s+inte\s+(?:jobba|arbeta)\s+(\d{1,2})(?::(\d{2}))?\s*(?:-|–|till|och)\s*(\d{1,2})(?::(\d{2}))?/);
      if (blockedRange) {
        const start = normalizeClock(blockedRange[1], blockedRange[2]);
        const end = normalizeClock(blockedRange[3], blockedRange[4]);
        if (!start || !end) {
          setMessage('Kunde inte läsa tidsintervallet.');
        } else {
          addBlockedRange(
            person,
            dayKey,
            start,
            end,
            `${person.name} kan inte jobba ${start}–${end} på ${DAY_LABELS[dayKey]}`
          );
        }
        setPrompt('');
        return;
      }

      const cannotWorkAt = text.match(
        /(?:kan\s+inte\s+(?:jobba|arbeta)|är\s+inte\s+tillgänglig|inte\s+tillgänglig|upptagen)(?:\s+kl(?:ockan)?\.?)?\s*(\d{1,2})(?::(\d{2}))?/
      );
      if (cannotWorkAt) {
        const hour = Math.min(23, Number(cannotWorkAt[1]));
        const minute = Number(cannotWorkAt[2] ?? 0);
        const startMinutes = hour * 60 + minute;
        const endMinutes = Math.min(24 * 60, startMinutes + 60);
        const blockedStart = minutesToTime(startMinutes);
        const blockedEnd = minutesToTime(endMinutes);

        const nextStaff = staff.map((item) => {
          if (item.id !== person.id) return item;
          const existing = item.blockedTimes?.[dayKey] ?? [];
          const duplicate = existing.some((period) => period.start === blockedStart && period.end === blockedEnd);
          return duplicate
            ? item
            : {
                ...item,
                blockedTimes: {
                  ...item.blockedTimes,
                  [dayKey]: [...existing, { start: blockedStart, end: blockedEnd }],
                },
              };
        });

        const hasConflict = assignments.some(
          (assignment) =>
            assignment.employeeId === person.id &&
            assignment.date === dateKey &&
            overlapsTime(assignment.start, assignment.end, { start: blockedStart, end: blockedEnd })
        );

        setStaff(nextStaff);

        if (hasConflict) {
          generateSimpleSchedule(
            nextStaff,
            [],
            `${person.name} kan inte jobba ${blockedStart}–${blockedEnd} på ${DAY_LABELS[dayKey]}.`
          );
        } else {
          setMessage(`${person.name} kan inte jobba ${blockedStart}–${blockedEnd} på ${DAY_LABELS[dayKey]}. Ingen krock fanns i nuvarande schema.`);
        }

        setPrompt('');
        return;
      }

      if (/\b(?:ta\s+bort|plocka\s+bort|radera)\b/.test(text)) {
        const matchingAssignments = assignments.filter(
          (assignment) => assignment.employeeId === person.id && assignment.date === dateKey
        );

        if (matchingAssignments.length) {
          const removeIds = new Set(matchingAssignments.map((assignment) => assignment.id));
          setAssignments((current) =>
            current.filter((assignment) => !removeIds.has(assignment.id))
          );
          setMessage(`${person.name} togs bort från ${DAY_LABELS[dayKey]}. Passet lämnades tomt.`);
        } else {
          setMessage(`${person.name} hade inget pass på ${DAY_LABELS[dayKey]}.`);
        }

        setPrompt('');
        return;
      }

      if (/sjuk|ledig|vab|semester|borta|frånvarande|kan inte jobba den dagen|kan inte arbeta den dagen/.test(text)) {
        const hasConflict = assignments.some(
          (assignment) => assignment.employeeId === person.id && assignment.date === dateKey
        );

        if (hasConflict) {
          generateSimpleSchedule(
            staff,
            [{ employeeId: person.id, date: dateKey }],
            `${person.name} togs bort från ${DAY_LABELS[dayKey]}.`
          );
        } else {
          setMessage(`${person.name} hade inget pass på ${DAY_LABELS[dayKey]}, så schemat behövde inte ändras.`);
        }

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
    blockedTimes: defaultBlockedTimes(),
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
          <div className="prompt-examples">
            <button
              className="prompt-help-toggle"
              type="button"
              onClick={() => setShowPromptHelp((current) => !current)}
              aria-expanded={showPromptHelp}
            >
              {showPromptHelp ? 'Dölj prompt-hjälp' : 'Vilka prompter fungerar?'}
            </button>

            {showPromptHelp && (
              <div className="prompt-help-panel">
                <div><strong>Skapa hela veckan</strong><span>“skapa schema” · “skapa veckoschema” · “generera schema” · “fyll schema”</span></div>
                <div><strong>Skapa hela månaden</strong><span>“skapa månadschema” · “generera månadsschema” · “fyll hela månaden”</span></div>
                <div><strong>Skapa/gör om en dag</strong><span>“fyll torsdag” · “skapa torsdag” · “schemalägg torsdag” · “gör om fredag” · “generera om tisdag”</span></div>
                <div><strong>Rensa</strong><span>“rensa fredag” · “töm onsdag” · “nollställ schema” (aktuell vecka) · “nollställ alla scheman” (alla veckor)</span></div>
                <div><strong>Lägg till person</strong><span>“lägg till Erik måndag” · “schemalägg Erik fredag”</span></div>
                <div><strong>Frånvaro</strong><span>“Sara sjuk tisdag” · “Erik ledig fredag” · “Anna vab onsdag”</span></div>
                <div><strong>Ta bort utan ersättare</strong><span>“ta bort Anna från torsdag” · “plocka bort Erik fredag” · “radera Sara från måndag”</span></div>
                <div><strong>Ta bort utan återfyllnad</strong><span>“ta bort Anna från torsdag” · “plocka bort Erik fredag”</span></div>
                <div><strong>Börjar senare</strong><span>“Anna börjar 12 på onsdag” · “Erik startar kl 10 torsdag”</span></div>
                <div><strong>Slutar tidigare</strong><span>“Sara slutar 14 på fredag” · “Erik kan jobba till 15 tisdag”</span></div>
                <div><strong>Arbetstid en dag</strong><span>“Anna jobbar 10-14 på onsdag” · “Sara arbetar mellan 9 och 15 fredag”</span></div>
                <div><strong>Inte före/efter</strong><span>“Erik kan inte jobba före 10 måndag” · “Sara kan inte jobba efter 14 tisdag”</span></div>
                <div><strong>Blockerad tid</strong><span>“Anna kan inte jobba kl 11 på torsdag” · “Erik kan inte jobba 10-12 torsdag” · “Sara är inte tillgänglig kl 14 fredag” · “Anna upptagen 11 torsdag”</span></div>
                <div><strong>Flytta mellan dagar</strong><span>“flytta Erik från torsdag till måndag” · “flytta Anna till måndag” · “flytta över Sara till fredag”</span></div>
                <div><strong>Byt två personer</strong><span>“byt Erik med Sara på tisdag” · “byt plats på Erik och Sara på tisdag”</span></div>
                <div><strong>Visa en dag</strong><span>“vem jobbar fredag?” · “visa schema tisdag”</span></div>
                <div><strong>Lediga pass</strong><span>“visa lediga pass onsdag” · “vilka pass är lediga fredag?”</span></div>
                <div><strong>Första/sista pass</strong><span>“vem öppnar måndag?” · “vem stänger fredag?”</span></div>
                <div><strong>Timmar per person</strong><span>“hur många timmar har Erik?” · “arbetstid Sara”</span></div>
              </div>
            )}
          </div>
          {message && <div className="message">{message}</div>}
        </section>

        <header className="app-header">
          <div>
            <p className="app-kicker">Schemaplaneraren <span className="version-badge">v{APP_VERSION}</span></p>
            <h1>Enkelt veckoschema</h1>
          </div>
          <nav className="tabs">
            <button className={tab === 'schedule' ? 'active' : ''} onClick={() => setTab('schedule')}>Schema</button>
            <button className={tab === 'month' ? 'active' : ''} onClick={() => setTab('month')}>Månad</button>
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

              <div className="hours-summary">
                <div className="hours-summary-title">
                  <strong>Schemalagda timmar</strong>
                  <span>Vecka {getIsoWeek(cursorDate)} · {selectedMonthLabel}</span>
                </div>
                <div className="hours-summary-columns" aria-hidden="true">
                  <span>Person</span>
                  <span>Vecka</span>
                  <span>Månad</span>
                </div>
                <div className="hours-summary-list">
                  {staff.map((person) => (
                    <div className="hours-summary-row" key={person.id}>
                      <span className="hours-person">
                        <i style={{ background: person.color }} />
                        {person.name}
                      </span>
                      <strong>{(scheduledHoursByPerson[person.id] ?? 0).toFixed(1)} h</strong>
                      <strong className="month-hours">{(monthlyHoursByPerson[person.id] ?? 0).toFixed(1)} h</strong>
                    </div>
                  ))}
                </div>
                {hourImbalanceNote && (
                  <div className="hours-imbalance-note">{hourImbalanceNote}</div>
                )}
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
                <button className="secondary" onClick={() => generateSimpleSchedule(staff)}>Skapa veckoschema</button>
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
                    shiftLengthMinutes={shiftLengthMinutes}
                    allAssignments={assignments}
                    weekDateKeys={visibleDateKeys}
                  />
                ))}
              </div>

              <div className="schedule-footer-actions">
                <button className="reset-button" onClick={resetVisibleSchedule}>Nollställ veckoschema</button>
                <button className="reset-all-button" onClick={resetAllSchedules}>Nollställ alla scheman</button>
              </div>
            </section>
          </main>
        )}

        {tab === 'month' && (
          <main className="month-view">
            <div className="month-toolbar">
              <div className="week-nav">
                <button onClick={() => setCursorDate(addMonths(cursorDate, -1))}>←</button>
                <button onClick={() => setCursorDate(new Date())}>Idag</button>
                <button onClick={() => setCursorDate(addMonths(cursorDate, 1))}>→</button>
              </div>
              <div>
                <h2>{selectedMonthLabel}</h2>
                <span>Hela månadens schema, måndag–fredag</span>
              </div>
              <div className="month-toolbar-actions">
                <button className="secondary" onClick={generateMonthSchedule}>Skapa månadschema</button>
                <div className="month-total-chip">
                  <span>Totalt</span>
                  <strong>
                    {Object.values(monthlyHoursByPerson).reduce((sum, hours) => sum + hours, 0).toFixed(1)} h
                  </strong>
                </div>
              </div>
            </div>

            <div className="month-weekday-header">
              {DAY_KEYS.map((day) => <strong key={day}>{DAY_LABELS[day]}</strong>)}
            </div>

            <div className="month-grid">
              {monthWeeks.flatMap((week, weekIndex) =>
                week.map((date) => {
                  const dateKey = localDateKey(date);
                  const inMonth = date.getMonth() === cursorDate.getMonth();
                  const dayAssignments = assignments
                    .filter((assignment) => assignment.date === dateKey)
                    .sort((a, b) => toMinutes(a.start) - toMinutes(b.start));

                  return (
                    <section
                      key={dateKey}
                      className={`month-day ${inMonth ? '' : 'outside-month'}`}
                    >
                      <header>
                        <span>v{getIsoWeek(date)}</span>
                        <strong>{date.getDate()}</strong>
                      </header>

                      <div className="month-day-assignments">
                        {dayAssignments.length === 0 ? (
                          <span className="month-empty">Ej schemalagt</span>
                        ) : (
                          dayAssignments.map((assignment) => {
                            const person = staff.find((item) => item.id === assignment.employeeId);
                            if (!person) return null;

                            return (
                              <div
                                className="month-assignment"
                                key={assignment.id}
                                style={{
                                  borderLeftColor: person.color,
                                  background: softColor(person.color, 0.2),
                                }}
                              >
                                <strong>{person.name}</strong>
                                <span>{assignment.start}–{assignment.end}</span>
                              </div>
                            );
                          })
                        )}
                      </div>
                    </section>
                  );
                })
              )}
            </div>

            <div className="month-hours-panel">
              <div>
                <strong>Timmar denna månad</strong>
                <span>{selectedMonthLabel}</span>
              </div>
              <div className="month-hours-list">
                {staff.map((person) => (
                  <div key={person.id}>
                    <span><i style={{ background: person.color }} />{person.name}</span>
                    <strong>{(monthlyHoursByPerson[person.id] ?? 0).toFixed(1)} h</strong>
                  </div>
                ))}
              </div>
            </div>
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

                        {DAY_KEYS.some((day) => (person.blockedTimes?.[day] ?? []).length > 0) && (
                          <div className="blocked-times">
                            <strong>Återkommande begränsningar</strong>
                            <div>
                              {DAY_KEYS.flatMap((day) =>
                                (person.blockedTimes?.[day] ?? []).map((period, index) => (
                                  <span key={`${day}-${period.start}-${index}`}>
                                    {DAY_LABELS[day]} {period.start}–{period.end}
                                  </span>
                                ))
                              )}
                            </div>
                          </div>
                        )}

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
