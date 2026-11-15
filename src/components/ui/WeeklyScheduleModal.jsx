import React, { useState } from 'react';
import { Check, Dumbbell, Moon } from 'lucide-react';
import Button from './Button';
import Modal from './Modal';
import './WeeklyScheduleModal.css';

const DAYS_OF_WEEK = [
  { id: 1, name: 'Segunda-feira' },
  { id: 2, name: 'Terça-feira' },
  { id: 3, name: 'Quarta-feira' },
  { id: 4, name: 'Quinta-feira' },
  { id: 5, name: 'Sexta-feira' },
  { id: 6, name: 'Sábado' },
  { id: 0, name: 'Domingo' }
];

export default function WeeklyScheduleModal({
  isOpen,
  onClose,
  weeklySchedule,
  weeklyGoal = 4,
  onWeeklyGoalChange,
  onSave
}) {
  const [tempSchedule, setTempSchedule] = useState(() => ({ ...weeklySchedule }));

  const handleSave = event => {
    event.preventDefault();
    const finalSchedule = {};

    DAYS_OF_WEEK.forEach(day => {
      const entry = tempSchedule[day.id] || {};
      const hasWorkout = Boolean(
        entry.hasWorkout ?? (entry.type === 'workout' || entry.type === 'both')
      );
      const workoutLabel = hasWorkout
        ? (entry.workoutLabel || entry.label || '').trim() || 'Treino'
        : '';

      finalSchedule[day.id] = {
        type: hasWorkout ? 'workout' : 'rest',
        label: hasWorkout ? workoutLabel : 'Descanso',
        hasWorkout,
        workoutLabel
      };
    });

    onSave(finalSchedule);
    onClose();
  };

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title="Escala Semanal & Dias de Treino"
      size="md"
      className="weekly-schedule-modal"
    >
      <form className="weekly-schedule-form" onSubmit={handleSave}>
        {onWeeklyGoalChange && (
          <section className="weekly-goal-section" aria-labelledby="weekly-goal-label">
            <label id="weekly-goal-label">Quantas vezes por semana você quer treinar?</label>
            <div className="weekly-goal-options">
              {[1, 2, 3, 4, 5, 6, 7].map(count => (
                <button
                  key={count}
                  type="button"
                  className={`weekly-goal-option ${weeklyGoal === count ? 'active' : ''}`}
                  aria-pressed={weeklyGoal === count}
                  onClick={() => onWeeklyGoalChange(count)}
                >
                  {count}x
                </button>
              ))}
            </div>
            <span className="weekly-goal-current">
              Meta atual: <strong>{weeklyGoal}x</strong> por semana
            </span>
          </section>
        )}

        <p className="weekly-schedule-intro">
          Defina o nome do treino de cada dia ou marque-o como descanso.
        </p>

        <div className="weekly-schedule-days">
          {DAYS_OF_WEEK.map(day => {
            const currentEntry = tempSchedule[day.id] || {};
            const hasWorkout = Boolean(
              currentEntry.hasWorkout ??
              (currentEntry.type === 'workout' || currentEntry.type === 'both')
            );
            const workoutLabel = currentEntry.workoutLabel ||
              (hasWorkout ? currentEntry.label : '');

            return (
              <article className="weekly-schedule-day" key={day.id}>
                <div className="weekly-schedule-day-header">
                  <strong>{day.name}</strong>
                  <button
                    type="button"
                    className={`weekly-schedule-rest-toggle ${!hasWorkout ? 'is-rest' : ''}`}
                    aria-pressed={!hasWorkout}
                    onClick={() => {
                      setTempSchedule(previous => ({
                        ...previous,
                        [day.id]: hasWorkout
                          ? { type: 'rest', label: 'Descanso', hasWorkout: false, workoutLabel: '' }
                          : {
                              type: 'workout',
                              label: workoutLabel || 'Treino',
                              hasWorkout: true,
                              workoutLabel: workoutLabel || 'Treino'
                            }
                      }));
                    }}
                  >
                    {hasWorkout ? <Moon size={15} /> : <Dumbbell size={15} />}
                    {hasWorkout ? 'Marcar descanso' : 'Definir treino'}
                  </button>
                </div>

                {hasWorkout ? (
                  <input
                    type="text"
                    className="weekly-schedule-name-input"
                    aria-label={`Nome do treino de ${day.name}`}
                    placeholder="Digite o nome do treino..."
                    value={workoutLabel}
                    onChange={event => {
                      const value = event.target.value;
                      setTempSchedule(previous => ({
                        ...previous,
                        [day.id]: {
                          ...currentEntry,
                          type: 'workout',
                          label: value,
                          hasWorkout: true,
                          workoutLabel: value
                        }
                      }));
                    }}
                  />
                ) : (
                  <div className="weekly-schedule-rest-status">
                    <Moon size={16} />
                    Descanso programado
                  </div>
                )}
              </article>
            );
          })}
        </div>

        <div className="weekly-schedule-actions">
          <Button type="button" variant="ghost" onClick={onClose}>
            Cancelar
          </Button>
          <Button type="submit" variant="primary" icon={Check}>
            Salvar escala
          </Button>
        </div>
      </form>
    </Modal>
  );
}
