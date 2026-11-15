import React from 'react';
import { Award, Clock3, Dumbbell, Heart, MessageCircle, Repeat2, Share2, Trash2, Weight } from 'lucide-react';
import Avatar from '../ui/Avatar';
import { formatRelative } from '../../utils/dateHelpers';
import { formatWorkoutDuration, getWorkoutFeedMetrics } from '../../utils/workoutFeedMetrics';
import './WorkoutFeed.css';

export default function WorkoutFeedCard({
  post,
  currentUserId,
  onLike,
  onOpen,
  onAuthorClick,
  onShare,
  onDelete
}) {
  const metrics = getWorkoutFeedMetrics(post);
  const isLiked = post.likedBy?.includes(currentUserId) || false;
  const likesCount = Number(post.likes) || post.likedBy?.length || 0;
  const commentsCount = post.comments?.length || 0;
  const postTitle = post.title || post.routineName || 'Treino';

  const handleCardClick = event => {
    if (event.target.closest('button, a, input, select, textarea, [role="button"]')) return;
    onOpen?.();
  };

  const handleCardKeyDown = event => {
    if (event.target !== event.currentTarget) return;
    if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault();
      onOpen?.();
    }
  };

  return (
    <article
      className="workout-feed-card"
      tabIndex={0}
      aria-label={`Abrir treino ${postTitle} de ${post.userName || 'Atleta'}`}
      onClick={handleCardClick}
      onKeyDown={handleCardKeyDown}
    >
      <header className="workout-feed-author">
        <button
          type="button"
          className="workout-feed-author-button"
          onClick={() => onAuthorClick?.(post.userId)}
          disabled={!post.userId || !onAuthorClick}
        >
          <Avatar src={post.userAvatar} name={post.userName || 'Atleta'} size="md" />
          <span>
            <strong>{post.userName || 'Atleta'}</strong>
            <time dateTime={post.date}>{formatRelative(post.date)}</time>
          </span>
        </button>
        {metrics.personalRecords > 0 && (
          <span className="workout-feed-pr-count">
            <Award size={15} /> {metrics.personalRecords} PR
          </span>
        )}
      </header>

      <button type="button" className="workout-feed-title" onClick={onOpen}>
        {postTitle}
      </button>

      <div className="workout-feed-stats" aria-label="Resumo do treino">
        <span><Clock3 size={15} /> {formatWorkoutDuration(post.durationMinutes)}</span>
        <span>
          <Weight size={15} />
          {post.showWeights === false || post.totalVolumeKg === undefined
            ? 'Volume privado'
            : `${Number(post.totalVolumeKg || 0).toLocaleString('pt-BR')} kg`}
        </span>
        <span><Repeat2 size={15} /> {metrics.reps} reps</span>
        <span><Dumbbell size={15} /> {metrics.sets} séries</span>
      </div>

      <button type="button" className="workout-feed-photo-button" onClick={onOpen}>
        {post.photoUrl ? (
          <img src={post.photoUrl} alt={`Foto do treino de ${post.userName || 'atleta'}`} loading="lazy" />
        ) : (
          <span className="workout-feed-photo-placeholder">
            <Dumbbell size={34} />
            <span>Treino registrado</span>
          </span>
        )}
      </button>

      <footer className="workout-feed-actions">
        <button
          type="button"
          className={`workout-feed-action ${isLiked ? 'is-liked' : ''}`}
          onClick={() => onLike?.(post.id)}
          aria-pressed={isLiked}
        >
          <Heart size={18} fill={isLiked ? 'currentColor' : 'none'} />
          <span>Curtir</span>
          <span className="workout-feed-action-count">{likesCount}</span>
        </button>
        <button type="button" className="workout-feed-action" onClick={onOpen}>
          <MessageCircle size={18} />
          <span>Comentar</span>
          <span className="workout-feed-action-count">{commentsCount}</span>
        </button>
        <button
          type="button"
          className="workout-feed-action"
          onClick={() => onShare?.(post)}
          aria-label="Compartilhar link do treino"
        >
          <Share2 size={18} />
          <span>Compartilhar</span>
        </button>
        {post.userId === currentUserId && onDelete && (
          <button
            type="button"
            className="workout-feed-action workout-feed-delete"
            onClick={() => onDelete(post)}
            aria-label="Apagar este treino"
            title="Apagar este treino"
          >
            <Trash2 size={18} />
            <span>Apagar</span>
          </button>
        )}
        {metrics.personalRecords > 0 && (
          <span className="workout-feed-action-pr">
            <Award size={17} /> {metrics.personalRecords} PRs
          </span>
        )}
      </footer>
    </article>
  );
}
