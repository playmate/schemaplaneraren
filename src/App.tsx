import { useEffect, useMemo, useState } from 'react';
import { DragDropProvider, useDraggable, useDroppable } from '@dnd-kit/react';

type ViewMode = 'day' | 'week' | 'month';
type ScheduleMode = 'staff' | 'project';
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

type ValidationItem = {
  level: 'error' | 'warning';
  text: string;
};

const DAY_KEYS: DayKey[] = ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'];
const DAY_LABELS: Record<DayKey, string> = {
  mon: 'Mån', tue: 'Tis', wed: 'Ons', thu: 'Tor', fri: 'Fre', sat: 'Lör', sun: 'Sön',
};
const SWEDISH_DAY_TO_KEY: Record<string, DayKey> = {
  måndag: 'mon', måndagar: 'mon', måndagen: 'mon',
  tisdag: 'tue', tisdagar: 'tue', tisdagen: 'tue',
  onsdag: 'wed', onsdagar: 'wed', onsdagen: 'wed',
  torsdag: 'thu', torsdagar: 'thu', torsdagen: 'thu',
  fredag: 'fri', fredagar: 'fri', fredagen: 'fri',
  lördag: 'sat', lördagar: 'sat', lördagen: 'sat',
  söndag: 'sun', söndagar: 'sun', söndagen: 'sun',
};

const COLORS = ['#2563eb', '#7c3aed', '#db2777', '#059669', '#d97706', '#0891b2', '#dc2626', '#4f46e5'];

const defaultBusiness: BusinessSettings = {
  days: {
    mon: { open: true, start: '07:00', end: '17:00' },
    tue: { open: true, start: '07:00', end: '17:00' },
    wed: { open: true, start: '07:00', end: '19:00' },
    thu: { open: true, start: '07:00', end: '17:00' },
    fri: { open: true, start: '07:00', end: '16:00' },
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
};

const initialProjects: Project[] = [
  {
    id: 'reception', name: 'Reception', minShiftHours: 4, normalShiftHours: 8, maxShiftHours: 9,
    minStaff: 1, desiredStaff: 2, start: '07:00', end: '17:00', color: '#2563eb',
  },
  {
    id: 'support', name: 'Support', minShiftHours: 5, normalShiftHours: 8, maxShiftHours: 9,
    minStaff: 1, desiredStaff: 2, start: '08:00', end: '17:00', color: '#7c3aed',
  },
];

const initialEmployees: Employee[] = [
  {
    id: 'anna', name: 'Anna', percent: 100, color: COLORS[0],
    days: { mon: true, tue: true, wed: true, thu: true, fri: true, sat: false, sun: false },
    defaultStart: '08:00', defaultEnd: '17:00', overrides: {},
    maxHoursDay: 9, maxHoursWeek: 40, minRestHours: 11, maxConsecutiveDays: 5,
    avoidConsecutiveOpen: true, avoidConsecutiveClose: true, openingRule: 'soft', closingRule: 'soft',
    projectIds: ['reception', 'support'],
  },
  {
    id: 'erik', name: 'Erik', percent: 80, color: COLORS[1],
    days: { mon: true, tue: true, wed: true, thu: true, fri: false, sat: false, sun: false },
    defaultStart: '08:00', defaultEnd: '17:00', overrides: {},
    maxHoursDay: 9, maxHoursWeek: 32, minRestHours: 11, maxConsecutiveDays: 4,
    avoidConsecutiveOpen: true, avoidConsecutiveClose: true, openingRule: 'soft', closingRule: 'soft',
    projectIds: ['support'],
  },
  {
    id: 'sara', name: 'Sara', percent: 75, color: COLORS[2],
    days: { mon: true, tue: true, wed: true, thu: false, fri: true, sat: false, sun: false },
    defaultStart: '09:00', defaultEnd: '16:00', overrides: {},
    maxHoursDay: 8, maxHoursWeek: 30, minRestHours: 11, maxConsecutiveDays: 4,
    avoidConsecutiveOpen: true, avoidConsecutiveClose: true, openingRule: 'soft', closingRule: 'soft',
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
  return new Intl.DateTimeFormat('sv-SE', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' }).format(date);
}

function capitalize(value: string) {
  return value.charAt(0).toUpperCase() + value.slice(1);
}

function getIsoWeek(date: Date) {
  const target = new Date(date);
  target.setHours(0, 0, 0, 0);
  target.setDate(target.getDate() + 3 - ((target.getDay() + 6) % 7));
  const week1 = new Date(target.getFullYear(), 0, 4);
  return 1 + Math.round(((target.getTime() - week1.getTime()) / 86400000 - 3 + ((week1.getDay() + 6) % 7)) / 7);
}

function toMinutes(time: string) {
  const [h, m] = time.split(':').map(Number);
  return h * 60 + m;
}

function hoursBetween(start: string, end: string) {
  return Math.max(0, (toMinutes(end) - toMinutes(start)) / 60);
}

function weeklyTargetHours(employee: Employee) {
  return employee.maxHoursWeek || 40 * (employee.percent / 100);
}

function assignmentHours(a: Assignment, business: BusinessSettings) {
  let hours = hoursBetween(a.start, a.end);
  const lunchMinutes = a.lunchMinutes ?? (
    a.lunchStart && a.lunchEnd
      ? Math.max(0, toMinutes(a.lunchEnd) - toMinutes(a.lunchStart))
      : business.lunch.durationMinutes
  );
  if (business.lunch.enabled && !business.lunch.paid) hours -= lunchMinutes / 60;
  return Math.max(0, hours);
}

function assignmentLunch(a: Assignment, business: BusinessSettings) {
  if (!business.lunch.enabled) return null;
  const start = a.lunchStart ?? business.lunch.windowStart;
  const end = a.lunchEnd ?? business.lunch.windowEnd;
  if (toMinutes(end) <= toMinutes(a.start) || toMinutes(start) >= toMinutes(a.end)) return null;
  return { start, end };
}

function overlaps(startA: string, endA: string, startB: string, endB: string) {
  return toMinutes(startA) < toMinutes(endB) && toMinutes(endA) > toMinutes(startB);
}

function formatTaskMinutes(minutes: number) {
  if (minutes % 60 === 0) return `${minutes / 60} h`;
  return `${Math.floor(minutes / 60)} h ${minutes % 60} min`;
}

function DraggableEmployee({ employee }: { employee: Employee }) {
  const { ref, handleRef } = useDraggable({ id: `employee:${employee.id}` });
  return (
    <div ref={ref} className="employee-card" style={{ borderLeftColor: employee.color }}>
      <button ref={handleRef} className="drag-handle" aria-label={`Dra ${employee.name}`}>⋮⋮</button>
      <div className="employee-main">
        <strong>{employee.name}</strong>
        <span>{employee.percent}%</span>
      </div>
      <div className="employee-days">
        {DAY_KEYS.filter((key) => employee.days[key]).map((key) => DAY_LABELS[key]).join(' · ')}
      </div>
    </div>
  );
}

function ScheduleCell({
  date,
  assignments,
  employees,
  projects,
  business,
  onRemove,
  onEdit,
}: {
  date: Date;
  assignments: Assignment[];
  employees: Employee[];
  projects: Project[];
  business: BusinessSettings;
  onRemove: (employeeId: string, date: string) => void;
  onEdit: (assignment: Assignment) => void;
}) {
  const dateKey = localDateKey(date);
  const dayKey = getDayKey(date);
  const { ref, isDropTarget } = useDroppable({ id: `date:${dateKey}` });
  const byId = Object.fromEntries(employees.map((e) => [e.id, e]));
  const projectById = Object.fromEntries(projects.map((p) => [p.id, p]));
  const businessDay = business.days[dayKey];

  return (
    <div ref={ref} className={`schedule-cell ${isDropTarget ? 'drop-active' : ''} ${!businessDay.open ? 'closed-day' : ''}`}>
      <div className="cell-date">
        <div>
          <span>{capitalize(new Intl.DateTimeFormat('sv-SE', { weekday: 'short' }).format(date))}</span>
          <small>{businessDay.open ? `${businessDay.start}–${businessDay.end}` : 'Stängt'}</small>
        </div>
        <strong>{date.getDate()}</strong>
      </div>
      <div className="cell-content">
        {!businessDay.open && <span className="closed-label">Stängt</span>}
        {businessDay.open && assignments.length === 0 && <span className="empty-text">Dra hit en person</span>}
        {assignments.map((a) => {
          const employee = byId[a.employeeId];
          if (!employee) return null;
          const project = a.projectId ? projectById[a.projectId] : undefined;
          return (
            <button
              key={`${a.employeeId}-${a.date}`}
              className="shift-chip"
              style={{ borderLeftColor: project?.color ?? employee.color }}
              onClick={() => onEdit(a)}
              title="Klicka för att redigera"
            >
              <span className="shift-topline"><strong>{employee.name}</strong><span>{assignmentHours(a, business).toFixed(1)} h</span></span>
              <span>{a.start}–{a.end}{project ? ` · ${project.name}` : ''}</span>
              {assignmentLunch(a, business) && (
                <span className="lunch-line">🍽 Lunch {assignmentLunch(a, business)!.start}–{assignmentLunch(a, business)!.end}</span>
              )}
              <span className="shift-actions" onClick={(e) => e.stopPropagation()}>
                <span className="mini-link" onClick={() => onRemove(a.employeeId, a.date)}>Ta bort</span>
              </span>
            </button>
          );
        })}
      </div>
    </div>
  );
}

function ProjectScheduleCell({
  date,
  project,
  taskAssignments,
  employees,
}: {
  date: Date;
  project: Project;
  taskAssignments: TaskAssignment[];
  employees: Employee[];
}) {
  const dateKey = localDateKey(date);
  const byId = Object.fromEntries(employees.map((employee) => [employee.id, employee]));
  const slots = taskAssignments.filter((task) => task.date === dateKey && task.projectId === project.id);

  return (
    <div className="project-day-cell">
      <div className="cell-date">
        <div>
          <span>{capitalize(new Intl.DateTimeFormat('sv-SE', { weekday: 'short' }).format(date))}</span>
          <small>{project.start}–{project.end}</small>
        </div>
        <strong>{date.getDate()}</strong>
      </div>
      <div className="project-slot-list">
        {slots.length === 0 && <span className="empty-text">Inga projektpass skapade</span>}
        {slots.map((slot) => {
          const employee = slot.employeeId ? byId[slot.employeeId] : undefined;
          return (
            <div key={slot.id} className={`project-slot ${employee ? '' : 'unassigned'}`} style={{ borderLeftColor: employee?.color ?? '#dc2626' }}>
              <div className="project-slot-time">{slot.start}–{slot.end}</div>
              <strong>{employee?.name ?? 'Obemannat'}</strong>
              <span>{formatTaskMinutes(toMinutes(slot.end) - toMinutes(slot.start))}</span>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function App() {
  const [employees, setEmployees] = useState<Employee[]>(() => {
    const saved = localStorage.getItem('scheduler-employees-v2');
    return saved ? JSON.parse(saved) : initialEmployees;
  });
  const [assignments, setAssignments] = useState<Assignment[]>(() => {
    const saved = localStorage.getItem('scheduler-assignments-v2');
    return saved ? JSON.parse(saved) : [];
  });
  const [business, setBusiness] = useState<BusinessSettings>(() => {
    const saved = localStorage.getItem('scheduler-business-v2');
    return saved ? JSON.parse(saved) : defaultBusiness;
  });
  const [projects, setProjects] = useState<Project[]>(() => {
    const saved = localStorage.getItem('scheduler-projects-v2');
    return saved ? JSON.parse(saved) : initialProjects;
  });
  const [taskAssignments, setTaskAssignments] = useState<TaskAssignment[]>(() => {
    const saved = localStorage.getItem('scheduler-task-assignments-v1');
    return saved ? JSON.parse(saved) : [];
  });

  const [view, setView] = useState<ViewMode>('week');
  const [scheduleMode, setScheduleMode] = useState<ScheduleMode>('staff');
  const [cursorDate, setCursorDate] = useState(new Date());
  const [selectedEmployeeId, setSelectedEmployeeId] = useState(employees[0]?.id ?? '');
  const [selectedProjectId, setSelectedProjectId] = useState(projects[0]?.id ?? '');
  const [sidebarTab, setSidebarTab] = useState<SidebarTab>('person');
  const [prompt, setPrompt] = useState('');
  const [message, setMessage] = useState('');
  const [editingAssignment, setEditingAssignment] = useState<Assignment | null>(null);

  useEffect(() => localStorage.setItem('scheduler-employees-v2', JSON.stringify(employees)), [employees]);
  useEffect(() => localStorage.setItem('scheduler-assignments-v2', JSON.stringify(assignments)), [assignments]);
  useEffect(() => localStorage.setItem('scheduler-business-v2', JSON.stringify(business)), [business]);
  useEffect(() => localStorage.setItem('scheduler-projects-v2', JSON.stringify(projects)), [projects]);
  useEffect(() => localStorage.setItem('scheduler-task-assignments-v1', JSON.stringify(taskAssignments)), [taskAssignments]);

  const selectedEmployee = employees.find((e) => e.id === selectedEmployeeId) ?? employees[0];
  const selectedProject = projects.find((p) => p.id === selectedProjectId) ?? projects[0];

  const visibleDates = useMemo(() => {
    if (view === 'day') return [new Date(cursorDate)];
    if (view === 'week') {
      const start = startOfWeek(cursorDate);
      return Array.from({ length: 5 }, (_, i) => addDays(start, i));
    }
    const year = cursorDate.getFullYear();
    const month = cursorDate.getMonth();
    const days: Date[] = [];
    const current = new Date(year, month, 1);
    while (current.getMonth() === month) {
      const day = current.getDay();
      if (day !== 0 && day !== 6) days.push(new Date(current));
      current.setDate(current.getDate() + 1);
    }
    return days;
  }, [view, cursorDate]);

  const weekDates = useMemo(() => {
    const start = startOfWeek(cursorDate);
    return Array.from({ length: 5 }, (_, i) => addDays(start, i));
  }, [cursorDate]);

  const weekDateKeys = useMemo(() => weekDates.map(localDateKey), [weekDates]);

  const employeeWeekHours = useMemo(() => {
    const result: Record<string, number> = {};
    for (const employee of employees) {
      result[employee.id] = assignments
        .filter((a) => a.employeeId === employee.id && weekDateKeys.includes(a.date))
        .reduce((sum, a) => sum + assignmentHours(a, business), 0);
    }
    return result;
  }, [assignments, business, employees, weekDateKeys]);

  const validations = useMemo(() => validateSchedule(assignments, employees, business, projects, weekDates), [assignments, employees, business, projects, weekDates]);

  function updateEmployee(id: string, patch: Partial<Employee>) {
    setEmployees((current) => current.map((e) => e.id === id ? { ...e, ...patch } : e));
  }

  function addEmployee() {
    const nextNumber = employees.length + 1;
    const id = `person-${Date.now()}`;
    const employee: Employee = {
      id, name: `Person ${nextNumber}`, percent: 100, color: COLORS[employees.length % COLORS.length],
      days: { mon: true, tue: true, wed: true, thu: true, fri: true, sat: false, sun: false },
      defaultStart: '08:00', defaultEnd: '17:00', overrides: {},
      maxHoursDay: 9, maxHoursWeek: 40, minRestHours: 11, maxConsecutiveDays: 5,
      avoidConsecutiveOpen: true, avoidConsecutiveClose: true, openingRule: 'soft', closingRule: 'soft',
      projectIds: projects.map((p) => p.id),
    };
    setEmployees((current) => [...current, employee]);
    setSelectedEmployeeId(id);
  }

  function addProject() {
    const id = `project-${Date.now()}`;
    const project: Project = {
      id, name: `Projekt ${projects.length + 1}`, minShiftHours: 1, normalShiftHours: 3, maxShiftHours: 3,
      minStaff: 1, desiredStaff: 1, start: '08:00', end: '17:00', color: COLORS[projects.length % COLORS.length],
    };
    setProjects((current) => [...current, project]);
    setSelectedProjectId(id);
  }

  function updateProject(id: string, patch: Partial<Project>) {
    setProjects((current) => current.map((p) => p.id === id ? { ...p, ...patch } : p));
  }

  function removeAssignment(employeeId: string, date: string) {
    setAssignments((current) => current.filter((a) => !(a.employeeId === employeeId && a.date === date)));
  }

  function saveEditedAssignment() {
    if (!editingAssignment) return;
    setAssignments((current) => current.map((a) =>
      a.employeeId === editingAssignment.employeeId && a.date === editingAssignment.date ? editingAssignment : a
    ));
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
    const project = projects.find((p) => employee.projectIds.includes(p.id));
    const start = employee.overrides[day]?.start ?? employee.defaultStart;
    const end = employee.overrides[day]?.end ?? employee.defaultEnd;
    const clippedStart = toMinutes(start) < toMinutes(businessDay.start) ? businessDay.start : start;
    const clippedEnd = toMinutes(end) > toMinutes(businessDay.end) ? businessDay.end : end;
    setAssignments((current) => {
      const withoutDuplicate = current.filter((a) => !(a.employeeId === employeeId && a.date === dateKey));
      return [...withoutDuplicate, {
        employeeId,
        date: dateKey,
        start: clippedStart,
        end: clippedEnd,
        projectId: project?.id,
        lunchStart: business.lunch.windowStart,
        lunchEnd: business.lunch.windowEnd,
        lunchMinutes: business.lunch.durationMinutes,
      }];
    });
    setMessage(`${employee.name} lades till ${dateKey}, ${clippedStart}–${clippedEnd}.`);
  }

  function handleDragEnd(event: any) {
    if (event.canceled) return;
    const sourceId = String(event.operation.source?.id ?? '');
    const targetId = String(event.operation.target?.id ?? '');
    if (!sourceId.startsWith('employee:') || !targetId.startsWith('date:')) return;
    addAssignment(sourceId.replace('employee:', ''), targetId.replace('date:', ''));
  }

  function generateProjectSchedule() {
    if (!selectedProject) return;
    const dateKeys = visibleDates.map(localDateKey);
    const keepOtherProjects = taskAssignments.filter((task) => task.projectId !== selectedProject.id || !dateKeys.includes(task.date));
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

        if (business.lunch.enabled && slotStart < toMinutes(business.lunch.windowEnd) && slotEnd > toMinutes(business.lunch.windowStart)) {
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

        const start = `${String(Math.floor(slotStart / 60)).padStart(2, '0')}:${String(slotStart % 60).padStart(2, '0')}`;
        const end = `${String(Math.floor(slotEnd / 60)).padStart(2, '0')}:${String(slotEnd % 60).padStart(2, '0')}`;

        const candidates = employees.filter((employee) => {
          if (!employee.days[day] || !employee.projectIds.includes(selectedProject.id)) return false;

          const staffShift = assignments.find((assignment) => assignment.employeeId === employee.id && assignment.date === dateKey);
          const availableStart = staffShift?.start ?? employee.overrides[day]?.start ?? employee.defaultStart;
          const availableEnd = staffShift?.end ?? employee.overrides[day]?.end ?? employee.defaultEnd;
          if (toMinutes(start) < toMinutes(availableStart) || toMinutes(end) > toMinutes(availableEnd)) return false;

          const lunch = staffShift ? assignmentLunch(staffShift, business) : (business.lunch.enabled ? { start: business.lunch.windowStart, end: business.lunch.windowEnd } : null);
          if (lunch && overlaps(start, end, lunch.start, lunch.end)) return false;

          return ![...taskAssignments, ...generated].some((task) =>
            task.employeeId === employee.id &&
            task.date === dateKey &&
            task.projectId !== selectedProject.id &&
            overlaps(start, end, task.start, task.end)
          ) && !generated.some((task) =>
            task.employeeId === employee.id &&
            task.date === dateKey &&
            overlaps(start, end, task.start, task.end)
          );
        });

        const isClosingSlot = slotEnd === endMinute;
        const scored = candidates.map((employee) => {
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
        }).sort((a, b) => a.score - b.score || a.employee.name.localeCompare(b.employee.name, 'sv'));

        const chosen = scored[0]?.employee ?? null;
        generated.push({
          id: `${selectedProject.id}-${dateKey}-${slotIndex}`,
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

        slotStart = slotEnd;
        if (business.lunch.enabled && slotStart === toMinutes(business.lunch.windowStart)) {
          slotStart = toMinutes(business.lunch.windowEnd);
        }
        slotIndex += 1;
      }
    }

    setTaskAssignments([...keepOtherProjects, ...generated]);
    setScheduleMode('project');
    setMessage(`Projektpassen för ${selectedProject.name} fördelades så jämnt som möjligt utan överlappning. Obemannade luckor visas tydligt.`);
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
    const mentionedProject = projects.find((project) => text.includes(project.name.toLocaleLowerCase('sv-SE')));
    let changed = false;

    if (employee) {
      let next: Employee = { ...employee, days: { ...employee.days }, overrides: { ...employee.overrides }, projectIds: [...employee.projectIds] };
      const percent = text.match(/(?:jobbar|arbetar)\s+(\d{1,3})\s*%/);
      if (percent) { next.percent = Math.min(100, Math.max(0, Number(percent[1]))); changed = true; }

      const notWork = text.match(/(?:jobbar|arbetar)\s+inte\s+(?:på\s+)?([a-zåäö]+)/);
      if (notWork) {
        const key = SWEDISH_DAY_TO_KEY[notWork[1]];
        if (key) { next.days[key] = false; changed = true; }
      }

      const endMatch = text.match(/slutar\s+(?:klockan|kl\.?\s*)?\s*(\d{1,2})(?::(\d{2}))?\s+(?:på\s+)?([a-zåäö]+)/);
      if (endMatch) {
        const key = SWEDISH_DAY_TO_KEY[endMatch[3]];
        if (key) {
          const hour = String(Math.min(23, Number(endMatch[1]))).padStart(2, '0');
          next.overrides[key] = { ...next.overrides[key], end: `${hour}:${endMatch[2] ?? '00'}` };
          changed = true;
        }
      }

      const startMatch = text.match(/börjar\s+(?:klockan|kl\.?\s*)?\s*(\d{1,2})(?::(\d{2}))?\s+(?:på\s+)?([a-zåäö]+)/);
      if (startMatch) {
        const key = SWEDISH_DAY_TO_KEY[startMatch[3]];
        if (key) {
          const hour = String(Math.min(23, Number(startMatch[1]))).padStart(2, '0');
          next.overrides[key] = { ...next.overrides[key], start: `${hour}:${startMatch[2] ?? '00'}` };
          changed = true;
        }
      }

      if (/bör\s+inte\s+öppna\s+(?:två|2)\s+dagar\s+i\s+rad/.test(text)) { next.avoidConsecutiveOpen = true; changed = true; }
      if (/bör\s+inte\s+stänga\s+(?:två|2)\s+dagar\s+i\s+rad/.test(text)) { next.avoidConsecutiveClose = true; changed = true; }

      const maxDay = text.match(/max(?:imalt)?\s+(\d+(?:[.,]\d+)?)\s+timmar\s+(?:per|om)\s+dag/);
      if (maxDay) { next.maxHoursDay = Number(maxDay[1].replace(',', '.')); changed = true; }

      const maxPassPerson = text.match(/(?:max(?:imal)?(?:\s*längd)?(?:\s+på)?\s+pass|maxpass)\s+(?:är\s+)?(\d+(?:[.,]\d+)?)\s*(?:h|tim(?:me|mar)?)/);
      if (maxPassPerson) { next.maxHoursDay = Number(maxPassPerson[1].replace(',', '.')); changed = true; }

      if (changed) {
        setEmployees((current) => current.map((e) => e.id === employee.id ? next : e));
        setSelectedEmployeeId(employee.id);
        setSidebarTab('person');
      }
    }

    const lunchTime = text.match(/lunch(?:en)?\s+(?:är\s+|ska\s+vara\s+)?(\d{1,2})(?::(\d{2}))?\s*(?:-|–|till)\s*(\d{1,2})(?::(\d{2}))?/);
    if (lunchTime) {
      const start = `${String(Number(lunchTime[1])).padStart(2, '0')}:${lunchTime[2] ?? '00'}`;
      const end = `${String(Number(lunchTime[3])).padStart(2, '0')}:${lunchTime[4] ?? '00'}`;
      const durationMinutes = Math.max(0, toMinutes(end) - toMinutes(start));
      setBusiness((current) => ({ ...current, lunch: { ...current.lunch, enabled: true, windowStart: start, windowEnd: end, durationMinutes } }));
      changed = true;
      setSidebarTab('business');
    }

    const lunch = text.match(/lunch(?:en)?\s+(?:är\s+)?(\d{1,3})\s*min/);
    if (lunch) {
      const durationMinutes = Number(lunch[1]);
      setBusiness((current) => ({
        ...current,
        lunch: {
          ...current.lunch,
          enabled: true,
          durationMinutes,
          windowEnd: addMinutesTime(current.lunch.windowStart, durationMinutes),
        },
      }));
      changed = true;
      setSidebarTab('business');
    }

    const globalMaxPass = text.match(/(?:max(?:imal)?(?:\s*längd)?(?:\s+på)?\s+pass|maxpass)\s+(?:är\s+)?(\d+(?:[.,]\d+)?)\s*(?:h|tim(?:me|mar)?)/);
    if (globalMaxPass && mentionedProject) {
      updateProject(mentionedProject.id, { maxShiftHours: Number(globalMaxPass[1].replace(',', '.')) });
      setSelectedProjectId(mentionedProject.id);
      setSidebarTab('projects');
      changed = true;
    } else if (globalMaxPass && !employee) {
      setBusiness((current) => ({ ...current, maxShiftHours: Number(globalMaxPass[1].replace(',', '.')) }));
      changed = true;
      setSidebarTab('business');
    }

    const businessDay = text.match(/(?:öppet|öppettid(?:er)?)\s+(?:på\s+)?([a-zåäö]+).*?(\d{1,2})(?::(\d{2}))?\s*(?:-|till)\s*(\d{1,2})(?::(\d{2}))?/);
    if (businessDay) {
      const key = SWEDISH_DAY_TO_KEY[businessDay[1]];
      if (key) {
        const start = `${String(Number(businessDay[2])).padStart(2, '0')}:${businessDay[3] ?? '00'}`;
        const end = `${String(Number(businessDay[4])).padStart(2, '0')}:${businessDay[5] ?? '00'}`;
        setBusiness((current) => ({ ...current, days: { ...current.days, [key]: { open: true, start, end } } }));
        changed = true;
        setSidebarTab('business');
      }
    }

    if (!changed) {
      setMessage('Jag kunde inte tolka regeln ännu. Prova t.ex. “Anna jobbar inte fredagar”, “Anna bör inte öppna två dagar i rad” eller “öppet onsdag 07-19”.');
      return;
    }

    setPrompt('');
    setMessage('Regeln uppdaterades.');
  }

  function autoFillVisible() {
    const dateKeys = visibleDates.map(localDateKey);
    const additions: Assignment[] = [];
    const openingCount: Record<string, number> = Object.fromEntries(employees.map((e) => [e.id, 0]));
    const closingCount: Record<string, number> = Object.fromEntries(employees.map((e) => [e.id, 0]));
    const lastOpenDate: Record<string, string | undefined> = {};
    const lastCloseDate: Record<string, string | undefined> = {};

    for (const date of visibleDates) {
      const day = getDayKey(date);
      const dateKey = localDateKey(date);
      const businessDay = business.days[day];
      if (!businessDay.open) continue;

      const available = employees.filter((employee) => employee.days[day]);
      if (!available.length) continue;

      const scored = available.map((employee) => {
        const target = weeklyTargetHours(employee);
        const current = additions.filter((a) => a.employeeId === employee.id).reduce((sum, a) => sum + assignmentHours(a, business), 0);
        return { employee, score: target - current };
      }).sort((a, b) => b.score - a.score);

      const desired = Math.min(Math.max(...projects.map((p) => p.desiredStaff), 1), scored.length);
      const chosen = scored.slice(0, desired);

      chosen.forEach(({ employee }, index) => {
        const project = projects.find((p) => employee.projectIds.includes(p.id));
        let start = employee.overrides[day]?.start ?? employee.defaultStart;
        let end = employee.overrides[day]?.end ?? employee.defaultEnd;
        if (toMinutes(start) < toMinutes(businessDay.start)) start = businessDay.start;
        if (toMinutes(end) > toMinutes(businessDay.end)) end = businessDay.end;

        const maxShiftHours = Math.min(
          business.maxShiftHours,
          employee.maxHoursDay,
          project?.maxShiftHours ?? Number.POSITIVE_INFINITY,
        );
        const latestAllowedEnd = addMinutesTime(start, Math.round(maxShiftHours * 60));
        if (toMinutes(end) > toMinutes(latestAllowedEnd)) end = latestAllowedEnd;

        const previousDate = localDateKey(addDays(date, -1));
        const wouldOpen = start === businessDay.start;
        const wouldClose = end === businessDay.end;
        if (wouldOpen && employee.avoidConsecutiveOpen && lastOpenDate[employee.id] === previousDate && index + 1 < chosen.length) {
          start = addMinutesTime(start, 60);
        }
        if (wouldClose && employee.avoidConsecutiveClose && lastCloseDate[employee.id] === previousDate && index > 0) {
          end = addMinutesTime(end, -60);
        }

        additions.push({
          employeeId: employee.id,
          date: dateKey,
          start,
          end,
          projectId: project?.id,
          lunchStart: business.lunch.windowStart,
          lunchEnd: business.lunch.windowEnd,
          lunchMinutes: business.lunch.durationMinutes,
        });
        if (start === businessDay.start) { openingCount[employee.id] += 1; lastOpenDate[employee.id] = dateKey; }
        if (end === businessDay.end) { closingCount[employee.id] += 1; lastCloseDate[employee.id] = dateKey; }
      });
    }

    setAssignments((current) => [...current.filter((a) => !dateKeys.includes(a.date)), ...additions]);
    setMessage('Schemat fylldes med hänsyn till tillgänglighet, öppettider och flera mjuka regler. Kontrollera varningarna för eventuella konflikter.');
  }

  const periodTitle = view === 'day'
    ? capitalize(formatLongDate(cursorDate))
    : view === 'week'
      ? `Vecka ${getIsoWeek(cursorDate)}`
      : capitalize(new Intl.DateTimeFormat('sv-SE', { month: 'long', year: 'numeric' }).format(cursorDate));

  return (
    <DragDropProvider onDragEnd={handleDragEnd}>
      <div className="app-shell">
        <header className="topbar">
          <div>
            <p className="eyebrow">Schemaplaneraren v0.4</p>
            <h1>Planera smartare – med regler</h1>
          </div>
          <div className="topbar-controls">
            <div className="schedule-mode-switcher" role="group" aria-label="Välj schematyp">
              <button className={scheduleMode === 'staff' ? 'active' : ''} onClick={() => setScheduleMode('staff')}>Personal</button>
              <button className={scheduleMode === 'project' ? 'active' : ''} onClick={() => setScheduleMode('project')}>Projekt / uppgifter</button>
            </div>
            <div className="view-switcher" role="group" aria-label="Välj vy">
              {(['day', 'week', 'month'] as ViewMode[]).map((mode) => (
                <button key={mode} className={view === mode ? 'active' : ''} onClick={() => setView(mode)}>
                  {mode === 'day' ? 'Dag' : mode === 'week' ? 'Vecka' : 'Månad'}
                </button>
              ))}
            </div>
          </div>
        </header>

        <section className="prompt-panel">
          <div>
            <strong>Skriv en regel</strong>
            <span>Exempel: “Anna max pass 7,5 timmar”, “Reception maxpass 3 timmar”, “lunch 12-12:30” eller “öppet onsdag 07-19”</span>
          </div>
          <div className="prompt-row">
            <input value={prompt} onChange={(e) => setPrompt(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && parsePrompt()} placeholder="Skriv en instruktion…" />
            <button className="primary" onClick={parsePrompt}>Tolka</button>
          </div>
          {message && <div className="status-message">{message}</div>}
        </section>

        <main className="workspace">
          <aside className="sidebar">
            <div className="sidebar-tabs">
              <button className={sidebarTab === 'person' ? 'active' : ''} onClick={() => setSidebarTab('person')}>Personal</button>
              <button className={sidebarTab === 'business' ? 'active' : ''} onClick={() => setSidebarTab('business')}>Verksamhet</button>
              <button className={sidebarTab === 'projects' ? 'active' : ''} onClick={() => setSidebarTab('projects')}>Projekt</button>
            </div>

            {sidebarTab === 'person' && (
              <>
                <div className="section-title">
                  <div><strong>Anställda</strong><span>{employees.length} personer</span></div>
                  <button className="icon-button" onClick={addEmployee} title="Lägg till person">＋</button>
                </div>
                <div className="employee-list">
                  {employees.map((employee) => (
                    <div key={employee.id} onClick={() => setSelectedEmployeeId(employee.id)} className={selectedEmployeeId === employee.id ? 'selected-wrap' : ''}>
                      <DraggableEmployee employee={employee} />
                      <div className="hours-meter">
                        <span>{(employeeWeekHours[employee.id] ?? 0).toFixed(1)} / {weeklyTargetHours(employee).toFixed(0)} h</span>
                        <div><i style={{ width: `${Math.min(100, ((employeeWeekHours[employee.id] ?? 0) / Math.max(1, weeklyTargetHours(employee))) * 100)}%` }} /></div>
                      </div>
                    </div>
                  ))}
                </div>

                {selectedEmployee && (
                  <div className="settings-card">
                    <label>Namn<input value={selectedEmployee.name} onChange={(e) => updateEmployee(selectedEmployee.id, { name: e.target.value })} /></label>
                    <label>Sysselsättningsgrad: <strong>{selectedEmployee.percent}%</strong>
                      <input type="range" min="0" max="100" step="5" value={selectedEmployee.percent} onChange={(e) => updateEmployee(selectedEmployee.id, { percent: Number(e.target.value), maxHoursWeek: 40 * Number(e.target.value) / 100 })} />
                    </label>
                    <div className="two-cols">
                      <label>Normal start<input type="time" value={selectedEmployee.defaultStart} onChange={(e) => updateEmployee(selectedEmployee.id, { defaultStart: e.target.value })} /></label>
                      <label>Normalt slut<input type="time" value={selectedEmployee.defaultEnd} onChange={(e) => updateEmployee(selectedEmployee.id, { defaultEnd: e.target.value })} /></label>
                    </div>
                    <div><span className="field-label">Arbetsdagar</span><div className="day-toggles">
                      {DAY_KEYS.map((key) => <button key={key} className={selectedEmployee.days[key] ? 'on' : ''} onClick={() => updateEmployee(selectedEmployee.id, { days: { ...selectedEmployee.days, [key]: !selectedEmployee.days[key] } })}>{DAY_LABELS[key]}</button>)}
                    </div></div>
                    <div className="two-cols">
                      <label>Max h/dag<input type="number" min="1" step="0.5" value={selectedEmployee.maxHoursDay} onChange={(e) => updateEmployee(selectedEmployee.id, { maxHoursDay: Number(e.target.value) })} /></label>
                      <label>Max h/vecka<input type="number" min="1" step="0.5" value={selectedEmployee.maxHoursWeek} onChange={(e) => updateEmployee(selectedEmployee.id, { maxHoursWeek: Number(e.target.value) })} /></label>
                    </div>
                    <div className="two-cols">
                      <label>Min vila (h)<input type="number" min="0" value={selectedEmployee.minRestHours} onChange={(e) => updateEmployee(selectedEmployee.id, { minRestHours: Number(e.target.value) })} /></label>
                      <label>Max dagar i rad<input type="number" min="1" value={selectedEmployee.maxConsecutiveDays} onChange={(e) => updateEmployee(selectedEmployee.id, { maxConsecutiveDays: Number(e.target.value) })} /></label>
                    </div>
                    <label className="check-row"><input type="checkbox" checked={selectedEmployee.avoidConsecutiveOpen} onChange={(e) => updateEmployee(selectedEmployee.id, { avoidConsecutiveOpen: e.target.checked })} /> Undvik öppning flera dagar i rad</label>
                    <label className="check-row"><input type="checkbox" checked={selectedEmployee.avoidConsecutiveClose} onChange={(e) => updateEmployee(selectedEmployee.id, { avoidConsecutiveClose: e.target.checked })} /> Undvik stängning flera dagar i rad</label>
                    <div className="two-cols">
                      <label>Öppningsregel<select value={selectedEmployee.openingRule} onChange={(e) => updateEmployee(selectedEmployee.id, { openingRule: e.target.value as ConstraintLevel })}><option value="soft">Mjuk</option><option value="hard">Hård</option></select></label>
                      <label>Stängningsregel<select value={selectedEmployee.closingRule} onChange={(e) => updateEmployee(selectedEmployee.id, { closingRule: e.target.value as ConstraintLevel })}><option value="soft">Mjuk</option><option value="hard">Hård</option></select></label>
                    </div>
                    <div><span className="field-label">Tillåtna projekt</span><div className="project-checks">
                      {projects.map((project) => <label key={project.id} className="check-row"><input type="checkbox" checked={selectedEmployee.projectIds.includes(project.id)} onChange={(e) => updateEmployee(selectedEmployee.id, { projectIds: e.target.checked ? [...selectedEmployee.projectIds, project.id] : selectedEmployee.projectIds.filter((id) => id !== project.id) })} /> {project.name}</label>)}
                    </div></div>
                  </div>
                )}
              </>
            )}

            {sidebarTab === 'business' && (
              <div className="settings-card no-divider">
                <div className="section-title"><div><strong>Normala öppettider</strong><span>Ändras per veckodag</span></div></div>
                <div className="business-days">
                  {DAY_KEYS.map((key) => {
                    const day = business.days[key];
                    return <div className="business-day" key={key}>
                      <label className="check-row day-open"><input type="checkbox" checked={day.open} onChange={(e) => setBusiness((b) => ({ ...b, days: { ...b.days, [key]: { ...day, open: e.target.checked } } }))} /> <strong>{DAY_LABELS[key]}</strong></label>
                      <input type="time" disabled={!day.open} value={day.start} onChange={(e) => setBusiness((b) => ({ ...b, days: { ...b.days, [key]: { ...day, start: e.target.value } } }))} />
                      <input type="time" disabled={!day.open} value={day.end} onChange={(e) => setBusiness((b) => ({ ...b, days: { ...b.days, [key]: { ...day, end: e.target.value } } }))} />
                    </div>;
                  })}
                </div>
                <div className="subsection"><strong>Passregler</strong>
                  <label>Maxlängd på pass (h)<input type="number" min="1" step="0.5" value={business.maxShiftHours} onChange={(e) => setBusiness((b) => ({ ...b, maxShiftHours: Number(e.target.value) }))} /></label>
                  <span className="field-help">Gäller som övergripande max. Person- och projektgränser kan vara lägre.</span>
                </div>
                <div className="subsection"><strong>Lunch</strong>
                  <label className="check-row"><input type="checkbox" checked={business.lunch.enabled} onChange={(e) => setBusiness((b) => ({ ...b, lunch: { ...b.lunch, enabled: e.target.checked } }))} /> Använd lunchregel</label>
                  <div className="two-cols">
                    <label>Från<input type="time" disabled={!business.lunch.enabled} value={business.lunch.windowStart} onChange={(e) => setBusiness((b) => ({ ...b, lunch: { ...b.lunch, windowStart: e.target.value } }))} /></label>
                    <label>Till<input type="time" disabled={!business.lunch.enabled} value={business.lunch.windowEnd} onChange={(e) => setBusiness((b) => ({ ...b, lunch: { ...b.lunch, windowEnd: e.target.value } }))} /></label>
                  </div>
                  <div className="two-cols">
                    <label>Längd (min)<input type="number" min="0" step="5" disabled={!business.lunch.enabled} value={business.lunch.durationMinutes} onChange={(e) => setBusiness((b) => ({ ...b, lunch: { ...b.lunch, durationMinutes: Number(e.target.value) } }))} /></label>
                    <label className="check-row paid-check"><input type="checkbox" disabled={!business.lunch.enabled} checked={business.lunch.paid} onChange={(e) => setBusiness((b) => ({ ...b, lunch: { ...b.lunch, paid: e.target.checked } }))} /> Betald lunch</label>
                  </div>
                </div>
              </div>
            )}

            {sidebarTab === 'projects' && (
              <>
                <div className="section-title"><div><strong>Projekt</strong><span>{projects.length} projekt</span></div><button className="icon-button" onClick={addProject}>＋</button></div>
                <div className="project-list">
                  {projects.map((project) => <button key={project.id} className={`project-card ${selectedProjectId === project.id ? 'active' : ''}`} onClick={() => setSelectedProjectId(project.id)}><span style={{ background: project.color }} />{project.name}</button>)}
                </div>
                {selectedProject && <div className="settings-card">
                  <label>Projektnamn<input value={selectedProject.name} onChange={(e) => updateProject(selectedProject.id, { name: e.target.value })} /></label>
                  <div className="two-cols"><label>Från<input type="time" value={selectedProject.start} onChange={(e) => updateProject(selectedProject.id, { start: e.target.value })} /></label><label>Till<input type="time" value={selectedProject.end} onChange={(e) => updateProject(selectedProject.id, { end: e.target.value })} /></label></div>
                  <div className="three-cols">
                    <label>Min pass<input type="number" min="1" step="0.5" value={selectedProject.minShiftHours} onChange={(e) => updateProject(selectedProject.id, { minShiftHours: Number(e.target.value) })} /></label>
                    <label>Normal<input type="number" min="1" step="0.5" value={selectedProject.normalShiftHours} onChange={(e) => updateProject(selectedProject.id, { normalShiftHours: Number(e.target.value) })} /></label>
                    <label>Max pass<input type="number" min="1" step="0.5" value={selectedProject.maxShiftHours} onChange={(e) => updateProject(selectedProject.id, { maxShiftHours: Number(e.target.value) })} /></label>
                  </div>
                  <div className="two-cols"><label>Min personal<input type="number" min="0" value={selectedProject.minStaff} onChange={(e) => updateProject(selectedProject.id, { minStaff: Number(e.target.value) })} /></label><label>Önskad personal<input type="number" min="0" value={selectedProject.desiredStaff} onChange={(e) => updateProject(selectedProject.id, { desiredStaff: Number(e.target.value) })} /></label></div>
                </div>}
              </>
            )}
          </aside>

          <section className="main-column">
            <section className="calendar-panel">
              <div className="calendar-toolbar">
                <div className="nav-buttons"><button onClick={() => navigate(-1)}>←</button><button onClick={() => setCursorDate(new Date())}>Idag</button><button onClick={() => navigate(1)}>→</button></div>
                <h2>{scheduleMode === 'staff' ? periodTitle : `${selectedProject?.name ?? 'Projekt'} · ${periodTitle}`}</h2>
                {scheduleMode === 'staff'
                  ? <button className="secondary" onClick={autoFillVisible}>Fyll personalschema</button>
                  : <button className="secondary" onClick={generateProjectSchedule} disabled={!selectedProject}>Fördela projektpass</button>}
              </div>

              {scheduleMode === 'staff' ? (
                <div className={`calendar-grid ${view}`}>
                  {visibleDates.map((date) => {
                    const key = localDateKey(date);
                    const dayAssignments = assignments.filter((a) => a.date === key);
                    const faded = view === 'month' && date.getMonth() !== cursorDate.getMonth();
                    return <div key={key} className={faded ? 'faded' : ''}><ScheduleCell date={date} assignments={dayAssignments} employees={employees} projects={projects} business={business} onRemove={removeAssignment} onEdit={setEditingAssignment} /></div>;
                  })}
                </div>
              ) : selectedProject ? (
                <>
                  <div className="project-schedule-summary">
                    <span>Maxpass <strong>{selectedProject.maxShiftHours} h</strong></span>
                    <span>Ingen dubbelbokning</span>
                    <span>Jämn fördelning prioriteras</span>
                    <span>Helger dolda</span>
                  </div>
                  <div className={`project-calendar-grid ${view}`}>
                    {visibleDates.map((date) => (
                      <ProjectScheduleCell
                        key={localDateKey(date)}
                        date={date}
                        project={selectedProject}
                        taskAssignments={taskAssignments}
                        employees={employees}
                      />
                    ))}
                  </div>
                </>
              ) : <div className="empty-text">Skapa eller välj ett projekt först.</div>}
            </section>

            <section className="validation-panel">
              <div className="section-title"><div><strong>Schemakontroll</strong><span>{validations.length ? `${validations.length} sak${validations.length === 1 ? '' : 'er'} att kontrollera` : 'Inga konflikter hittades'}</span></div></div>
              {validations.length === 0 ? <div className="ok-box">✓ Schemat följer de regler som kan kontrolleras just nu.</div> : <div className="validation-list">{validations.slice(0, 12).map((item, index) => <div key={index} className={`validation-item ${item.level}`}>{item.level === 'error' ? '!' : '•'} {item.text}</div>)}</div>}
            </section>
          </section>
        </main>

        {editingAssignment && (
          <div className="modal-backdrop" onClick={() => setEditingAssignment(null)}>
            <div className="modal" onClick={(e) => e.stopPropagation()}>
              <div className="section-title"><div><strong>Redigera pass</strong><span>{employees.find((e) => e.id === editingAssignment.employeeId)?.name} · {editingAssignment.date}</span></div><button className="icon-button" onClick={() => setEditingAssignment(null)}>×</button></div>
              <div className="two-cols"><label>Start<input type="time" value={editingAssignment.start} onChange={(e) => setEditingAssignment({ ...editingAssignment, start: e.target.value })} /></label><label>Slut<input type="time" value={editingAssignment.end} onChange={(e) => setEditingAssignment({ ...editingAssignment, end: e.target.value })} /></label></div>
              <label>Projekt<select value={editingAssignment.projectId ?? ''} onChange={(e) => setEditingAssignment({ ...editingAssignment, projectId: e.target.value || undefined })}><option value="">Inget projekt</option>{projects.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}</select></label>
              <div className="two-cols">
                <label>Lunch från<input type="time" value={editingAssignment.lunchStart ?? business.lunch.windowStart} onChange={(e) => {
                  const lunchStart = e.target.value;
                  const lunchEnd = editingAssignment.lunchEnd ?? business.lunch.windowEnd;
                  setEditingAssignment({ ...editingAssignment, lunchStart, lunchMinutes: Math.max(0, toMinutes(lunchEnd) - toMinutes(lunchStart)) });
                }} /></label>
                <label>Lunch till<input type="time" value={editingAssignment.lunchEnd ?? business.lunch.windowEnd} onChange={(e) => {
                  const lunchEnd = e.target.value;
                  const lunchStart = editingAssignment.lunchStart ?? business.lunch.windowStart;
                  setEditingAssignment({ ...editingAssignment, lunchEnd, lunchMinutes: Math.max(0, toMinutes(lunchEnd) - toMinutes(lunchStart)) });
                }} /></label>
              </div>
              <div className="modal-actions"><button className="secondary" onClick={() => setEditingAssignment(null)}>Avbryt</button><button className="primary" onClick={saveEditedAssignment}>Spara pass</button></div>
            </div>
          </div>
        )}

        <footer>Sparas automatiskt lokalt i webbläsaren. v0.4 har vardagsschema, separat projekt-/uppgiftsvy, jämn passfördelning och skydd mot överlappning.</footer>
      </div>
    </DragDropProvider>
  );
}

function addMinutesTime(time: string, delta: number) {
  let minutes = toMinutes(time) + delta;
  minutes = Math.max(0, Math.min(23 * 60 + 59, minutes));
  return `${String(Math.floor(minutes / 60)).padStart(2, '0')}:${String(minutes % 60).padStart(2, '0')}`;
}

function validateSchedule(assignments: Assignment[], employees: Employee[], business: BusinessSettings, projects: Project[], weekDates: Date[]): ValidationItem[] {
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
    const grossShiftHours = hoursBetween(assignment.start, assignment.end);
    if (grossShiftHours > business.maxShiftHours + 0.01) items.push({ level: 'warning', text: `${employee.name}s pass ${assignment.date} är ${grossShiftHours.toFixed(1)} h långt, över global maxlängd ${business.maxShiftHours} h.` });
    if (!bday.open) items.push({ level: 'error', text: `${employee.name} är schemalagd ${DAY_LABELS[dayKey]} trots att verksamheten är stängd.` });
    if (!employee.days[dayKey]) items.push({ level: 'error', text: `${employee.name} är schemalagd ${DAY_LABELS[dayKey]} trots att dagen är markerad som ledig.` });
    if (hours > employee.maxHoursDay + 0.01) items.push({ level: 'warning', text: `${employee.name} har ${hours.toFixed(1)} h ${assignment.date}, över max ${employee.maxHoursDay} h.` });
    if (toMinutes(assignment.start) < toMinutes(bday.start) || toMinutes(assignment.end) > toMinutes(bday.end)) items.push({ level: 'warning', text: `${employee.name}s pass ${assignment.date} ligger delvis utanför öppettiderna.` });
    if (assignment.projectId) {
      const project = byProject[assignment.projectId];
      if (project) {
        if (!employee.projectIds.includes(project.id)) items.push({ level: 'error', text: `${employee.name} är inte tillåten på projektet ${project.name}.` });
        if (hours < project.minShiftHours - 0.01) items.push({ level: 'warning', text: `${employee.name}s pass i ${project.name} är kortare än projektets min ${project.minShiftHours} h.` });
        if (hours > project.maxShiftHours + 0.01) items.push({ level: 'warning', text: `${employee.name}s pass i ${project.name} är längre än projektets max ${project.maxShiftHours} h.` });
      }
    }
  }

  for (const employee of employees) {
    const mine = assignments.filter((a) => a.employeeId === employee.id && weekKeys.includes(a.date)).sort((a, b) => a.date.localeCompare(b.date));
    const total = mine.reduce((sum, a) => sum + assignmentHours(a, business), 0);
    if (total > employee.maxHoursWeek + 0.01) items.push({ level: 'warning', text: `${employee.name} har ${total.toFixed(1)} h denna vecka, över max ${employee.maxHoursWeek} h.` });

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
      items.push({ level: 'warning', text: `${employee.name} arbetar ${longestRun} dagar i rad, över max ${employee.maxConsecutiveDays}.` });
    }

    for (let i = 1; i < mine.length; i++) {
      const prev = mine[i - 1];
      const cur = mine[i];
      const prevDate = new Date(`${prev.date}T${prev.end}:00`);
      const curDate = new Date(`${cur.date}T${cur.start}:00`);
      const rest = (curDate.getTime() - prevDate.getTime()) / 3600000;
      if (rest >= 0 && rest < employee.minRestHours) items.push({ level: 'warning', text: `${employee.name} får bara ${rest.toFixed(1)} h vila mellan ${prev.date} och ${cur.date}.` });
    }

    for (let i = 1; i < mine.length; i++) {
      const prev = mine[i - 1];
      const cur = mine[i];
      const prevDate = new Date(`${prev.date}T12:00:00`);
      const curDate = new Date(`${cur.date}T12:00:00`);
      const isConsecutive = Math.round((curDate.getTime() - prevDate.getTime()) / 86400000) === 1;
      if (!isConsecutive) continue;
      const prevDay = business.days[getDayKey(prevDate)];
      const curDay = business.days[getDayKey(curDate)];
      const prevOpen = prev.start === prevDay.start;
      const curOpen = cur.start === curDay.start;
      const prevClose = prev.end === prevDay.end;
      const curClose = cur.end === curDay.end;
      if (employee.avoidConsecutiveOpen && prevOpen && curOpen) items.push({ level: employee.openingRule === 'hard' ? 'error' : 'warning', text: `${employee.name} öppnar två dagar i rad (${prev.date} och ${cur.date}).` });
      if (employee.avoidConsecutiveClose && prevClose && curClose) items.push({ level: employee.closingRule === 'hard' ? 'error' : 'warning', text: `${employee.name} stänger två dagar i rad (${prev.date} och ${cur.date}).` });
    }
  }

  for (const date of weekDates) {
    const key = localDateKey(date);
    const dayKey = getDayKey(date);
    if (!business.days[dayKey].open) continue;
    for (const project of projects) {
      const count = assignments.filter((a) => a.date === key && a.projectId === project.id).length;
      if (count < project.minStaff) items.push({ level: 'warning', text: `${project.name} har ${count}/${project.minStaff} i minbemanning ${key}.` });
    }
  }

  return items;
}

export default App;
