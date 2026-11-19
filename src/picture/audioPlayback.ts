export function releasePictureAudio(audio: Pick<HTMLAudioElement, 'pause' | 'removeAttribute' | 'load'> | null | undefined): void {
  if (!audio) return
  audio.pause()
  audio.removeAttribute('src')
  audio.load()
}
