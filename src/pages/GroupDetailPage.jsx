import React, { useState, useRef, useEffect } from 'react';
import { useLocation, useParams, useNavigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { useData } from '../contexts/DataContext';
import { useConfirmDialog } from '../contexts/ConfirmDialogContext';
import { 
  Users, 
  ArrowLeft, 
  Trophy, 
  MessageSquare, 
  Flame, 
  Camera, 
  Heart, 
  Send, 
  Copy, 
  Check, 
  Clock, 
  Weight, 
  Plus,
  Sparkles,
  TrendingUp,
  Dumbbell,
  ChevronRight,
  Layers,
  StickyNote,
  Repeat2,
  Zap,
  Award,
  Ruler,
  Settings,
  LogOut,
  ShieldAlert,
  ShieldCheck,
  UserMinus,
  Crown,
  Link,
  Image,
  Trash2,
  Share2,
  ChevronDown
} from 'lucide-react';
import Button from '../components/ui/Button';
import Card from '../components/ui/Card';
import Modal from '../components/ui/Modal';
import Avatar from '../components/ui/Avatar';
import WorkoutFeedCard from '../components/feed/WorkoutFeedCard';
import SharedProfileActivity from '../components/profile/SharedProfileActivity';
import { shareWorkoutLink } from '../utils/workoutSharing';
import { showToast } from '../contexts/ToastContext';
import { formatTime } from '../utils/dateHelpers';
import { calculateGroupMemberMetrics } from '../utils/groupMetrics';
import { formatExerciseDuration, getWorkoutFeedMetrics } from '../utils/workoutFeedMetrics';
import {
  deleteGroupChatImage,
  fetchCloudSharedProfiles,
  fetchUserFollowSummary,
  setUserFollow,
  uploadGroupChatImage
} from '../lib/supabase';
import './Groups.css';

export default function GroupDetailPage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const location = useLocation();
  const { user } = useAuth();
  const confirm = useConfirmDialog();
  const { 
    groups, 
    allGroups, 
    getGroupMessages, 
    sendMessage, 
    toggleFeedPostLike,
    addFeedPostComment,
    leaveGroup,
    deleteGroup,
    promoteMember,
    demoteMember,
    kickMember,
    transferGroupOwnership,
    deleteMessageForEveryone,
    routines,
    checkins,
    deleteCheckin,
    deleteGroupFeedPost,
    weeklySchedule,
    refreshGroupMessages
  } = useData();

  const group = (allGroups || []).find(g => g.id === id) || (groups || []).find(g => g.id === id) || groups[0];

  // Tabs: 'feed' (Detalhes), 'ranking' (Classificações), 'members' (Membros), 'chat' (Bate-papo)
  const [activeTab, setActiveTab] = useState(() => (
    new URLSearchParams(location.search).get('tab') === 'chat' ? 'chat' : 'feed'
  ));
  const [rankingCategory, setRankingCategory] = useState('consistency');
  const [isRankingExpanded, setIsRankingExpanded] = useState(false);
  const [volumeMuscleGroup, setVolumeMuscleGroup] = useState('Geral');
  const [strengthMuscleGroup, setStrengthMuscleGroup] = useState('Peito');
  const [chatInput, setChatInput] = useState('');
  const [isSendingImage, setIsSendingImage] = useState(false);
  const [copiedCode, setCopiedCode] = useState(false);
  const [copiedInviteLink, setCopiedInviteLink] = useState(false);
  const [commentInput, setCommentInput] = useState('');
  const [followSummary, setFollowSummary] = useState(null);
  const [isFollowLoading, setIsFollowLoading] = useState(false);
  const [sharedProfileRetry, setSharedProfileRetry] = useState(0);
  const [sharedProfilesState, setSharedProfilesState] = useState({
    groupId: null,
    fetchKey: null,
    loading: false,
    profiles: {},
    error: null
  });

  // Modal inspection states
  const [selectedPostId, setSelectedPostId] = useState(
    () => new URLSearchParams(location.search).get('workout')
  );
  const [selectedMember, setSelectedMember] = useState(null);
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);

  const chatBottomRef = useRef(null);
  const chatImageInputRef = useRef(null);
  const chatErrorNotifiedRef = useRef(false);
  const selectedMemberId = selectedMember?.id;
  const groupProfileFetchKey = JSON.stringify((group?.members || []).map(member => [
    member.id,
    member.profileVisibility || null
  ]));
  const sharedProfilesRequestKey = `${group?.id || ''}:${groupProfileFetchKey}:${sharedProfileRetry}`;
  const selectedPost = (group?.feed || []).find(post => post.id === selectedPostId) || null;
  const selectedPostMetrics = selectedPost ? getWorkoutFeedMetrics(selectedPost) : null;

  useEffect(() => {
    if (!group?.id || !new URLSearchParams(location.search).has('workout')) return;
    navigate(`/groups/${encodeURIComponent(group.id)}`, { replace: true });
  }, [group?.id, location.search, navigate]);

  // Group messages
  const messages = getGroupMessages(group?.id || '');

  useEffect(() => {
    if (activeTab !== 'chat' || !group?.id) return undefined;
    chatErrorNotifiedRef.current = false;
    const refresh = async () => {
      try {
        await refreshGroupMessages(group.id);
        chatErrorNotifiedRef.current = false;
      } catch (error) {
        console.error('Não foi possível carregar as mensagens do grupo:', error);
        if (!chatErrorNotifiedRef.current) {
          showToast('Não foi possível carregar as mensagens do grupo.', 'error');
          chatErrorNotifiedRef.current = true;
        }
      }
    };
    refresh();
    const interval = setInterval(refresh, 5000);
    return () => clearInterval(interval);
  }, [activeTab, group?.id, refreshGroupMessages]);

  useEffect(() => {
    let active = true;
    if (!selectedMemberId || selectedMemberId === user?.id) return () => { active = false; };
    fetchUserFollowSummary(selectedMemberId, user?.id)
      .then(summary => {
        if (active) setFollowSummary(summary);
      })
      .catch(error => {
        console.error('Não foi possível carregar os dados de seguidores:', error);
        if (active) showToast('Não foi possível carregar os dados de seguidores.', 'error');
      })
      .finally(() => {
        if (active) setIsFollowLoading(false);
      });

    return () => { active = false; };
  }, [selectedMemberId, user?.id]);

  useEffect(() => {
    let active = true;
    const profileIds = JSON.parse(groupProfileFetchKey).map(([memberId]) => memberId);
    if (!group?.id || profileIds.length === 0) return () => { active = false; };

    fetchCloudSharedProfiles(profileIds)
      .then(profiles => {
        if (active) setSharedProfilesState({
          groupId: group.id,
          fetchKey: sharedProfilesRequestKey,
          loading: false,
          profiles,
          error: null
        });
      })
      .catch(error => {
        console.error('Não foi possível carregar os dados compartilhados do grupo:', error);
        if (active) setSharedProfilesState({
          groupId: group.id,
          fetchKey: sharedProfilesRequestKey,
          loading: false,
          profiles: {},
          error
        });
      });

    return () => { active = false; };
  }, [group?.id, groupProfileFetchKey, sharedProfilesRequestKey]);

  // Auto-scroll chat
  useEffect(() => {
    if (activeTab === 'chat') {
      chatBottomRef.current?.scrollIntoView({ behavior: 'smooth' });
    }
  }, [messages, activeTab]);

  if (!group) {
    return (
      <div className="group-detail-page">
        <p>Grupo não encontrado.</p>
        <Button onClick={() => navigate('/groups')}>Voltar para Grupos</Button>
      </div>
    );
  }

  // Handle chat message
  const handleSendMessage = async (e) => {
    e.preventDefault();
    if (!chatInput.trim()) return;

    const sent = await sendMessage(group.id, {
      userId: user?.id,
      userName: user?.name || 'Atleta',
      userAvatar: user?.avatar,
      text: chatInput.trim()
    });

    if (sent) setChatInput('');
  };

  const handleSendChatImage = async (event) => {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file || !group?.id) return;
    setIsSendingImage(true);
    try {
      const uploaded = await uploadGroupChatImage(file, group.id);
      if (!uploaded) return;
      const sent = await sendMessage(group.id, {
        text: '',
        imagePath: uploaded.path,
        imageUrl: uploaded.url,
        imageSignedAt: uploaded.signedAt
      });
      if (!sent) await deleteGroupChatImage(uploaded.path);
    } finally {
      setIsSendingImage(false);
    }
  };

  const handleDeleteChatMessage = async (message) => {
    if (await confirm({
      title: 'Apagar mensagem',
      message: 'Apagar esta mensagem para todos? Ela será substituída por um aviso de mensagem apagada.',
      confirmLabel: 'Apagar',
      variant: 'danger'
    })) {
      deleteMessageForEveryone(group.id, message.id);
    }
  };

  const handleToggleFollow = async () => {
    if (!selectedMember || !user?.id || isFollowLoading) return;
    setIsFollowLoading(true);
    try {
      const summary = await setUserFollow(selectedMember.id, !followSummary?.isFollowing);
      setFollowSummary(summary);
    } catch (error) {
      console.error('Não foi possível atualizar o seguimento:', error);
      showToast('Não foi possível atualizar o seguimento.', 'error');
    } finally {
      setIsFollowLoading(false);
    }
  };

  const openMemberProfile = (member) => {
    setFollowSummary(null);
    setIsFollowLoading(Boolean(member && member.id !== user?.id));
    setSelectedMember(member);
  };

  const closeMemberProfile = () => {
    setSelectedMember(null);
    setFollowSummary(null);
    setIsFollowLoading(false);
  };

  // Toggle like
  const handleToggleLike = (postId, e) => {
    e?.stopPropagation();
    if (group?.id) {
      toggleFeedPostLike(group.id, postId);
    }
  };

  // Add Comment
  const handleAddComment = async (postId, e) => {
    e?.preventDefault();
    if (!commentInput.trim() || !group?.id) return;
    const text = commentInput.trim();
    const savedComment = await addFeedPostComment(group.id, postId, text);
    if (savedComment) setCommentInput('');
  };

  const handleGroupPostAuthorClick = (profileId) => {
    if (!profileId) return;
    setSelectedPostId(null);
    if (profileId === user?.id) {
      navigate('/profile');
      return;
    }
    const member = enrichedMembers.find(item => item.id === profileId);
    if (member) openMemberProfile(member);
    else navigate(`/profiles/${profileId}`);
  };

  const handleShareGroupWorkout = async (post) => {
    try {
      const result = await shareWorkoutLink(post, group.id);
      if (result.copied) showToast('Link do treino copiado.', 'success');
    } catch (error) {
      if (error?.name === 'AbortError') return;
      console.error('Não foi possível compartilhar o treino do grupo:', error);
      showToast(error.message || 'Não foi possível compartilhar o link.', 'error');
    }
  };

  const handleDeleteGroupWorkout = async (post) => {
    if (post.userId !== user?.id) return;
    const checkinId = post.checkinId || post.id;
    const checkin = checkins.find(item => item.id === checkinId);
    const message = checkin
      ? 'Apagar este treino do histórico e também dos feeds em que foi publicado?'
      : 'Apagar esta publicação do grupo?';
    if (!await confirm({
      title: 'Apagar publicação',
      message,
      confirmLabel: 'Apagar',
      variant: 'danger'
    })) return;

    try {
      const deleted = checkin
        ? await deleteCheckin(checkin.id)
        : await deleteGroupFeedPost(group.id, post.id);
      if (deleted === null || deleted === false) return;
      setSelectedPostId(null);
      if (!checkin) showToast('Publicação removida do grupo.', 'success');
    } catch (error) {
      console.error('Não foi possível apagar o treino do grupo:', error);
      showToast('Não foi possível apagar este treino. Tente novamente.', 'error');
    }
  };

  // Group Management Handlers
  const isCreator = group.createdBy === user?.id || (group.members || []).find(m => m.id === user?.id)?.isCreator;
  const isCurrentUserAdmin = isCreator || (group.members || []).find(m => m.id === user?.id)?.role === 'admin';

  const handleLeaveGroup = async () => {
    if (await confirm({
      title: 'Sair do grupo',
      message: `Tem certeza que deseja sair do grupo "${group.name}"?`,
      confirmLabel: 'Sair do grupo',
      variant: 'danger'
    })) {
      const left = await leaveGroup(group.id);
      if (!left) return;
      navigate('/groups');
    }
  };

  const handleDeleteGroup = async () => {
    if (await confirm({
      title: 'Excluir grupo definitivamente',
      message: `Deseja realmente excluir o grupo "${group.name}"? Esta ação não pode ser desfeita.`,
      confirmLabel: 'Excluir grupo',
      variant: 'danger'
    })) {
      await deleteGroup(group.id);
      navigate('/groups');
    }
  };

  const handlePromoteMember = async (member, e) => {
    e?.stopPropagation();
    await promoteMember(group.id, member.id);
  };

  const handleDemoteMember = async (member, e) => {
    e?.stopPropagation();
    await demoteMember(group.id, member.id);
  };

  const handleKickMember = async (member, e) => {
    e?.stopPropagation();
    if (await confirm({
      title: 'Remover membro',
      message: `Remover "${member.name}" do grupo?`,
      confirmLabel: 'Remover',
      variant: 'danger'
    })) {
      await kickMember(group.id, member.id);
    }
  };

  const handleTransferOwnership = async (member, e) => {
    e?.stopPropagation();
    if (await confirm({
      title: 'Transferir propriedade',
      message: `Deseja transferir a posse do grupo para "${member.name}"? Ele será o novo criador e dono.`,
      confirmLabel: 'Transferir',
      variant: 'danger'
    })) {
      await transferGroupOwnership(group.id, member.id);
    }
  };

  // Copy code
  const handleCopyInviteCode = async () => {
    try {
      await navigator.clipboard.writeText(group.inviteCode);
      setCopiedCode(true);
      setTimeout(() => setCopiedCode(false), 2000);
    } catch (error) {
      console.error('Não foi possível copiar o código do grupo:', error);
      showToast('Não foi possível copiar o código de convite.', 'error');
    }
  };

  const handleCopyInviteLink = async () => {
    const inviteLink = `${window.location.origin}/groups?join=${encodeURIComponent(group.inviteCode)}`;
    try {
      await navigator.clipboard.writeText(inviteLink);
      setCopiedInviteLink(true);
      setTimeout(() => setCopiedInviteLink(false), 2000);
      showToast('Link de convite copiado. Grupos privados continuam protegidos por senha.', 'success');
    } catch (error) {
      console.error('Não foi possível copiar o link de convite:', error);
      showToast('Não foi possível copiar o link de convite.', 'error');
    }
  };

  const MUSCLE_GROUPS_LIST = ['Geral', 'Peito', 'Costas', 'Levantamento Terra', 'Pernas', 'Ombros', 'Bíceps', 'Tríceps', 'Panturrilha'];
  const STRENGTH_MUSCLE_GROUPS = ['Peito', 'Costas', 'Levantamento Terra', 'Pernas', 'Ombros', 'Bíceps', 'Tríceps', 'Panturrilha'];

  // Get max recorded lift in muscle group
  const liveUserMetrics = calculateGroupMemberMetrics(
    checkins,
    weeklySchedule,
    new Date()
  );
  const getMemberStrength = (metrics, groupName) => (
    metrics.maxLiftsByMuscleGroup?.[groupName] || { name: 'Sem registro', weight: 0 }
  );

  // Enriched members data for fair rankings
  const enrichedMembers = (group.members || []).map(m => {
    const isSelf = m.id === user?.id;
    const sharedProfile = sharedProfilesState.groupId === group?.id &&
      sharedProfilesState.fetchKey === sharedProfilesRequestKey
      ? sharedProfilesState.profiles[m.id]
      : null;
    const canViewTrainingActivity = isSelf || Boolean(
      sharedProfile && Object.prototype.hasOwnProperty.call(sharedProfile, 'weekly_checkins')
    );
    const canViewTrainingVolume = isSelf || Boolean(
      sharedProfile && (
        Object.prototype.hasOwnProperty.call(sharedProfile, 'weekly_sets_by_muscle_group') ||
        Object.prototype.hasOwnProperty.call(sharedProfile, 'weekly_volume_kg') ||
        Object.prototype.hasOwnProperty.call(sharedProfile, 'max_lifts_by_muscle_group')
      )
    );
    const canViewPersonalRecords = isSelf || Boolean(
      sharedProfile && Object.prototype.hasOwnProperty.call(sharedProfile, 'prs_count')
    );
    const weeklyGoal = canViewTrainingActivity
      ? (isSelf ? (user?.weeklyGoal || 4) : (Number(sharedProfile?.weekly_goal) || 4))
      : null;
    const metrics = isSelf ? liveUserMetrics : {
      weeklyCheckins: sharedProfile?.weekly_checkins,
      streak: sharedProfile?.streak,
      weeklyStreak: sharedProfile?.weekly_streak,
      prsCount: sharedProfile?.prs_count,
      weeklySetsByMuscleGroup: sharedProfile?.weekly_sets_by_muscle_group,
      maxLiftsByMuscleGroup: sharedProfile?.max_lifts_by_muscle_group
    };
    const weeklyCheckins = canViewTrainingActivity ? Number(metrics.weeklyCheckins) || 0 : null;
    const consistencyRate = canViewTrainingActivity
      ? Math.min(100, Math.round((weeklyCheckins / (weeklyGoal || 4)) * 100))
      : null;
    const streak = canViewTrainingActivity ? Number(metrics.streak) || 0 : null;
    const weeklyStreak = canViewTrainingActivity ? Number(metrics.weeklyStreak) || 0 : null;
    const prsCount = canViewPersonalRecords ? Number(metrics.prsCount) || 0 : null;
    const currentGroupSets = canViewTrainingVolume
      ? Number(metrics.weeklySetsByMuscleGroup?.[volumeMuscleGroup]) || 0
      : null;
    const currentStrengthExercise = canViewTrainingVolume
      ? getMemberStrength(metrics, strengthMuscleGroup)
      : null;

    return {
      ...m,
      weeklyGoal,
      weeklyCheckins,
      consistencyRate,
      streak,
      weeklyStreak,
      prsCount,
      currentGroupSets,
      currentStrengthExercise,
      canViewTrainingActivity,
      canViewTrainingVolume,
      canViewPersonalRecords
    };
  });

  // Sorted members for ranking depending on category
  const sortedMembers = [...enrichedMembers].sort((a, b) => {
    if (rankingCategory === 'consistency') {
      if (a.canViewTrainingActivity !== b.canViewTrainingActivity) {
        return Number(b.canViewTrainingActivity) - Number(a.canViewTrainingActivity);
      }
      if (b.consistencyRate !== a.consistencyRate) {
        return (b.consistencyRate ?? -1) - (a.consistencyRate ?? -1);
      }
      return (b.streak || 0) - (a.streak || 0);
    }
    if (rankingCategory === 'volume') {
      if (a.canViewTrainingVolume !== b.canViewTrainingVolume) {
        return Number(b.canViewTrainingVolume) - Number(a.canViewTrainingVolume);
      }
      return (b.currentGroupSets || 0) - (a.currentGroupSets || 0);
    }
    if (rankingCategory === 'strength') {
      if (a.canViewTrainingVolume !== b.canViewTrainingVolume) {
        return Number(b.canViewTrainingVolume) - Number(a.canViewTrainingVolume);
      }
      return (b.currentStrengthExercise?.weight || 0) - (a.currentStrengthExercise?.weight || 0);
    }
    if (rankingCategory === 'prs') {
      if (a.canViewPersonalRecords !== b.canViewPersonalRecords) {
        return Number(b.canViewPersonalRecords) - Number(a.canViewPersonalRecords);
      }
      return (b.prsCount || 0) - (a.prsCount || 0);
    }
    if (rankingCategory === 'streak') {
      if (a.canViewTrainingActivity !== b.canViewTrainingActivity) {
        return Number(b.canViewTrainingActivity) - Number(a.canViewTrainingActivity);
      }
      return (b.streak || 0) - (a.streak || 0);
    }
    if (a.canViewTrainingActivity !== b.canViewTrainingActivity) {
      return Number(b.canViewTrainingActivity) - Number(a.canViewTrainingActivity);
    }
    return (b.weeklyCheckins || 0) - (a.weeklyCheckins || 0);
  });
  const canViewRankingData = member => (
    rankingCategory === 'prs'
      ? member.canViewPersonalRecords
      : rankingCategory === 'volume' || rankingCategory === 'strength'
        ? member.canViewTrainingVolume
        : member.canViewTrainingActivity
  );
  const rankedMembers = sortedMembers.filter(canViewRankingData);
  const rankByMemberId = new Map(rankedMembers.map((member, index) => [member.id, index + 1]));

  const ownLatestMeasurement = (user?.measurementsHistory || [])
    .slice()
    .sort((a, b) => new Date(b.date || b.createdAt) - new Date(a.date || a.createdAt))[0] || null;
  const selectedSharedProfile = selectedMemberId === user?.id
    ? {
      streak: liveUserMetrics.streak,
      weekly_streak: liveUserMetrics.weeklyStreak,
      weekly_checkins: liveUserMetrics.weeklyCheckins,
      weekly_goal: user?.weeklyGoal,
      weekly_volume_kg: liveUserMetrics.weeklyVolumeKg,
      weekly_sets_by_muscle_group: liveUserMetrics.weeklySetsByMuscleGroup,
      max_lifts_by_muscle_group: liveUserMetrics.maxLiftsByMuscleGroup,
      prs_count: liveUserMetrics.prsCount,
      measurements: ownLatestMeasurement
    }
    : sharedProfilesState.groupId === group?.id
      && sharedProfilesState.fetchKey === sharedProfilesRequestKey
      ? sharedProfilesState.profiles[selectedMemberId]
      : null;
  const isSelectedMemberSelf = selectedMemberId === user?.id;
  const selectedProfileCanViewActivity = Boolean(
    isSelectedMemberSelf ||
    (selectedSharedProfile && Object.prototype.hasOwnProperty.call(selectedSharedProfile, 'training_dates'))
  );
  const selectedProfileRoutines = isSelectedMemberSelf ? routines : selectedSharedProfile?.routines;
  const selectedProfileRoutinesAvailable = isSelectedMemberSelf || Array.isArray(selectedSharedProfile?.routines);
  const selectedProfileTrainingDates = isSelectedMemberSelf
    ? (checkins || []).filter(checkin => checkin.type !== 'cardio' && !checkin.isCardio).map(checkin => checkin.date)
    : selectedSharedProfile?.training_dates;
  const selectedProfileWeeklySchedule = isSelectedMemberSelf
    ? weeklySchedule
    : selectedSharedProfile?.weekly_schedule;
  const isSelectedProfileLoading = Boolean(
    selectedMemberId &&
    selectedMemberId !== user?.id &&
    (sharedProfilesState.groupId !== group?.id ||
      sharedProfilesState.fetchKey !== sharedProfilesRequestKey ||
      sharedProfilesState.loading)
  );
  const selectedProfileLoadError = Boolean(
    sharedProfilesState.groupId === group?.id &&
    sharedProfilesState.fetchKey === sharedProfilesRequestKey &&
    sharedProfilesState.error
  );
  const selectedProfileWeeklySets = selectedSharedProfile?.weekly_sets_by_muscle_group?.Geral;
  const selectedProfileTrainingStatsAvailable = Boolean(
    selectedSharedProfile &&
    (selectedSharedProfile.weekly_volume_kg !== undefined ||
      selectedProfileWeeklySets !== undefined ||
      selectedSharedProfile.prs_count !== undefined)
  );
  const selectedProfileHasMeasurementAccess = Boolean(
    selectedSharedProfile &&
    Object.prototype.hasOwnProperty.call(selectedSharedProfile, 'measurements')
  );
  const selectedProfileHasMeasurements = Boolean(
    selectedSharedProfile?.measurements &&
    Object.values(selectedSharedProfile.measurements).some(value => Number(value) > 0)
  );

  const currentUserMember = enrichedMembers.find(member => member.id === user?.id);
  const currentUserRole = isCreator || currentUserMember?.role === 'admin'
    ? 'Administrador'
    : 'Membro';

  // Helper to format date groups like "Ontem", "sábado, set. 19"
  const getDateLabel = (dateStr) => {
    const d = new Date(dateStr);
    const nowLabel = new Date();
    const diffDays = Math.floor((nowLabel - d) / (1000 * 60 * 60 * 24));
    
    if (diffDays === 0) return 'Hoje';
    if (diffDays === 1) return 'Ontem';
    return d.toLocaleDateString('pt-BR', { weekday: 'long', month: 'short', day: 'numeric' });
  };

  // Group feed posts by date label
  const groupedFeed = (group.feed || []).filter(post => post.type !== 'justified_absence' && post.type !== 'cardio').reduce((acc, post) => {
    const label = getDateLabel(post.date);
    if (!acc[label]) acc[label] = [];
    acc[label].push(post);
    return acc;
  }, {});

  return (
    <div className="group-detail-page animate-fade-in">
      {/* Top Bar with Group Photo */}
      <header className="group-top-bar-v3">
        <button className="top-back-btn" onClick={() => navigate('/groups')}>
          <ArrowLeft size={20} />
          <span>Grupos</span>
        </button>

        <div className="top-group-title-wrap">
          {group.photoUrl ? (
            <img src={group.photoUrl} alt={group.name} className="top-group-photo-thumb" />
          ) : (
            <div className="top-group-avatar-icon">
              <Users size={18} />
            </div>
          )}
          <h2 className="top-group-title">{group.name}</h2>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <button className="top-invite-btn" onClick={handleCopyInviteCode} title="Copiar código">
            {copiedCode ? <Check size={16} className="text-success" /> : <Copy size={16} />}
            <span>{group.inviteCode}</span>
          </button>
          <button className="top-invite-btn" onClick={handleCopyInviteLink} title="Copiar link de convite">
            {copiedInviteLink ? <Check size={16} className="text-success" /> : <Link size={16} />}
          </button>
          <button className="top-invite-btn" onClick={() => setIsSettingsOpen(true)} title="Configurações do Grupo" style={{ padding: '6px 10px' }}>
            <Settings size={16} />
          </button>
        </div>
      </header>

      <div className="leader-comparison-card" role="status" aria-label="Resumo do grupo">
        <div 
          className="leader-pill-item"
          style={{ cursor: 'default' }}
        >
          <Users size={20} />
          <div className="leader-pill-meta">
            <strong>{enrichedMembers.length}</strong>
            <span>Membros no grupo</span>
          </div>
        </div>

        <div className="leader-pill-divider" />

        <div 
          className="leader-pill-item"
          style={{ cursor: 'default' }}
        >
          {isCreator || currentUserMember?.role === 'admin' ? <Crown size={20} /> : <Users size={20} />}
          <div className="leader-pill-meta">
            <strong>Sua função</strong>
            <span>{currentUserRole}</span>
          </div>
        </div>
      </div>

      {/* 4 Tabs: Detalhes, Classificações, Membros, Bate-papo */}
      <nav className="group-subtabs-nav">
        <button 
          className={`subtab-btn ${activeTab === 'feed' ? 'active' : ''}`}
          onClick={() => setActiveTab('feed')}
        >
          <Layers size={16} />
          <span>Detalhes (Feed)</span>
        </button>

        <button 
          className={`subtab-btn ${activeTab === 'ranking' ? 'active' : ''}`}
          onClick={() => setActiveTab('ranking')}
        >
          <Trophy size={16} />
          <span>Classificações</span>
        </button>

        <button 
          className={`subtab-btn ${activeTab === 'members' ? 'active' : ''}`}
          onClick={() => setActiveTab('members')}
        >
          <Users size={16} />
          <span>Membros ({enrichedMembers.length})</span>
        </button>

        <button 
          className={`subtab-btn ${activeTab === 'chat' ? 'active' : ''}`}
          onClick={() => setActiveTab('chat')}
        >
          <MessageSquare size={16} />
          <span>Bate-papo</span>
        </button>
      </nav>

      {/* TAB 1: FEED NO ESTILO DA IMAGEM 3 */}
      {activeTab === 'feed' && (
        <div className="group-tab-container animate-fade-in">
          {Object.keys(groupedFeed).length === 0 ? (
            <Card className="empty-state-card" padding="lg">
              <Camera size={44} className="text-muted" />
              <h3>Nenhum treino no feed ainda</h3>
              <p>Inicie uma rotina para que o treino apareça aqui com foto e cargas!</p>
              <Button 
                variant="primary" 
                onClick={() => navigate('/routines')}
                className="mt-md"
              >
                Começar Rotina
              </Button>
            </Card>
          ) : (
            <div className="feed-sections-stack">
              {Object.entries(groupedFeed).map(([dateLabel, posts]) => (
                <div key={dateLabel} className="feed-date-group">
                  <span className="feed-date-header">{dateLabel}</span>

                  <div className="feed-cards-compact-list workout-group-feed-list">
                    {posts.map(post => (
                      <WorkoutFeedCard
                        key={post.id}
                        post={post}
                        currentUserId={user?.id}
                        onLike={handleToggleLike}
                        onOpen={() => setSelectedPostId(post.id)}
                        onAuthorClick={handleGroupPostAuthorClick}
                        onShare={handleShareGroupWorkout}
                        onDelete={handleDeleteGroupWorkout}
                      />
                    ))}
                  </div>
                </div>
              ))}
            </div>
          )}

          {/* Floating action button (+) to quickly start routine */}
          <button 
            className="fab-start-workout-btn"
            onClick={() => navigate('/routines')}
            title="Começar Novo Treino"
          >
            <Plus size={26} />
          </button>
        </div>
      )}

      {/* TAB 2: CLASSIFICAÇÕES (RANKING COM CATEGORIAS E GRUPOS MUSCULARES) */}
      {activeTab === 'ranking' && (
        <div className="group-tab-container ranking-tab-content">
          {sharedProfilesState.groupId === group?.id &&
            sharedProfilesState.fetchKey === sharedProfilesRequestKey &&
            sharedProfilesState.error && (
            <div className="group-cloud-error" role="alert">
              <p>Não foi possível carregar as métricas compartilhadas.</p>
              <details>
                <summary>Detalhes do Supabase</summary>
                <p>{sharedProfilesState.error.message || 'Falha ao consultar o perfil compartilhado.'}</p>
                <small>Se o erro mencionar função ou coluna ausente, execute novamente o arquivo supabase_schema.sql.</small>
              </details>
              <Button
                type="button"
                variant="secondary"
                size="sm"
                onClick={() => setSharedProfileRetry(value => value + 1)}
              >
                Tentar novamente
              </Button>
            </div>
          )}
          {/* Sub-categories selector */}
          <div className="ranking-category-tabs">
            <button 
              className={`ranking-cat-btn ${rankingCategory === 'consistency' ? 'active' : ''}`}
              onClick={() => setRankingCategory('consistency')}
            >
              <Flame size={15} />
              <span>Consistência semanal</span>
            </button>
            <button 
              className={`ranking-cat-btn ${rankingCategory === 'volume' ? 'active' : ''}`}
              onClick={() => setRankingCategory('volume')}
            >
              <Layers size={15} />
              <span>Séries Semanais</span>
            </button>
            <button 
              className={`ranking-cat-btn ${rankingCategory === 'strength' ? 'active' : ''}`}
              onClick={() => setRankingCategory('strength')}
            >
              <Dumbbell size={15} />
              <span>Mais Forte</span>
            </button>
            <button 
              className={`ranking-cat-btn ${rankingCategory === 'prs' ? 'active' : ''}`}
              onClick={() => setRankingCategory('prs')}
            >
              <Award size={15} />
              <span>Mais PRs Batidos</span>
            </button>
            <button 
              className={`ranking-cat-btn ${rankingCategory === 'streak' ? 'active' : ''}`}
              onClick={() => setRankingCategory('streak')}
            >
              <Zap size={15} />
              <span>Dias Seguidos</span>
            </button>
          </div>

          {/* Sub-selector for Sets/Volume by Muscle Group */}
          {rankingCategory === 'volume' && (
            <div className="muscle-group-subselector animate-fade-in" style={{
              display: 'flex',
              gap: 8,
              overflowX: 'auto',
              padding: '10px 4px',
              marginBottom: 16
            }}>
              {MUSCLE_GROUPS_LIST.map(mg => (
                <button
                  key={mg}
                  type="button"
                  onClick={() => setVolumeMuscleGroup(mg)}
                  style={{
                    padding: '6px 14px',
                    borderRadius: 'var(--radius-full)',
                    fontSize: '0.8125rem',
                    fontWeight: 600,
                    border: volumeMuscleGroup === mg ? '1.5px solid var(--accent)' : '1px solid var(--border-color)',
                    background: volumeMuscleGroup === mg ? 'var(--accent-muted)' : 'var(--bg-elevated)',
                    color: volumeMuscleGroup === mg ? 'var(--accent)' : 'var(--text-secondary)',
                    cursor: 'pointer',
                    whiteSpace: 'nowrap',
                    transition: 'all 0.15s ease'
                  }}
                >
                  {mg === 'Geral' ? '🔥 Todas as Séries' : mg === 'Levantamento Terra' ? '🏋️ Terra / Deadlift' : mg}
                </button>
              ))}
            </div>
          )}

          {/* Sub-selector for Strength by Muscle Group */}
          {rankingCategory === 'strength' && (
            <div className="muscle-group-subselector animate-fade-in" style={{
              display: 'flex',
              flexDirection: 'column',
              gap: 8,
              marginBottom: 16
            }}>
              <div style={{
                display: 'flex',
                gap: 8,
                overflowX: 'auto',
                padding: '4px 2px'
              }}>
                {STRENGTH_MUSCLE_GROUPS.map(mg => (
                  <button
                    key={mg}
                    type="button"
                    onClick={() => setStrengthMuscleGroup(mg)}
                    style={{
                      padding: '6px 14px',
                      borderRadius: 'var(--radius-full)',
                      fontSize: '0.8125rem',
                      fontWeight: 600,
                      border: strengthMuscleGroup === mg ? '1.5px solid var(--accent)' : '1px solid var(--border-color)',
                      background: strengthMuscleGroup === mg ? 'var(--accent-muted)' : 'var(--bg-elevated)',
                      color: strengthMuscleGroup === mg ? 'var(--accent)' : 'var(--text-secondary)',
                      cursor: 'pointer',
                      whiteSpace: 'nowrap',
                      transition: 'all 0.15s ease'
                    }}
                  >
                    🏋️ {mg === 'Levantamento Terra' ? 'Terra / Deadlift' : mg}
                  </button>
                ))}
              </div>
              <span style={{ fontSize: '0.75rem', color: 'var(--text-tertiary)', fontStyle: 'italic' }}>
                ℹ️ Exibição informativa de cargas máximas registradas para <strong>{strengthMuscleGroup === 'Levantamento Terra' ? 'Levantamento Terra (Deadlift)' : strengthMuscleGroup}</strong>. Não é uma disputa direta, pois os exercícios e aparelhos diferem entre atletas.
              </span>
            </div>
          )}

          {rankedMembers.length > 0 ? (
            <div className={`ranking-podium ${rankedMembers.length === 1 ? 'ranking-podium-one' : ''} ${rankedMembers.length === 2 ? 'ranking-podium-two' : ''}`}>
            {rankedMembers.slice(0, 3).map((member, idx) => {
              const rank = idx + 1;

              return (
                <div 
                  key={member.id} 
                  className={`podium-card podium-rank-${rank}`}
                  onClick={() => openMemberProfile(member)}
                  style={{ cursor: 'pointer' }}
                >
                  <div className="podium-rank-badge">
                    {rank === 1 && '🥇 1º'}
                    {rank === 2 && '🥈 2º'}
                    {rank === 3 && '🥉 3º'}
                  </div>
                  <Avatar src={member.avatar} name={member.name} size="lg" />
                  <span className="podium-name">{member.name}</span>

                  {/* Dynamic metric based on category */}
                  <div className="podium-score">
                    {rankingCategory === 'consistency' && (
                      <>
                        <strong>{member.canViewTrainingActivity ? `${member.consistencyRate}%` : 'Privado'}</strong>
                        <span>{member.canViewTrainingActivity ? `${member.weeklyCheckins}/${member.weeklyGoal} meta` : 'Dados ocultos pelo atleta'}</span>
                      </>
                    )}
                    {rankingCategory === 'prs' && (
                      <>
                        <strong>{member.canViewPersonalRecords ? member.prsCount : 'Privado'}</strong>
                        <span>{member.canViewPersonalRecords ? 'PRs batidos 🏆' : 'Dados ocultos pelo atleta'}</span>
                      </>
                    )}
                    {rankingCategory === 'streak' && (
                      <>
                        <strong>{member.canViewTrainingActivity ? `${member.streak}d` : 'Privado'}</strong>
                        <span>{member.canViewTrainingActivity ? 'dias seguidos ⚡' : 'Dados ocultos pelo atleta'}</span>
                      </>
                    )}
                    {rankingCategory === 'volume' && (
                      <>
                        <strong>{member.canViewTrainingVolume ? member.currentGroupSets || 0 : 'Privado'}</strong>
                        <span>{member.canViewTrainingVolume ? (member.currentGroupSets === 1 ? 'série feita' : 'séries na semana') + ' ⚡' : 'Dados ocultos pelo atleta'}</span>
                      </>
                    )}
                    {rankingCategory === 'strength' && (
                      <>
                        <strong>{!member.canViewTrainingVolume ? 'Privado' : member.currentStrengthExercise?.weight > 0 ? `${member.currentStrengthExercise.weight} kg` : '—'}</strong>
                        <span className="podium-sublabel">{!member.canViewTrainingVolume ? 'Dados ocultos pelo atleta' : member.currentStrengthExercise?.weight > 0 ? member.currentStrengthExercise?.name : 'Sem registro'}</span>
                      </>
                    )}
                  </div>

                  {member.canViewTrainingActivity && member.weeklyStreak > 0 && (
                    <span className="podium-streak">
                      <Flame size={12} /> {member.weeklyStreak} sem
                    </span>
                  )}
                </div>
              );
            })}
            </div>
          ) : (
            <Card className="ranking-table-card" padding="md">
              <p className="text-tertiary">Nenhum atleta compartilhou dados para esta classificação.</p>
            </Card>
          )}

          <button
            type="button"
            className="ranking-full-toggle"
            onClick={() => setIsRankingExpanded(expanded => !expanded)}
            aria-expanded={isRankingExpanded}
            aria-controls="group-ranking-full-list"
          >
            {isRankingExpanded
              ? 'Ocultar classificação completa'
              : `Ver classificação completa · ${sortedMembers.length} atletas`}
            <ChevronDown size={17} className={isRankingExpanded ? 'is-expanded' : ''} />
          </button>

          <div id="group-ranking-full-list">
            {isRankingExpanded && (
              <Card className="ranking-table-card animate-fade-in" padding="none">
              <div className="ranking-table-header">
                <span className="col-rank">Pos</span>
                <span className="col-user">Atleta</span>
                <span className="col-streak"><span className="ranking-full-label">Semanas seguidas</span><span className="ranking-short-label">Sem.</span></span>
                <span className="col-checkins">
                  <span className="ranking-full-label">
                    {rankingCategory === 'consistency' && 'Meta Cumprida'}
                    {rankingCategory === 'prs' && 'Recordes Pessoais (PRs)'}
                    {rankingCategory === 'streak' && 'Sequência Diária'}
                    {rankingCategory === 'volume' && `Séries Semanais (${volumeMuscleGroup === 'Levantamento Terra' ? 'Terra/Deadlift' : volumeMuscleGroup})`}
                    {rankingCategory === 'strength' && `Maior Carga (${strengthMuscleGroup === 'Levantamento Terra' ? 'Terra/Deadlift' : strengthMuscleGroup})`}
                  </span>
                  <span className="ranking-short-label">Resultado</span>
                </span>
              </div>

              <div className="ranking-table-body">
                {sortedMembers.map(member => {
                  const isCurrentUser = member.id === user?.id;
                  const rank = rankByMemberId.get(member.id);

                  return (
                    <div
                      key={member.id}
                      className={`ranking-table-row ${isCurrentUser ? 'ranking-row-current' : ''} ${rank ? '' : 'ranking-row-private'}`}
                      onClick={() => openMemberProfile(member)}
                      style={{ cursor: 'pointer' }}
                    >
                      <span className="col-rank">{rank ? `#${rank}` : '—'}</span>
                      <div className="col-user ranking-user-cell">
                        <Avatar src={member.avatar} name={member.name} size="sm" />
                        <div className="ranking-user-meta">
                          <span className="ranking-name-text">
                            {member.name} {isCurrentUser && <span className="you-pill">Você</span>}
                          </span>
                          <span className="ranking-username">@{member.username}</span>
                        </div>
                      </div>
                      <div className="col-streak">
                        {!member.canViewTrainingActivity ? 'Privado' : member.weeklyStreak > 0 ? (
                          <span className="streak-tag"><Flame size={12} /> {member.weeklyStreak} sem</span>
                        ) : '-'}
                      </div>
                      <div className="col-checkins">
                        {rankingCategory === 'consistency' && (
                          <span className="checkins-badge-pill">
                            {member.canViewTrainingActivity
                              ? `${member.consistencyRate}% (${member.weeklyCheckins}/${member.weeklyGoal}d)`
                              : 'Privado'}
                          </span>
                        )}
                        {rankingCategory === 'prs' && (
                          <span className="checkins-badge-pill pr-badge-highlight">
                            {member.canViewPersonalRecords ? `🏆 ${member.prsCount} PRs batidos` : 'Privado'}
                          </span>
                        )}
                        {rankingCategory === 'streak' && (
                          <span className="checkins-badge-pill streak-badge-highlight">
                            {member.canViewTrainingActivity
                              ? `⚡ ${member.streak} ${member.streak === 1 ? 'dia seguido' : 'dias seguidos'}`
                              : 'Privado'}
                          </span>
                        )}
                        {rankingCategory === 'volume' && (
                          <span className="checkins-badge-pill" style={{ color: '#38bdf8', borderColor: 'rgba(56, 189, 248, 0.3)' }}>
                            {member.canViewTrainingVolume
                              ? <><strong>{member.currentGroupSets || 0}</strong> {member.currentGroupSets === 1 ? 'série' : 'séries'}</>
                              : 'Privado'}
                          </span>
                        )}
                        {rankingCategory === 'strength' && (
                          <span className="checkins-badge-pill">
                            {!member.canViewTrainingVolume ? 'Privado' : member.currentStrengthExercise?.weight > 0 ? (
                              <><strong>{member.currentStrengthExercise.weight} kg</strong> · {member.currentStrengthExercise.name}</>
                            ) : (
                              <span className="text-muted">— Sem registro</span>
                            )}
                          </span>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
              </Card>
            )}
          </div>
        </div>
      )}

      {/* TAB 3: MEMBROS DO GRUPO (VER MEMBROS E PERFIS) */}
      {activeTab === 'members' && (
        <div className="group-tab-container members-tab-content animate-fade-in">
          <div className="members-header-banner" style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            marginBottom: 16,
            flexWrap: 'wrap',
            gap: 12
          }}>
            <div>
              <h3 style={{ fontSize: '1.125rem', fontWeight: 700, color: 'var(--text-primary)' }}>
                Membros do Grupo ({enrichedMembers.length})
              </h3>
              <p style={{ fontSize: '0.8125rem', color: 'var(--text-secondary)' }}>
                Clique em qualquer membro para ver suas rotinas, evolução e calendário de treinos.
              </p>
            </div>
            {group.pin && (
              <span style={{
                fontSize: '0.75rem',
                fontWeight: 600,
                padding: '4px 10px',
                background: 'var(--bg-elevated)',
                border: '1px solid var(--border-color)',
                borderRadius: 'var(--radius-full)',
                color: 'var(--text-secondary)'
              }}>
                🔒 Grupo com Senha PIN
              </span>
            )}
          </div>

          <div className="members-grid-cards" style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))',
            gap: 12
          }}>
            {enrichedMembers.map(member => {
              const isCurrentUser = member.id === user?.id;
              const isAdmin = member.role === 'admin' || member.id === group.createdBy;

              return (
                <Card 
                  key={member.id} 
                  padding="md" 
                  className={`member-info-card ${isCurrentUser ? 'is-self' : ''}`}
                  onClick={() => openMemberProfile(member)}
                  style={{
                    cursor: 'pointer',
                    display: 'flex',
                    flexDirection: 'column',
                    gap: 12,
                    transition: 'all 0.15s ease'
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                    <Avatar src={member.avatar} name={member.name} size="md" />
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                        <strong style={{ fontSize: '0.9375rem', color: 'var(--text-primary)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                          {member.name}
                        </strong>
                        {isCurrentUser && (
                          <span style={{ fontSize: '0.6875rem', background: 'var(--accent-muted)', color: 'var(--accent)', padding: '2px 6px', borderRadius: 4, fontWeight: 700 }}>
                            Você
                          </span>
                        )}
                        {isAdmin && (
                          <span style={{ fontSize: '0.6875rem', background: 'rgba(234, 179, 8, 0.15)', color: '#eab308', padding: '2px 6px', borderRadius: 4, fontWeight: 700 }}>
                            Admin
                          </span>
                        )}
                      </div>
                      <span style={{ fontSize: '0.8125rem', color: 'var(--text-tertiary)' }}>
                        @{member.username || 'atleta'}
                      </span>
                    </div>
                  </div>

                  <div style={{
                    display: 'grid',
                    gridTemplateColumns: '1fr 1fr 1fr',
                    gap: 8,
                    background: 'var(--bg-elevated)',
                    padding: '8px 10px',
                    borderRadius: 'var(--radius-sm)',
                    textAlign: 'center',
                    fontSize: '0.75rem'
                  }}>
                    <div>
                      <span style={{ color: 'var(--text-tertiary)', display: 'block' }}>Meta</span>
                      <strong style={{ color: 'var(--text-primary)', fontSize: '0.875rem' }}>
                        {member.canViewTrainingActivity ? `${member.weeklyCheckins || 0}/${member.weeklyGoal || 4}x` : 'Privado'}
                      </strong>
                    </div>
                    <div>
                      <span style={{ color: 'var(--text-tertiary)', display: 'block' }}>Streak</span>
                      <strong style={{ color: '#f59e0b', fontSize: '0.875rem' }}>
                        {member.canViewTrainingActivity ? `🔥 ${member.streak || 0}d` : 'Privado'}
                      </strong>
                    </div>
                    <div>
                      <span style={{ color: 'var(--text-tertiary)', display: 'block' }}>Séries</span>
                      <strong style={{ color: '#38bdf8', fontSize: '0.875rem' }}>
                        {member.canViewTrainingVolume ? member.currentGroupSets || 0 : 'Privado'}
                      </strong>
                    </div>
                  </div>

                  {/* Admin Actions for this member */}
                  {isCurrentUserAdmin && !isCurrentUser && (
                    <div 
                      style={{ 
                        display: 'flex', 
                        flexWrap: 'wrap', 
                        gap: 6, 
                        borderTop: '1px solid var(--border-color)', 
                        paddingTop: 8,
                        marginTop: 2 
                      }}
                      onClick={(e) => e.stopPropagation()}
                    >
                      {isCreator && (
                        <>
                          {member.role === 'admin' ? (
                            <button
                              type="button"
                              className="btn btn-ghost"
                              style={{ fontSize: '0.75rem', padding: '4px 8px', height: 'auto', color: 'var(--text-secondary)' }}
                              onClick={(e) => handleDemoteMember(member, e)}
                            >
                              <ShieldCheck size={13} style={{ marginRight: 4 }} />
                              Rebaixar para Membro
                            </button>
                          ) : (
                            <button
                              type="button"
                              className="btn btn-ghost"
                              style={{ fontSize: '0.75rem', padding: '4px 8px', height: 'auto', color: '#eab308' }}
                              onClick={(e) => handlePromoteMember(member, e)}
                            >
                              <ShieldCheck size={13} style={{ marginRight: 4 }} />
                              Promover a Admin
                            </button>
                          )}
                          <button
                            type="button"
                            className="btn btn-ghost"
                            style={{ fontSize: '0.75rem', padding: '4px 8px', height: 'auto', color: 'var(--accent)' }}
                            onClick={(e) => handleTransferOwnership(member, e)}
                          >
                            <Crown size={13} style={{ marginRight: 4 }} />
                            Transferir Posse
                          </button>
                        </>
                      )}
                      <button
                        type="button"
                        className="btn btn-ghost"
                        style={{ fontSize: '0.75rem', padding: '4px 8px', height: 'auto', color: '#ef4444' }}
                        onClick={(e) => handleKickMember(member, e)}
                      >
                        <UserMinus size={13} style={{ marginRight: 4 }} />
                        Remover do Grupo
                      </button>
                    </div>
                  )}

                  <div style={{ display: 'flex', justifyContent: 'flex-end', alignItems: 'center', gap: 6, fontSize: '0.8125rem', color: 'var(--accent)', fontWeight: 600 }}>
                    <span>Ver Perfil & Treinos</span>
                    <ChevronRight size={14} />
                  </div>
                </Card>
              );
            })}
          </div>
        </div>
      )}

      {/* TAB 3: BATE-PAPO (CHAT) */}
      {activeTab === 'chat' && (
        <div className="group-tab-container chat-tab-content animate-fade-in">
          <Card className="chat-container-card" padding="none">
            <div className="chat-messages-area">
              <div className="chat-system-notice">
                <span>Conversa do grupo "{group.name}".</span>
              </div>

              {messages.map(msg => {
                const isMe = msg.userId === user?.id;
                const openAuthorProfile = () => {
                  if (isMe) {
                    navigate('/profile');
                    return;
                  }
                  const member = enrichedMembers.find(mb => mb.id === msg.userId);
                  if (member) openMemberProfile(member);
                  else if (msg.userId) navigate(`/profiles/${msg.userId}`);
                };
                return (
                  <div key={msg.id} className={`chat-bubble-row ${isMe ? 'chat-row-me' : 'chat-row-other'}`}>
                    <button
                      type="button"
                      onClick={openAuthorProfile}
                      aria-label={`Abrir perfil de ${msg.userName || 'atleta'}`}
                      style={{ border: 0, background: 'transparent', padding: 0, cursor: 'pointer' }}
                    >
                      <Avatar src={msg.userAvatar} name={msg.userName} size="sm" />
                    </button>
                    <div className={`chat-bubble ${isMe ? 'bubble-me' : 'bubble-other'}`}>
                      <button
                        type="button"
                        className="bubble-author"
                        onClick={openAuthorProfile}
                      >
                        {msg.userName || 'Atleta'}{isMe ? ' (EU)' : ''}
                      </button>
                      {msg.deleted ? (
                        <p className="bubble-text" style={{ fontStyle: 'italic', opacity: 0.75 }}>Esta mensagem foi apagada.</p>
                      ) : (
                        <>
                          {msg.imageUrl && (
                            <img
                              src={msg.imageUrl}
                              alt="Imagem enviada no chat"
                              style={{ display: 'block', maxWidth: 'min(100%, 280px)', maxHeight: 280, borderRadius: 10, margin: '6px 0', objectFit: 'cover' }}
                            />
                          )}
                          {msg.text && <p className="bubble-text">{msg.text}</p>}
                        </>
                      )}
                      <span className="bubble-time">{formatTime(msg.timestamp)}</span>
                      {isMe && !msg.deleted && (
                        <button
                          type="button"
                          onClick={() => handleDeleteChatMessage(msg)}
                          aria-label="Apagar mensagem para todos"
                          title="Apagar para todos"
                          style={{ display: 'block', marginLeft: 'auto', border: 0, padding: 4, color: 'inherit', background: 'transparent', opacity: 0.7, cursor: 'pointer' }}
                        >
                          <Trash2 size={13} />
                        </button>
                      )}
                    </div>
                  </div>
                );
              })}
              <div ref={chatBottomRef} />
            </div>

            <form className="chat-input-bar" onSubmit={handleSendMessage}>
              <input
                ref={chatImageInputRef}
                type="file"
                accept="image/jpeg,image/png,image/webp,image/gif"
                onChange={handleSendChatImage}
                style={{ display: 'none' }}
              />
              <button
                type="button"
                className="chat-send-btn"
                onClick={() => chatImageInputRef.current?.click()}
                disabled={isSendingImage}
                aria-label="Enviar imagem"
                title="Enviar imagem (até 5 MB)"
              >
                <Image size={18} />
              </button>
              <input 
                type="text"
                className="chat-text-input"
                placeholder="Mensagem para o grupo..."
                aria-label="Mensagem para o grupo"
                value={chatInput}
                onChange={e => setChatInput(e.target.value)}
              />
              <button type="submit" className="chat-send-btn" disabled={!chatInput.trim()}>
                <Send size={18} />
              </button>
            </form>
          </Card>
        </div>
      )}

      {/* MODAL: DETALHES COMPLETOS DA FICHA DE TREINO (Idêntico ao Print 5 com destaque de evolução) */}
      {selectedPost && (
        <Modal
          isOpen={!!selectedPost}
          onClose={() => {
            setSelectedPostId(null);
            setCommentInput('');
          }}
          title={`Ficha: ${selectedPost.title || selectedPost.routineName || 'Treino Concluído'}`}
          size="md"
        >
          <div className="post-detail-modal-body">
            {/* Big Photo Proof */}
            {selectedPost.photoUrl && (
              <div className="modal-post-photo-wrap">
                <img src={selectedPost.photoUrl} alt="Comprovante de treino" />
                <div className="photo-stamp-overlay">
                  <Check size={12} /> BATE PONTO CONFIRMADO
                </div>
              </div>
            )}

            {/* Quick Profile Link Button */}
            <button 
              type="button" 
              className="modal-view-profile-btn"
              onClick={() => {
                setSelectedPostId(null);
                if (selectedPost.userId === user?.id) {
                  navigate('/profile');
                  return;
                }
                const author = enrichedMembers.find(m => m.id === selectedPost.userId);
                if (author) openMemberProfile(author);
                else if (selectedPost.userId) navigate(`/profiles/${selectedPost.userId}`);
              }}
            >
              <Avatar src={selectedPost.userAvatar} name={selectedPost.userName} size="sm" />
              <div className="modal-view-profile-info">
                <strong>Ver perfil & calendário de {selectedPost.userName}</strong>
                <span>Toque para inspecionar frequência e estatísticas</span>
              </div>
              <ChevronRight size={18} />
            </button>

            {/* Metrics Chips */}
            <div className="modal-post-chips">
              <span className="modal-chip"><Clock size={13} /> {selectedPost.durationMinutes || 0} min</span>
              <span className="modal-chip"><Weight size={13} /> {selectedPost.showWeights === false || selectedPost.totalVolumeKg === undefined ? 'Privado' : `${Number(selectedPost.totalVolumeKg || 0).toLocaleString('pt-BR')} kg`}</span>
              <span className="modal-chip"><Sparkles size={13} /> {selectedPostMetrics.sets} séries</span>
              <span className="modal-chip"><Repeat2 size={13} /> {selectedPostMetrics.reps} reps</span>
              <span className="modal-chip"><Award size={13} /> {selectedPostMetrics.personalRecords === null ? 'PRs privados' : `${selectedPostMetrics.personalRecords} PRs`}</span>
            </div>

            {selectedPost.showMuscleStats !== false && (
              <section className="modal-muscle-breakdown">
                <h4>Divisão muscular</h4>
                {selectedPostMetrics.muscleStats.length ? (
                  selectedPostMetrics.muscleStats.map(muscle => {
                    const totalSets = selectedPostMetrics.muscleStats.reduce((total, item) => total + item.sets, 0);
                    const percent = totalSets ? Math.round((muscle.sets / totalSets) * 100) : 0;
                    return (
                      <div className="modal-muscle-row" key={muscle.name}>
                        <div>
                          <strong>{muscle.name}</strong>
                          <span>{muscle.sets} séries{muscle.reps > 0 ? ` · ${muscle.reps} reps` : ''}</span>
                        </div>
                        <div className="modal-muscle-bar"><span style={{ width: `${percent}%` }} /></div>
                      </div>
                    );
                  })
                ) : (
                  <p className="text-tertiary">Sem divisão muscular registrada.</p>
                )}
              </section>
            )}

            {/* Progression Highlight if any */}
            {selectedPost.progressNote && (
              <div className="modal-progression-box">
                <TrendingUp size={16} className="text-success" />
                <div>
                  <strong>Evolução Registrada:</strong>
                  <p>{selectedPost.progressNote}</p>
                </div>
              </div>
            )}

            {/* Personal Observation Note */}
            {selectedPost.notes && (
              <div className="modal-notes-box">
                <strong>OBSERVAÇÕES DO ATLETA:</strong>
                <p>"{selectedPost.notes}"</p>
              </div>
            )}

            {/* Ficha Completa de Exercícios no Formato Exato do Print 5 */}
            {selectedPost.exercises && selectedPost.exercises.length > 0 && (
              <div className="modal-exercises-breakdown">
                <h4>Ficha Completa de Exercícios:</h4>
                <div className="modal-exercises-cards-stack">
                  {selectedPost.exercises.map((ex, idx) => (
                    <div key={idx} className="post-exercise-detail-card">
                      <div className="post-exercise-detail-header">
                        <span className="post-exercise-number">{idx + 1}</span>
                        <div className="post-exercise-titles">
                          <span className="post-exercise-group-tag">{ex.muscleGroup || 'PEITO'}</span>
                          <h4 className="post-exercise-title-text">{ex.name}</h4>
                        </div>
                      </div>

                      <div className="post-exercise-sets-table">
                        <div className="post-sets-table-head">
                          <span>Série</span>
                          {ex.trackingType === 'duration' || ex.sets?.some(set => Number(set.durationSeconds) > 0) ? (
                            <span className="post-set-duration">Tempo</span>
                          ) : (
                            <>
                              <span>Carga</span>
                              <span>Repetições</span>
                            </>
                          )}
                        </div>
                        {ex.sets?.map((s, sIdx) => {
                          const hasPR = selectedPost.sharePRs !== false && s.isPR === true;
                          const hasProgression = !hasPR && (s.progression || (selectedPost.progressNote && (sIdx === 0 || sIdx === ex.sets.length - 1)));
                          const isTimedSet = ex.trackingType === 'duration' || Number(s.durationSeconds) > 0;

                          return (
                            <div 
                              key={sIdx} 
                              className={`post-sets-table-row ${hasPR ? 'post-set-row-pr' : hasProgression ? 'post-set-row-progression' : ''}`}
                            >
                              <span className="post-set-num">
                                {s.setNumber || sIdx + 1}
                                {hasPR && <span className="prog-medal-tag pr-medal-tag" title={s.prType === 'reps' ? 'Recorde pessoal de repetições' : 'Recorde pessoal de carga'}><Award size={12} /> PR</span>}
                                {hasProgression && <span className="prog-medal-tag" title="Evolução batida!">🏅</span>}
                              </span>
                              {isTimedSet ? (
                                <span className="post-set-val post-set-duration">
                                  {formatExerciseDuration(s.durationSeconds)}
                                </span>
                              ) : (
                                <>
                                  <span className="post-set-val">
                                    {selectedPost.showWeights === false ? '🔒' : `${s.weight} kg`}
                                  </span>
                                  <span className="post-set-val">{s.reps} reps</span>
                                </>
                              )}
                            </div>
                          );
                        })}
                      </div>

                      {/* Observations box identical to Print 5 */}
                      {(ex.notes || selectedPost.notes) && (
                        <div className="post-exercise-notes-box">
                          <div className="post-notes-box-header">
                            <StickyNote size={14} className="post-notes-icon" />
                            <span>OBSERVAÇÕES & AJUSTES DE CARGA</span>
                          </div>
                          <p className="post-notes-box-content">
                            {ex.notes || selectedPost.notes}
                          </p>
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Comments Section */}
            <div className="modal-comments-section">
              <div className="workout-details-social-actions">
                <button
                  type="button"
                  className={selectedPost.likedBy?.includes(user?.id) ? 'is-liked' : ''}
                  onClick={() => handleToggleLike(selectedPost.id)}
                  aria-pressed={selectedPost.likedBy?.includes(user?.id) || false}
                >
                  <Heart size={17} fill={selectedPost.likedBy?.includes(user?.id) ? 'currentColor' : 'none'} />
                  Curtir · {selectedPost.likes || selectedPost.likedBy?.length || 0}
                </button>
                <button type="button" onClick={() => handleShareGroupWorkout(selectedPost)}>
                  <Share2 size={17} /> Compartilhar link
                </button>
                {selectedPost.userId === user?.id && (
                  <button
                    type="button"
                    className="workout-details-delete"
                    onClick={() => handleDeleteGroupWorkout(selectedPost)}
                  >
                    <Trash2 size={17} /> Apagar treino
                  </button>
                )}
              </div>
              <h4 style={{ fontSize: '0.9375rem', fontWeight: 700, margin: '16px 0 8px 0' }}>
                Comentários ({selectedPost.comments?.length || 0})
              </h4>

              {selectedPost.comments && selectedPost.comments.length > 0 ? (
                <div className="modal-comments-list">
                  {selectedPost.comments.map(c => (
                    <div key={c.id} className="comment-item">
                      <button
                        type="button"
                        onClick={() => {
                          if (c.userId === user?.id) {
                            setSelectedPostId(null);
                            navigate('/profile');
                            return;
                          }
                          const member = enrichedMembers.find(m => m.id === c.userId);
                          if (member) {
                            setSelectedPostId(null);
                            openMemberProfile(member);
                          }
                          else if (c.userId) navigate(`/profiles/${c.userId}`);
                        }}
                        aria-label={`Abrir perfil de ${c.userName || 'atleta'}`}
                        style={{ border: 0, background: 'transparent', padding: 0, cursor: 'pointer' }}
                      >
                        <Avatar src={c.userAvatar} name={c.userName} size="xs" />
                      </button>
                      <div className="comment-bubble">
                        <button
                          type="button"
                          className="comment-author"
                          onClick={() => {
                            if (c.userId === user?.id) {
                              setSelectedPostId(null);
                              navigate('/profile');
                              return;
                            }
                            const member = enrichedMembers.find(m => m.id === c.userId);
                            if (member) {
                              setSelectedPostId(null);
                              openMemberProfile(member);
                            }
                            else if (c.userId) navigate(`/profiles/${c.userId}`);
                          }}
                          style={{ border: 0, padding: 0, background: 'transparent', color: 'inherit', font: 'inherit', cursor: 'pointer' }}
                        >
                          {c.userName || 'Atleta'}{c.userId === user?.id ? ' (EU)' : ''}
                        </button>
                        <p className="comment-text">{c.text}</p>
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="text-tertiary" style={{ fontSize: '0.8125rem', marginBottom: '12px' }}>
                  Nenhum comentário ainda. Seja o primeiro a elogiar o treino!
                </p>
              )}

              <form className="comment-input-form" onSubmit={(e) => handleAddComment(selectedPost.id, e)}>
                <input
                  type="text"
                  className="comment-text-input"
                  placeholder="Escreva um comentário de incentivo..."
                  value={commentInput}
                  onChange={e => setCommentInput(e.target.value)}
                />
                <Button type="submit" variant="primary" size="sm" disabled={!commentInput.trim()}>
                  Enviar
                </Button>
              </form>
            </div>
          </div>
        </Modal>
      )}

      {/* MODAL: PERFIL DO MEMBRO DO GRUPO COM CALENDÁRIO DE 4 CORES */}
      {selectedMember && (
        <Modal
          isOpen={!!selectedMember}
          onClose={closeMemberProfile}
          title={`Perfil de ${selectedMember.name}`}
          size="md"
        >
          <div className="member-profile-modal-body">
            <div className="member-profile-header">
              <Avatar src={selectedMember.avatar} name={selectedMember.name} size="xl" />
              <div>
                <h3>{selectedMember.name}</h3>
                <span className="text-muted">@{selectedMember.username || 'atleta'}</span>
                <div className="member-profile-activity-stats">
                  {selectedSharedProfile?.streak !== undefined && (
                    <span className="member-profile-activity-stat">
                      <Flame size={14} aria-hidden="true" />
                      <strong>{selectedSharedProfile.streak}</strong>
                      <small>{selectedSharedProfile.streak === 1 ? 'dia seguido' : 'dias seguidos'}</small>
                    </span>
                  )}
                  {selectedSharedProfile?.weekly_streak !== undefined && (
                    <span className="member-profile-activity-stat">
                      <Trophy size={14} aria-hidden="true" />
                      <strong>{selectedSharedProfile.weekly_streak}</strong>
                      <small>{selectedSharedProfile.weekly_streak === 1 ? 'semana ativa' : 'semanas ativas'}</small>
                    </span>
                  )}
                  {selectedSharedProfile?.weekly_checkins !== undefined && (
                    <span className="member-profile-activity-stat">
                      <Dumbbell size={14} aria-hidden="true" />
                      <strong>{selectedSharedProfile.weekly_checkins}/{selectedSharedProfile.weekly_goal || 4}</strong>
                      <small>treinos na semana</small>
                    </span>
                  )}
                  {selectedProfileWeeklySets !== undefined && (
                    <span className="member-profile-activity-stat">
                      <Layers size={14} aria-hidden="true" />
                      <strong>{selectedProfileWeeklySets}</strong>
                      <small>séries na semana</small>
                    </span>
                  )}
                </div>
              </div>
            </div>

            {selectedProfileLoadError && (
              <div className="group-cloud-error" role="alert">
                <p>Não foi possível carregar os dados compartilhados deste perfil.</p>
                <details>
                  <summary>Detalhes do Supabase</summary>
                  <p>{sharedProfilesState.error.message || 'Falha ao consultar o perfil compartilhado.'}</p>
                  <small>Se o erro mencionar função ou coluna ausente, execute novamente o arquivo supabase_schema.sql.</small>
                </details>
                <Button
                  type="button"
                  variant="secondary"
                  size="sm"
                  onClick={() => setSharedProfileRetry(value => value + 1)}
                >
                  Tentar novamente
                </Button>
              </div>
            )}

            {selectedMember.id !== user?.id && (
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12, marginTop: 12 }}>
                <div className="member-stats-row">
                  <span>{followSummary?.followers ?? '—'} seguidores</span>
                  <span>{followSummary?.following ?? '—'} seguindo</span>
                </div>
                <Button
                  type="button"
                  variant={followSummary?.isFollowing ? 'secondary' : 'primary'}
                  size="sm"
                  disabled={isFollowLoading || !followSummary}
                  onClick={handleToggleFollow}
                >
                  {isFollowLoading ? 'Aguarde...' : followSummary?.isFollowing ? 'Seguindo' : 'Seguir'}
                </Button>
              </div>
            )}

            <SharedProfileActivity
              name={selectedMember.name}
              routines={selectedProfileRoutines}
              routinesAvailable={selectedProfileRoutinesAvailable}
              routineWeightsVisible={isSelectedMemberSelf
                ? user?.privacy?.publicRoutineWeights === true
                : selectedSharedProfile?.public_routine_weights === true}
              trainingDates={selectedProfileTrainingDates}
              weeklySchedule={selectedProfileWeeklySchedule}
              canViewTrainingActivity={selectedProfileCanViewActivity}
              isLoading={isSelectedProfileLoading}
              onRoutineClick={routine => {
                if (!routine.id) return;
                const path = isSelectedMemberSelf
                  ? `/routines/${encodeURIComponent(routine.id)}`
                  : `/profiles/${encodeURIComponent(selectedMember.id)}/routines/${encodeURIComponent(routine.id)}`;
                closeMemberProfile();
                navigate(path);
              }}
            />

            {/* Member's Body Measurements (respecting privacy) */}
            <div className="member-measurements-privacy-box" style={{ marginTop: 16 }}>
              <h4 style={{ fontSize: '0.9375rem', fontWeight: 700, marginBottom: 8, display: 'flex', alignItems: 'center', gap: 6 }}>
                <Ruler size={16} className="text-accent" /> Medidas Corporais
              </h4>
              {isSelectedProfileLoading ? (
                <p className="text-tertiary" style={{ fontSize: '0.8125rem' }}>Carregando dados compartilhados...</p>
              ) : selectedProfileLoadError ? (
                <p role="alert" style={{ fontSize: '0.8125rem', color: 'var(--error)' }}>
                  Não foi possível carregar as informações compartilhadas.
                </p>
              ) : selectedProfileHasMeasurements ? (
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(100px, 1fr))', gap: 8, background: 'var(--bg-card)', padding: 10, borderRadius: 'var(--radius-md)', border: '1px solid var(--border-subtle)', fontSize: '0.75rem' }}>
                  {[
                    ['Peso', selectedSharedProfile.measurements.weight, 'kg'],
                    ['Altura', selectedSharedProfile.measurements.height, 'cm'],
                    ['Braço E.', selectedSharedProfile.measurements.leftArm, 'cm'],
                    ['Braço D.', selectedSharedProfile.measurements.rightArm, 'cm'],
                    ['Peitoral', selectedSharedProfile.measurements.chest, 'cm'],
                    ['Cintura', selectedSharedProfile.measurements.waist, 'cm'],
                    ['Coxa E.', selectedSharedProfile.measurements.leftThigh, 'cm'],
                    ['Coxa D.', selectedSharedProfile.measurements.rightThigh, 'cm'],
                    ['Panturrilha E.', selectedSharedProfile.measurements.leftCalf, 'cm'],
                    ['Panturrilha D.', selectedSharedProfile.measurements.rightCalf, 'cm']
                  ].filter(([, value]) => Number(value) > 0).map(([label, value, unit]) => (
                    <div key={label}>
                      <span>{label}</span>
                      <strong style={{ display: 'block', color: 'var(--text-primary)' }}>{value} {unit}</strong>
                    </div>
                  ))}
                </div>
              ) : selectedProfileHasMeasurementAccess ? (
                <p className="text-tertiary" style={{ fontSize: '0.8125rem' }}>
                  Nenhuma medição registrada.
                </p>
              ) : (
                <div style={{
                  padding: '10px 14px',
                  background: 'var(--bg-elevated)',
                  borderRadius: 'var(--radius-md)',
                  border: '1px solid var(--border-color)',
                  fontSize: '0.8125rem',
                  color: 'var(--text-tertiary)',
                  display: 'flex',
                  alignItems: 'center',
                  gap: 8
                }}>
                  <span>🔒</span>
                  <span>{selectedMember.id === user?.id
                    ? 'Você ainda não registrou medidas.'
                    : 'Este atleta não compartilhou medidas com você.'}</span>
                </div>
              )}
            </div>

            {selectedProfileTrainingStatsAvailable && (
              <div className="member-measurements-privacy-box" style={{ marginTop: 16 }}>
                <h4 style={{ fontSize: '0.9375rem', fontWeight: 700, marginBottom: 8, display: 'flex', alignItems: 'center', gap: 6 }}>
                  <TrendingUp size={16} className="text-accent" /> Dados de treino compartilhados
                </h4>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(110px, 1fr))', gap: 8 }}>
                  {selectedSharedProfile.weekly_volume_kg !== undefined && (
                    <div className="measurement-cell">
                      <span className="m-label">Volume semanal</span>
                      <strong className="m-val">{Number(selectedSharedProfile.weekly_volume_kg).toLocaleString('pt-BR')} kg</strong>
                    </div>
                  )}
                  {selectedProfileWeeklySets !== undefined && (
                    <div className="measurement-cell">
                      <span className="m-label">Séries semanais</span>
                      <strong className="m-val">{selectedProfileWeeklySets}</strong>
                    </div>
                  )}
                  {selectedSharedProfile.prs_count !== undefined && (
                    <div className="measurement-cell">
                      <span className="m-label">PRs</span>
                      <strong className="m-val">{selectedSharedProfile.prs_count}</strong>
                    </div>
                  )}
                </div>
              </div>
            )}
          </div>
        </Modal>
      )}

      {/* GROUP SETTINGS / ACTIONS MODAL */}
      {isSettingsOpen && (
        <Modal
          isOpen={isSettingsOpen}
          onClose={() => setIsSettingsOpen(false)}
          title="Opções do Grupo"
          size="md"
        >
          <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
            <div style={{ background: 'var(--bg-elevated)', padding: '12px 16px', borderRadius: 'var(--radius-md)', display: 'flex', flexDirection: 'column', gap: 8 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <span style={{ color: 'var(--text-tertiary)', fontSize: '0.8125rem' }}>Nome do Grupo</span>
                <strong style={{ color: 'var(--text-primary)' }}>{group.name}</strong>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <span style={{ color: 'var(--text-tertiary)', fontSize: '0.8125rem' }}>Código de Convite</span>
                <span style={{ fontFamily: 'monospace', fontWeight: 700, color: 'var(--accent)' }}>{group.inviteCode}</span>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <span style={{ color: 'var(--text-tertiary)', fontSize: '0.8125rem' }}>Total de Membros</span>
                <span style={{ color: 'var(--text-secondary)' }}>{enrichedMembers.length} atletas</span>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <span style={{ color: 'var(--text-tertiary)', fontSize: '0.8125rem' }}>Sua Função</span>
                <span style={{ fontWeight: 600, color: isCreator ? '#eab308' : isCurrentUserAdmin ? 'var(--accent)' : 'var(--text-secondary)' }}>
                  {isCreator ? '👑 Criador / Dono' : isCurrentUserAdmin ? '🛡️ Administrador' : 'Membro'}
                </span>
              </div>
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              <Button
                variant="secondary"
                fullWidth
                icon={Copy}
                onClick={handleCopyInviteCode}
              >
                {copiedCode ? 'Código Copiado!' : 'Copiar Código de Convite'}
              </Button>
              <Button
                variant="secondary"
                fullWidth
                icon={copiedInviteLink ? Check : Link}
                onClick={handleCopyInviteLink}
              >
                {copiedInviteLink ? 'Link Copiado!' : 'Copiar Link de Convite'}
              </Button>

              {!isCreator && (
                <Button
                  variant="ghost"
                  fullWidth
                  icon={LogOut}
                  style={{ color: '#f87171', border: '1px solid rgba(239, 68, 68, 0.2)' }}
                  onClick={() => {
                    setIsSettingsOpen(false);
                    handleLeaveGroup();
                  }}
                >
                  Sair do Grupo
                </Button>
              )}

              {isCreator && (
                <Button
                  variant="ghost"
                  fullWidth
                  icon={ShieldAlert}
                  style={{ color: '#ef4444', background: 'rgba(239, 68, 68, 0.1)', border: '1px solid rgba(239, 68, 68, 0.3)' }}
                  onClick={() => {
                    setIsSettingsOpen(false);
                    handleDeleteGroup();
                  }}
                >
                  Excluir Grupo Definitivamente
                </Button>
              )}
            </div>
          </div>
        </Modal>
      )}
    </div>
  );
}
