import React, { useMemo, useState } from 'react';
import { CalendarDays, ChevronLeft, ChevronRight, Dumbbell } from 'lucide-react';
import './SharedProfileActivity.css';

const WEEKDAYS = ['Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb', 'Dom'];

const getDateKey = value => {
  const date = new Date(
    typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value)
      ? `${value}T12:00:00`
      : value
  );
  if (Number.isNaN(date.getTime())) return null;
  return `${date.getFullYear()}-${date.getMonth()}-${date.getDate()}`;
};

const getScheduleStatus = (schedule, date) => {
  const entry = schedule?.[date.getDay()];
  if (!entry) return null;
  const isRest = entry.type === 'rest' ||
    (!entry.hasWorkout && entry.type !== 'workout' && entry.type !== 'both');
  return isRest ? 'rest' : 'missed';
};

const getDayStatus = (date, workoutDates, schedule) => {
  if (workoutDates.has(getDateKey(date))) return 'done';
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  if (date >= today) return 'upcoming';
  return getScheduleStatus(schedule, date);
};

const getStatusLabel = status => ({
  done: 'Treino concluído',
  rest: 'Descanso programado',
  missed: 'Treino não realizado',
  upcoming: 'Dia futuro'
}[status] || 'Sem atividade registrada');

export default function SharedProfileActivity({
  name,
  routines,
  routinesAvailable = true,
  routineWeightsVisible = false,
  trainingDates,
  weeklySchedule,
  canViewTrainingActivity,
  isLoading = false,
  onRoutineClick
}) {
  const now = new Date();
  const [calendarView, setCalendarView] = useState('monthly');
  const [calendarDate, setCalendarDate] = useState(() => new Date(now.getFullYear(), now.getMonth(), 1));
  const [activityYear, setActivityYear] = useState(now.getFullYear());
  const month = calendarDate.getMonth();
  const year = calendarDate.getFullYear();
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const firstDayOffset = (new Date(year, month, 1).getDay() + 6) % 7;

  const workoutDates = useMemo(() => new Set(
    (trainingDates || []).map(getDateKey).filter(Boolean)
  ), [trainingDates]);

  const annualWeeks = useMemo(() => {
    const firstWeekdayOffset = (new Date(activityYear, 0, 1).getDay() + 6) % 7;
    const daysInYear = (Date.UTC(activityYear + 1, 0, 1) - Date.UTC(activityYear, 0, 1)) / 86400000;
    const weekCount = Math.ceil((firstWeekdayOffset + daysInYear) / 7);
    return Array.from({ length: weekCount }, (_, weekIndex) =>
      Array.from({ length: 7 }, (_, weekdayIndex) => {
        const dayOfYear = weekIndex * 7 + weekdayIndex - firstWeekdayOffset;
        if (dayOfYear < 0 || dayOfYear >= daysInYear) return null;
        return new Date(activityYear, 0, dayOfYear + 1);
      })
    );
  }, [activityYear]);

  const changeMonth = offset => {
    setCalendarDate(new Date(year, month + offset, 1));
  };

  return (
    <div className="shared-profile-activity">
      <section className="shared-profile-calendar" aria-labelledby="shared-calendar-title">
        <header className="shared-profile-activity-heading">
          <div>
            <h2 id="shared-calendar-title"><CalendarDays size={18} /> Calendário de frequência</h2>
            <p>{calendarView === 'annual'
              ? 'Cada quadrado representa um dia de treino.'
              : 'Veja os treinos organizados por mês.'}</p>
          </div>
          <div className="shared-profile-calendar-controls">
            {calendarView === 'annual' && (
              <div className="shared-profile-year-switcher" aria-label="Selecionar ano">
                {[now.getFullYear(), now.getFullYear() + 1].map(optionYear => (
                  <button
                    key={optionYear}
                    type="button"
                    className={activityYear === optionYear ? 'is-active' : ''}
                    aria-pressed={activityYear === optionYear}
                    onClick={() => setActivityYear(optionYear)}
                  >
                    {optionYear}
                  </button>
                ))}
              </div>
            )}
            <div className="shared-profile-view-switcher" role="tablist" aria-label="Visualização do calendário">
              {['annual', 'monthly'].map(view => (
                <button
                  key={view}
                  type="button"
                  role="tab"
                  aria-selected={calendarView === view}
                  className={calendarView === view ? 'is-active' : ''}
                  onClick={() => setCalendarView(view)}
                >
                  {view === 'annual' ? 'Anual' : 'Mensal'}
                </button>
              ))}
            </div>
          </div>
        </header>

        {isLoading ? (
          <p className="shared-profile-activity-notice">Carregando atividade compartilhada...</p>
        ) : !canViewTrainingActivity ? (
          <p className="shared-profile-activity-notice">Este atleta não compartilhou a atividade de treino.</p>
        ) : calendarView === 'annual' ? (
          <div className="shared-profile-annual" role="tabpanel" aria-label={`Frequência anual de ${activityYear}`}>
            <div className="shared-profile-annual-scroll">
              <div className="shared-profile-annual-inner" style={{ '--annual-week-count': annualWeeks.length }}>
                <div className="shared-profile-annual-months">
                  {Array.from({ length: 12 }, (_, index) => {
                    const firstWeekdayOffset = (new Date(activityYear, 0, 1).getDay() + 6) % 7;
                    const dayOfYear = Math.floor(
                      (new Date(activityYear, index, 1) - new Date(activityYear, 0, 1)) / 86400000
                    );
                    const weekIndex = Math.floor((firstWeekdayOffset + dayOfYear) / 7);
                    return (
                      <span key={index} style={{ gridColumnStart: weekIndex + 1 }}>
                        {new Date(activityYear, index, 1).toLocaleDateString('pt-BR', { month: 'short' }).replace('.', '')}
                      </span>
                    );
                  })}
                </div>
                <div className="shared-profile-annual-chart">
                  <div className="shared-profile-annual-weekdays" aria-hidden="true">
                    <span>Seg</span><span /><span>Qua</span><span /><span>Sex</span><span /><span />
                  </div>
                  <div className="shared-profile-annual-weeks" role="grid" aria-label={`Treinos de ${activityYear}`}>
                    {annualWeeks.map((week, weekIndex) => (
                      <div className="shared-profile-annual-week" role="row" key={weekIndex}>
                        {week.map((date, dayIndex) => {
                          if (!date) return <span className="shared-profile-annual-day is-empty" key={dayIndex} />;
                          const status = getDayStatus(date, workoutDates, weeklySchedule);
                          const dateLabel = date.toLocaleDateString('pt-BR');
                          return (
                            <span
                              className="shared-profile-annual-day"
                              data-status={status || 'unknown'}
                              role="gridcell"
                              aria-label={`${dateLabel}: ${getStatusLabel(status)}`}
                              title={`${dateLabel} · ${getStatusLabel(status)}`}
                              key={dayIndex}
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
          <div className="shared-profile-monthly" role="tabpanel" aria-label="Frequência mensal">
            <div className="shared-profile-month-nav">
              <button type="button" onClick={() => changeMonth(-1)} aria-label="Mês anterior">
                <ChevronLeft size={18} />
              </button>
              <h3>{calendarDate.toLocaleDateString('pt-BR', { month: 'long', year: 'numeric' })}</h3>
              <button type="button" onClick={() => changeMonth(1)} aria-label="Próximo mês">
                <ChevronRight size={18} />
              </button>
            </div>
            <div className="shared-profile-month-weekdays">
              {WEEKDAYS.map(day => <span key={day}>{day}</span>)}
            </div>
            <div className="shared-profile-month-grid">
              {Array.from({ length: firstDayOffset }, (_, index) => (
                <span className="is-empty" aria-hidden="true" key={`blank-${index}`} />
              ))}
              {Array.from({ length: daysInMonth }, (_, index) => {
                const date = new Date(year, month, index + 1);
                const status = getDayStatus(date, workoutDates, weeklySchedule);
                return (
                  <span
                    className="shared-profile-month-day"
                    data-status={status || 'unknown'}
                    aria-label={`${date.toLocaleDateString('pt-BR')}: ${getStatusLabel(status)}`}
                    title={`${date.getDate()} de ${date.toLocaleDateString('pt-BR', { month: 'long' })}: ${getStatusLabel(status)}`}
                    key={index}
                  >
                    {date.getDate()}
                  </span>
                );
              })}
            </div>
          </div>
        )}

        {canViewTrainingActivity && (
          <div className="shared-profile-calendar-legend" aria-label="Legenda do calendário">
            <span><i data-status="done" />Treino</span>
            <span><i data-status="rest" />Descanso</span>
            <span><i data-status="missed" />Falta</span>
            <span><i data-status="upcoming" />Futuro</span>
          </div>
        )}
      </section>

      <section className="shared-profile-routines" aria-labelledby="shared-routines-title">
        <h2 id="shared-routines-title"><Dumbbell size={18} /> Rotinas de Treino ({name})</h2>
        {isLoading ? (
          <p className="shared-profile-activity-notice">Carregando rotinas...</p>
        ) : !routinesAvailable ? (
          <p className="shared-profile-activity-notice">As rotinas ainda não estão disponíveis. Atualize o esquema do Supabase para compartilhá-las.</p>
        ) : routines?.length ? (
          <div className="shared-profile-routine-list">
            {routines.map((routine, index) => (
              <button
                type="button"
                className="shared-profile-routine"
                key={routine.id || `${routine.name}-${index}`}
                onClick={() => onRoutineClick?.(routine)}
              >
                <strong>{routine.name || 'Rotina'}</strong>
                {routine.description && <span className="shared-profile-routine-description">{routine.description}</span>}
                <span className="shared-profile-routine-exercises">
                  {(routine.exercises || []).map(exercise => {
                    const weight = routineWeightsVisible ? Number(exercise.sets?.[0]?.weight) : 0;
                    return `${exercise.name}${weight > 0 ? ` (${weight} kg)` : ''}`;
                  }).join(' · ') || 'Sem exercícios cadastrados'}
                </span>
              </button>
            ))}
          </div>
        ) : (
          <p className="shared-profile-activity-notice">Nenhuma rotina cadastrada.</p>
        )}
      </section>
    </div>
  );
}
