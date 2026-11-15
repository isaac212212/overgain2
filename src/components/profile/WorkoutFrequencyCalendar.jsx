import React, { useMemo, useState } from 'react';
import { Calendar, ChevronLeft, ChevronRight } from 'lucide-react';
import Card from '../ui/Card';
import {
  formatDate,
  getCalendarDaysCurrentOnly,
  getMonthName,
  getMonthShortName
} from '../../utils/dateHelpers';
import './WorkoutFrequencyCalendar.css';

const getCalendarDateKey = value => {
  const date = new Date(
    typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value)
      ? `${value}T12:00:00`
      : value
  );
  if (Number.isNaN(date.getTime())) return null;
  return `${date.getFullYear()}-${date.getMonth()}-${date.getDate()}`;
};

export default function WorkoutFrequencyCalendar({ checkins = [], weeklySchedule = {} }) {
  const currentYear = new Date().getFullYear();
  const [activityYear, setActivityYear] = useState(currentYear);
  const [calendarView, setCalendarView] = useState('annual');
  const [calendarDate, setCalendarDate] = useState(new Date());
  const calMonth = calendarDate.getMonth();
  const calYear = calendarDate.getFullYear();
  const calendarDays = getCalendarDaysCurrentOnly(calYear, calMonth);
  const availableYears = [currentYear, currentYear + 1];

  const annualActivity = useMemo(() => {
    const workoutsByDate = new Map();

    checkins.forEach(checkin => {
      const rawDate = checkin.date;
      const date = new Date(typeof rawDate === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(rawDate)
        ? `${rawDate}T12:00:00`
        : rawDate);
      if (Number.isNaN(date.getTime()) || date.getFullYear() !== activityYear) return;

      const key = getCalendarDateKey(rawDate);
      if (!key) return;
      workoutsByDate.set(key, (workoutsByDate.get(key) || 0) + 1);
    });

    const firstWeekdayOffset = (new Date(activityYear, 0, 1).getDay() + 6) % 7;
    const daysInYear = (Date.UTC(activityYear + 1, 0, 1) - Date.UTC(activityYear, 0, 1)) / 86400000;
    const weekCount = Math.ceil((firstWeekdayOffset + daysInYear) / 7);
    const weeks = Array.from({ length: weekCount }, (_, weekIndex) =>
      Array.from({ length: 7 }, (_, weekdayIndex) => {
        const dayOfYear = weekIndex * 7 + weekdayIndex - firstWeekdayOffset;
        if (dayOfYear < 0 || dayOfYear >= daysInYear) return null;

        const date = new Date(activityYear, 0, dayOfYear + 1);
        const key = `${date.getFullYear()}-${date.getMonth()}-${date.getDate()}`;
        return { date, count: workoutsByDate.get(key) || 0 };
      })
    );

    const months = Array.from({ length: 12 }, (_, monthIndex) => {
      const dayOfYear = Math.floor(
        (new Date(activityYear, monthIndex, 1) - new Date(activityYear, 0, 1)) / 86400000
      );
      return {
        label: getMonthShortName(monthIndex),
        weekIndex: Math.floor((firstWeekdayOffset + dayOfYear) / 7)
      };
    });

    return {
      weeks,
      months,
      workoutCount: Array.from(workoutsByDate.values()).reduce((sum, count) => sum + count, 0),
      activeDays: workoutsByDate.size
    };
  }, [activityYear, checkins]);

  const getCalendarDayStatus = day => {
    const targetDate = day instanceof Date
      ? day
      : new Date(day.year, day.month, day.day);
    const targetKey = getCalendarDateKey(targetDate);
    if (checkins.some(checkin => getCalendarDateKey(checkin.date) === targetKey)) return 'done';

    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const dateToCompare = new Date(targetDate.getFullYear(), targetDate.getMonth(), targetDate.getDate());
    if (dateToCompare >= today) return 'upcoming';

    const schedule = weeklySchedule?.[targetDate.getDay()];
    const isRestDay = schedule?.type === 'rest' ||
      (!schedule?.hasWorkout && schedule?.type !== 'workout' && schedule?.type !== 'both');
    return isRestDay ? 'rest' : 'missed';
  };

  const changeMonth = offset => {
    setCalendarDate(new Date(calYear, calMonth + offset, 1));
  };

  return (
    <Card className="profile-annual-activity-card" padding="lg">
      <div className="profile-annual-activity-header">
        <div>
          <h2 className="profile-section-title">
            <Calendar size={18} className="text-accent" /> Calendário de frequência
          </h2>
          <p className="profile-section-subtitle">
            {calendarView === 'annual'
              ? 'Cada quadrado representa um dia de treino.'
              : 'Veja seus treinos organizados por mês.'}
          </p>
        </div>
        <div className="profile-calendar-controls">
          {calendarView === 'annual' && (
            <div className="annual-activity-year-switcher" aria-label="Selecionar ano">
              {availableYears.map(year => (
                <button
                  key={year}
                  type="button"
                  className={activityYear === year ? 'is-active' : ''}
                  aria-pressed={activityYear === year}
                  onClick={() => setActivityYear(year)}
                >
                  {year}
                </button>
              ))}
            </div>
          )}
          <div className="profile-calendar-view-switcher" role="tablist" aria-label="Visualização do calendário">
            <button
              type="button"
              role="tab"
              aria-selected={calendarView === 'annual'}
              className={calendarView === 'annual' ? 'is-active' : ''}
              onClick={() => setCalendarView('annual')}
            >
              Anual
            </button>
            <button
              type="button"
              role="tab"
              aria-selected={calendarView === 'monthly'}
              className={calendarView === 'monthly' ? 'is-active' : ''}
              onClick={() => setCalendarView('monthly')}
            >
              Mensal
            </button>
          </div>
        </div>
      </div>

      {calendarView === 'annual' ? (
        <div role="tabpanel" aria-label="Frequência anual">
          <div className="annual-activity-summary">
            <strong>{annualActivity.workoutCount}</strong> treinos
            <span>·</span>
            <strong>{annualActivity.activeDays}</strong> dias ativos em {activityYear}
          </div>

          <div className="annual-calendar-scroll">
            <div
              className="annual-calendar-inner"
              style={{ '--annual-week-count': annualActivity.weeks.length }}
            >
              <div className="annual-calendar-months">
                {annualActivity.months.map(month => (
                  <span
                    key={month.label}
                    style={{ gridColumnStart: month.weekIndex + 1 }}
                  >
                    {month.label}
                  </span>
                ))}
              </div>
              <div className="annual-calendar-chart">
                <div className="annual-calendar-weekdays" aria-hidden="true">
                  <span>Seg</span><span /><span>Qua</span><span /><span>Sex</span><span /><span />
                </div>
                <div
                  className="annual-calendar-weeks"
                  role="grid"
                  aria-label={`Calendário de treinos de ${activityYear}`}
                >
                  {annualActivity.weeks.map((week, weekIndex) => (
                    <div className="annual-calendar-week" role="row" key={weekIndex}>
                      {week.map((day, weekdayIndex) => {
                        if (!day) {
                          return <span className="annual-calendar-day is-empty" aria-hidden="true" key={weekdayIndex} />;
                        }
                        const level = day.count === 0 ? 0 : day.count === 1 ? 1 : day.count === 2 ? 2 : 3;
                        const status = getCalendarDayStatus(day.date);
                        const dateLabel = formatDate(day.date);
                        const activityLabel = day.count === 1 ? '1 treino' : `${day.count} treinos`;
                        const statusLabel = status === 'done'
                          ? activityLabel
                          : status === 'rest'
                            ? 'Descanso programado'
                            : status === 'missed'
                              ? 'Treino não realizado'
                              : 'Dia futuro';

                        return (
                          <span
                            key={weekdayIndex}
                            className="annual-calendar-day"
                            data-level={level}
                            data-status={status}
                            role="gridcell"
                            aria-label={`${dateLabel}: ${statusLabel}`}
                            title={`${dateLabel} · ${statusLabel}`}
                          />
                        );
                      })}
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>
        </div>
      ) : (
        <div className="profile-monthly-calendar" role="tabpanel" aria-label="Frequência mensal">
          <div className="profile-cal-nav">
            <button type="button" className="cal-nav-btn" onClick={() => changeMonth(-1)} aria-label="Mês anterior">
              <ChevronLeft size={18} />
            </button>
            <h3 className="cal-nav-title">
              {getMonthName(calMonth)} de {calYear}
            </h3>
            <button type="button" className="cal-nav-btn" onClick={() => changeMonth(1)} aria-label="Próximo mês">
              <ChevronRight size={18} />
            </button>
          </div>

          <div className="profile-cal-weekdays">
            <span>Seg</span>
            <span>Ter</span>
            <span>Qua</span>
            <span>Qui</span>
            <span>Sex</span>
            <span>Sáb</span>
            <span>Dom</span>
          </div>

          <div className="profile-cal-grid">
            {calendarDays.map((day, index) => {
              if (!day) {
                return <div key={`blank-${index}`} className="profile-cal-cell calendar-day-blank" />;
              }
              const status = getCalendarDayStatus(day);
              const statusLabel = status === 'done'
                ? 'Treino concluído'
                : status === 'rest'
                  ? 'Descanso programado'
                  : status === 'missed'
                    ? 'Treino não realizado'
                    : 'Dia futuro';
              return (
                <div
                  key={index}
                  className={`profile-cal-cell status-${status}`}
                  title={`${day.day} de ${getMonthName(day.month)}: ${statusLabel}`}
                >
                  <span className="cal-num">{day.day}</span>
                </div>
              );
            })}
          </div>
        </div>
      )}

      <div className="profile-calendar-legend" aria-label="Legenda do calendário">
        <span><i className="calendar-status-swatch is-done" />Treino</span>
        <span><i className="calendar-status-swatch is-rest" />Descanso</span>
        <span><i className="calendar-status-swatch is-missed" />Falta</span>
        <span><i className="calendar-status-swatch is-upcoming" />Futuro</span>
      </div>
    </Card>
  );
}
