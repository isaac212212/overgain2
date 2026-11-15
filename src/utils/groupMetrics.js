import { calculateTrainingStreaks, isValidCompletedSet } from './workoutMetrics.js';

const normalize = (value) => String(value || '')
  .normalize('NFD')
  .replace(/[\u0300-\u036f]/g, '')
  .toLowerCase();

const getMetricGroup = (exercise) => {
  const name = normalize(exercise?.name);
  const group = normalize(exercise?.muscleGroup);

  if (name.includes('terra') || name.includes('deadlift') || group.includes('terra')) return 'Levantamento Terra';
  if (group.includes('peito') || name.includes('supino') || name.includes('crucifixo') || name.includes('crossover')) return 'Peito';
  if (group.includes('costa') || name.includes('remada') || name.includes('puxada') || name.includes('pulldown') || name.includes('barra fixa')) return 'Costas';
  if (group.includes('ombro') || name.includes('desenvolvimento') || name.includes('elevacao lateral') || name.includes('elevacao frontal')) return 'Ombros';
  if (group.includes('biceps') || name.includes('rosca')) return 'Bíceps';
  if (group.includes('triceps') || name.includes('triceps') || name.includes('testa') || name.includes('pulley')) return 'Tríceps';
  if (group.includes('panturrilha') || name.includes('panturrilha') || name.includes('gemeos')) return 'Panturrilha';
  if (group.includes('perna') || group.includes('quadriceps') || group.includes('gluteo') || group.includes('posterior')
    || name.includes('agachamento') || name.includes('leg press') || name.includes('extensora')
    || name.includes('flexora') || name.includes('afundo') || name.includes('stiff')) return 'Pernas';

  return 'Geral';
};

const startOfLocalWeek = (value) => {
  const date = new Date(value);
  date.setHours(0, 0, 0, 0);
  date.setDate(date.getDate() - ((date.getDay() + 6) % 7));
  return date;
};

export function calculateGroupMemberMetrics(
  checkins,
  weeklySchedule,
  referenceDate = new Date(),
  { includeWeights = true, includePRs = true } = {}
) {
  const workouts = (checkins || []).filter(checkin => (
    checkin && checkin.type !== 'cardio' && !checkin.isCardio
  ));
  const weekStart = startOfLocalWeek(referenceDate);
  const weekEnd = new Date(weekStart);
  weekEnd.setDate(weekEnd.getDate() + 7);
  const weeklyWorkouts = workouts.filter(checkin => {
    const date = new Date(checkin.date);
    return date >= weekStart && date < weekEnd;
  });
  const weeklyCheckins = new Set(
    weeklyWorkouts.map(checkin => new Date(checkin.date).toDateString())
  ).size;
  const streaks = calculateTrainingStreaks(workouts, weeklySchedule, referenceDate);
  const weeklySetsByMuscleGroup = { Geral: 0 };
  const maxLiftsByMuscleGroup = {};
  const recordsByExercise = new Map();
  let prsCount = 0;
  let weeklyVolumeKg = 0;

  workouts
    .slice()
    .sort((a, b) => new Date(a.date) - new Date(b.date))
    .forEach(checkin => {
      (checkin.exercises || []).forEach(exercise => {
        const muscleGroup = getMetricGroup(exercise);
        const exerciseKey = normalize(exercise.name);
        (exercise.sets || []).filter(isValidCompletedSet).forEach(set => {
          const weight = Number(set.weight) || 0;
          if (weeklyWorkouts.includes(checkin)) {
            weeklySetsByMuscleGroup.Geral += 1;
            weeklySetsByMuscleGroup[muscleGroup] = (weeklySetsByMuscleGroup[muscleGroup] || 0) + 1;
            if (includeWeights) weeklyVolumeKg += weight * (Number(set.reps) || 0);
          }

          if (checkin.showWeights !== false && weight > 0) {
            if (includeWeights) {
              const currentBest = maxLiftsByMuscleGroup[muscleGroup];
              if (!currentBest || weight > currentBest.weight) {
                maxLiftsByMuscleGroup[muscleGroup] = { name: exercise.name, weight };
              }
            }
            const priorRecord = recordsByExercise.get(exerciseKey);
            if (includePRs && priorRecord !== undefined && weight > priorRecord) {
              prsCount += 1;
            }
            if (includePRs && (priorRecord === undefined || weight > priorRecord)) {
              recordsByExercise.set(exerciseKey, weight);
            }
          }
        });
      });
    });

  return {
    weeklyCheckins,
    streak: streaks.dailyStreak,
    weeklyStreak: streaks.weeklyStreak,
    prsCount: includePRs ? prsCount : 0,
    weeklySetsByMuscleGroup,
    maxLiftsByMuscleGroup,
    weeklyVolumeKg
  };
}
