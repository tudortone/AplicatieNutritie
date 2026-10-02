import AsyncStorage from '@react-native-async-storage/async-storage';
import {
  ACTIVE_LOCAL_USER_KEY,
  USER_STORAGE_PREFIX,
  isUserBoundWorkspaceKey,
} from './userDataCleanup';

type JsonObject = Record<string, unknown>;

function parseStoredValue(value: string): unknown {
  try {
    return JSON.parse(value);
  } catch {
    return value;
  }
}

async function readSortedStorage(keys: string[]): Promise<Record<string, unknown>> {
  const sorted = [...new Set(keys)].sort((a, b) => a.localeCompare(b));
  if (sorted.length === 0) return {};
  const entries = await AsyncStorage.multiGet(sorted);
  return Object.fromEntries(
    entries
      .filter((entry): entry is [string, string] => entry[1] !== null)
      .map(([key, value]) => [key, parseStoredValue(value)]),
  );
}

export async function buildCompleteUserExport({
  userId,
  serverExport,
}: {
  userId: string;
  serverExport: JsonObject;
}): Promise<{
  schema_version: 1;
  server: JsonObject;
  local_device: { active_workspace: Record<string, unknown>; account_scoped: Record<string, unknown> };
}> {
  const owner = userId.trim();
  if (!owner || serverExport.user_id !== owner) throw new Error('GDPR_EXPORT_IDENTITY_MISMATCH');

  const allKeys = await AsyncStorage.getAllKeys();
  const activeOwner = await AsyncStorage.getItem(ACTIVE_LOCAL_USER_KEY);
  const encodedOwnerPrefix = `${USER_STORAGE_PREFIX}${encodeURIComponent(owner)}:`;
  const chatPrefix = `chat_history_${owner}_`;
  const accountKeys = allKeys.filter((key) =>
    key.startsWith(encodedOwnerPrefix) ||
    key === `chat_history_${owner}` ||
    key.startsWith(chatPrefix) ||
    key === `@nutri_offline_meals_queue_${owner}` ||
    key === `@nutri_pending_macro_targets_${owner}`,
  );
  const workspaceKeys = activeOwner === owner
    ? allKeys.filter(isUserBoundWorkspaceKey)
    : [];

  return {
    schema_version: 1,
    server: serverExport,
    local_device: {
      active_workspace: await readSortedStorage(workspaceKeys),
      account_scoped: await readSortedStorage(accountKeys),
    },
  };
}

export async function fetchServerGdprExport({
  apiUrl,
  apiPrefix,
  token,
  expectedUserId,
  fetchImpl = fetch,
}: {
  apiUrl: string;
  apiPrefix: string;
  token: string;
  expectedUserId: string;
  fetchImpl?: typeof fetch;
}): Promise<JsonObject> {
  const response = await fetchImpl(`${apiUrl}${apiPrefix}/user/export-data`, {
    method: 'GET',
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!response.ok) throw new Error('GDPR_EXPORT_FAILED');
  const payload = await response.json() as JsonObject;
  if (payload.user_id !== expectedUserId) throw new Error('GDPR_EXPORT_IDENTITY_MISMATCH');
  return payload;
}
