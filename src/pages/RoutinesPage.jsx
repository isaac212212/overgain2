import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useData } from '../contexts/DataContext';
import { useAuth } from '../contexts/AuthContext';
import { useConfirmDialog } from '../contexts/ConfirmDialogContext';
import { 
  Plus, 
  ChevronRight, 
  ChevronDown, 
  Dumbbell, 
  MoreHorizontal, 
  Trash2, 
  Copy, 
  Edit3, 
  Play, 
  Check,
  StickyNote,
  X,
  Calendar,
  RotateCw,
  ClipboardList,
  ArrowUp,
  ArrowDown,
  RefreshCw
} from 'lucide-react';
import Button from '../components/ui/Button';
import Modal from '../components/ui/Modal';
import Input from '../components/ui/Input';
import ExerciseSelectorModal from '../components/ui/ExerciseSelectorModal';
import WeeklyScheduleModal from '../components/ui/WeeklyScheduleModal';
import { generateId } from '../utils/storage';
import './RoutinesPage.css';

const DEFAULT_MUSCLE_GROUPS = [
  'Peitoral', 
  'Costas', 
  'Ombros', 
  'Trapézio',
  'Quadríceps', 
  'Posterior de Coxa e Glúteos', 
  'Panturrilha', 
  'Bíceps', 
  'Tríceps', 
  'Antebraço', 
  'Abdômen e Core'
];

const DAYS_OF_WEEK = [
  { id: 1, name: 'Segunda-feira', short: 'Seg' },
  { id: 2, name: 'Terça-feira', short: 'Ter' },
  { id: 3, name: 'Quarta-feira', short: 'Qua' },
  { id: 4, name: 'Quinta-feira', short: 'Qui' },
  { id: 5, name: 'Sexta-feira', short: 'Sex' },
  { id: 6, name: 'Sábado', short: 'Sáb' },
  { id: 0, name: 'Domingo', short: 'Dom' },
];

export default function RoutinesPage() {
  const { 
    routines, 
    checkins,
    addRoutine, 
    updateRoutine, 
    deleteRoutine, 
    duplicateRoutine,
    startActiveWorkout,
    weeklySchedule,
    updateWeeklySchedule
  } = useData();
  const { user, updateWeeklyGoal } = useAuth();
  const confirm = useConfirmDialog();
  const navigate = useNavigate();

  // State
  const [isEditorOpen, setIsEditorOpen] = useState(false);
  const [isScheduleModalOpen, setIsScheduleModalOpen] = useState(false);
  const [isExerciseSelectorOpen, setIsExerciseSelectorOpen] = useState(false);
  const [exerciseModalCategory, setExerciseModalCategory] = useState('Todos');
  const [exerciseIndexToReplace, setExerciseIndexToReplace] = useState(null);
  const [editingRoutine, setEditingRoutine] = useState(null);
  const [activeMenuId, setActiveMenuId] = useState(null);
  const [folderOpen, setFolderOpen] = useState(true);

  // Editor form state
  const [formName, setFormName] = useState('');
  const [formDescription, setFormDescription] = useState('');
  const [formScheduledDay, setFormScheduledDay] = useState('');
  const [formExercises, setFormExercises] = useState([]);

  // Start Live Workout with routine
  const handleStartWorkout = (routine) => {
    startActiveWorkout(routine);
    navigate('/workout/active');
  };

  // Start Blank Live Workout
  const handleStartEmptyWorkout = () => {
    startActiveWorkout({
      id: 'blank',
      name: 'Treino Avulso',
      exercises: []
    });
    navigate('/workout/active');
  };

  const handleDeleteRoutine = async (routine) => {
    const confirmed = await confirm({
      title: 'Excluir rotina',
      message: `Excluir a rotina "${routine.name}"?`,
      confirmLabel: 'Excluir rotina',
      variant: 'danger'
    });
    if (confirmed) deleteRoutine(routine.id);
    setActiveMenuId(null);
  };

  // Helper: find last recorded loads for an exercise by name across all checkins and routines
  const findPreviousLoads = (exerciseName) => {
    if (!exerciseName) return null;
    const nameNorm = exerciseName.trim().toLowerCase();
    
    // First check historical checkins (most recent first)
    if (checkins && checkins.length > 0) {
      for (const checkin of checkins) {
        const match = checkin.exercises?.find(ex => ex.name?.trim().toLowerCase() === nameNorm);
        if (match && match.sets?.length > 0 && match.sets.some(s => Number(s.weight) > 0)) {
          return match.sets;
        }
      }
    }

    // Next check other saved routines
    if (routines && routines.length > 0) {
      for (const r of routines) {
        const match = r.exercises?.find(ex => ex.name?.trim().toLowerCase() === nameNorm);
        if (match && match.sets?.length > 0 && match.sets.some(s => Number(s.weight) > 0)) {
          return match.sets;
        }
      }
    }

    return null;
  };

  // Open editor for new routine (starts TOTALLY BLANK as requested)
  const handleOpenNewRoutine = () => {
    setEditingRoutine(null);
    setFormName('');
    setFormDescription('');
    setFormScheduledDay('');
    setFormExercises([]); // Totally blank!
    setIsEditorOpen(true);
  };

  // Open editor for existing routine
  const handleOpenEditRoutine = (routine) => {
    setEditingRoutine(routine);
    setFormName(routine.name);
    setFormDescription(routine.description || '');
    setFormScheduledDay(routine.scheduledDay !== undefined && routine.scheduledDay !== null ? String(routine.scheduledDay) : '');
    setFormExercises(JSON.parse(JSON.stringify(routine.exercises || [])));
    setIsEditorOpen(true);
    setActiveMenuId(null);
  };

  // Add exercise to form
  const handleAddExercise = () => {
    setFormExercises(prev => [
      ...prev,
      {
        id: generateId(),
        muscleGroup: 'Peito',
        name: '',
        notes: '',
        trackingType: 'strength',
        sets: [
          { setNumber: 1, weight: 0, reps: 0 }
        ]
      }
    ]);
  };

  // Remove exercise from form
  const handleRemoveExercise = (idx) => {
    setFormExercises(prev => prev.filter((_, i) => i !== idx));
  };

  // Move exercise up in form
  const handleMoveExerciseUp = (idx) => {
    if (idx <= 0) return;
    setFormExercises(prev => {
      const copy = [...prev];
      const temp = copy[idx - 1];
      copy[idx - 1] = copy[idx];
      copy[idx] = temp;
      return copy;
    });
  };

  // Move exercise down in form
  const handleMoveExerciseDown = (idx) => {
    setFormExercises(prev => {
      if (idx >= prev.length - 1) return prev;
      const copy = [...prev];
      const temp = copy[idx + 1];
      copy[idx + 1] = copy[idx];
      copy[idx] = temp;
      return copy;
    });
  };

  // Update exercise field
  const handleUpdateExercise = (idx, field, value) => {
    setFormExercises(prev => {
      const copy = [...prev];
      copy[idx] = { ...copy[idx], [field]: value };

      // If the name changed, check for previous loads from other routines/checkins
      if (field === 'name' && value.trim().length > 2) {
        const prevSets = findPreviousLoads(value);
        if (prevSets) {
          // Pre-fill weights from previous executions, keep reps at 0
          copy[idx].sets = copy[idx].sets.map((s, sIdx) => {
            const prevSet = prevSets[sIdx];
            return {
              ...s,
              weight: prevSet?.weight ?? s.weight
            };
          });
        }
      }

      return copy;
    });
  };

  // Add set to exercise
  const handleAddSet = (exerciseIdx) => {
    setFormExercises(prev => {
      const copy = [...prev];
      const ex = copy[exerciseIdx];
      ex.sets.push({
        setNumber: ex.sets.length + 1,
        weight: 0,
        reps: 0
      });
      return copy;
    });
  };

  // Remove set from exercise
  const handleRemoveSet = (exerciseIdx, setIdx) => {
    setFormExercises(prev => {
      const copy = [...prev];
      const ex = copy[exerciseIdx];
      ex.sets = ex.sets.filter((_, i) => i !== setIdx).map((s, idx) => ({
        ...s,
        setNumber: idx + 1
      }));
      return copy;
    });
  };

  // Update set values
  const handleUpdateSet = (exerciseIdx, setIdx, field, value) => {
    setFormExercises(prev => {
      const copy = [...prev];
      const ex = copy[exerciseIdx];
      ex.sets[setIdx] = { ...ex.sets[setIdx], [field]: Number(value) || 0 };
      return copy;
    });
  };

  // Save routine
  const handleSaveRoutine = (e) => {
    e.preventDefault();
    if (!formName.trim()) return;

    const routineData = {
      name: formName.trim(),
      description: formDescription.trim(),
      scheduledDay: formScheduledDay !== '' ? Number(formScheduledDay) : null,
      folder: 'Minhas rotinas',
      exercises: formExercises.filter(ex => ex.name.trim().length > 0)
    };

    if (editingRoutine) {
      updateRoutine(editingRoutine.id, routineData);
    } else {
      addRoutine(routineData);
    }

    if (formScheduledDay !== '') {
      const dayId = Number(formScheduledDay);
      updateWeeklySchedule({
        ...weeklySchedule,
        [dayId]: {
          type: 'workout',
          hasWorkout: true,
          workoutLabel: formName.trim(),
          label: formName.trim()
        }
      });
    }

    setIsEditorOpen(false);
  };

  return (
    <div className="routines-page-v2 animate-fade-in">
      {/* Top Bar matching Image 1: Treino ⌵, PRO badge, Refresh */}
      <header className="treino-topbar">
        <div className="treino-title-dropdown">
          <h1>Treino</h1>
          <ChevronDown size={20} className="treino-caret" />
        </div>

        <div className="treino-topbar-right">
          <button className="icon-refresh-btn" onClick={() => window.location.reload()} title="Atualizar">
            <RotateCw size={18} />
          </button>
        </div>
      </header>

      {/* Button: "+ Iniciar treino vazio" matching Image 1 */}
      <button 
        className="btn-start-empty-workout"
        onClick={handleStartEmptyWorkout}
        id="btn-iniciar-treino-vazio"
      >
        <Plus size={20} />
        <span>Iniciar treino vazio</span>
      </button>

      {/* Section Header: Rotinas */}
      <div className="rotinas-section-title-bar">
        <h2>Rotinas</h2>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <button 
            type="button"
            className="routine-freq-pill-btn"
            onClick={() => setIsScheduleModalOpen(true)}
            title="Alterar frequência de treinos da semana"
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: 6,
              background: 'var(--bg-elevated)',
              border: '1px solid var(--border-color)',
              borderRadius: 'var(--radius-full)',
              padding: '6px 12px',
              fontSize: '0.8125rem',
              fontWeight: 600,
              color: 'var(--accent)',
              cursor: 'pointer'
            }}
          >
            <Calendar size={14} />
            <span>Frequência: {user?.weeklyGoal || 4}x/sem</span>
          </button>
          <button 
            className="folder-plus-btn" 
            onClick={() => setIsScheduleModalOpen(true)}
            title="Escala Semanal & Dias de Treino"
          >
            <Calendar size={18} />
          </button>
        </div>
      </div>

      {/* Action Buttons Row */}
      <div className="rotinas-quick-actions-grid">
        <button 
          className="rotina-action-box"
          onClick={handleOpenNewRoutine}
          id="btn-nova-rotina"
        >
          <ClipboardList size={22} className="action-box-icon" />
          <span>Nova rotina</span>
        </button>

        <button 
          className="rotina-action-box"
          onClick={() => setIsScheduleModalOpen(true)}
          id="btn-escala-semanal"
        >
          <Calendar size={22} className="action-box-icon" />
          <span>Escala Semanal</span>
        </button>

      </div>

      {/* PROGRAMAÇÃO DO DIA */}
      {(() => {
        const todayDayOfWeek = new Date().getDay();
        const todaySchedule = weeklySchedule?.[todayDayOfWeek];
        const dayNames = {
          0: 'Domingo', 1: 'Segunda-feira', 2: 'Terça-feira', 3: 'Quarta-feira',
          4: 'Quinta-feira', 5: 'Sexta-feira', 6: 'Sábado'
        };
        const hasW = todaySchedule?.hasWorkout || todaySchedule?.type === 'workout' || todaySchedule?.type === 'both';
        const wTitle = todaySchedule?.workoutLabel || todaySchedule?.label || 'Treino de Musculação';
        const matchedRoutine = routines.find(r => r.scheduledDay === todayDayOfWeek || (r.name && todaySchedule?.workoutLabel && r.name.toLowerCase() === todaySchedule.workoutLabel.toLowerCase()));

        if (!hasW) return null;

        return (
          <div className="daily-program-today-box" style={{
            background: 'var(--bg-card)',
            border: '1px solid var(--border-color)',
            borderRadius: 'var(--radius-lg)',
            padding: '16px',
            display: 'flex',
            flexDirection: 'column',
            gap: 12,
            marginBottom: 12
          }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <div>
                <span style={{ fontSize: '0.6875rem', fontWeight: 800, color: 'var(--accent)', letterSpacing: 0.5 }}>
                  PROGRAMAÇÃO DE HOJE
                </span>
                <h3 style={{ fontSize: '1.125rem', fontWeight: 800, color: 'var(--text-primary)' }}>
                  {dayNames[todayDayOfWeek].toUpperCase()}
                </h3>
              </div>
              <span style={{
                fontSize: '0.75rem',
                fontWeight: 700,
                padding: '4px 10px',
                borderRadius: 'var(--radius-full)',
                background: 'var(--bg-elevated)',
                color: 'var(--text-secondary)'
              }}>
                Musculação
              </span>
            </div>

            {/* Treino Principal */}
            {hasW && (
              <div style={{
                display: 'flex',
                flexDirection: 'column',
                gap: 8,
                padding: '12px 14px',
                background: 'var(--bg-elevated)',
                borderRadius: 'var(--radius-md)',
                borderLeft: '4px solid var(--accent)'
              }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <div>
                    <span style={{ fontSize: '0.6875rem', fontWeight: 800, color: 'var(--accent)' }}>
                      🏋️ [TREINO PRINCIPAL]: {wTitle}
                    </span>
                    <h4 style={{ fontSize: '0.9375rem', fontWeight: 800, color: 'var(--text-primary)', margin: '2px 0 0 0' }}>
                      {wTitle}
                    </h4>
                  </div>
                  <Button
                    variant="primary"
                    size="sm"
                    icon={Play}
                    onClick={() => {
                      if (matchedRoutine) {
                        handleStartWorkout(matchedRoutine);
                      } else {
                        handleStartEmptyWorkout();
                      }
                    }}
                  >
                    Bate-Ponto Musculação
                  </Button>
                </div>

                {matchedRoutine?.exercises?.length > 0 && (
                  <ul style={{ margin: '4px 0 0 0', paddingLeft: 16, fontSize: '0.8125rem', color: 'var(--text-secondary)' }}>
                    {matchedRoutine.exercises.map((ex, i) => (
                      <li key={i}>• {ex.name}</li>
                    ))}
                  </ul>
                )}
              </div>
            )}

          </div>
        );
      })()}

      {/* Minhas rotinas toggle matching Image 1 */}
      <div className="minhas-rotinas-header" onClick={() => setFolderOpen(!folderOpen)}>
        {folderOpen ? <ChevronDown size={18} /> : <ChevronRight size={18} />}
        <span>Minhas rotinas ({routines.length})</span>
      </div>

      {/* Routine Cards Stack */}
      {folderOpen && (
        <div className="routine-cards-stack-v2">
          {routines.length === 0 ? (
            <div className="routines-empty-box animate-fade-in" style={{
              padding: '32px 20px',
              textAlign: 'center',
              background: 'var(--bg-card)',
              border: '1px dashed var(--border-subtle)',
              borderRadius: 'var(--radius-lg)',
              color: 'var(--text-secondary)'
            }}>
              <Dumbbell size={36} style={{ color: 'var(--accent)', margin: '0 auto 12px auto', display: 'block' }} />
              <h3 style={{ color: 'var(--text-primary)', fontSize: '1.125rem', fontWeight: 700, marginBottom: '6px' }}>
                Nenhuma rotina criada ainda
              </h3>
              <p style={{ fontSize: '0.875rem', maxWidth: '380px', margin: '0 auto 16px auto', color: 'var(--text-secondary)' }}>
                Monte sua ficha personalizada com exercícios, séries e cargas tocando em <strong>Nova rotina</strong> acima, ou comece agora mesmo com um <strong>Treino vazio</strong>!
              </p>
              <Button variant="primary" icon={Plus} onClick={handleOpenNewRoutine}>
                Criar Minha Primeira Rotina
              </Button>
            </div>
          ) : (
            routines.map(routine => {
              const exercisesSummary = routine.exercises?.length > 0
                ? routine.exercises.map(e => e.name).join(', ')
                : 'Nenhum exercício cadastrado';

              return (
                <div 
                  key={routine.id} 
                  className="routine-card-v2"
                  role="button"
                  tabIndex={0}
                  aria-label={`Abrir ficha da rotina ${routine.name}`}
                  onClick={() => navigate(`/routines/${routine.id}`)}
                  onKeyDown={event => {
                    if (event.target !== event.currentTarget) return;
                    if (event.key === 'Enter' || event.key === ' ') {
                      event.preventDefault();
                      navigate(`/routines/${routine.id}`);
                    }
                  }}
                >
                  {/* Header with Title and ... menu */}
                  <div className="routine-card-v2-header">
                    <div>
                      <h3 className="routine-v2-name">{routine.name}</h3>
                      {routine.scheduledDay !== undefined && routine.scheduledDay !== null && (
                        <span style={{
                          display: 'inline-block',
                          fontSize: '0.6875rem',
                          padding: '2px 8px',
                          background: 'rgba(59, 130, 246, 0.15)',
                          color: '#60a5fa',
                          borderRadius: 'var(--radius-full)',
                          fontWeight: 600,
                          marginTop: 4
                        }}>
                          📅 {DAYS_OF_WEEK.find(d => d.id === routine.scheduledDay)?.name || 'Dia agendado'}
                        </span>
                      )}
                    </div>
                    <div className="menu-wrap" onClick={e => e.stopPropagation()}>
                      <button 
                        className="routine-more-btn"
                        onClick={() => setActiveMenuId(activeMenuId === routine.id ? null : routine.id)}
                      >
                        <MoreHorizontal size={20} />
                      </button>

                      {activeMenuId === routine.id && (
                        <div className="routine-popover-menu animate-scale-in">
                          <button 
                            className="popover-item"
                            onClick={() => {
                              handleStartWorkout(routine);
                              setActiveMenuId(null);
                            }}
                          >
                            <Play size={15} /> Começar rotina
                          </button>
                          <button 
                            className="popover-item"
                            onClick={() => handleOpenEditRoutine(routine)}
                          >
                            <Edit3 size={15} /> Editar Ficha
                          </button>
                          <button 
                            className="popover-item"
                            onClick={() => {
                              duplicateRoutine(routine.id);
                              setActiveMenuId(null);
                            }}
                          >
                            <Copy size={15} /> Duplicar
                          </button>
                          <button 
                            className="popover-item item-danger"
                            onClick={() => handleDeleteRoutine(routine)}
                          >
                            <Trash2 size={15} /> Excluir
                          </button>
                        </div>
                      )}
                    </div>
                  </div>

                  {/* Exercises summary line */}
                  <p className="routine-v2-summary">{exercisesSummary}</p>

                  <div className="routine-card-actions">
                    <button
                      type="button"
                      className="btn-comecar-rotina-blue"
                      onClick={(event) => {
                        event.stopPropagation();
                        handleStartWorkout(routine);
                      }}
                      id={`btn-start-${routine.id}`}
                    >
                      Iniciar treino
                    </button>
                  </div>
                </div>
              );
            })
          )}
        </div>
      )}

      {/* Routine Editor Modal */}
      {isEditorOpen && (
        <Modal
          isOpen={isEditorOpen}
          onClose={() => setIsEditorOpen(false)}
          title={editingRoutine ? `Editar: ${editingRoutine.name}` : 'Nova Rotina de Treino'}
          size="lg"
        >
          <form className="routine-editor-form" onSubmit={handleSaveRoutine}>
            <Input 
              label="Nome da Rotina" 
              placeholder="Ex: Treino empurrar, Pernas pesadas, PPL dia A..."
              value={formName}
              onChange={e => setFormName(e.target.value)}
              required
              autoFocus
            />

            <Input 
              label="Descrição ou Foco (Opcional)"
              placeholder="Escreva aqui a descrição do treino"
              value={formDescription}
              onChange={e => setFormDescription(e.target.value)}
            />

            <div className="form-group-custom" style={{ marginTop: 12 }}>
              <label style={{ fontSize: '0.8125rem', fontWeight: 600, color: 'var(--text-secondary)' }}>
                Vincular a um Dia da Semana (Opcional)
              </label>
              <select
                className="editor-select"
                style={{ width: '100%', padding: '10px 12px', background: 'var(--bg-elevated)', borderRadius: 'var(--radius-md)', border: '1px solid var(--border-color)', color: 'var(--text-primary)', marginTop: 4 }}
                value={formScheduledDay}
                onChange={e => setFormScheduledDay(e.target.value)}
              >
                <option value="">Nenhum dia específico</option>
                <option value="1">Segunda-feira</option>
                <option value="2">Terça-feira</option>
                <option value="3">Quarta-feira</option>
                <option value="4">Quinta-feira</option>
                <option value="5">Sexta-feira</option>
                <option value="6">Sábado</option>
                <option value="0">Domingo</option>
              </select>
              <small style={{ fontSize: '0.75rem', color: 'var(--text-tertiary)', marginTop: 4, display: 'block' }}>
                Ao vincular, esta rotina será automaticamente programada para esse dia na sua escala semanal.
              </small>
            </div>

            <div className="editor-exercises-section">
              <div className="editor-section-header" style={{ flexDirection: 'column', alignItems: 'stretch', gap: 10 }}>
                <h3 style={{ fontSize: '1rem', fontWeight: 800 }}>Exercícios da Ficha ({formExercises.length})</h3>

                {/* Botão principal de adicionar exercícios */}
                <Button 
                  type="button" 
                  variant="primary" 
                  size="lg" 
                  icon={Plus}
                  onClick={() => {
                    setExerciseModalCategory('Todos');
                    setExerciseIndexToReplace(null);
                    setIsExerciseSelectorOpen(true);
                  }}
                  style={{ width: '100%', justifyContent: 'center', padding: '12px 16px', fontSize: '0.9375rem' }}
                >
                  Adicionar Exercício
                </Button>
              </div>

              {formExercises.length === 0 ? (
                <div style={{
                  textAlign: 'center',
                  padding: '32px 16px',
                  background: 'var(--bg-elevated)',
                  borderRadius: 'var(--radius-lg)',
                  border: '1px dashed var(--border-subtle)',
                  margin: '12px 0'
                }}>
                  <Dumbbell size={28} style={{ color: 'var(--accent)', margin: '0 auto 8px auto', display: 'block' }} />
                  <p style={{ margin: 0, fontWeight: 700, color: 'var(--text-primary)', fontSize: '0.9375rem' }}>
                    Nenhum exercício na ficha ainda
                  </p>
                  <p style={{ margin: '4px 0 0 0', color: 'var(--text-secondary)', fontSize: '0.8125rem' }}>
                    Toque no botão <strong>+ Adicionar Exercício</strong> acima para escolher na lista categorizada com busca rápida.
                  </p>
                </div>
              ) : (
                formExercises.map((exercise, eIdx) => (
                  <div key={exercise.id} className="editor-exercise-card">
                    <div className="editor-exercise-top-bar">
                      <div className="editor-exercise-heading">
                        <span className="editor-exercise-idx" style={{ background: 'var(--accent)', color: '#fff', padding: '2px 8px', borderRadius: 'var(--radius-sm)', fontWeight: 800, fontSize: '0.75rem' }}>
                          #{eIdx + 1}
                        </span>
                        <div className="editor-exercise-copy">
                          <span style={{ fontSize: '0.6875rem', fontWeight: 800, color: 'var(--accent)', textTransform: 'uppercase', letterSpacing: '0.05em', display: 'block' }}>
                            {exercise.muscleGroup || 'Musculação'}
                          </span>
                          <h4 style={{ margin: 0, fontSize: '1.0625rem', fontWeight: 800, color: 'var(--text-primary)' }}>
                            {exercise.name}
                          </h4>
                        </div>
                      </div>
                      <div className="editor-exercise-actions">
                        <button
                          type="button"
                          className="editor-exercise-action-btn"
                          onClick={() => {
                            setExerciseIndexToReplace(eIdx);
                            setExerciseModalCategory(
                              DEFAULT_MUSCLE_GROUPS.includes(exercise.muscleGroup)
                                ? exercise.muscleGroup
                                : 'Todos'
                            );
                            setIsExerciseSelectorOpen(true);
                          }}
                          title="Substituir exercício"
                          aria-label={`Substituir ${exercise.name}`}
                        >
                          <RefreshCw size={17} />
                        </button>
                        <button 
                          type="button" 
                          className="editor-exercise-action-btn"
                          onClick={() => handleMoveExerciseUp(eIdx)}
                          disabled={eIdx === 0}
                          title="Mover para cima"
                          aria-label={`Mover ${exercise.name} para cima`}
                        >
                          <ArrowUp size={15} />
                        </button>
                        <button 
                          type="button" 
                          className="editor-exercise-action-btn"
                          onClick={() => handleMoveExerciseDown(eIdx)}
                          disabled={eIdx === formExercises.length - 1}
                          title="Mover para baixo"
                          aria-label={`Mover ${exercise.name} para baixo`}
                        >
                          <ArrowDown size={15} />
                        </button>
                        <button 
                          type="button" 
                          className="editor-exercise-action-btn editor-remove-btn"
                          onClick={() => handleRemoveExercise(eIdx)}
                          title="Remover exercício"
                          aria-label={`Remover ${exercise.name}`}
                        >
                          <Trash2 size={16} />
                        </button>
                      </div>
                    </div>

                  {/* Sets */}
                  <div className="editor-sets-section">
                    <label className="input-label-sm">Séries, Cargas e Repetições</label>
                    <div className="editor-sets-table">
                      <div className="editor-set-row-header">
                        <span className="col-num">Série</span>
                        <span className="col-weight">Carga (kg)</span>
                        <span className="col-reps">Repetições</span>
                        <span className="col-action"></span>
                      </div>
                      {exercise.sets.map((setObj, sIdx) => (
                        <div key={sIdx} className="editor-set-row">
                          <div className="editor-set-num">{setObj.setNumber || (sIdx + 1)}</div>
                          <input 
                            type="number" 
                            className="editor-set-input"
                            min="0"
                            step="0.5"
                            placeholder="0"
                            value={setObj.weight === 0 ? '' : setObj.weight}
                            onChange={e => handleUpdateSet(eIdx, sIdx, 'weight', e.target.value)}
                          />
                          <input 
                            type="number" 
                            className="editor-set-input"
                            min="0"
                            placeholder="0"
                            value={setObj.reps === 0 ? '' : setObj.reps}
                            onChange={e => handleUpdateSet(eIdx, sIdx, 'reps', e.target.value)}
                          />
                          <button 
                            type="button" 
                            className="editor-set-remove-btn"
                            onClick={() => handleRemoveSet(eIdx, sIdx)}
                            disabled={exercise.sets.length <= 1}
                            title="Remover série"
                          >
                            <X size={15} />
                          </button>
                        </div>
                      ))}
                    </div>
                    <button 
                      type="button" 
                      className="editor-add-set-btn"
                      onClick={() => handleAddSet(eIdx)}
                    >
                      + Adicionar Série
                    </button>
                  </div>

                  {/* Observações / Anotações Pessoais */}
                  <div className="editor-notes-section">
                    <label className="input-label-sm">
                      <StickyNote size={13} style={{ display: 'inline', marginRight: 4 }} />
                      Observações / Anotações Rápidas de Carga
                    </label>
                    <textarea 
                      className="editor-notes-textarea"
                      rows={2}
                      placeholder="Escreva aqui suas observações sobre o exercício"
                      value={exercise.notes}
                      onChange={e => handleUpdateExercise(eIdx, 'notes', e.target.value)}
                    />
                  </div>
                </div>
              ))
            )}
          </div>

            <div className="editor-form-footer">
              <Button type="button" variant="ghost" onClick={() => setIsEditorOpen(false)}>
                Cancelar
              </Button>
              <Button type="submit" variant="primary" icon={Check} size="lg">
                Salvar Rotina
              </Button>
            </div>
          </form>
        </Modal>
      )}

      {isScheduleModalOpen && (
        <WeeklyScheduleModal
          isOpen={isScheduleModalOpen}
          onClose={() => setIsScheduleModalOpen(false)}
          weeklySchedule={weeklySchedule}
          weeklyGoal={user?.weeklyGoal || 4}
          onWeeklyGoalChange={updateWeeklyGoal}
          onSave={updateWeeklySchedule}
        />
      )}

      {/* Categorized & Fast Exercise Selector Modal */}
      {isExerciseSelectorOpen && (
        <ExerciseSelectorModal
          isOpen={isExerciseSelectorOpen}
          initialCategory={exerciseModalCategory}
          title={exerciseIndexToReplace === null ? 'Selecionar Exercício' : 'Substituir Exercício'}
          onClose={() => {
            setIsExerciseSelectorOpen(false);
            setExerciseIndexToReplace(null);
          }}
          onSelectExercise={(selectedEx) => {
            setFormExercises(prev => {
              const trackingType = selectedEx.trackingType || 'strength';
              if (exerciseIndexToReplace !== null) {
                return prev.map((exercise, index) => (
                  index === exerciseIndexToReplace
                    ? {
                        ...exercise,
                        muscleGroup: selectedEx.muscleGroup,
                        name: selectedEx.name,
                        trackingType,
                        ...((exercise.trackingType || 'strength') !== trackingType ? {
                          sets: (exercise.sets || selectedEx.sets || []).map((set, setIndex) => (
                            trackingType === 'duration'
                              ? { setNumber: setIndex + 1, durationSeconds: 0 }
                              : { setNumber: setIndex + 1, weight: 0, reps: 0 }
                          ))
                        } : {})
                      }
                    : exercise
                ));
              }

              return [
                ...prev,
                {
                  id: generateId(),
                  muscleGroup: selectedEx.muscleGroup,
                  name: selectedEx.name,
                  trackingType,
                  notes: '',
                  sets: selectedEx.sets || [
                    { setNumber: 1, weight: 0, reps: 0 }
                  ]
                }
              ];
            });
            setExerciseIndexToReplace(null);
          }}
        />
      )}
    </div>
  );
}
