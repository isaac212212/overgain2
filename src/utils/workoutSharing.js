export async function shareWorkoutLink(post, groupId) {
  const path = groupId ? `/groups/${encodeURIComponent(groupId)}` : '/dashboard';
  const url = new URL(path, window.location.origin);
  url.searchParams.set('workout', post.id);

  if (typeof navigator.share === 'function') {
    await navigator.share({
      title: post.title || post.routineName || 'Treino no Overgain',
      text: `Confira o treino de ${post.userName || 'um atleta'}.`,
      url: url.href
    });
    return { copied: false, url: url.href };
  }

  if (navigator.clipboard?.writeText) {
    await navigator.clipboard.writeText(url.href);
    return { copied: true, url: url.href };
  }

  const input = document.createElement('textarea');
  input.value = url.href;
  input.setAttribute('readonly', '');
  input.style.position = 'fixed';
  input.style.opacity = '0';
  document.body.appendChild(input);
  let copied = false;
  try {
    input.select();
    copied = document.execCommand('copy');
  } finally {
    input.remove();
  }
  if (!copied) throw new Error('Este navegador não permite compartilhar nem copiar o link.');
  return { copied: true, url: url.href };
}
