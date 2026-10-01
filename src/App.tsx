import { useEffect, useMemo, useState } from 'react';
import { DragDropProvider, useDraggable, useDroppable } from '@dnd-kit/react';

type ViewMode = 'day' | 'week' | 'month';
type ScheduleMode = 'staff' | 'project';
type AppTab = 'schedule' | 'staff' | 'business' | 'projects';
type DayKey = 'mon' | 'tue' | 'wed' | 'thu' | 'fri' | 'sat' | 'sun';
type SidebarTab = 'person' | 'business' | 'projects';
type ConstraintLevel = 'hard' | 'soft';

type Employee = {
  id: string;
  name: string;
  percent: number;
  color: string;
  days: Record<DayKey, boolean>;
  defaultStart: string;
  defaultEnd: string;
  overrides: Partial<Record<DayKey, { start?: string; end?: string }>>;
  maxHoursDay: number;
  maxHoursWeek: number;
  minRestHours: number;
  maxConsecutiveDays: number;
  avoidConsecutiveOpen: boolean;
  avoidConsecutiveClose: boolean;
  openingRule: ConstraintLevel;
  closingRule: ConstraintLevel;
  projectIds: string[];
};

type BusinessDay = {
  open: boolean;
  start: string;
  end: string;
};

type LunchRule = {
  enabled: boolean;
  windowStart: string;
  windowEnd: string;
  durationMinutes: number;
  paid: boolean;
};

type BusinessSettings = {
  days: Record<DayKey, BusinessDay>;
  lunch: LunchRule;
  maxShiftHours: number;
  staffAtSameTime: number;
};

type Project = {
  id: string;
  name: string;
  minShiftHours: number;
  normalShiftHours: number;
  maxShiftHours: number;
  minStaff: number;
  desiredStaff: number;
  start: string;
  end: string;
  color: string;
};

type Assignment = {
  employeeId: string;
  date: string;
  start: string;
  end: string;
  projectId?: string;
  lunchStart?: string;
  lunchEnd?: string;
  lunchMinutes?: number;
};

type TaskAssignment = {
  id: string;
  projectId: string;
  employeeId: string | null;
  date: string;
  start: string;
  end: string;
};

type Absence = {
  employeeId: string;
  date: string;
  reason: 'sick' | 'vab' | 'vacation' | 'leave' | 'other';
};

type ValidationItem = {
  level: 'error' | 'warning';
  text: string;
};

type Placement<T> = {
  item: T;
  column: number;
  totalColumns: number;
};

const DAY_KEYS: DayKey[] = ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'];

const DAY_LABELS: Record<DayKey, string> = {
  mon: 'Mån',
  tue: 'Tis',
  wed: 'Ons',
  thu: 'Tor',
  fri: 'Fre',
  sat: 'Lör',
  sun: 'Sön',
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
  lördag: 'sat',
  lördagar: 'sat',
  lördagen: 'sat',
  söndag: 'sun',
  söndagar: 'sun',
  söndagen: 'sun',
};

const WEEKDAY_KEYS: DayKey[] = ['mon', 'tue', 'wed', 'thu', 'fri'];

const COLORS = ['#2563eb', '#7c3aed', '#db2777', '#059669', '#d97706', '#0891b2', '#dc2626', '#4f46e5'];

const defaultBusiness: BusinessSettings = {
  days: {
    mon: { open: true, start: '08:00', end: '16:30' },
    tue: { open: true, start: '08:00', end: '16:30' },
    wed: { open: true, start: '08:00', end: '16:30' },
    thu: { open: true, start: '08:00', end: '16:30' },
    fri: { open: true, start: '08:00', end: '16:30' },
    sat: { open: false, start: '09:00', end: '14:00' },
    sun: { open: false, start: '09:00', end: '14:00' },
  },
  lunch: {
    enabled: true,
    windowStart: '12:00',
    windowEnd: '12:30',
    durationMinutes: 30,
    paid: false,
  },
  maxShiftHours: 9,
  staffAtSameTime: 1,
};

const initialProjects: Project[] = [
  {
    id: 'reception',
    name: 'Reception',
    minShiftHours: 1,
    normalShiftHours: 3,
    maxShiftHours: 3,
    minStaff: 1,
    desiredStaff: 1,
    start: '08:00',
    end: '16:30',
    color: '#2563eb',
  },
  {
    id: 'support',
    name: 'Support',
    minShiftHours: 1,
    normalShiftHours: 3,
    maxShiftHours: 3,
    minStaff: 1,
    desiredStaff: 1,
    start: '08:00',
    end: '16:30',
    color: '#7c3aed',
  },
];

const initialEmployees: Employee[] = [
  {
    id: 'anna',
    name: 'Anna',
    percent: 100,
    color: COLORS[0],
    days: { mon: true, tue: true, wed: true, thu: true, fri: true, sat: false, sun: false },
    defaultStart: '08:00',
    defaultEnd: '16:30',
    overrides: {},
    maxHoursDay: 9,
    maxHoursWeek: 40,
    minRestHours: 11,
    maxConsecutiveDays: 5,
    avoidConsecutiveOpen: true,
    avoidConsecutiveClose: true,
    openingRule: 'soft',
    closingRule: 'soft',
    projectIds: ['reception', 'support'],
  },
  {
    id: 'erik',
    name: 'Erik',
    percent: 80,
    color: COLORS[1],
    days: { mon: true, tue: true, wed: true, thu: true, fri: false, sat: false, sun: false },
    defaultStart: '08:00',
    defaultEnd: '16:30',
    overrides: {},
    maxHoursDay: 8,
    maxHoursWeek: 32,
    minRestHours: 11,
    maxConsecutiveDays: 4,
    avoidConsecutiveOpen: true,
    avoidConsecutiveClose: true,
    openingRule: 'soft',
    closingRule: 'soft',
    projectIds: ['support'],
  },
  {
    id: 'sara',
    name: 'Sara',
    percent: 75,
    color: COLORS[2],
    days: { mon: true, tue: true, wed: true, thu: false, fri: true, sat: false, sun: false },
    defaultStart: '09:00',
    defaultEnd: '16:30',
    overrides: {},
    maxHoursDay: 8,
    maxHoursWeek: 30,
    minRestHours: 11,
    maxConsecutiveDays: 4,
    avoidConsecutiveOpen: true,
    avoidConsecutiveClose: true,
    openingRule: 'soft',
    closingRule: 'soft',
    projectIds: ['reception'],
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
  const map: DayKey[] = ['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat'];
  return map[date.getDay()];
}

function formatLongDate(date: Date) {
  return new Intl.DateTimeFormat('sv-SE', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  }).format(date);
}

function capitalize(value: string) {
  return value.charAt(0).toUpperCase() + value.slice(1);
}

function getIsoWeek(date: Date) {
  const target = new Date(date);
  target.setHours(0, 0, 0, 0);
  target.setDate(target.getDate() + 3 - ((target.getDay() + 6) % 7));
  const week1 = new Date(target.getFullYear(), 0, 4);
  return (
    1 +
    Math.round(((target.getTime() - week1.getTime()) / 86400000 - 3 + ((week1.getDay() + 6) % 7)) / 7)
  );
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

function hoursBetween(start: string, end: string) {
  return Math.max(0, (toMinutes(end) - toMinutes(start)) / 60);
}

function weeklyTargetHours(employee: Employee) {
  return employee.maxHoursWeek || 40 * (employee.percent / 100);
}

function assignmentLunch(a: Assignment, business: BusinessSettings) {
  if (!business.lunch.enabled) return null;
  const start = a.lunchStart ?? business.lunch.windowStart;
  const end = a.lunchEnd ?? business.lunch.windowEnd;
  if (toMinutes(end) <= toMinutes(a.start) || toMinutes(start) >= toMinutes(a.end)) return null;
  return { start, end };
}

function assignmentHours(a: Assignment, business: BusinessSettings) {
  let hours = hoursBetween(a.start, a.end);
  const lunch = assignmentLunch(a, business);
  const lunchMinutes =
    a.lunchMinutes ??
    (lunch ? Math.max(0, toMinutes(lunch.end) - toMinutes(lunch.start)) : business.lunch.durationMinutes);

  if (business.lunch.enabled && !business.lunch.paid && lunch) {
    hours -= lunchMinutes / 60;
  }
  return Math.max(0, hours);
}

function overlaps(startA: string, endA: string, startB: string, endB: string) {
  return toMinutes(startA) < toMinutes(endB) && toMinutes(endA) > toMinutes(startB);
}

function addMinutesTime(time: string, delta: number) {
  let minutes = toMinutes(time) + delta;
  minutes = Math.max(0, Math.min(23 * 60 + 59, minutes));
  return minutesToTime(minutes);
}

function layoutByOverlap<T extends { start: string; end: string }>(items: T[]) {
  const sorted = [...items].sort((a, b) => toMinutes(a.start) - toMinutes(b.start));
  const placements: Array<{ item: T; column: number }> = [];
  const columnEnds: number[] = [];

  for (const item of sorted) {
    const start = toMinutes(item.start);
    const end = toMinutes(item.end);
    let column = 0;

    while (column < columnEnds.length && start < columnEnds[column]) {
      column += 1;
    }

    if (column === columnEnds.length) {
      columnEnds.push(end);
    } else {
      columnEnds[column] = end;
    }

    placements.push({ item, column });
  }

  const totalColumns = Math.max(1, columnEnds.length);

  return placements.map((p) => ({
    ...p,
    totalColumns,
  })) as Placement<T>[];
}

function timelineRange(visibleDates: Date[], business: BusinessSettings, mode: ScheduleMode, project?: Project) {
  if (mode === 'project' && project) {
    const start = Math.min(...visibleDates.map((d) => toMinutes(project.start)), toMinutes(project.start));
    const end = Math.max(...visibleDates.map((d) => toMinutes(project.end)), toMinutes(project.end));
    return { startMin: start, endMin: end };
  }

  const openDays = visibleDates.map((date) => business.days[getDayKey(date)]).filter((d) => d.open);
  const startMin = openDays.length ? Math.min(...openDays.map((d) => toMinutes(d.start))) : 7 * 60;
  const endMin = openDays.length ? Math.max(...openDays.map((d) => toMinutes(d.end))) : 17 * 60;
  return { startMin, endMin };
}

function buildTimeMarks(startMin: number, endMin: number) {
  const first = Math.floor(startMin / 60) * 60;
  const marks: number[] = [];
  for (let t = first; t <= endMin; t += 60) {
    marks.push(t);
  }
  return marks;
}

function DraggableEmployee({ employee }: { employee: Employee }) {
  const { ref, handleRef } = useDraggable({ id: `employee:${employee.id}` });

  return (
    <div ref={ref} className="employee-card" style={{ borderLeftColor: employee.color }}>
      <button ref={handleRef} className="drag-handle" aria-label={`Dra ${employee.name}`}>
        ⋮⋮
      </button>
      <div className="employee-main">
        <strong>{employee.name}</strong>
        <span>{employee.percent}%</span>
      </div>
      <div className="employee-days">
        {WEEKDAY_KEYS.filter((key) => employee.days[key]).map((key) => DAY_LABELS[key]).join(' · ')}
      </div>
    </div>
  );
}

function TimeColumn({
  marks,
  startMin,
  endMin,
  pixelsPerMinute,
}: {
  marks: number[];
  startMin: number;
  endMin: number;
  pixelsPerMinute: number;
}) {
  const totalHeight = (endMin - startMin) * pixelsPerMinute;

  return (
    <div className="timeline-time-column">
      <div className="timeline-day-header empty" />
      <div className="timeline-track" style={{ height: totalHeight }}>
        {marks.map((mark) => {
          const top = (mark - startMin) * pixelsPerMinute;
          return (
            <div key={mark} className="time-label-row" style={{ top }}>
              <span>{minutesToTime(mark)}</span>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function StaffTimelineDay({
  date,
  assignments,
  employees,
  projects,
  business,
  startMin,
  endMin,
  pixelsPerMinute,
  onRemove,
  onEdit,
  absences,
}: {
  date: Date;
  assignments: Assignment[];
  employees: Employee[];
  projects: Project[];
  business: BusinessSettings;
  startMin: number;
  endMin: number;
  pixelsPerMinute: number;
  onRemove: (employeeId: string, date: string) => void;
  onEdit: (assignment: Assignment) => void;
  absences: Absence[];
}) {
  const dateKey = localDateKey(date);
  const dayKey = getDayKey(date);
  const businessDay = business.days[dayKey];
  const { ref, isDropTarget } = useDroppable({ id: `date:${dateKey}` });
  const byEmployee = Object.fromEntries(employees.map((e) => [e.id, e]));
  const byProject = Object.fromEntries(projects.map((p) => [p.id, p]));
  const totalHeight = (endMin - startMin) * pixelsPerMinute;
  const placements = layoutByOverlap(assignments);
  const absentNames = absences
    .filter((absence) => absence.date === dateKey)
    .map((absence) => byEmployee[absence.employeeId]?.name)
    .filter(Boolean);

  return (
    <div className={`timeline-day ${!businessDay.open ? 'closed-day' : ''}`}>
      <div className="timeline-day-header">
        <div>
          <span>{capitalize(new Intl.DateTimeFormat('sv-SE', { weekday: 'short' }).format(date))}</span>
          <small>{businessDay.open ? `${businessDay.start}–${businessDay.end}` : 'Stängt'}</small>
          {absentNames.length > 0 && <small className="absence-summary">Sjuk: {absentNames.join(', ')}</small>}
        </div>
        <strong>{date.getDate()}</strong>
      </div>

      <div ref={ref} className={`timeline-track ${isDropTarget ? 'drop-active' : ''}`} style={{ height: totalHeight }}>
        {buildTimeMarks(startMin, endMin).map((mark) => {
          const top = (mark - startMin) * pixelsPerMinute;
          return <div key={mark} className="timeline-hour-line" style={{ top }} />;
        })}

        {!businessDay.open && <div className="closed-label big">Stängt</div>}

        {businessDay.open && assignments.length === 0 && (
          <div className="timeline-empty">Dra hit en person</div>
        )}

        {placements.map(({ item, column, totalColumns }) => {
          const employee = byEmployee[item.employeeId];
          if (!employee) return null;

          const project = item.projectId ? byProject[item.projectId] : undefined;
          const top = (toMinutes(item.start) - startMin) * pixelsPerMinute;
          const height = Math.max(48, (toMinutes(item.end) - toMinutes(item.start)) * pixelsPerMinute);
          const leftPercent = (column / totalColumns) * 100;
          const widthPercent = 100 / totalColumns;
          const lunch = assignmentLunch(item, business);

          return (
            <button
              key={`${item.employeeId}-${item.date}`}
              className="timeline-shift-block"
              style={{
                top,
                height,
                left: `calc(${leftPercent}% + 4px)`,
                width: `calc(${widthPercent}% - 8px)`,
                borderLeftColor: project?.color ?? employee.color,
              }}
              onClick={() => onEdit(item)}
              title="Klicka för att redigera"
            >
              <div className="timeline-shift-top">
                <strong>{employee.name}</strong>
                <span>{assignmentHours(item, business).toFixed(1)} h</span>
              </div>
              <div className="timeline-shift-time">
                {item.start}–{item.end}
              </div>
              <div className="timeline-shift-project">{project?.name ?? 'Allmänt pass'}</div>
              {lunch && <div className="timeline-lunch-badge">Lunch {lunch.start}–{lunch.end}</div>}
              <div className="timeline-shift-remove" onClick={(e) => e.stopPropagation()}>
                <span className="mini-link" onClick={() => onRemove(item.employeeId, item.date)}>
                  Ta bort
                </span>
              </div>
            </button>
          );
        })}
      </div>
    </div>
  );
}

function ProjectTimelineDay({
  date,
  project,
  tasks,
  employees,
  startMin,
  endMin,
  pixelsPerMinute,
  business,
  absences,
}: {
  date: Date;
  project: Project;
  tasks: TaskAssignment[];
  employees: Employee[];
  startMin: number;
  endMin: number;
  pixelsPerMinute: number;
  business: BusinessSettings;
  absences: Absence[];
}) {
  const byEmployee = Object.fromEntries(employees.map((e) => [e.id, e]));
  const totalHeight = (endMin - startMin) * pixelsPerMinute;
  const dateKey = localDateKey(date);
  const dayTasks = tasks.filter((t) => t.date === dateKey && t.projectId === project.id);
  const placements = layoutByOverlap(dayTasks);
  const absent = absences
    .filter((absence) => absence.date === dateKey)
    .map((absence) => {
      const employee = byEmployee[absence.employeeId];
      const label = absence.reason === 'sick' ? 'sjuk' : absence.reason === 'vab' ? 'VAB' : absence.reason === 'vacation' ? 'semester' : absence.reason === 'leave' ? 'ledig' : 'frånvarande';
      return employee ? `${employee.name} (${label})` : '';
    })
    .filter(Boolean);
  const lunchTop = (toMinutes(business.lunch.windowStart) - startMin) * pixelsPerMinute;
  const lunchHeight = Math.max(0, (toMinutes(business.lunch.windowEnd) - toMinutes(business.lunch.windowStart)) * pixelsPerMinute);

  return (
    <div className="timeline-day project-mode">
      <div className="timeline-day-header">
        <div>
          <span>{capitalize(new Intl.DateTimeFormat('sv-SE', { weekday: 'short' }).format(date))}</span>
          <small>{project.start}–{project.end}</small>
          {absent.length > 0 && <small className="absence-summary">Frånvaro: {absent.join(', ')}</small>}
        </div>
        <strong>{date.getDate()}</strong>
      </div>

      <div className="timeline-track" style={{ height: totalHeight }}>
        {buildTimeMarks(startMin, endMin).map((mark) => {
          const top = (mark - startMin) * pixelsPerMinute;
          return <div key={mark} className="timeline-hour-line" style={{ top }} />;
        })}

        {business.lunch.enabled && lunchHeight > 0 && (
          <div className="timeline-lunch-shade" style={{ top: lunchTop, height: lunchHeight }}>
            Lunch {business.lunch.windowStart}–{business.lunch.windowEnd}
          </div>
        )}

        {dayTasks.length === 0 && <div className="timeline-empty">Inga projektpass skapade</div>}

        {placements.map(({ item: task, column, totalColumns }) => {
          const top = (toMinutes(task.start) - startMin) * pixelsPerMinute;
          const height = Math.max(42, (toMinutes(task.end) - toMinutes(task.start)) * pixelsPerMinute);
          const employee = task.employeeId ? byEmployee[task.employeeId] : undefined;

          const leftPercent = (column / totalColumns) * 100;
          const widthPercent = 100 / totalColumns;

          return (
            <div
              key={task.id}
              className={`timeline-shift-block project-block ${employee ? '' : 'unassigned'}`}
              style={{
                top,
                height,
                left: `calc(${leftPercent}% + 4px)`,
                width: `calc(${widthPercent}% - 8px)`,
                borderLeftColor: employee?.color ?? '#dc2626',
              }}
            >
              <div className="timeline-shift-top">
                <strong>{employee?.name ?? 'Obemannat'}</strong>
                <span>{hoursBetween(task.start, task.end).toFixed(1)} h</span>
              </div>
              <div className="timeline-shift-time">
                {task.start}–{task.end}
              </div>
              <div className="timeline-shift-project">{project.name}</div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

export default function App() {
  const [employees, setEmployees] = useState<Employee[]>(() => {
    const saved = localStorage.getItem('scheduler-employees-v4');
    if (!saved) return initialEmployees;
    const parsed: Employee[] = JSON.parse(saved);
    return parsed.map((employee) => {
      const wasOldDefault =
        (employee.defaultStart === '08:00' && employee.defaultEnd === '17:00') ||
        (employee.defaultStart === '09:00' && employee.defaultEnd === '16:00');
      return wasOldDefault
        ? { ...employee, defaultStart: '08:00', defaultEnd: '16:30' }
        : employee;
    });
  });

  const [assignments, setAssignments] = useState<Assignment[]>(() => {
    const saved = localStorage.getItem('scheduler-assignments-v4');
    return saved ? JSON.parse(saved) : [];
  });

  const [business, setBusiness] = useState<BusinessSettings>(() => {
    const saved = localStorage.getItem('scheduler-business-v4');
    if (!saved) return defaultBusiness;
    const parsed = JSON.parse(saved);
    return {
      ...defaultBusiness,
      ...parsed,
      days: { ...defaultBusiness.days, ...(parsed.days ?? {}) },
      lunch: { ...defaultBusiness.lunch, ...(parsed.lunch ?? {}) },
      staffAtSameTime: parsed.staffAtSameTime ?? 1,
    };
  });

  const [projects, setProjects] = useState<Project[]>(() => {
    const saved = localStorage.getItem('scheduler-projects-v4');
    return saved ? JSON.parse(saved) : initialProjects;
  });

  const [taskAssignments, setTaskAssignments] = useState<TaskAssignment[]>(() => {
    const saved = localStorage.getItem('scheduler-task-assignments-v4');
    return saved ? JSON.parse(saved) : [];
  });
  const [absences, setAbsences] = useState<Absence[]>(() => {
    const saved = localStorage.getItem('scheduler-absences-v1');
    return saved ? JSON.parse(saved) : [];
  });

  const [view, setView] = useState<ViewMode>('week');
  const [appTab, setAppTab] = useState<AppTab>('schedule');
  const [scheduleMode, setScheduleMode] = useState<ScheduleMode>('project');
  const [cursorDate, setCursorDate] = useState(new Date());
  const [selectedEmployeeId, setSelectedEmployeeId] = useState(initialEmployees[0]?.id ?? '');
  const [selectedProjectId, setSelectedProjectId] = useState(initialProjects[0]?.id ?? '');
  const [sidebarTab, setSidebarTab] = useState<SidebarTab>('person');
  const [prompt, setPrompt] = useState('');
  const [message, setMessage] = useState('');
  const [editingAssignment, setEditingAssignment] = useState<Assignment | null>(null);

  useEffect(() => localStorage.setItem('scheduler-employees-v4', JSON.stringify(employees)), [employees]);
  useEffect(() => localStorage.setItem('scheduler-assignments-v4', JSON.stringify(assignments)), [assignments]);
  useEffect(() => localStorage.setItem('scheduler-business-v4', JSON.stringify(business)), [business]);
  useEffect(() => localStorage.setItem('scheduler-projects-v4', JSON.stringify(projects)), [projects]);
  useEffect(() => localStorage.setItem('scheduler-task-assignments-v4', JSON.stringify(taskAssignments)), [taskAssignments]);
  useEffect(() => localStorage.setItem('scheduler-absences-v1', JSON.stringify(absences)), [absences]);

  const selectedEmployee = employees.find((e) => e.id === selectedEmployeeId) ?? employees[0];
  const selectedProject = projects.find((p) => p.id === selectedProjectId) ?? projects[0];

  const visibleDates = useMemo(() => {
    if (view === 'day') {
      const day = getDayKey(cursorDate);
      if (day === 'sat') return [addDays(cursorDate, 2)];
      if (day === 'sun') return [addDays(cursorDate, 1)];
      return [new Date(cursorDate)];
    }

    if (view === 'week') {
      const start = startOfWeek(cursorDate);
      return Array.from({ length: 5 }, (_, i) => addDays(start, i));
    }

    const year = cursorDate.getFullYear();
    const month = cursorDate.getMonth();
    const dates: Date[] = [];
    const current = new Date(year, month, 1);

    while (current.getMonth() === month) {
      const day = current.getDay();
      if (day !== 0 && day !== 6) {
        dates.push(new Date(current));
      }
      current.setDate(current.getDate() + 1);
    }

    return dates;
  }, [view, cursorDate]);

  const weekDates = useMemo(() => {
    const start = startOfWeek(cursorDate);
    return Array.from({ length: 5 }, (_, i) => addDays(start, i));
  }, [cursorDate]);

  const weekDateKeys = useMemo(() => weekDates.map(localDateKey), [weekDates]);

  const employeeWeekHours = useMemo(() => {
    const result: Record<string, number> = {};
    for (const employee of employees) {
      result[employee.id] = taskAssignments
        .filter((task) => task.employeeId === employee.id && weekDateKeys.includes(task.date))
        .reduce((sum, task) => sum + hoursBetween(task.start, task.end), 0);
    }
    return result;
  }, [taskAssignments, employees, weekDateKeys]);

  const validations = useMemo(
    () => validateSchedule(assignments, taskAssignments, employees, business, projects, weekDates, selectedProject),
    [assignments, taskAssignments, employees, business, projects, weekDates, selectedProject]
  );

  const { startMin, endMin } = useMemo(
    () => timelineRange(visibleDates, business, scheduleMode, selectedProject),
    [visibleDates, business, scheduleMode, selectedProject]
  );

  const pixelsPerMinute = 1.3;
  const timeMarks = useMemo(() => buildTimeMarks(startMin, endMin), [startMin, endMin]);

  function updateEmployee(id: string, patch: Partial<Employee>) {
    setEmployees((current) => current.map((e) => (e.id === id ? { ...e, ...patch } : e)));
  }

  function addEmployee() {
    const nextNumber = employees.length + 1;
    const id = `person-${Date.now()}`;

    const employee: Employee = {
      id,
      name: `Person ${nextNumber}`,
      percent: 100,
      color: COLORS[employees.length % COLORS.length],
      days: { mon: true, tue: true, wed: true, thu: true, fri: true, sat: false, sun: false },
      defaultStart: '08:00',
      defaultEnd: '16:30',
      overrides: {},
      maxHoursDay: 8,
      maxHoursWeek: 40,
      minRestHours: 11,
      maxConsecutiveDays: 5,
      avoidConsecutiveOpen: true,
      avoidConsecutiveClose: true,
      openingRule: 'soft',
      closingRule: 'soft',
      projectIds: projects.map((p) => p.id),
    };

    setEmployees((current) => [...current, employee]);
    setSelectedEmployeeId(id);
  }

  function addProject() {
    const id = `project-${Date.now()}`;
    const project: Project = {
      id,
      name: `Projekt ${projects.length + 1}`,
      minShiftHours: 1,
      normalShiftHours: 3,
      maxShiftHours: 3,
      minStaff: 1,
      desiredStaff: 1,
      start: '08:00',
      end: '17:00',
      color: COLORS[projects.length % COLORS.length],
    };

    setProjects((current) => [...current, project]);
    setSelectedProjectId(id);
  }

  function updateProject(id: string, patch: Partial<Project>) {
    setProjects((current) => current.map((p) => (p.id === id ? { ...p, ...patch } : p)));
  }

  function removeAssignment(employeeId: string, date: string) {
    setAssignments((current) => current.filter((a) => !(a.employeeId === employeeId && a.date === date)));
  }

  function saveEditedAssignment() {
    if (!editingAssignment) return;

    setAssignments((current) =>
      current.map((a) =>
        a.employeeId === editingAssignment.employeeId && a.date === editingAssignment.date ? editingAssignment : a
      )
    );

    setEditingAssignment(null);
    setMessage('Passet uppdaterades.');
  }

  function addAssignment(employeeId: string, dateKey: string) {
    const employee = employees.find((e) => e.id === employeeId);
    if (!employee) return;

    const date = new Date(`${dateKey}T12:00:00`);
    const day = getDayKey(date);
    const businessDay = business.days[day];

    if (!businessDay.open) {
      setMessage(`${DAY_LABELS[day]} är stängd enligt verksamhetens öppettider.`);
      return;
    }

    if (!employee.days[day]) {
      setMessage(`${employee.name} är markerad som ledig ${DAY_LABELS[day].toLowerCase()}.`);
      return;
    }

    let start = employee.overrides[day]?.start ?? employee.defaultStart;
    let end = employee.overrides[day]?.end ?? employee.defaultEnd;

    if (toMinutes(start) < toMinutes(businessDay.start)) start = businessDay.start;
    if (toMinutes(end) > toMinutes(businessDay.end)) end = businessDay.end;

    // Personalschemat är frikopplat från projektens passlängd.
    // Ett projekt kan t.ex. ha maxpass 3 h utan att den anställdes vanliga arbetsdag kapas till 3 h.
    const maxShiftHours = Math.min(business.maxShiftHours, employee.maxHoursDay);
    const latestAllowedEnd = addMinutesTime(start, Math.round(maxShiftHours * 60));
    if (toMinutes(end) > toMinutes(latestAllowedEnd)) end = latestAllowedEnd;

    setAssignments((current) => {
      const withoutDuplicate = current.filter((a) => !(a.employeeId === employeeId && a.date === dateKey));
      return [
        ...withoutDuplicate,
        {
          employeeId,
          date: dateKey,
          start,
          end,
          projectId: undefined,
          lunchStart: business.lunch.windowStart,
          lunchEnd: business.lunch.windowEnd,
          lunchMinutes: business.lunch.durationMinutes,
        },
      ];
    });

    setMessage(`${employee.name} lades till ${dateKey}, ${start}–${end}.`);
  }

  function handleDragEnd(event: any) {
    if (event.canceled) return;
    const sourceId = String(event.operation.source?.id ?? '');
    const targetId = String(event.operation.target?.id ?? '');

    if (!sourceId.startsWith('employee:') || !targetId.startsWith('date:')) return;

    addAssignment(sourceId.replace('employee:', ''), targetId.replace('date:', ''));
  }

  function navigate(direction: -1 | 1) {
    const next = new Date(cursorDate);
    if (view === 'day') next.setDate(next.getDate() + direction);
    if (view === 'week') next.setDate(next.getDate() + direction * 7);
    if (view === 'month') next.setMonth(next.getMonth() + direction);
    setCursorDate(next);
  }

  function parsePrompt() {
    const text = prompt.trim().toLocaleLowerCase('sv-SE');
    if (!text) return;

    const employee = employees.find((e) => text.includes(e.name.toLocaleLowerCase('sv-SE')));
    const mentionedProject = projects.find((p) => text.includes(p.name.toLocaleLowerCase('sv-SE')));
    const weekStart = startOfWeek(cursorDate);

    const resolveDay = (token?: string) => token ? SWEDISH_DAY_TO_KEY[token] : undefined;
    const dateForDay = (dayKey: DayKey) => addDays(weekStart, WEEKDAY_KEYS.indexOf(dayKey));
    const setAbsenceForDate = (employeeId: string, date: Date, reason: Absence['reason']) => {
      const dateKey = localDateKey(date);
      setAbsences((current) => [
        ...current.filter((absence) => !(absence.employeeId === employeeId && absence.date === dateKey)),
        { employeeId, date: dateKey, reason },
      ]);
      setAssignments((current) => current.filter((assignment) => !(assignment.employeeId === employeeId && assignment.date === dateKey)));
      setTaskAssignments((current) => current.map((task) =>
        task.employeeId === employeeId && task.date === dateKey ? { ...task, employeeId: null } : task
      ));
    };

    const generateWords = /^(generera|generera schema|full schema|fullt schema|skapa schema|gör schema|gör ett schema|bygg schema|bygg ett schema|fyll schema|fyll schemat|schemalägg|schemalägg veckan|skapa veckoschema)$/;
    if (generateWords.test(text)) {
      setAppTab('schedule');
      setScheduleMode('project');
      generateProjectSchedule();
      setPrompt('');
      return;
    }

    if (/^(rensa|töm|nollställ)\s+(schema|schemat)$/.test(text)) {
      const keys = visibleDates.map(localDateKey);
      setTaskAssignments((current) => current.filter((task) => !keys.includes(task.date)));
      setPrompt('');
      setAppTab('schedule');
      setMessage('Schemat för den synliga perioden rensades.');
      return;
    }

    const simultaneous = text.match(/(?:antal\s+personal\s+|bemanning\s+|)(\d+)\s*(?:person(?:al|er)?|anställda?)?\s*(?:ska\s+)?(?:jobba\s+)?samtidigt/);
    if (simultaneous) {
      const count = Math.max(1, Number(simultaneous[1]));
      setBusiness((current) => ({ ...current, staffAtSameTime: count }));
      setAppTab('business');
      setSidebarTab('business');
      setPrompt('');
      setMessage(`Bemanningen ändrades till ${count} person${count === 1 ? '' : 'er'} samtidigt.`);
      return;
    }

    if (employee) {
      const absenceReason: Absence['reason'] | null =
        /\bvab\b/.test(text) ? 'vab' :
        /semester/.test(text) ? 'vacation' :
        /ledig|ledighet|frånvarande|borta/.test(text) ? 'leave' :
        /sjuk/.test(text) ? 'sick' : null;

      const rangeMatch = text.match(/([a-zåäö]+)\s*(?:-|–|till)\s*([a-zåäö]+)/);
      const singleDayMatch = text.match(/(?:sjuk|vab|semester|ledig|ledighet|frånvarande|borta)(?:\s+på)?\s+([a-zåäö]+)/);

      if (absenceReason && rangeMatch) {
        const fromKey = resolveDay(rangeMatch[1]);
        const toKey = resolveDay(rangeMatch[2]);
        if (fromKey && toKey && WEEKDAY_KEYS.includes(fromKey) && WEEKDAY_KEYS.includes(toKey)) {
          const fromIndex = WEEKDAY_KEYS.indexOf(fromKey);
          const toIndex = WEEKDAY_KEYS.indexOf(toKey);
          const first = Math.min(fromIndex, toIndex);
          const last = Math.max(fromIndex, toIndex);
          for (let i = first; i <= last; i++) setAbsenceForDate(employee.id, addDays(weekStart, i), absenceReason);
          setPrompt('');
          setAppTab('schedule');
          setMessage(`${employee.name} markerades ${absenceReason === 'sick' ? 'sjuk' : absenceReason === 'vab' ? 'VAB' : absenceReason === 'vacation' ? 'på semester' : 'ledig'} ${DAY_LABELS[WEEKDAY_KEYS[first]]}–${DAY_LABELS[WEEKDAY_KEYS[last]]}.`);
          return;
        }
      }

      if (absenceReason && singleDayMatch) {
        const dayKey = resolveDay(singleDayMatch[1]);
        if (dayKey && WEEKDAY_KEYS.includes(dayKey)) {
          const date = dateForDay(dayKey);
          setAbsenceForDate(employee.id, date, absenceReason);
          setPrompt('');
          setAppTab('schedule');
          setMessage(`${employee.name} markerades ${absenceReason === 'sick' ? 'sjuk' : absenceReason === 'vab' ? 'VAB' : absenceReason === 'vacation' ? 'på semester' : 'ledig'} ${DAY_LABELS[dayKey]}.`);
          return;
        }
      }

      const removeAbsence = text.match(/(?:inte\s+(?:sjuk|vab|ledig)|tillbaka|kommer tillbaka|ta bort frånvaro)(?:\s+på)?\s*([a-zåäö]+)?/);
      if (removeAbsence) {
        const dayKey = resolveDay(removeAbsence[1]);
        if (dayKey && WEEKDAY_KEYS.includes(dayKey)) {
          const dateKey = localDateKey(dateForDay(dayKey));
          setAbsences((current) => current.filter((absence) => !(absence.employeeId === employee.id && absence.date === dateKey)));
          setPrompt('');
          setMessage(`Frånvaron för ${employee.name} på ${DAY_LABELS[dayKey]} togs bort.`);
          return;
        }
      }

      let next: Employee = {
        ...employee,
        days: { ...employee.days },
        overrides: { ...employee.overrides },
        projectIds: [...employee.projectIds],
      };
      let changed = false;

      const percent = text.match(/(?:jobbar|arbetar|sysselsättningsgrad)\s*(?:är\s*)?(\d{1,3})\s*%/);
      if (percent) {
        next.percent = Math.min(100, Math.max(0, Number(percent[1])));
        next.maxHoursWeek = (40 * next.percent) / 100;
        changed = true;
      }

      const notWork = text.match(/(?:jobbar|arbetar)\s+inte\s+(?:på\s+)?([a-zåäö]+)/);
      if (notWork) {
        const key = resolveDay(notWork[1]);
        if (key) { next.days[key] = false; changed = true; }
      }

      const worksDay = text.match(/(?:jobbar|arbetar)\s+(?:på\s+)?([a-zåäö]+)$/);
      if (worksDay) {
        const key = resolveDay(worksDay[1]);
        if (key) { next.days[key] = true; changed = true; }
      }

      const endMatch = text.match(/slutar\s+(?:klockan|kl\.?\s*)?\s*(\d{1,2})(?::(\d{2}))?\s+(?:på\s+)?([a-zåäö]+)/);
      if (endMatch) {
        const key = resolveDay(endMatch[3]);
        if (key) {
          const hour = String(Math.min(23, Number(endMatch[1]))).padStart(2, '0');
          next.overrides[key] = { ...next.overrides[key], end: `${hour}:${endMatch[2] ?? '00'}` };
          changed = true;
        }
      }

      const startMatch = text.match(/börjar\s+(?:klockan|kl\.?\s*)?\s*(\d{1,2})(?::(\d{2}))?\s+(?:på\s+)?([a-zåäö]+)/);
      if (startMatch) {
        const key = resolveDay(startMatch[3]);
        if (key) {
          const hour = String(Math.min(23, Number(startMatch[1]))).padStart(2, '0');
          next.overrides[key] = { ...next.overrides[key], start: `${hour}:${startMatch[2] ?? '00'}` };
          changed = true;
        }
      }

      const normalHours = text.match(/(?:jobbar|arbetar|normal tid|arbetstid).*?(\d{1,2})(?::(\d{2}))?\s*(?:-|–|till)\s*(\d{1,2})(?::(\d{2}))?/);
      if (normalHours && !text.match(/[a-zåäö]+\s*(?:-|–|till)\s*[a-zåäö]+/)) {
        next.defaultStart = `${String(Number(normalHours[1])).padStart(2, '0')}:${normalHours[2] ?? '00'}`;
        next.defaultEnd = `${String(Number(normalHours[3])).padStart(2, '0')}:${normalHours[4] ?? '00'}`;
        changed = true;
      }

      if (/bör\s+inte\s+öppna\s+(?:två|2|flera)\s+dagar\s+i\s+rad/.test(text)) { next.avoidConsecutiveOpen = true; changed = true; }
      if (/bör\s+inte\s+stänga\s+(?:två|2|flera)\s+dagar\s+i\s+rad/.test(text)) { next.avoidConsecutiveClose = true; changed = true; }

      const maxDay = text.match(/max(?:imalt)?\s+(\d+(?:[.,]\d+)?)\s+timmar\s+(?:per|om)\s+dag/);
      if (maxDay) { next.maxHoursDay = Number(maxDay[1].replace(',', '.')); changed = true; }

      if (changed) {
        setEmployees((current) => current.map((e) => e.id === employee.id ? next : e));
        setSelectedEmployeeId(employee.id);
        setSidebarTab('person');
        setAppTab('staff');
        setPrompt('');
        setMessage(`Inställningarna för ${employee.name} uppdaterades.`);
        return;
      }
    }

    const lunchTime = text.match(/lunch(?:en)?\s+(?:är\s+|ska\s+vara\s+)?(\d{1,2})(?::(\d{2}))?\s*(?:-|–|till)\s*(\d{1,2})(?::(\d{2}))?/);
    if (lunchTime) {
      const startTime = `${String(Number(lunchTime[1])).padStart(2, '0')}:${lunchTime[2] ?? '00'}`;
      const endTime = `${String(Number(lunchTime[3])).padStart(2, '0')}:${lunchTime[4] ?? '00'}`;
      const durationMinutes = Math.max(0, toMinutes(endTime) - toMinutes(startTime));
      setBusiness((current) => ({ ...current, lunch: { ...current.lunch, enabled: true, windowStart: startTime, windowEnd: endTime, durationMinutes } }));
      setPrompt('');
      setMessage(`Lunch ändrades till ${startTime}–${endTime}.`);
      return;
    }

    const lunchDuration = text.match(/lunch(?:en)?\s+(?:är\s+)?(\d{1,3})\s*min/);
    if (lunchDuration) {
      const durationMinutes = Number(lunchDuration[1]);
      setBusiness((current) => ({ ...current, lunch: { ...current.lunch, enabled: true, durationMinutes, windowEnd: addMinutesTime(current.lunch.windowStart, durationMinutes) } }));
      setPrompt('');
      setMessage(`Lunchlängden ändrades till ${durationMinutes} minuter.`);
      return;
    }

    if (/ingen lunch|stäng av lunch|utan lunch/.test(text)) {
      setBusiness((current) => ({ ...current, lunch: { ...current.lunch, enabled: false } }));
      setPrompt('');
      setMessage('Lunchregeln stängdes av.');
      return;
    }

    if (/använd lunch|slå på lunch|aktivera lunch/.test(text)) {
      setBusiness((current) => ({ ...current, lunch: { ...current.lunch, enabled: true } }));
      setPrompt('');
      setMessage('Lunchregeln aktiverades.');
      return;
    }

    const businessDay = text.match(/(?:öppet|öppettid(?:er)?|arbetsdag)\s+(?:på\s+)?([a-zåäö]+).*?(\d{1,2})(?::(\d{2}))?\s*(?:-|–|till)\s*(\d{1,2})(?::(\d{2}))?/);
    if (businessDay) {
      const key = resolveDay(businessDay[1]);
      if (key) {
        const startTime = `${String(Number(businessDay[2])).padStart(2, '0')}:${businessDay[3] ?? '00'}`;
        const endTime = `${String(Number(businessDay[4])).padStart(2, '0')}:${businessDay[5] ?? '00'}`;
        setBusiness((current) => ({ ...current, days: { ...current.days, [key]: { open: true, start: startTime, end: endTime } } }));
        setPrompt('');
        setMessage(`${DAY_LABELS[key]} ändrades till ${startTime}–${endTime}.`);
        return;
      }
    }

    const projectHours = text.match(/(?:projekt(?:et)?\s+)?(?:öppet|tid|tider|arbetstid)?\s*(\d{1,2})(?::(\d{2}))?\s*(?:-|–|till)\s*(\d{1,2})(?::(\d{2}))?/);
    if (mentionedProject && projectHours) {
      const startTime = `${String(Number(projectHours[1])).padStart(2, '0')}:${projectHours[2] ?? '00'}`;
      const endTime = `${String(Number(projectHours[3])).padStart(2, '0')}:${projectHours[4] ?? '00'}`;
      updateProject(mentionedProject.id, { start: startTime, end: endTime });
      setSelectedProjectId(mentionedProject.id);
      setPrompt('');
      setMessage(`${mentionedProject.name} ändrades till ${startTime}–${endTime}.`);
      return;
    }

    const maxPass = text.match(/(?:max(?:imal)?(?:\s*längd)?(?:\s+på)?\s+pass|maxpass|pass max)\s+(?:är\s+)?(\d+(?:[.,]\d+)?)\s*(?:h|tim(?:me|mar)?)/);
    if (maxPass) {
      const hours = Number(maxPass[1].replace(',', '.'));
      if (mentionedProject) {
        updateProject(mentionedProject.id, { maxShiftHours: hours });
        setSelectedProjectId(mentionedProject.id);
        setMessage(`${mentionedProject.name} fick maxpass ${hours} h.`);
      } else if (selectedProject) {
        updateProject(selectedProject.id, { maxShiftHours: hours });
        setMessage(`${selectedProject.name} fick maxpass ${hours} h.`);
      }
      setPrompt('');
      return;
    }

    const minPass = text.match(/(?:min(?:sta)?\s+pass|minpass)\s+(\d+(?:[.,]\d+)?)\s*(?:h|tim(?:me|mar)?)/);
    if (minPass && (mentionedProject ?? selectedProject)) {
      const project = mentionedProject ?? selectedProject!;
      const hours = Number(minPass[1].replace(',', '.'));
      updateProject(project.id, { minShiftHours: hours });
      setPrompt('');
      setMessage(`${project.name} fick minpass ${hours} h.`);
      return;
    }

    setMessage('Jag kunde inte tolka instruktionen. Exempel: “skapa schema”, “Erik sjuk måndag”, “Anna VAB tisdag”, “Sara semester onsdag-fredag”, “2 personal samtidigt”, “Reception maxpass 3 timmar”, “lunch 12-12:30”.');
  }

  function autoFillVisible() {
    const dateKeys = visibleDates.map(localDateKey);
    const additions: Assignment[] = [];
    const lastCloseDate: Record<string, string | undefined> = {};

    for (const date of visibleDates) {
      const day = getDayKey(date);
      const dateKey = localDateKey(date);
      const businessDay = business.days[day];
      if (!businessDay.open) continue;

      const available = employees.filter(
        (employee) =>
          employee.days[day] &&
          !absences.some((absence) => absence.employeeId === employee.id && absence.date === dateKey)
      );
      if (!available.length) continue;

      // Personalschemat ska lägga ut alla personer som faktiskt arbetar den dagen.
      // Projektbemanning hanteras separat i fliken "Projekt / uppgifter".
      const chosen = [...available].sort((a, b) => {
        const aTarget = weeklyTargetHours(a);
        const bTarget = weeklyTargetHours(b);
        const aCurrent = additions
          .filter((assignment) => assignment.employeeId === a.id)
          .reduce((sum, assignment) => sum + assignmentHours(assignment, business), 0);
        const bCurrent = additions
          .filter((assignment) => assignment.employeeId === b.id)
          .reduce((sum, assignment) => sum + assignmentHours(assignment, business), 0);
        return (bTarget - bCurrent) - (aTarget - aCurrent);
      }).slice(0, Math.max(1, business.staffAtSameTime ?? 1));

      chosen.forEach((employee) => {
        let start = employee.overrides[day]?.start ?? employee.defaultStart;
        let end = employee.overrides[day]?.end ?? employee.defaultEnd;

        if (toMinutes(start) < toMinutes(businessDay.start)) start = businessDay.start;
        if (toMinutes(end) > toMinutes(businessDay.end)) end = businessDay.end;

        // Viktigt: projektens maxpass (t.ex. 3 h) gäller bara projekt-/uppgiftspass.
        // Vanliga personalpass begränsas endast av verksamhetens och personens maxlängd.
        const maxShiftHours = Math.min(business.maxShiftHours, employee.maxHoursDay);
        const latestAllowedEnd = addMinutesTime(start, Math.round(maxShiftHours * 60));
        if (toMinutes(end) > toMinutes(latestAllowedEnd)) end = latestAllowedEnd;

        // Försök undvika avslutande pass två vardagar i rad när det finns utrymme.
        const previousDate = localDateKey(addDays(date, -1));
        const wouldClose = end === businessDay.end;
        if (
          wouldClose &&
          employee.avoidConsecutiveClose &&
          lastCloseDate[employee.id] === previousDate &&
          toMinutes(end) - toMinutes(start) >= 120
        ) {
          end = addMinutesTime(end, -30);
        }

        additions.push({
          employeeId: employee.id,
          date: dateKey,
          start,
          end,
          projectId: undefined,
          lunchStart: business.lunch.windowStart,
          lunchEnd: business.lunch.windowEnd,
          lunchMinutes: business.lunch.durationMinutes,
        });

        if (end === businessDay.end) {
          lastCloseDate[employee.id] = dateKey;
        }
      });
    }

    setAssignments((current) => [...current.filter((a) => !dateKeys.includes(a.date)), ...additions]);
    setMessage('Personalschemat fylldes automatiskt.');
  }

  function generateProjectSchedule() {
    if (!selectedProject) return;

    const dateKeys = visibleDates.map(localDateKey);
    const keepOtherProjects = taskAssignments.filter(
      (task) => task.projectId !== selectedProject.id || !dateKeys.includes(task.date)
    );

    const generated: TaskAssignment[] = [];
    const assignedMinutes: Record<string, number> = Object.fromEntries(employees.map((employee) => [employee.id, 0]));
    const closingCount: Record<string, number> = Object.fromEntries(employees.map((employee) => [employee.id, 0]));

    for (const date of visibleDates) {
      const dateKey = localDateKey(date);
      const day = getDayKey(date);
      if (!business.days[day].open) continue;

      const startMinute = Math.max(toMinutes(selectedProject.start), toMinutes(business.days[day].start));
      const endMinute = Math.min(toMinutes(selectedProject.end), toMinutes(business.days[day].end));

      if (endMinute <= startMinute) continue;

      const maxSlotMinutes = Math.max(30, Math.round(selectedProject.maxShiftHours * 60));
      let slotStart = startMinute;
      let slotIndex = 0;

      while (slotStart < endMinute) {
        let slotEnd = Math.min(endMinute, slotStart + maxSlotMinutes);

        if (
          business.lunch.enabled &&
          slotStart < toMinutes(business.lunch.windowEnd) &&
          slotEnd > toMinutes(business.lunch.windowStart)
        ) {
          if (slotStart < toMinutes(business.lunch.windowStart)) {
            slotEnd = Math.min(slotEnd, toMinutes(business.lunch.windowStart));
          } else {
            slotStart = Math.max(slotStart, toMinutes(business.lunch.windowEnd));
            if (slotStart >= endMinute) break;
            slotEnd = Math.min(endMinute, slotStart + maxSlotMinutes);
          }
        }

        if (slotEnd <= slotStart) {
          slotStart += 30;
          continue;
        }

        const start = minutesToTime(slotStart);
        const end = minutesToTime(slotEnd);

        const candidates = employees.filter((employee) => {
          if (!employee.days[day] || !employee.projectIds.includes(selectedProject.id)) return false;
          if (absences.some((absence) => absence.employeeId === employee.id && absence.date === dateKey)) return false;

          const staffShift = assignments.find(
            (assignment) => assignment.employeeId === employee.id && assignment.date === dateKey
          );

          const availableStart = staffShift?.start ?? employee.overrides[day]?.start ?? employee.defaultStart;
          const availableEnd = staffShift?.end ?? employee.overrides[day]?.end ?? employee.defaultEnd;

          if (toMinutes(start) < toMinutes(availableStart) || toMinutes(end) > toMinutes(availableEnd)) return false;

          const lunch = staffShift
            ? assignmentLunch(staffShift, business)
            : business.lunch.enabled
              ? { start: business.lunch.windowStart, end: business.lunch.windowEnd }
              : null;

          if (lunch && overlaps(start, end, lunch.start, lunch.end)) return false;

          const existingTasks = [...taskAssignments, ...generated].filter(
            (task) => task.employeeId === employee.id && task.date === dateKey
          );

          if (existingTasks.some((task) => overlaps(start, end, task.start, task.end))) return false;

          return true;
        });

        const isClosingSlot = slotEnd === endMinute;

        const scored = candidates
          .map((employee) => {
            const previous = generated
              .filter((task) => task.employeeId === employee.id && task.date === dateKey)
              .sort((a, b) => a.end.localeCompare(b.end))
              .at(-1);

            const backToBackPenalty = previous?.end === start ? 100000 : 0;
            const closingPenalty = isClosingSlot ? (closingCount[employee.id] ?? 0) * 50000 : 0;

            return {
              employee,
              score: (assignedMinutes[employee.id] ?? 0) + backToBackPenalty + closingPenalty,
            };
          })
          .sort((a, b) => a.score - b.score || a.employee.name.localeCompare(b.employee.name, 'sv'));

        const requiredStaff = Math.max(1, business.staffAtSameTime ?? 1);
        const chosenWorkers = scored.slice(0, requiredStaff).map((entry) => entry.employee);

        for (let staffIndex = 0; staffIndex < requiredStaff; staffIndex++) {
          const chosen = chosenWorkers[staffIndex] ?? null;
          generated.push({
            id: `${selectedProject.id}-${dateKey}-${slotIndex}-${staffIndex}`,
            projectId: selectedProject.id,
            employeeId: chosen?.id ?? null,
            date: dateKey,
            start,
            end,
          });

          if (chosen) {
            assignedMinutes[chosen.id] = (assignedMinutes[chosen.id] ?? 0) + (slotEnd - slotStart);
            if (isClosingSlot) closingCount[chosen.id] = (closingCount[chosen.id] ?? 0) + 1;
          }
        }

        slotStart = slotEnd;
        if (business.lunch.enabled && slotStart === toMinutes(business.lunch.windowStart)) {
          slotStart = toMinutes(business.lunch.windowEnd);
        }
        slotIndex += 1;
      }
    }

    setTaskAssignments([...keepOtherProjects, ...generated]);
    setScheduleMode('project');
    setMessage(`Schemat för ${selectedProject.name} genererades med ${Math.max(1, business.staffAtSameTime ?? 1)} person${Math.max(1, business.staffAtSameTime ?? 1) === 1 ? '' : 'er'} samtidigt, utan dubbelbokning.`);
  }

  const periodTitle =
    view === 'day'
      ? capitalize(formatLongDate(visibleDates[0] ?? cursorDate))
      : view === 'week'
        ? `Vecka ${getIsoWeek(cursorDate)}`
        : capitalize(new Intl.DateTimeFormat('sv-SE', { month: 'long', year: 'numeric' }).format(cursorDate));

  return (
    <DragDropProvider onDragEnd={handleDragEnd}>
      <div className="app-shell">
        <section className="prompt-panel">
          <div>
            <strong>Skriv en regel</strong>
            <span>
              Exempel: “skapa schema”, “Erik sjuk måndag”, “Anna VAB tisdag”, “Sara semester onsdag-fredag”, “2 personal samtidigt”, “Reception maxpass 3 timmar”, “lunch 12-12:30”
            </span>
          </div>

          <div className="prompt-row">
            <input
              value={prompt}
              onChange={(e) => setPrompt(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && parsePrompt()}
              placeholder="Skriv en instruktion…"
            />
            <button className="primary" onClick={parsePrompt}>
              Tolka
            </button>
          </div>

          {message && <div className="status-message">{message}</div>}
        </section>

        <header className="topbar">
          <div>
            <p className="eyebrow">Schemaplaneraren v0.8</p>
            <h1>Planera smartare – nu med riktig tidslinje</h1>
          </div>

          <div className="topbar-controls">
            <div className="view-switcher" role="group" aria-label="Välj vy">
              {(['day', 'week', 'month'] as ViewMode[]).map((mode) => (
                <button key={mode} className={view === mode ? 'active' : ''} onClick={() => setView(mode)}>
                  {mode === 'day' ? 'Dag' : mode === 'week' ? 'Vecka' : 'Månad'}
                </button>
              ))}
            </div>
          </div>
        </header>

        <nav className="app-tabs" aria-label="Huvudflikar">
          <button className={appTab === 'schedule' ? 'active' : ''} onClick={() => setAppTab('schedule')}>Schema</button>
          <button className={appTab === 'staff' ? 'active' : ''} onClick={() => { setAppTab('staff'); setSidebarTab('person'); }}>Personalinställningar</button>
          <button className={appTab === 'business' ? 'active' : ''} onClick={() => { setAppTab('business'); setSidebarTab('business'); }}>Verksamhet</button>
          <button className={appTab === 'projects' ? 'active' : ''} onClick={() => { setAppTab('projects'); setSidebarTab('projects'); }}>Projekt</button>
        </nav>

        <main className={`workspace ${appTab === 'schedule' ? 'schedule-only' : 'settings-only'}`}>
          {appTab !== 'schedule' && (
          <aside className="sidebar">
            {sidebarTab === 'person' && (
              <>
                <div className="section-title">
                  <div>
                    <strong>Anställda</strong>
                    <span>{employees.length} personer</span>
                  </div>
                  <button className="icon-button" onClick={addEmployee} title="Lägg till person">
                    ＋
                  </button>
                </div>

                <div className="employee-list">
                  {employees.map((employee) => (
                    <div
                      key={employee.id}
                      onClick={() => setSelectedEmployeeId(employee.id)}
                      className={selectedEmployeeId === employee.id ? 'selected-wrap' : ''}
                    >
                      <DraggableEmployee employee={employee} />
                      <div className="hours-meter">
                        <span>
                          {(employeeWeekHours[employee.id] ?? 0).toFixed(1)} / {weeklyTargetHours(employee).toFixed(0)} h
                        </span>
                        <div>
                          <i
                            style={{
                              width: `${Math.min(
                                100,
                                ((employeeWeekHours[employee.id] ?? 0) / Math.max(1, weeklyTargetHours(employee))) * 100
                              )}%`,
                            }}
                          />
                        </div>
                      </div>
                    </div>
                  ))}
                </div>

                {selectedEmployee && (
                  <div className="settings-card">
                    <label>
                      Namn
                      <input value={selectedEmployee.name} onChange={(e) => updateEmployee(selectedEmployee.id, { name: e.target.value })} />
                    </label>

                    <label>
                      Sysselsättningsgrad: <strong>{selectedEmployee.percent}%</strong>
                      <input
                        type="range"
                        min="0"
                        max="100"
                        step="5"
                        value={selectedEmployee.percent}
                        onChange={(e) =>
                          updateEmployee(selectedEmployee.id, {
                            percent: Number(e.target.value),
                            maxHoursWeek: (40 * Number(e.target.value)) / 100,
                          })
                        }
                      />
                    </label>

                    <div className="two-cols">
                      <label>
                        Normal start
                        <input
                          type="time"
                          value={selectedEmployee.defaultStart}
                          onChange={(e) => updateEmployee(selectedEmployee.id, { defaultStart: e.target.value })}
                        />
                      </label>

                      <label>
                        Normalt slut
                        <input
                          type="time"
                          value={selectedEmployee.defaultEnd}
                          onChange={(e) => updateEmployee(selectedEmployee.id, { defaultEnd: e.target.value })}
                        />
                      </label>
                    </div>

                    <div>
                      <span className="field-label">Arbetsdagar</span>
                      <div className="day-toggles">
                        {WEEKDAY_KEYS.map((key) => (
                          <button
                            key={key}
                            className={selectedEmployee.days[key] ? 'on' : ''}
                            onClick={() =>
                              updateEmployee(selectedEmployee.id, {
                                days: { ...selectedEmployee.days, [key]: !selectedEmployee.days[key] },
                              })
                            }
                          >
                            {DAY_LABELS[key]}
                          </button>
                        ))}
                      </div>
                    </div>

                    <div className="two-cols">
                      <label>
                        Max h/dag
                        <input
                          type="number"
                          min="1"
                          step="0.5"
                          value={selectedEmployee.maxHoursDay}
                          onChange={(e) => updateEmployee(selectedEmployee.id, { maxHoursDay: Number(e.target.value) })}
                        />
                      </label>

                      <label>
                        Max h/vecka
                        <input
                          type="number"
                          min="1"
                          step="0.5"
                          value={selectedEmployee.maxHoursWeek}
                          onChange={(e) => updateEmployee(selectedEmployee.id, { maxHoursWeek: Number(e.target.value) })}
                        />
                      </label>
                    </div>

                    <div className="two-cols">
                      <label>
                        Min vila (h)
                        <input
                          type="number"
                          min="0"
                          value={selectedEmployee.minRestHours}
                          onChange={(e) => updateEmployee(selectedEmployee.id, { minRestHours: Number(e.target.value) })}
                        />
                      </label>

                      <label>
                        Max dagar i rad
                        <input
                          type="number"
                          min="1"
                          value={selectedEmployee.maxConsecutiveDays}
                          onChange={(e) =>
                            updateEmployee(selectedEmployee.id, { maxConsecutiveDays: Number(e.target.value) })
                          }
                        />
                      </label>
                    </div>

                    <label className="check-row">
                      <input
                        type="checkbox"
                        checked={selectedEmployee.avoidConsecutiveOpen}
                        onChange={(e) => updateEmployee(selectedEmployee.id, { avoidConsecutiveOpen: e.target.checked })}
                      />{' '}
                      Undvik öppning flera dagar i rad
                    </label>

                    <label className="check-row">
                      <input
                        type="checkbox"
                        checked={selectedEmployee.avoidConsecutiveClose}
                        onChange={(e) => updateEmployee(selectedEmployee.id, { avoidConsecutiveClose: e.target.checked })}
                      />{' '}
                      Undvik stängning flera dagar i rad
                    </label>

                    <div className="two-cols">
                      <label>
                        Öppningsregel
                        <select
                          value={selectedEmployee.openingRule}
                          onChange={(e) => updateEmployee(selectedEmployee.id, { openingRule: e.target.value as ConstraintLevel })}
                        >
                          <option value="soft">Mjuk</option>
                          <option value="hard">Hård</option>
                        </select>
                      </label>

                      <label>
                        Stängningsregel
                        <select
                          value={selectedEmployee.closingRule}
                          onChange={(e) => updateEmployee(selectedEmployee.id, { closingRule: e.target.value as ConstraintLevel })}
                        >
                          <option value="soft">Mjuk</option>
                          <option value="hard">Hård</option>
                        </select>
                      </label>
                    </div>

                    <div>
                      <span className="field-label">Tillåtna projekt</span>
                      <div className="project-checks">
                        {projects.map((project) => (
                          <label key={project.id} className="check-row">
                            <input
                              type="checkbox"
                              checked={selectedEmployee.projectIds.includes(project.id)}
                              onChange={(e) =>
                                updateEmployee(selectedEmployee.id, {
                                  projectIds: e.target.checked
                                    ? [...selectedEmployee.projectIds, project.id]
                                    : selectedEmployee.projectIds.filter((id) => id !== project.id),
                                })
                              }
                            />{' '}
                            {project.name}
                          </label>
                        ))}
                      </div>
                    </div>
                  </div>
                )}
              </>
            )}

            {sidebarTab === 'business' && (
              <div className="settings-card no-divider">
                <div className="section-title">
                  <div>
                    <strong>Normala öppettider</strong>
                    <span>Ändras per veckodag</span>
                  </div>
                </div>

                <div className="business-days">
                  {WEEKDAY_KEYS.map((key) => {
                    const day = business.days[key];
                    return (
                      <div className="business-day" key={key}>
                        <label className="check-row day-open">
                          <input
                            type="checkbox"
                            checked={day.open}
                            onChange={(e) =>
                              setBusiness((b) => ({
                                ...b,
                                days: { ...b.days, [key]: { ...day, open: e.target.checked } },
                              }))
                            }
                          />{' '}
                          <strong>{DAY_LABELS[key]}</strong>
                        </label>

                        <input
                          type="time"
                          disabled={!day.open}
                          value={day.start}
                          onChange={(e) =>
                            setBusiness((b) => ({
                              ...b,
                              days: { ...b.days, [key]: { ...day, start: e.target.value } },
                            }))
                          }
                        />

                        <input
                          type="time"
                          disabled={!day.open}
                          value={day.end}
                          onChange={(e) =>
                            setBusiness((b) => ({
                              ...b,
                              days: { ...b.days, [key]: { ...day, end: e.target.value } },
                            }))
                          }
                        />
                      </div>
                    );
                  })}
                </div>

                <div className="subsection">
                  <strong>Bemanning</strong>
                  <label>
                    Personal samtidigt
                    <input
                      type="number"
                      min="1"
                      step="1"
                      value={business.staffAtSameTime ?? 1}
                      onChange={(e) => setBusiness((b) => ({ ...b, staffAtSameTime: Math.max(1, Number(e.target.value)) }))}
                    />
                  </label>
                  <span className="field-help">Standard är 1. Autofyllningen väljer så många tillgängliga personer per dag.</span>
                </div>

                <div className="subsection">
                  <strong>Passregler</strong>
                  <label>
                    Maxlängd på pass (h)
                    <input
                      type="number"
                      min="1"
                      step="0.5"
                      value={business.maxShiftHours}
                      onChange={(e) => setBusiness((b) => ({ ...b, maxShiftHours: Number(e.target.value) }))}
                    />
                  </label>
                  <span className="field-help">
                    Gäller som övergripande max. Person- och projektgränser kan vara lägre.
                  </span>
                </div>

                <div className="subsection">
                  <strong>Lunch</strong>

                  <label className="check-row">
                    <input
                      type="checkbox"
                      checked={business.lunch.enabled}
                      onChange={(e) =>
                        setBusiness((b) => ({
                          ...b,
                          lunch: { ...b.lunch, enabled: e.target.checked },
                        }))
                      }
                    />{' '}
                    Använd lunchregel
                  </label>

                  <div className="two-cols">
                    <label>
                      Från
                      <input
                        type="time"
                        disabled={!business.lunch.enabled}
                        value={business.lunch.windowStart}
                        onChange={(e) =>
                          setBusiness((b) => ({
                            ...b,
                            lunch: { ...b.lunch, windowStart: e.target.value },
                          }))
                        }
                      />
                    </label>

                    <label>
                      Till
                      <input
                        type="time"
                        disabled={!business.lunch.enabled}
                        value={business.lunch.windowEnd}
                        onChange={(e) =>
                          setBusiness((b) => ({
                            ...b,
                            lunch: { ...b.lunch, windowEnd: e.target.value },
                          }))
                        }
                      />
                    </label>
                  </div>

                  <div className="two-cols">
                    <label>
                      Längd (min)
                      <input
                        type="number"
                        min="0"
                        step="5"
                        disabled={!business.lunch.enabled}
                        value={business.lunch.durationMinutes}
                        onChange={(e) =>
                          setBusiness((b) => ({
                            ...b,
                            lunch: { ...b.lunch, durationMinutes: Number(e.target.value) },
                          }))
                        }
                      />
                    </label>

                    <label className="check-row paid-check">
                      <input
                        type="checkbox"
                        disabled={!business.lunch.enabled}
                        checked={business.lunch.paid}
                        onChange={(e) =>
                          setBusiness((b) => ({
                            ...b,
                            lunch: { ...b.lunch, paid: e.target.checked },
                          }))
                        }
                      />{' '}
                      Betald lunch
                    </label>
                  </div>
                </div>
              </div>
            )}

            {sidebarTab === 'projects' && (
              <>
                <div className="section-title">
                  <div>
                    <strong>Projekt</strong>
                    <span>{projects.length} projekt</span>
                  </div>
                  <button className="icon-button" onClick={addProject}>
                    ＋
                  </button>
                </div>

                <div className="project-list">
                  {projects.map((project) => (
                    <button
                      key={project.id}
                      className={`project-card ${selectedProjectId === project.id ? 'active' : ''}`}
                      onClick={() => setSelectedProjectId(project.id)}
                    >
                      <span style={{ background: project.color }} />
                      {project.name}
                    </button>
                  ))}
                </div>

                {selectedProject && (
                  <div className="settings-card">
                    <label>
                      Projektnamn
                      <input value={selectedProject.name} onChange={(e) => updateProject(selectedProject.id, { name: e.target.value })} />
                    </label>

                    <div className="two-cols">
                      <label>
                        Från
                        <input
                          type="time"
                          value={selectedProject.start}
                          onChange={(e) => updateProject(selectedProject.id, { start: e.target.value })}
                        />
                      </label>

                      <label>
                        Till
                        <input
                          type="time"
                          value={selectedProject.end}
                          onChange={(e) => updateProject(selectedProject.id, { end: e.target.value })}
                        />
                      </label>
                    </div>

                    <div className="three-cols">
                      <label>
                        Min pass
                        <input
                          type="number"
                          min="1"
                          step="0.5"
                          value={selectedProject.minShiftHours}
                          onChange={(e) => updateProject(selectedProject.id, { minShiftHours: Number(e.target.value) })}
                        />
                      </label>

                      <label>
                        Normal
                        <input
                          type="number"
                          min="1"
                          step="0.5"
                          value={selectedProject.normalShiftHours}
                          onChange={(e) =>
                            updateProject(selectedProject.id, { normalShiftHours: Number(e.target.value) })
                          }
                        />
                      </label>

                      <label>
                        Max pass
                        <input
                          type="number"
                          min="1"
                          step="0.5"
                          value={selectedProject.maxShiftHours}
                          onChange={(e) => updateProject(selectedProject.id, { maxShiftHours: Number(e.target.value) })}
                        />
                      </label>
                    </div>

                    <div className="two-cols">
                      <label>
                        Min personal
                        <input
                          type="number"
                          min="0"
                          value={selectedProject.minStaff}
                          onChange={(e) => updateProject(selectedProject.id, { minStaff: Number(e.target.value) })}
                        />
                      </label>

                      <label>
                        Önskad personal
                        <input
                          type="number"
                          min="0"
                          value={selectedProject.desiredStaff}
                          onChange={(e) => updateProject(selectedProject.id, { desiredStaff: Number(e.target.value) })}
                        />
                      </label>
                    </div>
                  </div>
                )}
              </>
            )}
          </aside>
          )}

          {appTab === 'schedule' && (
          <section className="main-column">
            <section className="calendar-panel">
              <div className="calendar-toolbar">
                <div className="nav-buttons">
                  <button onClick={() => navigate(-1)}>←</button>
                  <button onClick={() => setCursorDate(new Date())}>Idag</button>
                  <button onClick={() => navigate(1)}>→</button>
                </div>

                <h2>{`${selectedProject?.name ?? 'Projekt'} · ${periodTitle}`}</h2>

                <button className="secondary" onClick={generateProjectSchedule} disabled={!selectedProject}>
                  Generera schema
                </button>
              </div>

              {selectedProject ? (
                <>
                  <div className="project-schedule-summary">
                    <span>Arbetsdag <strong>08:00–16:30</strong></span>
                    <span>Maxpass <strong>{selectedProject.maxShiftHours} h</strong></span>
                    <span>Bemanning <strong>{Math.max(1, business.staffAtSameTime ?? 1)}</strong> samtidigt</span>
                    <span>Ingen dubbelbokning</span>
                    <span>Jämn fördelning</span>
                    <span>Helger dolda</span>
                  </div>

                  <div className={`timeline-board ${view}`}>
                    <TimeColumn marks={timeMarks} startMin={startMin} endMin={endMin} pixelsPerMinute={pixelsPerMinute} />

                    {visibleDates.map((date) => (
                      <ProjectTimelineDay
                        key={localDateKey(date)}
                        date={date}
                        project={selectedProject}
                        tasks={taskAssignments}
                        employees={employees}
                        startMin={startMin}
                        endMin={endMin}
                        pixelsPerMinute={pixelsPerMinute}
                        business={business}
                        absences={absences}
                      />
                    ))}
                  </div>
                </>
              ) : (
                <div className="timeline-empty">Skapa eller välj ett projekt först.</div>
              )}
            </section>

            <section className="validation-panel">
              <div className="section-title">
                <div>
                  <strong>Schemakontroll</strong>
                  <span>
                    {validations.length
                      ? `${validations.length} sak${validations.length === 1 ? '' : 'er'} att kontrollera`
                      : 'Inga konflikter hittades'}
                  </span>
                </div>
              </div>

              {validations.length === 0 ? (
                <div className="ok-box">✓ Schemat följer de regler som kan kontrolleras just nu.</div>
              ) : (
                <div className="validation-list">
                  {validations.slice(0, 16).map((item, index) => (
                    <div key={index} className={`validation-item ${item.level}`}>
                      {item.level === 'error' ? '!' : '•'} {item.text}
                    </div>
                  ))}
                </div>
              )}
            </section>
          </section>
          )}
        </main>

        {editingAssignment && (
          <div className="modal-backdrop" onClick={() => setEditingAssignment(null)}>
            <div className="modal" onClick={(e) => e.stopPropagation()}>
              <div className="section-title">
                <div>
                  <strong>Redigera pass</strong>
                  <span>
                    {employees.find((e) => e.id === editingAssignment.employeeId)?.name} · {editingAssignment.date}
                  </span>
                </div>
                <button className="icon-button" onClick={() => setEditingAssignment(null)}>
                  ×
                </button>
              </div>

              <div className="two-cols">
                <label>
                  Start
                  <input
                    type="time"
                    value={editingAssignment.start}
                    onChange={(e) => setEditingAssignment({ ...editingAssignment, start: e.target.value })}
                  />
                </label>

                <label>
                  Slut
                  <input
                    type="time"
                    value={editingAssignment.end}
                    onChange={(e) => setEditingAssignment({ ...editingAssignment, end: e.target.value })}
                  />
                </label>
              </div>

              <label>
                Projekt
                <select
                  value={editingAssignment.projectId ?? ''}
                  onChange={(e) => setEditingAssignment({ ...editingAssignment, projectId: e.target.value || undefined })}
                >
                  <option value="">Inget projekt</option>
                  {projects.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.name}
                    </option>
                  ))}
                </select>
              </label>

              <div className="two-cols">
                <label>
                  Lunch från
                  <input
                    type="time"
                    value={editingAssignment.lunchStart ?? business.lunch.windowStart}
                    onChange={(e) => {
                      const lunchStart = e.target.value;
                      const lunchEnd = editingAssignment.lunchEnd ?? business.lunch.windowEnd;
                      setEditingAssignment({
                        ...editingAssignment,
                        lunchStart,
                        lunchMinutes: Math.max(0, toMinutes(lunchEnd) - toMinutes(lunchStart)),
                      });
                    }}
                  />
                </label>

                <label>
                  Lunch till
                  <input
                    type="time"
                    value={editingAssignment.lunchEnd ?? business.lunch.windowEnd}
                    onChange={(e) => {
                      const lunchEnd = e.target.value;
                      const lunchStart = editingAssignment.lunchStart ?? business.lunch.windowStart;
                      setEditingAssignment({
                        ...editingAssignment,
                        lunchEnd,
                        lunchMinutes: Math.max(0, toMinutes(lunchEnd) - toMinutes(lunchStart)),
                      });
                    }}
                  />
                </label>
              </div>

              <div className="modal-actions">
                <button className="secondary" onClick={() => setEditingAssignment(null)}>
                  Avbryt
                </button>
                <button className="primary" onClick={saveEditedAssignment}>
                  Spara pass
                </button>
              </div>
            </div>
          </div>
        )}

        <footer>
          Sparas automatiskt lokalt i webbläsaren. v0.8 visar endast projektschemat, har standarddag 08:00–16:30,
          utgråad lunch, bredare promptstöd och stöd för flera personer samtidigt.
        </footer>
      </div>
    </DragDropProvider>
  );
}

function validateSchedule(
  assignments: Assignment[],
  taskAssignments: TaskAssignment[],
  employees: Employee[],
  business: BusinessSettings,
  projects: Project[],
  weekDates: Date[],
  selectedProject?: Project
): ValidationItem[] {
  const items: ValidationItem[] = [];
  const weekKeys = weekDates.map(localDateKey);
  const byEmployee = Object.fromEntries(employees.map((e) => [e.id, e]));
  const byProject = Object.fromEntries(projects.map((p) => [p.id, p]));

  for (const assignment of assignments.filter((a) => weekKeys.includes(a.date))) {
    const employee = byEmployee[assignment.employeeId];
    if (!employee) continue;

    const date = new Date(`${assignment.date}T12:00:00`);
    const dayKey = getDayKey(date);
    const bday = business.days[dayKey];
    const hours = assignmentHours(assignment, business);
    const grossHours = hoursBetween(assignment.start, assignment.end);

    if (grossHours > business.maxShiftHours + 0.01) {
      items.push({
        level: 'warning',
        text: `${employee.name}s pass ${assignment.date} är ${grossHours.toFixed(1)} h långt, över global maxlängd ${business.maxShiftHours} h.`,
      });
    }

    if (!bday.open) {
      items.push({
        level: 'error',
        text: `${employee.name} är schemalagd ${DAY_LABELS[dayKey]} trots att verksamheten är stängd.`,
      });
    }

    if (!employee.days[dayKey]) {
      items.push({
        level: 'error',
        text: `${employee.name} är schemalagd ${DAY_LABELS[dayKey]} trots att dagen är markerad som ledig.`,
      });
    }

    if (hours > employee.maxHoursDay + 0.01) {
      items.push({
        level: 'warning',
        text: `${employee.name} har ${hours.toFixed(1)} h ${assignment.date}, över max ${employee.maxHoursDay} h.`,
      });
    }

    if (assignment.projectId) {
      const project = byProject[assignment.projectId];
      if (project) {
        if (!employee.projectIds.includes(project.id)) {
          items.push({
            level: 'error',
            text: `${employee.name} är inte tillåten på projektet ${project.name}.`,
          });
        }

        if (hours > project.maxShiftHours + 0.01) {
          items.push({
            level: 'warning',
            text: `${employee.name}s pass i ${project.name} är längre än projektets max ${project.maxShiftHours} h.`,
          });
        }
      }
    }
  }

  for (const employee of employees) {
    const mine = assignments
      .filter((a) => a.employeeId === employee.id && weekKeys.includes(a.date))
      .sort((a, b) => a.date.localeCompare(b.date));

    const total = mine.reduce((sum, a) => sum + assignmentHours(a, business), 0);

    if (total > employee.maxHoursWeek + 0.01) {
      items.push({
        level: 'warning',
        text: `${employee.name} har ${total.toFixed(1)} h denna vecka, över max ${employee.maxHoursWeek} h.`,
      });
    }

    let consecutiveDays = mine.length ? 1 : 0;
    let longestRun = consecutiveDays;

    for (let i = 1; i < mine.length; i++) {
      const prevDayDate = new Date(`${mine[i - 1].date}T12:00:00`);
      const curDayDate = new Date(`${mine[i].date}T12:00:00`);
      const diff = Math.round((curDayDate.getTime() - prevDayDate.getTime()) / 86400000);
      consecutiveDays = diff === 1 ? consecutiveDays + 1 : 1;
      longestRun = Math.max(longestRun, consecutiveDays);
    }

    if (longestRun > employee.maxConsecutiveDays) {
      items.push({
        level: 'warning',
        text: `${employee.name} arbetar ${longestRun} dagar i rad, över max ${employee.maxConsecutiveDays}.`,
      });
    }

    for (let i = 1; i < mine.length; i++) {
      const prev = mine[i - 1];
      const cur = mine[i];
      const prevDate = new Date(`${prev.date}T${prev.end}:00`);
      const curDate = new Date(`${cur.date}T${cur.start}:00`);
      const rest = (curDate.getTime() - prevDate.getTime()) / 3600000;
      if (rest >= 0 && rest < employee.minRestHours) {
        items.push({
          level: 'warning',
          text: `${employee.name} får bara ${rest.toFixed(1)} h vila mellan ${prev.date} och ${cur.date}.`,
        });
      }
    }
  }

  if (selectedProject) {
    const projectTasks = taskAssignments.filter(
      (task) => task.projectId === selectedProject.id && weekKeys.includes(task.date)
    );

    const byPersonAndDay: Record<string, TaskAssignment[]> = {};

    for (const task of projectTasks) {
      if (!task.employeeId) {
        items.push({
          level: 'warning',
          text: `${selectedProject.name} har obemannat pass ${task.date} ${task.start}–${task.end}.`,
        });
        continue;
      }

      const key = `${task.employeeId}-${task.date}`;
      byPersonAndDay[key] = [...(byPersonAndDay[key] ?? []), task];
    }

    for (const [key, tasks] of Object.entries(byPersonAndDay)) {
      for (let i = 0; i < tasks.length; i++) {
        for (let j = i + 1; j < tasks.length; j++) {
          if (overlaps(tasks[i].start, tasks[i].end, tasks[j].start, tasks[j].end)) {
            const employee = byEmployee[tasks[i].employeeId as string];
            items.push({
              level: 'error',
              text: `${employee?.name ?? 'En person'} har överlappande projektpass ${tasks[i].date}.`,
            });
          }
        }
      }

      const sorted = [...tasks].sort((a, b) => a.start.localeCompare(b.start));
      for (let i = 1; i < sorted.length; i++) {
        if (sorted[i - 1].end === sorted[i].start) {
          const employee = byEmployee[sorted[i].employeeId as string];
          items.push({
            level: 'warning',
            text: `${employee?.name ?? 'En person'} har projektpass direkt efter varandra ${sorted[i].date}.`,
          });
        }
      }
    }
  }

  return items;
}