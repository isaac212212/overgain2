import React, { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { ArrowLeft, CalendarDays, Flame, Globe, Target, Trophy, UserPlus, UserRoundCheck } from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';
import { useData } from '../contexts/DataContext';
import Avatar from '../components/ui/Avatar';
import Button from '../components/ui/Button';
import Card from '../components/ui/Card';
import SharedProfileActivity from '../components/profile/SharedProfileActivity';
import {
  fetchCloudPublicProfile,
  fetchPublicWorkouts,
  fetchUserFollowSummary,
  setUserFollow
} from '../lib/supabase';
import { formatRelative } from '../utils/dateHelpers';
import './PublicProfilePage.css';

const SHARED_MEASUREMENTS = [
  ['weight', 'Peso', 'kg'],
  ['height', 'Altura', 'cm'],
  ['leftArm', 'Braço esquerdo', 'cm'],
  ['rightArm', 'Braço direito', 'cm'],
  ['chest', 'Peitoral', 'cm'],
  ['waist', 'Cintura', 'cm'],
  ['leftThigh', 'Coxa esquerda', 'cm'],
  ['rightThigh', 'Coxa direita', 'cm'],
  ['leftCalf', 'Panturrilha esquerda', 'cm'],
  ['rightCalf', 'Panturrilha direita', 'cm']
];

export default function PublicProfilePage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { user } = useAuth();
  const { groups } = useData();
  const [profile, setProfile] = useState(null);
  const [workouts, setWorkouts] = useState([]);
  const [followSummary, setFollowSummary] = useState(null);
  const [loadedProfileId, setLoadedProfileId] = useState(null);
  const [isFollowLoading, setIsFollowLoading] = useState(false);
  const [error, setError] = useState('');
  const isLoading = loadedProfileId !== id;
  const isOwnProfile = user?.id === id;

  useEffect(() => {
    let active = true;
    Promise.all([
      fetchCloudPublicProfile(id),
      fetchPublicWorkouts(100),
      fetchUserFollowSummary(id, user?.id)
    ]).then(([publicProfile, publicWorkouts, summary]) => {
      if (!active) return;
      setProfile(publicProfile);
      setWorkouts(publicWorkouts.filter(workout => workout.userId === id));
      setFollowSummary(summary);
      setError('');
      if (!publicProfile) setError('Perfil não encontrado ou indisponível.');
      setLoadedProfileId(id);
    }).catch(loadError => {
      console.error('Não foi possível carregar o perfil público:', loadError);
      if (active) {
        setProfile(null);
        setError('Não foi possível carregar este perfil. Tente novamente.');
        setLoadedProfileId(id);
      }
    });
    return () => { active = false; };
  }, [id, user?.id, isOwnProfile]);

  const handleFollow = async () => {
    if (!profile || isFollowLoading) return;
    setIsFollowLoading(true);
    try {
      const summary = await setUserFollow(id, !followSummary?.isFollowing);
      setFollowSummary(summary);
    } catch (followError) {
      console.error('Não foi possível atualizar o seguimento:', followError);
      setError('Não foi possível atualizar o seguimento.');
    } finally {
      setIsFollowLoading(false);
    }
  };

  const groupMember = groups
    .flatMap(group => group.members || [])
    .find(member => member.id === id);
  const sharedMeasurements = SHARED_MEASUREMENTS
    .map(([key, label, unit]) => [label, profile?.measurements?.[key], unit])
    .filter(([, value]) => Number(value) > 0);
  const sharedWeeklySets = profile?.weekly_sets_by_muscle_group?.Geral;

  return (
    <main className="public-profile-page">
      <Button className="public-profile-back" variant="ghost" icon={ArrowLeft} onClick={() => navigate(-1)}>Voltar</Button>
      {isLoading ? (
        <Card padding="lg"><p>Carregando perfil...</p></Card>
      ) : error && !profile ? (
        <Card padding="lg"><p role="alert">{error}</p></Card>
      ) : (
        <>
          <Card className="public-profile-card" padding="md">
            <header className="public-profile-heading">
              <Avatar src={profile?.avatar_url} name={profile?.name || 'Atleta'} size="lg" />
              <div className="public-profile-identity">
                <h1>{profile?.name || 'Atleta'}</h1>
                {profile?.username && <p>@{profile.username}</p>}
                <div className="public-profile-social">
                  <span><strong>{followSummary?.followers ?? 0}</strong> seguidores</span>
                  <span><strong>{followSummary?.following ?? 0}</strong> seguindo</span>
                </div>
              </div>
              {!isOwnProfile && (
                <Button
                  className="public-profile-follow"
                  size="sm"
                  variant={followSummary?.isFollowing ? 'secondary' : 'primary'}
                  icon={followSummary?.isFollowing ? UserRoundCheck : UserPlus}
                  onClick={handleFollow}
                  disabled={isFollowLoading}
                >
                  {followSummary?.isFollowing ? 'Seguindo' : 'Seguir'}
                </Button>
              )}
            </header>

            <div className="public-profile-activity">
              {profile?.weekly_checkins !== undefined && (
                <div className="public-profile-activity-stat">
                  <CalendarDays aria-hidden="true" />
                  <strong>{profile.weekly_checkins}</strong>
                  <span>Treinos na semana</span>
                </div>
              )}
              {profile?.streak !== undefined && (
                <div className="public-profile-activity-stat">
                  <Flame aria-hidden="true" />
                  <strong>{profile.streak}</strong>
                  <span>Dias seguidos</span>
                </div>
              )}
              {profile?.weekly_streak !== undefined && (
                <div className="public-profile-activity-stat">
                  <Trophy aria-hidden="true" />
                  <strong>{profile.weekly_streak}</strong>
                  <span>Semanas ativas</span>
                </div>
              )}
              {profile?.weekly_goal && (
                <div className="public-profile-activity-stat">
                  <Target aria-hidden="true" />
                  <strong>{profile.weekly_goal}x</strong>
                  <span>Meta semanal</span>
                </div>
              )}
            </div>

            {groupMember && (
              <div className="public-profile-group-note">
                <CalendarDays size={16} />
                <span>Membro de um grupo que vocês compartilham</span>
              </div>
            )}
            {(sharedMeasurements.length > 0 || profile?.weekly_volume_kg !== undefined ||
              sharedWeeklySets !== undefined || profile?.prs_count !== undefined) && (
              <div className="public-profile-data-grid">
                {sharedMeasurements.map(([label, value, unit]) => (
                  <div key={label} style={{ padding: '9px 11px', border: '1px solid var(--border-subtle)', borderRadius: 'var(--radius-sm)', background: 'var(--bg-elevated)' }}>
                    <span style={{ display: 'block', color: 'var(--text-tertiary)', fontSize: '0.72rem' }}>{label}</span>
                    <strong>{value} {unit}</strong>
                  </div>
                ))}
                {profile?.weekly_volume_kg !== undefined && (
                  <div style={{ padding: '9px 11px', border: '1px solid var(--border-subtle)', borderRadius: 'var(--radius-sm)', background: 'var(--bg-elevated)' }}>
                    <span style={{ display: 'block', color: 'var(--text-tertiary)', fontSize: '0.72rem' }}>Volume semanal</span>
                    <strong>{Number(profile.weekly_volume_kg).toLocaleString('pt-BR')} kg</strong>
                  </div>
                )}
                {sharedWeeklySets !== undefined && (
                  <div style={{ padding: '9px 11px', border: '1px solid var(--border-subtle)', borderRadius: 'var(--radius-sm)', background: 'var(--bg-elevated)' }}>
                    <span style={{ display: 'block', color: 'var(--text-tertiary)', fontSize: '0.72rem' }}>Séries semanais</span>
                    <strong>{sharedWeeklySets}</strong>
                  </div>
                )}
                {profile?.prs_count !== undefined && (
                  <div style={{ padding: '9px 11px', border: '1px solid var(--border-subtle)', borderRadius: 'var(--radius-sm)', background: 'var(--bg-elevated)' }}>
                    <span style={{ display: 'block', color: 'var(--text-tertiary)', fontSize: '0.72rem' }}>PRs</span>
                    <strong>{profile.prs_count}</strong>
                  </div>
                )}
              </div>
            )}
            {error && <p role="alert" style={{ color: 'var(--color-danger, #ef4444)' }}>{error}</p>}
          </Card>

          <SharedProfileActivity
            name={profile?.name || 'Atleta'}
            routines={profile?.routines}
            routinesAvailable={Array.isArray(profile?.routines)}
            routineWeightsVisible={profile?.public_routine_weights === true}
            trainingDates={profile?.training_dates}
            weeklySchedule={profile?.weekly_schedule}
            canViewTrainingActivity={Array.isArray(profile?.training_dates)}
            onRoutineClick={routine => {
              if (!routine.id) return;
              navigate(`/profiles/${encodeURIComponent(id)}/routines/${encodeURIComponent(routine.id)}`);
            }}
          />

          <section style={{ marginTop: 24 }}>
            <h2 style={{ display: 'flex', alignItems: 'center', gap: 8 }}><Globe size={18} /> Treinos públicos</h2>
            {workouts.length === 0 ? (
              <Card padding="md"><p>Esta pessoa ainda não publicou treinos.</p></Card>
            ) : workouts.map(workout => (
              <Card key={workout.id} padding="md" style={{ marginBottom: 12 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap' }}>
                  <strong>{workout.title || workout.routineName || 'Treino'}</strong>
                  <span style={{ color: 'var(--text-secondary)' }}>{formatRelative(workout.date)}</span>
                </div>
                <p style={{ color: 'var(--text-secondary)' }}>
                  {[workout.durationMinutes && `${workout.durationMinutes} min`, workout.totalSets && `${workout.totalSets} séries`].filter(Boolean).join(' · ')}
                </p>
                {workout.exercises?.length > 0 && (
                  <div>
                    {workout.exercises.map((exercise, exerciseIndex) => {
                      const records = (exercise.sets || []).filter(set => set.isPR);
                      return (
                        <p key={`${workout.id}-${exerciseIndex}`} style={{ margin: '6px 0' }}>
                          {exercise.name}
                          {records.map((set, setIndex) => (
                            <strong key={setIndex} style={{ color: '#16a34a', marginLeft: 8 }}>
                              🏆 S{set.setNumber || setIndex + 1} PR
                            </strong>
                          ))}
                        </p>
                      );
                    })}
                  </div>
                )}
              </Card>
            ))}
          </section>
        </>
      )}
    </main>
  );
}
