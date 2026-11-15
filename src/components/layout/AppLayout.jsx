import React, { useEffect, useState } from 'react';
import { Outlet, useLocation, useNavigate } from 'react-router-dom';
import { ChevronUp, Trash2 } from 'lucide-react';
import { useData } from '../../contexts/DataContext';
import { useConfirmDialog } from '../../contexts/ConfirmDialogContext';
import Sidebar from './Sidebar';
import BottomNav from './BottomNav';
import './AppLayout.css';

const formatWorkoutDuration = (seconds) => {
  if (seconds < 60) return `${seconds}s`;
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  const remainingSeconds = seconds % 60;
  if (hours > 0) {
    return `${hours}:${String(minutes).padStart(2, '0')}:${String(remainingSeconds).padStart(2, '0')}`;
  }
  return `${String(minutes).padStart(2, '0')}:${String(remainingSeconds).padStart(2, '0')}`;
};

export default function AppLayout() {
  const { activeWorkout, isActiveWorkoutLoaded, cancelActiveWorkout } = useData();
  const confirm = useConfirmDialog();
  const location = useLocation();
  const navigate = useNavigate();
  const [elapsedSeconds, setElapsedSeconds] = useState(0);
  const isWorkoutPage = location.pathname.startsWith('/workout/active');
  const showWorkoutBar = isActiveWorkoutLoaded && activeWorkout && !isWorkoutPage;
  const currentExercise = activeWorkout?.exercises?.find(exercise =>
    exercise.sets?.some(set => !set.completed)
  );

  useEffect(() => {
    if (!activeWorkout?.startTime) return undefined;
    const updateElapsedTime = () => {
      setElapsedSeconds(Math.max(0, Math.floor((Date.now() - activeWorkout.startTime) / 1000)));
    };
    updateElapsedTime();
    const intervalId = window.setInterval(updateElapsedTime, 1000);
    return () => window.clearInterval(intervalId);
  }, [activeWorkout?.startTime]);

  const handleCancelWorkout = async (event) => {
    event.stopPropagation();
    if (await confirm({
      title: 'Descartar treino',
      message: 'Deseja descartar o treino em andamento? Os dados não serão salvos.',
      confirmLabel: 'Descartar treino',
      variant: 'danger'
    })) {
      cancelActiveWorkout();
    }
  };

  return (
    <div className={`app-layout ${showWorkoutBar ? 'has-minimized-workout' : ''}`}>
      <Sidebar />
      <main className="app-main">
        <Outlet />
      </main>
      {showWorkoutBar && (
        <div className="minimized-workout-bar">
          <button
            type="button"
            className="minimized-workout-open"
            onClick={() => navigate('/workout/active')}
            aria-label={`Voltar ao treino ${activeWorkout.routineName || 'em andamento'}`}
          >
            <span className="minimized-workout-icon"><ChevronUp size={28} /></span>
            <span className="minimized-workout-copy">
              <strong>Treino {formatWorkoutDuration(elapsedSeconds)}</strong>
              <span>{currentExercise?.name || 'Todos os exercícios concluídos'}</span>
            </span>
          </button>
          <button
            type="button"
            className="minimized-workout-cancel"
            onClick={handleCancelWorkout}
            aria-label="Descartar treino em andamento"
            title="Descartar treino"
          >
            <Trash2 size={18} />
          </button>
        </div>
      )}
      <BottomNav />
    </div>
  );
}
