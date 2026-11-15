import React from 'react';
import { Award, Clock3, Dumbbell, Heart, MessageCircle, Repeat2, Share2, Trash2, Weight } from 'lucide-react';
import Avatar from '../ui/Avatar';
import Button from '../ui/Button';
import Modal from '../ui/Modal';
import { formatRelative } from '../../utils/dateHelpers';
import { formatExerciseDuration, formatWorkoutDuration, getWorkoutFeedMetrics } from '../../utils/workoutFeedMetrics';
import './WorkoutFeed.css';

export default function WorkoutDetailsModal({
  post,
  currentUserId,
  commentInput,
  onCommentInputChange,
  onClose,
  onAddComment,
  onLike,
  onAuthorClick,
  onShare,
  onDelete
}) {
  if (!post) return null;

  const metrics = getWorkoutFeedMetrics(post);
  const muscleSetTotal = metrics.muscleStats.reduce((total, muscle) => total + muscle.sets, 0);
  const isLiked = post.likedBy?.includes(currentUserId) || false;
  const likesCount = Number(post.likes) || post.likedBy?.length || 0;

  return (
    <Modal
      isOpen={Boolean(post)}
      onClose={onClose}
      title={post.title || post.routineName || 'Detalhes do treino'}
      size="lg"
      className="workout-details-modal"
    >
      <div className="workout-details">
        <button
          type="button"
          className="workout-details-author"
          onClick={() => onAuthorClick?.(post.userId)}
          disabled={!post.userId || !onAuthorClick}
        >
          <Avatar src={post.userAvatar} name={post.userName || 'Atleta'} size="sm" />
          <span>
            <strong>{post.userName || 'Atleta'}</strong>
            <time dateTime={post.date}>{formatRelative(post.date)}</time>
          </span>
        </button>

        {post.photoUrl && (
          <img
            className="workout-details-photo"
            src={post.photoUrl}
            alt={`Foto do treino de ${post.userName || 'atleta'}`}
          />
        )}

        <div className="workout-details-metrics">
          <span><Clock3 size={16} /><strong>{formatWorkoutDuration(post.durationMinutes)}</strong><small>tempo</small></span>
          <span>
            <Weight size={16} />
            <strong>{post.showWeights === false || post.totalVolumeKg === undefined
              ? 'Privado'
              : `${Number(post.totalVolumeKg || 0).toLocaleString('pt-BR')} kg`}</strong>
            <small>volume</small>
          </span>
          <span><Dumbbell size={16} /><strong>{metrics.sets}</strong><small>séries</small></span>
          <span><Repeat2 size={16} /><strong>{metrics.reps}</strong><small>repetições</small></span>
          <span>
            <Award size={16} />
            <strong>{metrics.personalRecords === null ? 'Privados' : metrics.personalRecords}</strong>
            <small>PRs</small>
          </span>
        </div>

        {post.showMuscleStats !== false && (
          <section className="workout-details-section">
            <h4>Divisão muscular</h4>
            {metrics.muscleStats.length ? (
              <div className="workout-muscle-breakdown">
                {metrics.muscleStats.map(muscle => {
                  const percent = muscleSetTotal ? Math.round((muscle.sets / muscleSetTotal) * 100) : 0;
                  return (
                    <div className="workout-muscle-row" key={muscle.name}>
                      <div className="workout-muscle-label">
                        <strong>{muscle.name}</strong>
                        <span>{muscle.sets} séries{muscle.reps > 0 ? ` · ${muscle.reps} reps` : ''}</span>
                      </div>
                      <div className="workout-muscle-bar" aria-label={`${percent}% das séries`}>
                        <span style={{ width: `${percent}%` }} />
                      </div>
                    </div>
                  );
                })}
              </div>
            ) : (
              <p className="workout-details-empty">Sem divisão muscular registrada.</p>
            )}
          </section>
        )}

        <section className="workout-details-section">
          <h4>Exercícios e séries</h4>
          {metrics.exercises.length ? metrics.exercises.map((exercise, exerciseIndex) => (
            <article className="workout-detail-exercise" key={`${exercise.name}-${exerciseIndex}`}>
              <header>
                <span>{exercise.muscleGroup || 'Geral'}</span>
                <strong>{exercise.name || 'Exercício'}</strong>
              </header>
              {(exercise.sets || []).length ? (
                <div className="workout-detail-sets">
                  {(exercise.sets || []).map((set, setIndex) => {
                    const isPR = post.sharePRs !== false && set.isPR === true;
                    return (
                      <div className={`workout-detail-set ${isPR ? 'is-pr' : ''}`} key={set.id || setIndex}>
                        <span className="workout-detail-set-number">
                          Série {set.setNumber || setIndex + 1}
                          {isPR && <span className="workout-pr-medal"><Award size={14} /> PR</span>}
                        </span>
                        {exercise.trackingType === 'duration' || Number(set.durationSeconds) > 0 ? (
                          <span className="workout-detail-set-duration">
                            {formatExerciseDuration(set.durationSeconds)}
                          </span>
                        ) : (
                          <>
                            <span>{post.showWeights === false || set.weight === undefined ? 'Carga privada' : `${set.weight} kg`}</span>
                            <span>{Number(set.reps) || 0} reps</span>
                          </>
                        )}
                      </div>
                    );
                  })}
                </div>
              ) : (
                <p className="workout-details-empty">Nenhuma série compartilhada.</p>
              )}
            </article>
          )) : (
            <p className="workout-details-empty">Este treino não contém exercícios compartilhados.</p>
          )}
        </section>

        {post.notes && (
          <section className="workout-details-notes">
            <h4>Observações</h4>
            <p>{post.notes}</p>
          </section>
        )}

        <section className="workout-details-section workout-comments">
          <h4><MessageCircle size={17} /> Comentários ({post.comments?.length || 0})</h4>
          <div className="workout-comments-list">
            {(post.comments || []).map(comment => (
              <div className="workout-comment" key={comment.id}>
                <button
                  type="button"
                  onClick={() => onAuthorClick?.(comment.userId)}
                  disabled={!comment.userId || !onAuthorClick}
                  aria-label={`Abrir perfil de ${comment.userName || 'atleta'}`}
                >
                  <Avatar src={comment.userAvatar} name={comment.userName || 'Atleta'} size="xs" />
                </button>
                <div>
                  <strong>{comment.userName || 'Atleta'}</strong>
                  <p>{comment.text}</p>
                </div>
              </div>
            ))}
            {!post.comments?.length && <p className="workout-details-empty">Nenhum comentário ainda.</p>}
          </div>

          <div className="workout-details-social-actions">
            <button type="button" className={isLiked ? 'is-liked' : ''} onClick={() => onLike?.(post.id)} aria-pressed={isLiked}>
              <Heart size={17} fill={isLiked ? 'currentColor' : 'none'} /> Curtir · {likesCount}
            </button>
            <button type="button" onClick={() => onShare?.(post)}>
              <Share2 size={17} /> Compartilhar link
            </button>
            {post.userId === currentUserId && onDelete && (
              <button type="button" className="workout-details-delete" onClick={() => onDelete(post)}>
                <Trash2 size={17} /> Apagar treino
              </button>
            )}
          </div>

          <form className="workout-comment-form" onSubmit={onAddComment}>
            <input
              type="text"
              maxLength={1000}
              placeholder="Escreva um comentário..."
              value={commentInput}
              onChange={event => onCommentInputChange(event.target.value)}
              aria-label="Comentário"
            />
            <Button type="submit" variant="primary" size="sm" disabled={!commentInput.trim()}>
              Enviar
            </Button>
          </form>
        </section>
      </div>
    </Modal>
  );
}
