export async function logoutPreservingUserData(_deps: {
  signOut: () => Promise<{ error: Error | null }>;
  cancelReminders: () => Promise<void>;
}): Promise<void> {
  // AuthContext seals the active local workspace on SIGNED_OUT. Deleting keys
  // before a confirmed sign-out would lose pending meals, chats and workouts.
  const { error } = await _deps.signOut();
  if (error) throw error;
  await _deps.cancelReminders();
}
