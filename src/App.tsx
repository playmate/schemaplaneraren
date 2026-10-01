import { useEffect, useMemo, useState } from 'react';
import { DragDropProvider, useDraggable, useDroppable } from '@dnd-kit/react';

type DayKey = 'mon' | 'tue' | 'wed' | 'thu' | 'fri';
type AppTab = 'schedule' | 'staff';

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

function weekScheduleSignature(items: Assignment[], weekStartDate: Date) {
  const weekKeys = DAY_KEYS.map((_, index) => localDateKey(addDays(weekStartDate, index)));

  return items
    .filter((assignment) => weekKeys.includes(assignment.date))
    .map((assignment) => {
      const dayIndex = weekKeys.indexOf(assignment.date);
      return `${dayIndex}|${assignment.start}|${assignment.end}|${assignment.employeeId}`;
    })
    .sort()
    .join('||');
}

function softColor(hex: string, alpha = 0.24) {
  const clean = hex.replace('#', '');
  const full = clean.length === 3 ? clean.split('').map((c) => c + c).join('') : clean;
  const r = parseInt(full.slice(0, 2), 16);
  const g = parseInt(full.slice(2, 4), 16);
  const b = parseInt(full.slice(4, 6), 16);
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
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
}: {
  person: Staff;
  assignment: Assignment;
  lane: number;
  laneCount: number;
  startMin: number;
  totalHeight: number;
  onRemove: (assignmentId: string) => void;
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
}: {
  date: Date;
  staff: Staff[];
  assignments: Assignment[];
  onRemove: (assignmentId: string) => void;
  shiftLengthMinutes: number;
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
      const hasAnyGap = candidateSlots.some((slot) =>
        !dayAssignments.some((assignment) =>
          overlapsTime(slot.start, slot.end, { start: assignment.start, end: assignment.end })
        )
      );

      setMessage(
        hasAnyGap
          ? `Det finns ett ledigt pass på ${DAY_LABELS[day]}, men ${person.name} är inte tillgänglig då.`
          : `Det finns inget oschemalagt pass kvar på ${DAY_LABELS[day]}.`
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
      const targetAssignmentId = targetId.replace('assignment:', '');
      const targetAssignment = assignments.find((assignment) => assignment.id === targetAssignmentId);
      if (!targetAssignment) return;

      assignPerson(sourceId.replace('staff:', ''), targetAssignment.date);
    }
  }

  function generateSimpleSchedule(
    staffSource: Staff[] = staff,
    excluded: Array<{ employeeId: string; date: string }> = [],
    reason?: string
  ) {
    const weekKeys = visibleDates.map(localDateKey);
    const recentWeeks = Array.from({ length: 5 }, (_, index) => startOfWeek(addDays(weekStart, -(index + 1) * 7)));
    const recentSignatures = recentWeeks
      .map((recentWeekStart) => weekScheduleSignature(assignments, recentWeekStart))
      .filter(Boolean);

    const recentSlotAssignments = recentWeeks.flatMap((recentWeekStart, weekOffset) => {
      const keys = DAY_KEYS.map((_, index) => localDateKey(addDays(recentWeekStart, index)));
      return assignments
        .filter((assignment) => keys.includes(assignment.date))
        .map((assignment) => ({
          employeeId: assignment.employeeId,
          dayIndex: keys.indexOf(assignment.date),
          start: assignment.start,
          end: assignment.end,
          age: weekOffset + 1,
        }));
    });

    const maxAttempts = Math.max(6, staffSource.length * 2);
    let selectedGenerated: Assignment[] = [];
    let selectedCoverageGaps: string[] = [];
    let foundUnique = false;

    for (let attempt = 0; attempt < maxAttempts; attempt += 1) {
      const generated: Assignment[] = [];
      const assignedMinutes: Record<string, number> = Object.fromEntries(staffSource.map((person) => [person.id, 0]));
      const closingCounts: Record<string, number> = Object.fromEntries(staffSource.map((person) => [person.id, 0]));
      const lastWorkedSlot: Record<string, { date: string; end: string } | undefined> = {};
      const lastClosingDate: Record<string, string | undefined> = {};
      const coverageGaps: string[] = [];

      for (const date of visibleDates) {
        const day = getDayKey(date);
        const dateKey = localDateKey(date);
        const dayIndex = DAY_KEYS.indexOf(day);
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

          if (slotEnd <= slotStart) {
            if (slotStart < toMinutes(LUNCH_END)) {
              slotStart = toMinutes(LUNCH_END);
              continue;
            }
            break;
          }

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
            .map((person, personIndex) => {
              const previous = lastWorkedSlot[person.id];

              const consecutiveClosePenalty =
                isClosingShift && lastClosingDate[person.id] === previousDateKey ? 80000 : 0;

              const closeThenOpenPenalty =
                isOpeningShift && lastClosingDate[person.id] === previousDateKey ? 90000 : 0;

              const closingLoadPenalty =
                isClosingShift ? (closingCounts[person.id] ?? 0) * 20000 : 0;

              const recentSameSlotPenalty = recentSlotAssignments.reduce((sum, previousSlot) => {
                if (
                  previousSlot.employeeId === person.id &&
                  previousSlot.dayIndex === dayIndex &&
                  previousSlot.start === slotStartTime &&
                  previousSlot.end === actualEndTime
                ) {
                  return sum + Math.max(5000, 18000 - previousSlot.age * 2500);
                }
                return sum;
              }, 0);

              const fairnessScore = (assignedMinutes[person.id] ?? 0) * 100;
              const rotationRank =
                (personIndex - (getIsoWeek(weekStart) + attempt) + staffSource.length * 10) %
                Math.max(1, staffSource.length);
              const rotationPenalty = rotationRank * 10;

              return {
                person,
                score:
                  fairnessScore +
                  consecutiveClosePenalty +
                  closeThenOpenPenalty +
                  closingLoadPenalty +
                  recentSameSlotPenalty +
                  rotationPenalty,
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
          if (slotStart === toMinutes(LUNCH_START)) {
            slotStart = toMinutes(LUNCH_END);
          }
          slotIndex += 1;
        }
      }

      const signature = weekScheduleSignature(generated, weekStart);
      const duplicatesRecentWeek = Boolean(signature) && recentSignatures.includes(signature);

      selectedGenerated = generated;
      selectedCoverageGaps = coverageGaps;

      if (!duplicatesRecentWeek) {
        foundUnique = true;
        break;
      }
    }

    if (!foundUnique && recentSignatures.length > 0) {
      setMessage(
        `${reason ? reason + ' ' : ''}Kunde inte skapa ett schema som skiljer sig från de senaste fem veckorna utan att bryta mot övriga regler.`
      );
      return;
    }

    setAssignments((current) => [
      ...current.filter((assignment) => !weekKeys.includes(assignment.date)),
      ...selectedGenerated,
    ]);

    if (selectedCoverageGaps.length) {
      setMessage(
        `${reason ? reason + ' ' : ''}Schemat genererades om med sex veckors ruljans, men följande tider saknar tillgänglig personal: ${selectedCoverageGaps.join(', ')}.`
      );
    } else {
      setMessage(
        reason
          ? `${reason} Schemat genererades om automatiskt med minst sex veckors ruljans.`
          : `Schemat skapades med minst sex veckors ruljans och hänsyn till jämn fördelning, max ett pass per dag och första/sista-pass-regler.`
      );
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

    const recentWeeks = Array.from({ length: 5 }, (_, index) =>
      startOfWeek(addDays(weekStart, -(index + 1) * 7))
    );
    const recentSlots = recentWeeks.flatMap((recentWeekStart, weekOffset) => {
      const recentDateKey = localDateKey(addDays(recentWeekStart, dayIndex));
      return assignments
        .filter((assignment) => assignment.date === recentDateKey)
        .map((assignment) => ({
          employeeId: assignment.employeeId,
          start: assignment.start,
          end: assignment.end,
          age: weekOffset + 1,
        }));
    });

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

          const recentSameSlotPenalty = recentSlots.reduce((sum, previousSlot) => {
            if (
              previousSlot.employeeId === person.id &&
              previousSlot.start === slotStartTime &&
              previousSlot.end === actualEndTime
            ) {
              return sum + Math.max(5000, 18000 - previousSlot.age * 2500);
            }
            return sum;
          }, 0);

          return {
            person,
            score:
              (weeklyMinutes[person.id] ?? 0) +
              boundaryPenalty +
              recentSameSlotPenalty,
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

  function parsePrompt() {
    const text = prompt.trim().toLocaleLowerCase('sv-SE');
    if (!text) return;

    if (/^(generera|generera schema|skapa schema|gör schema|full schema|fyll schema|schemalägg)$/.test(text)) {
      generateSimpleSchedule(staff);
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

    const dayCommandWord = Object.keys(SWEDISH_DAY_TO_KEY).find((word) => text.includes(word));
    const dayCommandKey = dayCommandWord ? SWEDISH_DAY_TO_KEY[dayCommandWord] : undefined;

    if (dayCommandKey && /^(rensa|töm|tömma|nollställ)\b/.test(text) && !/schema|schemat/.test(text)) {
      clearDay(dayCommandKey);
      setPrompt('');
      return;
    }

    if (
      dayCommandKey &&
      /^(gör\s+om|generera\s+om|skapa\s+om|lägg\s+om|schemalägg\s+om)\b/.test(text)
    ) {
      regenerateDay(dayCommandKey);
      setPrompt('');
      return;
    }

    if (/^byt\b/.test(text) && dayCommandKey) {
      const mentionedPeople = staff.filter((item) =>
        text.includes(item.name.toLocaleLowerCase('sv-SE'))
      );

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

      const cannotWorkAt = text.match(/kan\s+inte\s+(?:jobba|arbeta)(?:\s+kl(?:ockan)?\.?)?\s*(\d{1,2})(?::(\d{2}))?/);
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

      if (/sjuk|ledig|vab|semester|ta bort|borta|frånvarande/.test(text)) {
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
                <div><strong>Skapa hela veckan</strong><span>“skapa schema”</span></div>
                <div><strong>Gör om en dag</strong><span>“gör om fredag” · “generera om tisdag”</span></div>
                <div><strong>Rensa en dag</strong><span>“rensa fredag” · “töm onsdag”</span></div>
                <div><strong>Lägg till person</strong><span>“lägg till Erik måndag”</span></div>
                <div><strong>Frånvaro</strong><span>“Sara sjuk tisdag” · “Erik ledig fredag”</span></div>
                <div><strong>Tidsbegränsning</strong><span>“Erik kan inte jobba kl 11 på måndagar”</span></div>
                <div><strong>Flytta mellan dagar</strong><span>“flytta Erik från torsdag till måndag”</span></div>
                <div><strong>Byt två personer</strong><span>“byt Erik med Sara på tisdag” · “byt plats på Erik och Sara på tisdag”</span></div>
                <div><strong>Nollställ veckan</strong><span>“rensa schema”</span></div>
              </div>
            )}
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

              <div className="hours-summary">
                <div className="hours-summary-title">
                  <strong>Schemalagda timmar</strong>
                  <span>Den här veckan</span>
                </div>
                <div className="hours-summary-list">
                  {staff.map((person) => (
                    <div className="hours-summary-row" key={person.id}>
                      <span>
                        <i style={{ background: person.color }} />
                        {person.name}
                      </span>
                      <strong>{(scheduledHoursByPerson[person.id] ?? 0).toFixed(1)} h</strong>
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
                <button className="secondary" onClick={() => generateSimpleSchedule(staff)}>Skapa schema</button>
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
