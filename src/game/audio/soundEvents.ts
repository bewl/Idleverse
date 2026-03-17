import { audioManager } from './audioManager';

export function syncAudioSettings(settings: { audioEnabled: boolean; masterVolume: number }) {
  audioManager.setEnabled(settings.audioEnabled);
  audioManager.setMasterVolume(settings.masterVolume);
}

export function unlockAudio() {
  return audioManager.unlock();
}

export function playUiNavigate() {
  audioManager.playNavigate();
}

export function playUiConfirm() {
  audioManager.playConfirm();
}

export function playUiSave() {
  audioManager.playSave();
}

export function playManufacturingComplete(count: number) {
  audioManager.playManufacturingComplete(count);
}

export function playSkillAdvance(count: number) {
  audioManager.playSkillAdvance(count);
}

export function playAlert() {
  audioManager.playAlert();
}