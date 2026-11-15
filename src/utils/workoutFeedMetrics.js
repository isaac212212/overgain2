const isCompletedSet = (set) => (
  set?.completed !== false
  && (
    (Number.isFinite(Number(set?.durationSeconds)) && Number(set.durationSeconds) > 0)
    || (Number(set?.reps) > 0 && Number.isFinite(Number(set?.reps)))
  )
);

export function getWorkoutFeedMetrics(post) {
  const exercises = Array.isArray(post?.exercises) ? post.exercises : [];
  const sets = exercises.flatMap(exercise => exercise?.sets || []);
  const completedSets = sets.filter(isCompletedSet);
  const derivedReps = completedSets.reduce(
    (total, set) => total + (Number(set.durationSeconds) > 0 ? 0 : Number(set.reps) || 0),
    0
  );
  const durationSeconds = completedSets.reduce(
    (total, set) => total + (Number(set.durationSeconds) || 0),
    0
  );
  const derivedVolume = completedSets.reduce(
    (total, set) => total + ((Number(set.weight) || 0) * (Number(set.reps) || 0)),
    0
  );
  const rawMuscleStats = post?.muscleStats && typeof post.muscleStats === 'object'
    ? post.muscleStats
    : {};
  const muscleStats = Object.keys(rawMuscleStats).length
    ? Object.entries(rawMuscleStats).map(([name, stats]) => ({
      name,
      sets: Number(stats?.sets) || 0,
      reps: Number(stats?.reps) || 0,
      volume: Number(stats?.volume) || 0
    }))
    : Object.entries(exercises.reduce((stats, exercise) => {
      const name = exercise?.muscleGroup || 'Geral';
      const muscle = stats[name] || { sets: 0, reps: 0, volume: 0 };
      (exercise?.sets || []).filter(isCompletedSet).forEach(set => {
        muscle.sets += 1;
        muscle.reps += Number(set.reps) || 0;
        muscle.volume += (Number(set.weight) || 0) * (Number(set.reps) || 0);
      });
      stats[name] = muscle;
      return stats;
    }, {})).map(([name, stats]) => ({ name, ...stats }));

  return {
    sets: Number.isFinite(Number(post?.totalSets)) ? Number(post.totalSets) : completedSets.length,
    reps: Number.isFinite(Number(post?.totalReps)) ? Number(post.totalReps) : derivedReps,
    volume: Number.isFinite(Number(post?.totalVolumeKg)) ? Number(post.totalVolumeKg) : derivedVolume,
    durationSeconds,
    personalRecords: post?.sharePRs === false
      ? null
      : sets.filter(set => set?.isPR === true).length,
    muscleStats: muscleStats.sort((a, b) => b.sets - a.sets),
    exercises
  };
}

export function formatWorkoutDuration(value) {
  const minutes = Math.max(0, Math.round(Number(value) || 0));
  if (minutes < 60) return `${minutes} min`;
  return `${Math.floor(minutes / 60)}h ${String(minutes % 60).padStart(2, '0')}min`;
}

export function formatExerciseDuration(value) {
  const seconds = Math.max(0, Math.floor(Number(value) || 0));
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  const remainingSeconds = seconds % 60;
  const parts = [];

  if (hours) parts.push(`${hours}h`);
  if (minutes || hours) parts.push(`${minutes}min`);
  parts.push(`${remainingSeconds}s`);
  return parts.join(' ');
}
