import React, { useEffect, useMemo, useState } from 'react';
import { Navigate, useNavigate, useParams } from 'react-router-dom';
import { ArrowLeft, ChevronDown, Play } from 'lucide-react';
import { useData } from '../contexts/DataContext';
import { useAuth } from '../contexts/AuthContext';
import { isValidCompletedSet } from '../utils/workoutMetrics';
import { fetchCloudPublicProfile } from '../lib/supabase';
import './RoutineViewPage.css';

const RANGE_OPTIONS = [
  { value: '1m', label: 'Último mês', months: 1 },
  { value: '3m', label: 'Últimos 3 meses', months: 3 },
  { value: '6m', label: 'Últimos 6 meses', months: 6 },
  { value: 'all', label: 'Todo o período', months: null }
];

const METRICS = [
  { id: 'volume', label: 'Volume', unit: 'kg' },
  { id: 'reps', label: 'Repetições', unit: 'reps' },
  { id: 'duration', label: 'Duração', unit: 'min' }
];

const getWorkoutDate = workout => {
  const timestamp = new Date(workout.date || workout.createdAt || 0).getTime();
  return Number.isNaN(timestamp) ? null : new Date(timestamp);
};

const getWorkoutMetrics = workout => {
  const sets = (workout.exercises || [])
    .flatMap(exercise => exercise.sets || [])
    .filter(isValidCompletedSet);

  return {
    volume: sets.reduce((total, set) => total + (Number(set.weight) || 0) * (Number(set.reps) || 0), 0),
    reps: sets.reduce((total, set) => total + (Number(set.reps) || 0), 0),
    duration: Number(workout.durationMinutes) || 0
  };
};

function RoutineHistoryChart({ history, metric }) {
  const chartData = history.slice(-7);
  const values = chartData.map(workout => workout[metric]);
  const maxValue = Math.max(1, ...values);
  const points = values.map((value, index) => {
    const x = chartData.length === 1 ? 320 : 56 + (index * 528) / (chartData.length - 1);
    const y = 170 - (value / maxValue) * 124;
    return { x, y, value, workout: chartData[index] };
  });
  const linePoints = points.map(point => `${point.x},${point.y}`).join(' ');
  const areaPoints = points.length
    ? `56,170 ${linePoints} ${points[points.length - 1].x},170`
    : '';
  const visibleLabels = new Set([0, Math.floor((chartData.length - 1) / 2), chartData.length - 1]);
  const metricLabel = METRICS.find(item => item.id === metric)?.label || 'Progresso';

  return (
    <div className="routine-view-chart">
      <svg viewBox="0 0 640 220" role="img" aria-label={`${metricLabel} por treino`}>
        {[46, 88, 129, 170].map(y => (
          <line key={y} x1="48" x2="592" y1={y} y2={y} className="routine-view-chart-grid" />
        ))}
        {points.length > 1 && <polygon points={areaPoints} className="routine-view-chart-area" />}
        {points.length > 1 && <polyline points={linePoints} className="routine-view-chart-line" />}
        {points.map((point, index) => (
          <g key={point.workout.id || index}>
            <circle cx={point.x} cy={point.y} r="5" className="routine-view-chart-point">
              <title>{`${point.value.toLocaleString('pt-BR')} · ${point.workout.label}`}</title>
            </circle>
            {visibleLabels.has(index) && (
              <text x={point.x} y="204" textAnchor="middle" className="routine-view-chart-date">
                {point.workout.label}
              </text>
            )}
          </g>
        ))}
      </svg>
    </div>
  );
}

export default function RoutineViewPage({ publicView = false }) {
  const { id: profileId, routineId } = useParams();
  const navigate = useNavigate();
  const { routines, checkins, startActiveWorkout, isDataLoading } = useData();
  const { user } = useAuth();
  const [range, setRange] = useState('3m');
  const [metric, setMetric] = useState('volume');
  const [sharedProfileState, setSharedProfileState] = useState({
    profileId: null,
    profile: null,
    error: null
  });

  useEffect(() => {
    if (!publicView || !profileId) return undefined;
    let active = true;
    fetchCloudPublicProfile(profileId)
      .then(profile => {
        if (active) setSharedProfileState({ profileId, profile, error: null });
      })
      .catch(error => {
        console.error('Não foi possível carregar a rotina compartilhada:', error);
        if (active) setSharedProfileState({ profileId, profile: null, error });
      });
    return () => { active = false; };
  }, [profileId, publicView]);

  const isSharedProfileLoading = publicView && sharedProfileState.profileId !== profileId;
  const sharedProfile = sharedProfileState.profileId === profileId
    ? sharedProfileState.profile
    : null;
  const routine = publicView
    ? sharedProfile?.routines?.find(item => String(item.id) === routineId)
    : routines.find(item => String(item.id) === routineId);
  const canViewRoutineWeights = !publicView || sharedProfile?.public_routine_weights === true;

  const history = useMemo(() => {
    if (!routine || publicView) return [];
    const rangeMonths = RANGE_OPTIONS.find(option => option.value === range)?.months;
    let startDate = new Date(0);
    if (rangeMonths !== null && rangeMonths !== undefined) {
      startDate = new Date();
      startDate.setMonth(startDate.getMonth() - rangeMonths);
    }

    return checkins
      .filter(workout => {
        if (!workout || workout.type === 'cardio' || workout.isCardio) return false;
        const sameId = workout.routineId && String(workout.routineId) === String(routine.id);
        const sameName = String(workout.routineName || '').trim().toLowerCase()
          === String(routine.name || '').trim().toLowerCase();
        const date = getWorkoutDate(workout);
        return (sameId || sameName) && date && date <= new Date() && date >= startDate;
      })
      .slice()
      .sort((a, b) => getWorkoutDate(a) - getWorkoutDate(b))
      .map(workout => {
        const date = getWorkoutDate(workout);
        return {
          ...getWorkoutMetrics(workout),
          id: workout.id,
          label: date.toLocaleDateString('pt-BR', { day: '2-digit', month: 'short' }).replace('.', ''),
          date
        };
      });
  }, [checkins, publicView, range, routine]);

  if ((publicView && isSharedProfileLoading) || (!publicView && isDataLoading)) {
    return <div className="routine-view-loading">Carregando rotina...</div>;
  }

  if (publicView && sharedProfileState.profileId === profileId && sharedProfileState.error) {
    return (
      <div className="routine-view-loading" role="alert">
        <p>Não foi possível carregar esta rotina compartilhada.</p>
        <button type="button" onClick={() => navigate(`/profiles/${profileId}`)}>Voltar ao perfil</button>
      </div>
    );
  }

  if (!routine) {
    return <Navigate to={publicView ? `/profiles/${profileId}` : '/routines'} replace />;
  }

  const latestWorkout = history[history.length - 1];
  const selectedMetric = METRICS.find(item => item.id === metric);

  const handleStartRoutine = () => {
    startActiveWorkout(routine);
    navigate('/workout/active');
  };

  return (
    <div className="routine-view-page">
      <header className="routine-view-topbar">
        <button
          type="button"
          className="routine-view-back"
          onClick={() => navigate(publicView ? `/profiles/${profileId}` : '/routines')}
          aria-label="Voltar para rotinas"
        >
          <ArrowLeft size={23} />
        </button>
        <h1>Rotina</h1>
        <span className="routine-view-topbar-spacer" aria-hidden="true" />
      </header>

      <div className="routine-view-content">
        <section className="routine-view-intro">
          <h2>{routine.name}</h2>
          <p>Criado por {publicView
            ? sharedProfile?.username || sharedProfile?.name || 'Atleta'
            : user?.username || user?.name || 'Atleta'}</p>
          {routine.description && <p className="routine-view-description">{routine.description}</p>}
          {!publicView && (
            <button type="button" className="routine-view-start" onClick={handleStartRoutine}>
              <Play size={18} fill="currentColor" />
              Iniciar rotina
            </button>
          )}
        </section>

        {!publicView && <section className="routine-view-progress" aria-label="Progresso da rotina">
          <div className="routine-view-chart-heading">
            <div className="routine-view-latest">
              <strong>
                {latestWorkout
                  ? `${latestWorkout[metric].toLocaleString('pt-BR')} ${selectedMetric.unit}`
                  : `0 ${selectedMetric.unit}`}
              </strong>
              <span>
                {latestWorkout
                  ? latestWorkout.date.toLocaleDateString('pt-BR', { month: 'short', day: 'numeric' }).replace('.', '')
                  : 'Sem treinos no período'}
              </span>
            </div>
            <label className="routine-view-range">
              <span className="sr-only">Período do gráfico</span>
              <select value={range} onChange={event => setRange(event.target.value)}>
                {RANGE_OPTIONS.map(option => (
                  <option key={option.value} value={option.value}>{option.label}</option>
                ))}
              </select>
              <ChevronDown size={17} aria-hidden="true" />
            </label>
          </div>

          {history.length > 0 ? (
            <RoutineHistoryChart history={history} metric={metric} />
          ) : (
            <div className="routine-view-chart-empty">
              O gráfico será exibido após você concluir treinos desta rotina.
            </div>
          )}

          <div className="routine-view-metrics" role="group" aria-label="Métrica do gráfico">
            {METRICS.map(item => (
              <button
                key={item.id}
                type="button"
                className={metric === item.id ? 'active' : ''}
                aria-pressed={metric === item.id}
                onClick={() => setMetric(item.id)}
              >
                {item.label}
              </button>
            ))}
          </div>
        </section>}

        <section className="routine-view-exercises">
          <h3>Exercícios</h3>
          {routine.exercises?.length ? (
            routine.exercises.map((exercise, exerciseIndex) => (
              <article className="routine-view-exercise" key={exercise.id || `${exercise.name}-${exerciseIndex}`}>
                <div className="routine-view-exercise-title">
                  <span className="routine-view-exercise-number">{exerciseIndex + 1}</span>
                  <div>
                    <h4>{exercise.name}</h4>
                    {exercise.muscleGroup && <span>{exercise.muscleGroup}</span>}
                  </div>
                </div>
                <div className="routine-view-sets" role="table" aria-label={`Séries de ${exercise.name}`}>
                  <div className={`routine-view-sets-row routine-view-sets-heading ${canViewRoutineWeights ? '' : 'weights-hidden'}`} role="row">
                    <span role="columnheader">Série</span>
                    {canViewRoutineWeights && <span role="columnheader">Kg</span>}
                    <span role="columnheader">Reps</span>
                  </div>
                  {(exercise.sets || []).map((set, setIndex) => (
                    <div className={`routine-view-sets-row ${canViewRoutineWeights ? '' : 'weights-hidden'}`} role="row" key={set.id || setIndex}>
                      <span role="cell">{set.setNumber || setIndex + 1}</span>
                      {canViewRoutineWeights && <span role="cell">{set.weight ?? 0}</span>}
                      <span role="cell">{set.reps ?? 0}</span>
                    </div>
                  ))}
                </div>
                {exercise.notes && <p className="routine-view-exercise-notes">{exercise.notes}</p>}
              </article>
            ))
          ) : (
            <p className="routine-view-empty-exercises">Esta rotina ainda não tem exercícios cadastrados.</p>
          )}
        </section>
      </div>
    </div>
  );
}
