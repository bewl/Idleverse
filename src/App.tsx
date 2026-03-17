import { useEffect } from 'react';
import { useGameStore } from '@/stores/gameStore';
import { useUiStore } from '@/stores/uiStore';
import { syncAudioSettings, unlockAudio } from '@/game/audio/soundEvents';
import { GameLayout } from '@/ui/layouts/GameLayout';

function App() {
  const tick = useGameStore(s => s.tick);
  const loadFromStorage = useGameStore(s => s.loadFromStorage);
  const saveToStorage = useGameStore(s => s.saveToStorage);
  const autoSave = useGameStore(s => s.state.settings.autoSave);
  const autoSaveInterval = useGameStore(s => s.state.settings.autoSaveInterval);
  const audioEnabled = useGameStore(s => s.state.settings.audioEnabled);
  const masterVolume = useGameStore(s => s.state.settings.masterVolume);

  // Load save on mount (also processes offline progress)
  useEffect(() => {
    loadFromStorage();
  }, [loadFromStorage]);

  // 1-second simulation tick (DEV: scaled by devTimeScale)
  useEffect(() => {
    const id = setInterval(() => {
      const scale = import.meta.env.DEV ? useUiStore.getState().devTimeScale : 1;
      tick(scale);
    }, 1000);
    return () => clearInterval(id);
  }, [tick]);

  // Auto-save
  useEffect(() => {
    if (!autoSave) return;
    const id = setInterval(() => saveToStorage(), autoSaveInterval);
    return () => clearInterval(id);
  }, [autoSave, autoSaveInterval, saveToStorage]);

  useEffect(() => {
    syncAudioSettings({ audioEnabled, masterVolume });
  }, [audioEnabled, masterVolume]);

  useEffect(() => {
    if (typeof window === 'undefined') return;

    const unlock = () => {
      void unlockAudio();
    };

    window.addEventListener('pointerdown', unlock, { once: true });
    window.addEventListener('keydown', unlock, { once: true });
    return () => {
      window.removeEventListener('pointerdown', unlock);
      window.removeEventListener('keydown', unlock);
    };
  }, []);

  return <GameLayout />;
}

export default App;
