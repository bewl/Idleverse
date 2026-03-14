import { useEffect } from 'react';
import { useGameStore } from '@/stores/gameStore';
import { GameLayout } from '@/ui/layouts/GameLayout';

function App() {
  const tick = useGameStore(s => s.tick);
  const loadFromStorage = useGameStore(s => s.loadFromStorage);
  const saveToStorage = useGameStore(s => s.saveToStorage);
  const autoSave = useGameStore(s => s.state.settings.autoSave);
  const autoSaveInterval = useGameStore(s => s.state.settings.autoSaveInterval);

  // Load save on mount (also processes offline progress)
  useEffect(() => {
    loadFromStorage();
  }, [loadFromStorage]);

  // 1-second simulation tick
  useEffect(() => {
    const id = setInterval(() => tick(1), 1000);
    return () => clearInterval(id);
  }, [tick]);

  // Auto-save
  useEffect(() => {
    if (!autoSave) return;
    const id = setInterval(() => saveToStorage(), autoSaveInterval);
    return () => clearInterval(id);
  }, [autoSave, autoSaveInterval, saveToStorage]);

  return <GameLayout />;
}

export default App;
