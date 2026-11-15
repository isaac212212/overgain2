import React, { useEffect, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { useData } from '../contexts/DataContext';
import { useConfirmDialog } from '../contexts/ConfirmDialogContext';
import {
  addPublicWorkoutComment,
  deletePublicWorkoutFromCloud,
  deletePublicWorkoutPhoto,
  fetchPublicWorkouts,
  togglePublicWorkoutLike
} from '../lib/supabase';
import { Globe } from 'lucide-react';
import Button from '../components/ui/Button';
import Card from '../components/ui/Card';
import Avatar from '../components/ui/Avatar';
import WorkoutFeedCard from '../components/feed/WorkoutFeedCard';
import WorkoutDetailsModal from '../components/feed/WorkoutDetailsModal';
import WorkoutFrequencyCalendar from '../components/profile/WorkoutFrequencyCalendar';
import { showToast } from '../contexts/ToastContext';
import { shareWorkoutLink } from '../utils/workoutSharing';
import { isSameDay } from '../utils/dateHelpers';
import './DashboardPage.css';

export default function DashboardPage() {
  const { user } = useAuth();
  const confirm = useConfirmDialog();
  const { 
    checkins, 
    routines, 
    weeklySchedule,
    startActiveWorkout,
    deleteCheckin
  } = useData();
  const navigate = useNavigate();
  const location = useLocation();

  const today = new Date();
  const [publicWorkouts, setPublicWorkouts] = useState([]);
  const [publicFeedError, setPublicFeedError] = useState('');
  const [isPublicFeedLoading, setIsPublicFeedLoading] = useState(true);
  const [selectedPostId, setSelectedPostId] = useState(
    () => new URLSearchParams(location.search).get('workout')
  );
  const [commentInput, setCommentInput] = useState('');
  const [pendingLikes, setPendingLikes] = useState(() => new Set());

  useEffect(() => {
    let active = true;
    fetchPublicWorkouts(20)
      .then(items => {
        if (active) {
          setPublicWorkouts(items);
          setPublicFeedError('');
          setIsPublicFeedLoading(false);
        }
      })
      .catch(error => {
        console.error('Não foi possível carregar o feed público:', error);
        if (active) {
          setPublicFeedError('Não foi possível carregar os treinos públicos.');
          setIsPublicFeedLoading(false);
        }
      });
    return () => { active = false; };
  }, [user?.id, checkins]);

  useEffect(() => {
    if (!new URLSearchParams(location.search).has('workout')) return;
    navigate('/dashboard', { replace: true });
  }, [location.search, navigate]);

  const selectedPost = publicWorkouts.find(item => item.id === selectedPostId) || null;

  const handleLikePublicWorkout = async (workoutId) => {
    if (!user?.id || pendingLikes.has(workoutId)) return;
    setPendingLikes(previous => new Set(previous).add(workoutId));
    try {
      const { liked, userId } = await togglePublicWorkoutLike(workoutId);
      setPublicWorkouts(items => items.map(item => {
        if (item.id !== workoutId) return item;
        const likedBy = item.likedBy || [];
        return {
          ...item,
          likedBy: liked
            ? [...new Set([...likedBy, userId])]
            : likedBy.filter(id => id !== userId),
          likes: Math.max(0, (Number(item.likes) || 0) + (liked ? 1 : -1))
        };
      }));
    } catch (error) {
      console.error('Não foi possível atualizar a curtida:', error);
      showToast(error.message || 'Não foi possível curtir este treino.', 'error');
    } finally {
      setPendingLikes(previous => {
        const next = new Set(previous);
        next.delete(workoutId);
        return next;
      });
    }
  };

  const handleAddPublicComment = async (event) => {
    event.preventDefault();
    if (!selectedPost || !commentInput.trim()) return;
    try {
      const comment = await addPublicWorkoutComment(selectedPost.id, commentInput);
      setPublicWorkouts(items => items.map(item => (
        item.id === selectedPost.id
          ? { ...item, comments: [...(item.comments || []), comment] }
          : item
      )));
      setCommentInput('');
    } catch (error) {
      console.error('Não foi possível adicionar comentário ao treino:', error);
      showToast(error.message || 'Não foi possível enviar o comentário.', 'error');
    }
  };

  const handlePublicAuthorClick = (profileId) => {
    if (!profileId) return;
    setSelectedPostId(null);
    setCommentInput('');
    navigate(profileId === user?.id ? '/profile' : `/profiles/${profileId}`);
  };

  const handleSharePublicWorkout = async (post) => {
    try {
      const result = await shareWorkoutLink(post);
      if (result.copied) showToast('Link do treino copiado.', 'success');
    } catch (error) {
      if (error?.name === 'AbortError') return;
      console.error('Não foi possível compartilhar o treino:', error);
      showToast(error.message || 'Não foi possível compartilhar o link.', 'error');
    }
  };

  const handleDeletePublicWorkout = async (post) => {
    if (post.userId !== user?.id) return;
    if (!await confirm({
      title: 'Apagar treino',
      message: 'Apagar este treino do histórico e também dos feeds em que foi publicado?',
      confirmLabel: 'Apagar treino',
      variant: 'danger'
    })) return;
    try {
      const localCheckin = checkins.find(item => item.id === (post.checkinId || post.id));
      if (localCheckin) {
        const deleted = await deleteCheckin(localCheckin.id);
        if (deleted === null) return;
      } else {
        const deleted = await deletePublicWorkoutFromCloud(post.id);
        if (!deleted) return;
        const photoRemoved = await deletePublicWorkoutPhoto(post.photoUrl);
        if (photoRemoved) showToast('Publicação removida do feed público.', 'success');
      }
      setPublicWorkouts(items => items.filter(item => item.id !== post.id));
      setSelectedPostId(null);
    } catch (error) {
      console.error('Não foi possível apagar o treino público:', error);
      showToast('Não foi possível apagar este treino. Tente novamente.', 'error');
    }
  };

  const todayDayOfWeek = today.getDay();
  const todaySchedule = weeklySchedule?.[todayDayOfWeek];
  const todayTrainedWorkout = checkins.some(c => c.type !== 'cardio' && !c.isCardio && isSameDay(c.date, today));
  
  const DAYS_OF_WEEK_NAMES = {
    0: 'Domingo',
    1: 'Segunda-feira',
    2: 'Terça-feira',
    3: 'Quarta-feira',
    4: 'Quinta-feira',
    5: 'Sexta-feira',
    6: 'Sábado'
  };

  const matchedTodayRoutine = (routines || []).find(r => 
    r.scheduledDay === todayDayOfWeek || 
    (r.name && todaySchedule?.workoutLabel && r.name.toLowerCase() === todaySchedule.workoutLabel.toLowerCase()) ||
    (r.name && todaySchedule?.label && r.name.toLowerCase() === todaySchedule.label.toLowerCase())
  );
  const hasTodaySchedule = Boolean(
    todaySchedule?.type === 'rest' ||
    todaySchedule?.hasWorkout ||
    todaySchedule?.type === 'workout' ||
    todaySchedule?.type === 'both' ||
    matchedTodayRoutine
  );

  return (
    <div className="dashboard-page animate-fade-in">
      {/* Header Greeting */}
      <header className="dashboard-header">
        <div className="dashboard-greeting">
          <button type="button" onClick={() => navigate('/profile')} aria-label="Abrir meu perfil" style={{ border: 0, padding: 0, background: 'transparent', cursor: 'pointer' }}>
            <Avatar src={user?.avatar} name={user?.name || 'Usuário'} size="lg" />
          </button>
          <div>
            <h1 className="dashboard-title">
              <button type="button" onClick={() => navigate('/profile')} style={{ border: 0, padding: 0, background: 'transparent', color: 'inherit', font: 'inherit', cursor: 'pointer' }}>
                Olá, {user?.name?.split(' ')[0] || 'Atleta'}
              </button>! 👋
            </h1>
            <p className="dashboard-subtitle">Pronto para treinar hoje? Hora de registrar sua evolução.</p>
          </div>
        </div>

      </header>

          {/* Programação do Dia */}
          <section className="dashboard-section daily-program-section">
            <div className="section-header">
              <h2 className="section-title">
                📅 Programação de Hoje ({DAYS_OF_WEEK_NAMES[todayDayOfWeek]})
              </h2>
              <span className="section-badge">
                {!hasTodaySchedule
                  ? 'Sem programação'
                  : (todaySchedule?.hasWorkout || todaySchedule?.type === 'workout' || todaySchedule?.type === 'both' || matchedTodayRoutine)
                    ? 'Musculação'
                    : 'Descanso'}
              </span>
            </div>

            <Card className="daily-schedule-unified-card" padding="lg">
              {/* 1. Treino Principal */}
              {(todaySchedule?.hasWorkout || todaySchedule?.type === 'workout' || todaySchedule?.type === 'both' || matchedTodayRoutine || todayTrainedWorkout) && (
                <div className="daily-schedule-workout-box">
                  <div className="daily-box-top">
                    <div className="daily-box-title-group">
                      <span className="daily-box-tag">🏋️ [TREINO PRINCIPAL]</span>
                      <h3 className="daily-box-name">
                        {todaySchedule?.workoutLabel || matchedTodayRoutine?.name || todaySchedule?.label || 'Treino de Musculação'}
                      </h3>
                    </div>
                    {todayTrainedWorkout ? (
                      <span className="daily-status-pill done">✅ Treino Concluído</span>
                    ) : (
                      <span className="daily-status-pill pending">⏳ Pendente</span>
                    )}
                  </div>

                  {/* Exercises list preview */}
                  {matchedTodayRoutine?.exercises?.length > 0 && (
                    <ul className="daily-exercises-list-preview">
                      {matchedTodayRoutine.exercises.map((ex, i) => (
                        <li key={i}>• {ex.name} {ex.muscleGroup ? `(${ex.muscleGroup})` : ''}</li>
                      ))}
                    </ul>
                  )}

                  <div className="daily-box-footer">
                    <Button 
                      variant={todayTrainedWorkout ? "secondary" : "primary"}
                      size="sm"
                      onClick={() => {
                        if (matchedTodayRoutine) {
                          startActiveWorkout(matchedTodayRoutine);
                        } else {
                          startActiveWorkout({
                            id: 'today_workout',
                            name: todaySchedule?.workoutLabel || 'Treino do Dia',
                            exercises: []
                          });
                        }
                        navigate('/workout/active');
                      }}
                    >
                      {todayTrainedWorkout ? "Treinar Novamente" : "Iniciar Treino Principal"}
                    </Button>
                  </div>
                </div>
              )}

              {/* Descanso */}
              {(!todaySchedule || todaySchedule.type === 'rest') && !todaySchedule?.hasWorkout && !todayTrainedWorkout && (
                <div className="daily-rest-placeholder">
                  <span style={{ fontSize: '1.5rem' }}>💤</span>
                  <div>
                    <h4>Dia de Descanso Programado</h4>
                    <p>Aproveite para recuperar as energias para o próximo treino.</p>
                  </div>
                </div>
              )}
              {!hasTodaySchedule && !todayTrainedWorkout && (
                <div className="daily-rest-placeholder">
                  <div>
                    <h4>Nenhum treino programado para hoje</h4>
                    <p>Crie uma rotina para definir sua programação semanal.</p>
                  </div>
                </div>
              )}
            </Card>
          </section>

          <section className="dashboard-section">
            <WorkoutFrequencyCalendar checkins={checkins} weeklySchedule={weeklySchedule} />
          </section>

          <section className="dashboard-section dashboard-public-feed">
            <div className="dashboard-feed-heading">
              <div>
                <h2 className="section-title"><Globe size={18} /> FEED DE TREINOS</h2>
                <p>Treinos compartilhados pela comunidade Overgain.</p>
              </div>
              {publicWorkouts.length > 0 && (
                <span className="dashboard-feed-count">{publicWorkouts.length} POSTS</span>
              )}
            </div>
            {publicFeedError ? (
              <Card className="dashboard-feed-state" padding="md"><p>{publicFeedError}</p></Card>
            ) : isPublicFeedLoading ? (
              <Card className="dashboard-feed-state" padding="md"><p>Carregando treinos...</p></Card>
            ) : publicWorkouts.length === 0 ? (
              <Card className="dashboard-feed-state" padding="md">
                <Globe size={22} />
                <p>Nenhum treino público por enquanto.</p>
              </Card>
            ) : (
              <div className="public-workout-list">
                {publicWorkouts.map(item => (
                  <WorkoutFeedCard
                    key={item.id}
                    post={item}
                    currentUserId={user?.id}
                    onLike={handleLikePublicWorkout}
                    onOpen={() => setSelectedPostId(item.id)}
                    onAuthorClick={handlePublicAuthorClick}
                    onShare={handleSharePublicWorkout}
                    onDelete={handleDeletePublicWorkout}
                  />
                ))}
              </div>
            )}
          </section>
          <WorkoutDetailsModal
            post={selectedPost}
            currentUserId={user?.id}
            commentInput={commentInput}
            onCommentInputChange={setCommentInput}
            onClose={() => {
              setSelectedPostId(null);
              setCommentInput('');
            }}
            onAddComment={handleAddPublicComment}
            onLike={handleLikePublicWorkout}
            onAuthorClick={handlePublicAuthorClick}
            onShare={handleSharePublicWorkout}
            onDelete={handleDeletePublicWorkout}
          />
    </div>
  );
}
