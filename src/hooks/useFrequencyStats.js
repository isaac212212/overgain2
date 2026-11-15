import React, { useMemo } from 'react';
import { useData } from '../contexts/DataContext';
import { isSameWeek, isSameMonth, isSameYear } from '../utils/dateHelpers';
import { calculateTrainingStreaks } from '../utils/workoutMetrics';

export function useFrequencyStats() {
  const { checkins, weeklySchedule } = useData();

  const stats = useMemo(() => {
    const now = new Date();
    
    const workoutCheckins = checkins.filter(c => c.type !== 'cardio' && !c.isCardio);

    const monthWorkouts = workoutCheckins.filter(c => isSameMonth(c.date, now));

    const yearWorkouts = workoutCheckins.filter(c => isSameYear(c.date, now));

    // Unique days trained this week
    const uniqueWeekDays = new Set(
      workoutCheckins.filter(c => isSameWeek(c.date, now)).map(c => new Date(c.date).toDateString())
    ).size;

    const { dailyStreak, weeklyStreak } = calculateTrainingStreaks(workoutCheckins, weeklySchedule, now);

    // Weekly data for chart (last 12 weeks)
    const weeklyData = [];
    for (let i = 11; i >= 0; i--) {
      const weekStart = new Date(now);
      weekStart.setDate(weekStart.getDate() - (weekStart.getDay() || 7) + 1 - (i * 7));
      weekStart.setHours(0, 0, 0, 0);
      const weekEnd = new Date(weekStart);
      weekEnd.setDate(weekEnd.getDate() + 6);
      weekEnd.setHours(23, 59, 59, 999);
      
      const count = workoutCheckins.filter(c => {
        const d = new Date(c.date);
        return d >= weekStart && d <= weekEnd;
      }).length;
      
      weeklyData.push({ weekStart, weekEnd, count });
    }

    return {
      week: uniqueWeekDays,
      month: monthWorkouts.length,
      year: yearWorkouts.length,
      total: workoutCheckins.length,
      streak: dailyStreak,
      weeklyStreak,
      weeklyData
    };
  }, [checkins, weeklySchedule]);

  return stats;
}

export default useFrequencyStats;
