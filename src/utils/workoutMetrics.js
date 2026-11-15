const startOfLocalDay = (value) => {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  date.setHours(0, 0, 0, 0);
  return date;
};

const startOfLocalWeek = (value) => {
  const date = startOfLocalDay(value);
  if (!date) return null;
  date.setDate(date.getDate() - ((date.getDay() + 6) % 7));
  return date;
};

const isScheduledWorkoutDay = (date, weeklySchedule) => {
  const entry = weeklySchedule?.[date.getDay()];
  return Boolean(entry?.hasWorkout || entry?.type === 'workout' || entry?.type === 'both');
};

export function isValidCompletedSet(set) {
  if (!set?.completed) return false;

  const durationSeconds = Number(set.durationSeconds);
  if (Number.isFinite(durationSeconds) && durationSeconds > 0) return true;

  const weight = set.weight === undefined || set.weight === null || set.weight === ''
    ? 0
    : Number(set.weight);
  const reps = Number(set.reps);

  return Number.isFinite(weight) && weight >= 0 && Number.isFinite(reps) && reps > 0;
}

export function markWorkoutPRs(exercises, previousCheckins) {
  const records = new Map();
  (previousCheckins || []).forEach(checkin => {
    (checkin?.exercises || []).forEach(exercise => {
      const key = String(exercise?.name || '').trim().toLowerCase();
      if (!key || exercise?.trackingType === 'duration') return;
      (exercise?.sets || []).filter(set => (
        set?.durationSeconds === undefined && isValidCompletedSet(set)
      )).forEach(set => {
        const weight = Number(set.weight) || 0;
        const reps = Number(set.reps) || 0;
        const record = records.get(key);
        if (!record || weight > record.weight || (weight === record.weight && reps > record.reps)) {
          records.set(key, { weight, reps });
        }
      });
    });
  });

  return (exercises || []).map(exercise => {
    const key = String(exercise?.name || '').trim().toLowerCase();
    const sets = (exercise?.sets || []).map(set => {
      const markedSet = { ...set, isPR: false, prType: null };
      if (
        !key
        || exercise?.trackingType === 'duration'
        || set?.durationSeconds !== undefined
        || !isValidCompletedSet(set)
      ) return markedSet;

      const weight = Number(set.weight) || 0;
      const reps = Number(set.reps) || 0;
      const record = records.get(key);
      if (!record || weight > record.weight) {
        markedSet.isPR = true;
        markedSet.prType = 'weight';
        records.set(key, { weight, reps });
      } else if (weight === record.weight && reps > record.reps) {
        markedSet.isPR = true;
        markedSet.prType = 'reps';
        records.set(key, { weight, reps });
      }
      return markedSet;
    });
    return { ...exercise, sets };
  });
}

export function recalculateWorkoutPRs(checkins) {
  const history = [];
  const recalculated = new Map();
  (checkins || [])
    .filter(checkin => checkin && checkin.type !== 'cardio' && !checkin.isCardio)
    .slice()
    .sort((a, b) => new Date(a.date) - new Date(b.date))
    .forEach(checkin => {
      const exercises = markWorkoutPRs(checkin.exercises, history);
      recalculated.set(checkin.id, { ...checkin, exercises });
      history.push({ exercises });
    });

  return (checkins || []).map(checkin => recalculated.get(checkin.id) || checkin);
}

export function calculateTrainingStreaks(checkins, weeklySchedule, referenceDate = new Date()) {
  const workoutCheckins = (checkins || []).filter(checkin => checkin && checkin.type !== 'cardio' && !checkin.isCardio);
  const workoutDates = new Set(
    workoutCheckins
      .map(checkin => startOfLocalDay(checkin.date)?.getTime())
      .filter(timestamp => timestamp !== undefined)
  );
  const workoutWeeks = new Set(
    workoutCheckins
      .map(checkin => startOfLocalWeek(checkin.date)?.getTime())
      .filter(timestamp => timestamp !== undefined)
  );

  const today = startOfLocalDay(referenceDate) || startOfLocalDay(new Date());
  let dailyStreak = 0;

  if (workoutDates.has(today.getTime())) {
    dailyStreak += 1;
  }

  const evalDate = new Date(today);
  evalDate.setDate(evalDate.getDate() - 1);
  for (let i = 0; i < 366; i++) {
    if (isScheduledWorkoutDay(evalDate, weeklySchedule)) {
      if (workoutDates.has(evalDate.getTime())) {
        dailyStreak += 1;
      } else {
        break;
      }
    }
    evalDate.setDate(evalDate.getDate() - 1);
  }

  let weeklyStreak = 0;
  const evalWeek = startOfLocalWeek(today);
  evalWeek.setDate(evalWeek.getDate() - 7);
  for (let i = 0; i < 520; i++) {
    if (!workoutWeeks.has(evalWeek.getTime())) break;
    weeklyStreak += 1;
    evalWeek.setDate(evalWeek.getDate() - 7);
  }
  if (workoutWeeks.has(startOfLocalWeek(today).getTime())) {
    weeklyStreak += 1;
  }

  return { dailyStreak, weeklyStreak };
}
