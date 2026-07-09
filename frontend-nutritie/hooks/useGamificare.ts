import {
  useGamificareContext,
  QuestZilnic,
  StareGamificare,
  xpNecesarPanaLaNivel,
  calculeazaNivel,
} from '../context/GamificareContext';

export { QuestZilnic, StareGamificare, xpNecesarPanaLaNivel, calculeazaNivel };

export function useGamificare() {
  return useGamificareContext();
}
