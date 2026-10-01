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
      const base = {
        employeeId: assignment.employeeId,
        date: assignment.date,
        start: assignment.start ?? WORK_START,
        end: assignment.end ?? WORK_END,
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
    const start =
      toMinutes(workTime.start) >= toMinutes(LUNCH_START) && toMinutes(workTime.start) < toMinutes(LUNCH_END)
        ? LUNCH_END
        : workTime.start;
    const end = contiguousShiftEnd(start, workTime.end, shiftLengthMinutes);
    const blocked = person.blockedTimes?.[day] ?? [];

    if (blocked.some((period) => overlapsTime(start, end, period))) {
      setMessage(`${person.name} är inte tillgänglig under hela det passet på ${DAY_LABELS[day]}.`);
      return;
    }

    setAssignments((current) => {
      const exists = current.some(
        (assignment) => assignment.employeeId === employeeId && assignment.date === dateKey
      );
      if (exists) return current;
      return [...current, {
        id: `manual-${Date.now()}-${employeeId}`,
        employeeId,
        date: dateKey,
        start,
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
          assignment.id !== targetAssignmentId &&
          assignment.employeeId === sourceAssignment.employeeId &&
          assignment.date === targetAssignment.date
      );
      const targetWouldDuplicate = assignments.some(
        (assignment) =>
          assignment.id !== sourceAssignmentId &&
          assignment.employeeId === targetAssignment.employeeId &&
          assignment.date === sourceAssignment.date
      );

      if (sourceWouldDuplicate || targetWouldDuplicate) {
        setMessage('Bytet går inte: max ett pass per person och dag.');
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
    }
  }

  function generateSimpleSchedule(
    staffSource: Staff[] = staff,
    excluded: Array<{ employeeId: string; date: string }> = [],
    reason?: string
  ) {
    const weekKeys = visibleDates.map(localDateKey);
    const generated: Assignment[] = [];
    const assignedMinutes: Record<string, number> = Object.fromEntries(staffSource.map((person) => [person.id, 0]));
    const closingCounts: Record<string, number> = Object.fromEntries(staffSource.map((person) => [person.id, 0]));
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
          .map((person) => {
            const previous = lastWorkedSlot[person.id];

            // Undvik att samma person får sista passet flera dagar i rad.
            const consecutiveClosePenalty =
              isClosingShift && lastClosingDate[person.id] === previousDateKey ? 80000 : 0;

            // Undvik stängning dag 1 följt av öppning dag 2.
            const closeThenOpenPenalty =
              isOpeningShift && lastClosingDate[person.id] === previousDateKey ? 90000 : 0;

            // Sprid generellt stängningspassen jämnt över veckan.
            const closingLoadPenalty =
              isClosingShift ? (closingCounts[person.id] ?? 0) * 20000 : 0;

            // Baspoäng för jämn total arbetstid.
            const fairnessScore = assignedMinutes[person.id] ?? 0;

            return {
              person,
              score:
                fairnessScore +
                consecutiveClosePenalty +
                closeThenOpenPenalty +
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
      setMessage(`${reason ? reason + ' ' : ''}Schemat genererades om, men följande tider saknar tillgänglig personal: ${coverageGaps.join(', ')}.`);
    } else {
      setMessage(
        reason
          ? `${reason} Schemat genererades om automatiskt.`
          : `Hela arbetsdagen 08:00–16:30 bemannades med passlängd ${durationLabel(shiftLengthMinutes)} och hänsyn till jämn fördelning, flera pass i rad, avslutande pass och stängning följt av öppning nästa dag.`
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
            <span>Exempel: “skapa schema”, “lägg till Erik måndag”, “Sara sjuk tisdag”, “Erik kan inte jobba kl 11 på måndagar”</span>
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
