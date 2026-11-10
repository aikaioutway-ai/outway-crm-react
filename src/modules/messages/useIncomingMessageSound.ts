import { useEffect, useRef } from 'react';
import type { MessageChannel } from '../../services/messageService';

export default function useIncomingMessageSound(channels: MessageChannel[] | undefined, employeeId?: string, employeeName?: string) {
  const audio = useRef<AudioContext | null>(null);
  const previous = useRef<{ employeeId: string; channels: Map<string, MessageChannel> } | null>(null);

  useEffect(() => {
    if (!employeeId) return;
    function enable() {
      if (!window.AudioContext) return;
      audio.current ??= new AudioContext();
      void audio.current.resume().catch(() => undefined);
    }
    window.addEventListener('pointerdown', enable);
    window.addEventListener('keydown', enable);
    return () => {
      window.removeEventListener('pointerdown', enable);
      window.removeEventListener('keydown', enable);
      if (audio.current) void audio.current.close().catch(() => undefined);
      audio.current = null;
    };
  }, [employeeId]);

  useEffect(() => {
    if (!employeeId || !channels) return;
    const before = previous.current;
    previous.current = { employeeId, channels: new Map(channels.map(channel => [channel.channel, channel])) };
    const context = audio.current;
    if (before?.employeeId !== employeeId || context?.state !== 'running') return;
    const incoming = channels.some(channel => {
      const old = before.channels.get(channel.channel);
      return !channel.readOnly && channel.unread > 0 && channel.lastAt &&
        channel.lastAt !== old?.lastAt &&
        (channel.unread > (old?.unread ?? 0) || channel.lastAuthor !== employeeName);
    });
    if (!incoming) return;
    const start = context.currentTime;
    const tone = context.createOscillator();
    const volume = context.createGain();
    tone.frequency.setValueAtTime(660, start);
    tone.frequency.setValueAtTime(880, start + 0.075);
    volume.gain.setValueAtTime(0, start);
    volume.gain.linearRampToValueAtTime(0.08, start + 0.02);
    volume.gain.exponentialRampToValueAtTime(0.001, start + 0.2);
    tone.connect(volume).connect(context.destination);
    tone.start(start);
    tone.stop(start + 0.21);
  }, [channels, employeeId, employeeName]);
}
