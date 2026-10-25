import AsyncStorage from '@react-native-async-storage/async-storage';
import { ETICHETE_ACTIVITATE, ETICHETE_DIETA, ETICHETE_SCOP, type Activitate, type Scop, type TipDieta } from './onboarding';
import { ACTIVE_LOCAL_USER_KEY } from './userDataCleanup';

export type ContextProfilChat = { obiectiv?: Scop; activitate?: Activitate; dieta?: TipDieta };

/** Reads the existing account workspace; preferences are context, never authorization. */
export async function citesteContextProfilChat(userId: string): Promise<ContextProfilChat | undefined> {
  try {
    if (!userId || await AsyncStorage.getItem(ACTIVE_LOCAL_USER_KEY) !== userId) return undefined;
    const values = Object.fromEntries(await AsyncStorage.multiGet(['obiectiv', 'nivel_activitate', 'dieta']));
    if (await AsyncStorage.getItem(ACTIVE_LOCAL_USER_KEY) !== userId) return undefined;
    const context: ContextProfilChat = {};
    if (values.obiectiv && Object.prototype.hasOwnProperty.call(ETICHETE_SCOP, values.obiectiv)) {
      context.obiectiv = values.obiectiv as Scop;
    }
    if (values.nivel_activitate && Object.prototype.hasOwnProperty.call(ETICHETE_ACTIVITATE, values.nivel_activitate)) {
      context.activitate = values.nivel_activitate as Activitate;
    }
    if (values.dieta && Object.prototype.hasOwnProperty.call(ETICHETE_DIETA, values.dieta)) {
      context.dieta = values.dieta as TipDieta;
    }
    return context;
  } catch {
    return undefined;
  }
}
