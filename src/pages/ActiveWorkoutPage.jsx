import React, { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { useData } from '../contexts/DataContext';
import { useConfirmDialog } from '../contexts/ConfirmDialogContext';
import { 
  Check, 
  Camera, 
  Upload, 
  Trash2, 
  Plus,
  AlertCircle,
  ArrowDownUp,
  GripVertical,
  Minimize2,
  MoreVertical,
  RefreshCw,
  StickyNote,
  Award
} from 'lucide-react';
import Button from '../components/ui/Button';
import Card from '../components/ui/Card';
import Modal from '../components/ui/Modal';
import ExerciseSelectorModal from '../components/ui/ExerciseSelectorModal';
import { uploadPublicWorkoutPhoto } from '../lib/supabase';
import { showToast } from '../contexts/ToastContext';
import { formatExerciseDuration } from '../utils/workoutFeedMetrics';
import { markWorkoutPRs } from '../utils/workoutMetrics';
import './ActiveWorkoutPage.css';

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

export default function ActiveWorkoutPage() {
  const { user } = useAuth();
  const { 
    activeWorkout, 
    checkins,
    isActiveWorkoutLoaded,
    updateActiveWorkout, 
    cancelActiveWorkout, 
    finishActiveWorkout,
    groups
  } = useData();
  const confirm = useConfirmDialog();
  const navigate = useNavigate();

  // Finish modal state
  const [isFinishModalOpen, setIsFinishModalOpen] = useState(false);
  const [isSubmittingFinish, setIsSubmittingFinish] = useState(false);
  const [finishFormError, setFinishFormError] = useState('');
  const [isAddExerciseModalOpen, setIsAddExerciseModalOpen] = useState(false);
  const [exerciseIndexToReplace, setExerciseIndexToReplace] = useState(null);
  const [isReorderingExercises, setIsReorderingExercises] = useState(false);
  const [draggingExerciseIndex, setDraggingExerciseIndex] = useState(null);
  const [photoPreview, setPhotoPreview] = useState(null);
  const [workoutTitle, setWorkoutTitle] = useState(activeWorkout?.routineName || 'Treino Concluído');
  const [generalNotes, setGeneralNotes] = useState('');
  const [visibility, setVisibility] = useState(user?.privacy?.publicRoutines === false ? 'private' : 'public');
  const [showWeights, setShowWeights] = useState(user?.privacy?.publicWeights ?? true);
  const [showMuscleStats, setShowMuscleStats] = useState(true);
  const [elapsedSeconds, setElapsedSeconds] = useState(0);
  const [expandedExerciseNotes, setExpandedExerciseNotes] = useState({});
  const [openExerciseMenu, setOpenExerciseMenu] = useState(null);

  const fileInputRef = useRef(null);
  const cameraInputRef = useRef(null);
  const draggedExerciseIndexRef = useRef(null);

  useEffect(() => {
    if (isActiveWorkoutLoaded && !activeWorkout) {
      navigate('/routines');
    }
  }, [activeWorkout, isActiveWorkoutLoaded, navigate]);

  useEffect(() => {
    if (!activeWorkout?.startTime) return undefined;
    const updateElapsedTime = () => {
      setElapsedSeconds(Math.max(0, Math.floor((Date.now() - activeWorkout.startTime) / 1000)));
    };
    updateElapsedTime();
    const intervalId = window.setInterval(updateElapsedTime, 1000);
    return () => window.clearInterval(intervalId);
  }, [activeWorkout?.startTime]);

  // Compute live volume and completed sets
  let liveVolume = 0;
  let liveCompletedSets = 0;

  activeWorkout?.exercises?.forEach(ex => {
    ex.sets?.forEach(s => {
      if (s.completed) {
        const w = s.weight !== undefined && s.weight !== '' ? Number(s.weight) : (Number(s.previousWeight) || 0);
        const r = s.reps !== undefined && s.reps !== '' ? Number(s.reps) : (Number(s.previousReps) || 0);
        const vol = (isNaN(w) ? 0 : w) * (isNaN(r) ? 0 : r);
        liveVolume += vol;
        liveCompletedSets++;
      }
    });
  });

  // Toggle set completion and update personal-record flags.
  const handleToggleSet = (exerciseIdx, setIdx) => {
    if (!activeWorkout) return;
    const updatedExercises = JSON.parse(JSON.stringify(activeWorkout.exercises));
    const targetSet = updatedExercises[exerciseIdx].sets[setIdx];
    const isTimedExercise = updatedExercises[exerciseIdx].trackingType === 'duration';
    
    if (!targetSet.completed) {
      if (isTimedExercise) {
        targetSet.completed = Number(targetSet.durationSeconds) > 0;
        if (!targetSet.completed) return;
      } else {
        if (targetSet.weight === undefined || targetSet.weight === '') {
          targetSet.weight = targetSet.previousWeight !== undefined ? targetSet.previousWeight : 0;
        }
        if (targetSet.reps === undefined || targetSet.reps === '') {
          targetSet.reps = targetSet.previousReps !== undefined ? targetSet.previousReps : 10;
        }
        targetSet.completed = true;
      }
    } else {
      targetSet.completed = false;
    }

    updateActiveWorkout({ exercises: markWorkoutPRs(updatedExercises, checkins) });
  };

  // Update set weight or reps
  const handleUpdateSet = (exerciseIdx, setIdx, field, val) => {
    if (!activeWorkout) return;
    const updatedExercises = JSON.parse(JSON.stringify(activeWorkout.exercises));
    updatedExercises[exerciseIdx].sets[setIdx][field] = val === '' ? '' : Number(val) || 0;
    updateActiveWorkout({ exercises: markWorkoutPRs(updatedExercises, checkins) });
  };

  // Update exercise notes (observation field)
  const handleUpdateNotes = (exerciseIdx, val) => {
    if (!activeWorkout) return;
    const updatedExercises = JSON.parse(JSON.stringify(activeWorkout.exercises));
    updatedExercises[exerciseIdx].notes = val;
    updateActiveWorkout({ exercises: updatedExercises });
  };

  // Add set
  const handleAddSet = (exerciseIdx) => {
    if (!activeWorkout) return;
    const updatedExercises = JSON.parse(JSON.stringify(activeWorkout.exercises));
    const sets = updatedExercises[exerciseIdx].sets;
    if (updatedExercises[exerciseIdx].trackingType === 'duration') {
      const lastSet = sets[sets.length - 1] || {};
      sets.push({
        setNumber: sets.length + 1,
        durationSeconds: 0,
        completed: false,
        previousDurationSeconds: lastSet.durationSeconds || lastSet.previousDurationSeconds || 0,
        previous: lastSet.durationSeconds > 0
          ? formatExerciseDuration(lastSet.durationSeconds)
          : lastSet.previous || '—'
      });
      updateActiveWorkout({ exercises: updatedExercises });
      return;
    }
    const lastSet = sets[sets.length - 1] || { previousWeight: 20, previousReps: 10 };
    const pw = lastSet.previousWeight || lastSet.weight || 20;
    const pr = lastSet.previousReps || lastSet.reps || 10;
    sets.push({
      setNumber: sets.length + 1,
      weight: 0,
      reps: 0,
      completed: false,
      previousWeight: pw,
      previousReps: pr,
      previous: `${pw}kg x ${pr}`
    });
    updateActiveWorkout({ exercises: updatedExercises });
  };

  const handleReorderPointerDown = (event, index) => {
    if (!isReorderingExercises || event.button !== 0) return;
    event.currentTarget.setPointerCapture(event.pointerId);
    draggedExerciseIndexRef.current = index;
    setDraggingExerciseIndex(index);
  };

  const handleReorderPointerMove = (event) => {
    const sourceIndex = draggedExerciseIndexRef.current;
    if (sourceIndex === null || !activeWorkout) return;

    const target = document
      .elementFromPoint(event.clientX, event.clientY)
      ?.closest('[data-exercise-index]');
    const targetIndex = Number(target?.dataset.exerciseIndex);
    if (!target || !Number.isInteger(targetIndex) || targetIndex === sourceIndex) return;

    const updatedExercises = [...activeWorkout.exercises];
    const [movedExercise] = updatedExercises.splice(sourceIndex, 1);
    updatedExercises.splice(targetIndex, 0, movedExercise);
    draggedExerciseIndexRef.current = targetIndex;
    setDraggingExerciseIndex(targetIndex);
    updateActiveWorkout({ exercises: updatedExercises });
  };

  const handleReorderPointerEnd = () => {
    draggedExerciseIndexRef.current = null;
    setDraggingExerciseIndex(null);
  };

  // Remove exercise from live workout
  const handleDeleteExercise = async (idx) => {
    if (!activeWorkout) return;
    if (activeWorkout.exercises.length <= 1) {
      showToast('A sessão de treino deve ter no mínimo 1 exercício.', 'error');
      return;
    }
    if (await confirm({
      title: 'Remover exercício',
      message: `Remover "${activeWorkout.exercises[idx]?.name}" do treino atual?`,
      confirmLabel: 'Remover',
      variant: 'danger'
    })) {
      const updatedExercises = activeWorkout.exercises.filter((_, i) => i !== idx);
      updateActiveWorkout({ exercises: updatedExercises });
    }
  };

  // Handle Photo selection
  const handlePhotoSelect = (e) => {
    const file = e.target.files[0];
    if (file) {
      setFinishFormError('');
      const reader = new FileReader();
      reader.onload = (event) => {
        setPhotoPreview(event.target.result);
      };
      reader.readAsDataURL(file);
    }
  };

  // Discard / Cancel workout
  const handleDiscard = async () => {
    if (await confirm({
      title: 'Cancelar treino',
      message: 'Deseja cancelar esta sessão de treino? Os dados não serão salvos.',
      confirmLabel: 'Cancelar treino',
      variant: 'danger'
    })) {
      cancelActiveWorkout();
      navigate('/routines');
    }
  };

  // Confirm final finish
  const handleConfirmFinish = async (e) => {
    e.preventDefault();
    if (isSubmittingFinish) return;

    const isShared = visibility !== 'private';

    if (isShared && !photoPreview) {
      setFinishFormError('Adicione uma foto para publicar o treino ou escolha “Somente eu” para salvar apenas no seu histórico.');
      return;
    }

    setFinishFormError('');
    setIsSubmittingFinish(true);
    try {
      const photoUrl = visibility === 'public'
        ? await uploadPublicWorkoutPhoto(photoPreview, activeWorkout?.id || 'workout')
        : photoPreview;

      await finishActiveWorkout({
        photoUrl,
        notes: generalNotes,
        title: workoutTitle,
        visibility,
        showWeights,
        showMuscleStats,
        user
      });

      setIsFinishModalOpen(false);
      navigate(visibility === 'private' ? '/dashboard' : '/groups');
    } catch (error) {
      console.error('Não foi possível finalizar/publicar o treino:', error);
      const message = error?.message || '';
      setFinishFormError(/bucket not found/i.test(message)
        ? 'O projeto Supabase conectado ainda não tem o armazenamento “public-workout-photos”. No Dashboard do mesmo projeto, abra SQL Editor, execute o arquivo supabase_schema.sql completo e tente novamente.'
        : message || 'Não foi possível finalizar o treino. Verifique a conexão e tente novamente.');
    } finally {
      setIsSubmittingFinish(false);
    }
  };

  if (!isActiveWorkoutLoaded) {
    return <div className="active-workout-loading">Restaurando treino...</div>;
  }
  if (!activeWorkout) return null;

  return (
    <div className="active-workout-page animate-fade-in">
      <header className="active-workout-header">
        <div className="active-workout-header-row">
          <button
            className="header-back-btn"
            onClick={() => navigate('/routines')}
            title="Minimizar treino"
          >
            <Minimize2 size={18} />
            <span>Minimizar</span>
          </button>
          <h1 className="active-workout-heading">Treino</h1>
          <button
            className="btn-concluir-action"
            onClick={() => setIsFinishModalOpen(true)}
            id="btn-concluir-workout"
          >
            Concluir
          </button>
        </div>
      </header>

      <div className="active-metrics-summary-bar">
        <div className="metric-cell">
          <span className="metric-label">Duração</span>
          <span className="metric-value">{formatWorkoutDuration(elapsedSeconds)}</span>
        </div>

        <div className="metric-cell">
          <span className="metric-label">Volume</span>
          <span className="metric-value">{liveVolume.toLocaleString('pt-BR')} kg</span>
        </div>

        <div className="metric-cell">
          <span className="metric-label">Séries</span>
          <span className="metric-value">{liveCompletedSets}</span>
        </div>
      </div>

      <div className="exercise-reorder-control">
        <button
          type="button"
          className={`exercise-reorder-toggle ${isReorderingExercises ? 'active' : ''}`}
          onClick={() => {
            setIsReorderingExercises(current => !current);
            handleReorderPointerEnd();
          }}
          aria-pressed={isReorderingExercises}
        >
          <ArrowDownUp size={17} />
          {isReorderingExercises ? 'Concluir reordenação' : 'Reordenar exercícios'}
        </button>
        {isReorderingExercises && (
          <span className="exercise-reorder-hint">Arraste pelo ícone para mudar a ordem.</span>
        )}
      </div>

      <div className="active-exercises-list">
        {activeWorkout.exercises?.map((exercise, eIdx) => {
          const noteKey = exercise.id || `${exercise.name}-${eIdx}`;
          const isNoteExpanded = expandedExerciseNotes[noteKey] ?? Boolean(exercise.notes);
          const isTimedExercise = exercise.trackingType === 'duration';

          return (
          <div
            key={exercise.id || eIdx}
            className={`active-exercise-sort-item ${draggingExerciseIndex === eIdx ? 'dragging' : ''}`}
            data-exercise-index={eIdx}
          >
          <Card className="active-exercise-card" padding="none">
            <div className="exercise-card-header">
              <div className="exercise-title-group">
                {isReorderingExercises && (
                  <button
                    type="button"
                    className="exercise-drag-handle"
                    aria-label={`Arrastar ${exercise.name} para reordenar`}
                    onPointerDown={event => handleReorderPointerDown(event, eIdx)}
                    onPointerMove={handleReorderPointerMove}
                    onPointerUp={handleReorderPointerEnd}
                    onPointerCancel={handleReorderPointerEnd}
                  >
                    <GripVertical size={20} />
                  </button>
                )}
                <h3 className="exercise-name-text">{exercise.name}</h3>
              </div>
              <div className="exercise-options-menu-wrap">
                <button
                  type="button"
                  className="exercise-options-btn"
                  aria-label={`Opções de ${exercise.name}`}
                  aria-expanded={openExerciseMenu === eIdx}
                  onClick={() => setOpenExerciseMenu(openExerciseMenu === eIdx ? null : eIdx)}
                >
                  <MoreVertical size={20} />
                </button>
                {openExerciseMenu === eIdx && (
                  <div className="exercise-options-menu">
                    <button
                      type="button"
                      onClick={() => {
                        setExerciseIndexToReplace(eIdx);
                        setIsAddExerciseModalOpen(true);
                        setOpenExerciseMenu(null);
                      }}
                    >
                      <RefreshCw size={15} /> Substituir exercício
                    </button>
                    <button type="button" className="exercise-options-danger" onClick={() => { handleDeleteExercise(eIdx); setOpenExerciseMenu(null); }}>
                      <Trash2 size={15} /> Remover exercício
                    </button>
                  </div>
                )}
              </div>
            </div>

            <div className="exercise-notes-area">
              <button
                type="button"
                className="exercise-note-toggle"
                aria-expanded={isNoteExpanded}
                onClick={() => setExpandedExerciseNotes(previous => ({
                  ...previous,
                  [noteKey]: !isNoteExpanded
                }))}
              >
                <StickyNote size={18} />
                Nota
              </button>
              {isNoteExpanded ? (
                <textarea
                  className="exercise-notes-input"
                  placeholder="Anote o que quiser sobre este exercício..."
                  value={exercise.notes || ''}
                  onChange={e => handleUpdateNotes(eIdx, e.target.value)}
                  rows={2}
                />
              ) : exercise.notes ? (
                <p className="exercise-note-preview">{exercise.notes}</p>
              ) : null}
            </div>

            <div className="active-sets-table">
              <div className="sets-table-header-row">
                <span className="col-set">SÉRIE</span>
                <span className="col-prev">ANTERIOR</span>
                {isTimedExercise ? (
                  <span className="col-duration">TEMPO</span>
                ) : (
                  <>
                    <span className="col-kg">KG</span>
                    <span className="col-reps">REPS</span>
                  </>
                )}
                <span className="col-check">✓</span>
              </div>

              {exercise.sets?.map((setObj, sIdx) => {
                return (
                  <div key={sIdx}>
                    <div 
                      className={`set-table-row ${setObj.completed ? 'set-completed' : ''} ${setObj.isPR ? 'set-personal-record' : ''}`}
                    >
                      <span className="col-set set-number-badge">
                        {setObj.setNumber || sIdx + 1}
                      </span>

                      <span className="col-prev prev-badge">
                        {setObj.previous || '-'}
                      </span>

                      {isTimedExercise ? (
                        <div className="col-duration">
                          <input
                            type="number"
                            className="table-input table-input-placeholder"
                            min="1"
                            step="1"
                            placeholder="Segundos"
                            value={setObj.durationSeconds ?? ''}
                            onChange={e => handleUpdateSet(eIdx, sIdx, 'durationSeconds', e.target.value)}
                            aria-label={`Tempo da série ${sIdx + 1} de ${exercise.name}, em segundos`}
                          />
                          <span>s</span>
                        </div>
                      ) : (
                        <>
                          <div className="col-kg">
                            <input 
                              type="number"
                              className="table-input table-input-placeholder"
                              min="0"
                              step="0.5"
                              placeholder={String(setObj.previousWeight || 20)}
                              value={setObj.weight ?? ''}
                              onChange={e => handleUpdateSet(eIdx, sIdx, 'weight', e.target.value)}
                            />
                          </div>

                          <div className="col-reps">
                            <input 
                              type="number"
                              className="table-input table-input-placeholder"
                              min="0"
                              placeholder={String(setObj.previousReps || 10)}
                              value={setObj.reps ?? ''}
                              onChange={e => handleUpdateSet(eIdx, sIdx, 'reps', e.target.value)}
                            />
                          </div>
                        </>
                      )}

                      <div className="col-check">
                        <button
                          type="button"
                          className={`check-set-btn ${setObj.completed ? 'completed' : ''}`}
                          onClick={() => handleToggleSet(eIdx, sIdx)}
                          disabled={isTimedExercise && !setObj.completed && !(Number(setObj.durationSeconds) > 0)}
                          title={setObj.completed ? 'Concluída' : 'Marcar concluída'}
                        >
                          <Check size={16} />
                        </button>
                      </div>
                    </div>

                    {setObj.isPR && setObj.completed && (
                      <div
                        className="active-set-pr-badge animate-scale-in"
                        aria-label={`Recorde pessoal: ${setObj.weight} kg e ${setObj.reps} repetições`}
                      >
                        <Award size={14} />
                        <strong>PR</strong>
                        <span>{setObj.weight} kg · {setObj.reps} reps</span>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>

            {/* Add Set Button */}
            <button 
              type="button" 
              className="btn-add-exercise-set"
              onClick={() => handleAddSet(eIdx)}
            >
              + Adicionar série
            </button>
          </Card>
          </div>
          );
        })}

        {/* Button to add new exercise to live workout session */}
        <button
          type="button"
          className="btn-add-new-exercise-live"
          onClick={() => {
            setExerciseIndexToReplace(null);
            setIsAddExerciseModalOpen(true);
          }}
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            gap: 8,
            width: '100%',
            padding: '14px',
            background: 'var(--bg-card)',
            border: '1px dashed var(--accent)',
            borderRadius: 'var(--radius-lg)',
            color: 'var(--accent)',
            fontWeight: 700,
            fontSize: '0.9375rem',
            cursor: 'pointer',
            marginTop: 12
          }}
        >
          <Plus size={18} />
          <span>Adicionar Exercício do Catálogo</span>
        </button>
      </div>

      <button type="button" className="workout-discard-btn" onClick={handleDiscard}>
        <Trash2 size={17} />
        Descartar treino
      </button>

      {/* Categorized Exercise Selector Modal for Live Workout */}
      {isAddExerciseModalOpen && (
        <ExerciseSelectorModal
          isOpen={isAddExerciseModalOpen}
          onClose={() => {
            setIsAddExerciseModalOpen(false);
            setExerciseIndexToReplace(null);
          }}
          title={exerciseIndexToReplace === null ? 'Selecionar Exercício' : 'Substituir Exercício'}
          onSelectExercise={(selectedEx) => {
            const updatedExercises = JSON.parse(JSON.stringify(activeWorkout.exercises || []));
            const replacement = updatedExercises[exerciseIndexToReplace];
            const trackingType = selectedEx.trackingType || 'strength';
            if (replacement) {
              const currentTrackingType = replacement.trackingType || 'strength';
              updatedExercises[exerciseIndexToReplace] = {
                ...replacement,
                name: selectedEx.name,
                muscleGroup: selectedEx.muscleGroup,
                trackingType,
                ...(trackingType !== currentTrackingType ? {
                  sets: (replacement.sets || selectedEx.sets || []).map((set, index) => (
                    trackingType === 'duration'
                      ? { setNumber: index + 1, durationSeconds: 0, completed: false }
                      : { setNumber: index + 1, weight: 0, reps: 0, completed: false }
                  ))
                } : {})
              };
            } else {
              const sets = selectedEx.sets || [{ setNumber: 1, weight: 0, reps: 0 }];
              updatedExercises.push({
                name: selectedEx.name,
                muscleGroup: selectedEx.muscleGroup,
                trackingType,
                notes: '',
                sets: sets.map((set, index) => trackingType === 'duration'
                  ? { setNumber: index + 1, durationSeconds: 0, completed: false, previous: '—' }
                  : {
                    setNumber: index + 1,
                    weight: 0,
                    reps: set.reps ?? 0,
                    completed: false,
                    previousWeight: 0,
                    previousReps: 0,
                    previous: '—'
                  })
              });
            }
            updateActiveWorkout({ exercises: updatedExercises });
            setExerciseIndexToReplace(null);
          }}
        />
      )}

      {/* Finish Workout Modal with Mandatory Photo Proof */}
      {isFinishModalOpen && (
        <Modal
          isOpen={isFinishModalOpen}
          onClose={() => {
            setIsFinishModalOpen(false);
            setFinishFormError('');
          }}
          title="Finalizar Treino & Comprovar"
          size="md"
        >
          <form className="finish-workout-form" onSubmit={handleConfirmFinish} aria-busy={isSubmittingFinish}>
            <div className="finish-stats-preview">
              <div className="finish-stat-chip">
                <span>Volume:</span>
                <strong>{liveVolume.toLocaleString('pt-BR')} kg</strong>
              </div>
              <div className="finish-stat-chip">
                <span>Séries:</span>
                <strong>{liveCompletedSets} concluídas</strong>
              </div>
            </div>

            {/* Photo Proof (MANDATORY REQUIREMENT) */}
            <div className="finish-photo-container">
              <label className="finish-field-label">
                Foto Comprobatória do Treino {visibility !== 'private' ? <span className="text-accent">* Obrigatória para publicar</span> : <span style={{ color: 'var(--text-tertiary)', fontWeight: 400 }}>(Opcional para registro pessoal)</span>}
              </label>

              {photoPreview ? (
                <div className="finish-photo-preview-box">
                  <img src={photoPreview} alt="Foto comprovante" className="finish-preview-img" />
                  <div className="finish-photo-overlay-stamp">
                    <span>OVERGAIN VERIFIED</span>
                  </div>
                  <button 
                    type="button" 
                    className="retake-btn"
                    disabled={isSubmittingFinish}
                    onClick={() => cameraInputRef.current?.click()}
                  >
                    Trocar Foto
                  </button>
                </div>
              ) : (
                <div className="finish-photo-upload-grid">
                  <button 
                    type="button" 
                    className="photo-btn-primary"
                    disabled={isSubmittingFinish}
                    onClick={() => cameraInputRef.current?.click()}
                  >
                    <Camera size={28} />
                    <strong>Tirar Foto na Câmera</strong>
                    <span>Espelho / Equipamento</span>
                  </button>

                  <button 
                    type="button" 
                    className="photo-btn-secondary"
                    disabled={isSubmittingFinish}
                    onClick={() => fileInputRef.current?.click()}
                  >
                    <Upload size={20} />
                    <span>Escolher da Galeria</span>
                  </button>
                </div>
              )}

              <input 
                ref={cameraInputRef}
                type="file" 
                accept="image/*" 
                capture="environment" 
                onChange={handlePhotoSelect} 
                disabled={isSubmittingFinish}
                style={{ display: 'none' }} 
              />
              <input 
                ref={fileInputRef}
                type="file" 
                accept="image/*" 
                onChange={handlePhotoSelect} 
                disabled={isSubmittingFinish}
                style={{ display: 'none' }} 
              />
            </div>

            {/* Post Title */}
            <div className="finish-field">
              <label className="finish-field-label">Título da Postagem</label>
              <input 
                type="text"
                className="finish-text-input"
                placeholder="Ex: Push com Gabs, Puxar e empurrar..."
                value={workoutTitle}
                onChange={e => setWorkoutTitle(e.target.value)}
                disabled={isSubmittingFinish}
                required
              />
            </div>

            {/* General Notes */}
            <div className="finish-field">
              <label className="finish-field-label">Observações Gerais do Treino</label>
              <textarea 
                className="finish-textarea"
                rows={2}
                placeholder="Como foi o treino? Alguma dor, progresso de carga ou sensação?"
                value={generalNotes}
                onChange={e => setGeneralNotes(e.target.value)}
                disabled={isSubmittingFinish}
              />
            </div>

            <div className="finish-privacy-section" style={{ display: 'flex', flexDirection: 'column', gap: '12px', marginTop: '16px' }}>
              <span className="finish-field-label">Quem pode ver este treino?</span>
              <label className="finish-share-toggle">
                <input type="radio" name="workout-visibility" value="private" checked={visibility === 'private'} disabled={isSubmittingFinish} onChange={() => { setVisibility('private'); setFinishFormError(''); }} />
                <div className="share-toggle-text">
                  <strong>Somente eu</strong>
                  <span>Fica apenas no seu histórico, estatísticas e calendário.</span>
                </div>
              </label>
              {groups.length > 0 && (
                <label className="finish-share-toggle">
                  <input type="radio" name="workout-visibility" value="group" checked={visibility === 'group'} disabled={isSubmittingFinish} onChange={() => { setVisibility('group'); setFinishFormError(''); }} />
                  <div className="share-toggle-text">
                    <strong>Meus grupos</strong>
                    <span>Publica nos grupos dos quais você participa e mantém no seu histórico.</span>
                  </div>
                </label>
              )}
              <label className="finish-share-toggle">
                <input type="radio" name="workout-visibility" value="public" checked={visibility === 'public'} disabled={isSubmittingFinish} onChange={() => { setVisibility('public'); setFinishFormError(''); }} />
                <div className="share-toggle-text">
                  <strong>Público</strong>
                  <span>Publica no feed público e também nos seus grupos.</span>
                </div>
              </label>
              {visibility !== 'private' && (
                <>
                  <label className="finish-share-toggle">
                    <input type="checkbox" checked={showWeights} disabled={isSubmittingFinish} onChange={e => setShowWeights(e.target.checked)} />
                    <div className="share-toggle-text">
                      <strong>Mostrar cargas</strong>
                      <span>Desative para ocultar o peso das séries para outras pessoas.</span>
                    </div>
                  </label>
                  <label className="finish-share-toggle">
                    <input type="checkbox" checked={showMuscleStats} disabled={isSubmittingFinish} onChange={e => setShowMuscleStats(e.target.checked)} />
                    <div className="share-toggle-text">
                      <strong>Mostrar divisão muscular</strong>
                      <span>Inclui o gráfico dos grupos musculares no post.</span>
                    </div>
                  </label>
                </>
              )}
            </div>

            {/* Action Buttons */}
            {finishFormError && (
              <div className="finish-form-notice" role="alert">
                <AlertCircle size={19} aria-hidden="true" />
                <span>{finishFormError}</span>
              </div>
            )}
            <div className="finish-modal-actions">
              <Button
                type="button"
                variant="ghost"
                disabled={isSubmittingFinish}
                onClick={() => {
                  setIsFinishModalOpen(false);
                  setFinishFormError('');
                }}
              >
                Continuar treinando
              </Button>
              <Button
                type="submit"
                variant="success"
                size="lg"
                icon={Check}
                loading={isSubmittingFinish}
                disabled={isSubmittingFinish}
              >
                {isSubmittingFinish
                  ? 'Finalizando...'
                  : visibility === 'private'
                    ? 'Finalizar treino'
                    : 'Finalizar e publicar treino'}
              </Button>
            </div>
          </form>
        </Modal>
      )}
    </div>
  );
}
