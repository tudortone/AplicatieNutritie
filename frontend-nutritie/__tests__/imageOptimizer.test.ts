import AsyncStorage from '@react-native-async-storage/async-storage';
import * as FileSystem from 'expo-file-system/legacy';
import {
  saveLocalImageDraft,
  discardLocalImageDraft,
  listPendingDrafts,
} from '../lib/imageOptimizer';

jest.mock('@react-native-async-storage/async-storage', () => ({
  getItem: jest.fn(),
  setItem: jest.fn(),
}));

jest.mock('expo-file-system/legacy', () => ({
  documentDirectory: 'file:///data/user/0/com.app/files/',
  getInfoAsync: jest.fn(),
  makeDirectoryAsync: jest.fn(),
  copyAsync: jest.fn(),
  deleteAsync: jest.fn(),
}));

describe('U-03 — Storage local persistent imagini (drafts)', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  test('saveLocalImageDraft creează directorul dacă nu există și salvează în AsyncStorage', async () => {
    (FileSystem.getInfoAsync as jest.Mock).mockResolvedValue({ exists: false });
    (AsyncStorage.getItem as jest.Mock).mockResolvedValue(null);

    const path = await saveLocalImageDraft('file:///tmp/camera_photo.jpg');

    expect(FileSystem.makeDirectoryAsync).toHaveBeenCalled();
    expect(FileSystem.copyAsync).toHaveBeenCalledWith({
      from: 'file:///tmp/camera_photo.jpg',
      to: path,
    });
    expect(AsyncStorage.setItem).toHaveBeenCalledWith(
      'nutriai:image-drafts',
      JSON.stringify([path]),
    );
  });

  test('discardLocalImageDraft șterge fișierul și elimină calea din AsyncStorage', async () => {
    const draftPath = 'file:///data/user/0/com.app/files/drafts/123.jpg';
    (AsyncStorage.getItem as jest.Mock).mockResolvedValue(JSON.stringify([draftPath]));

    await discardLocalImageDraft(draftPath);

    expect(FileSystem.deleteAsync).toHaveBeenCalledWith(draftPath, { idempotent: true });
    expect(AsyncStorage.setItem).toHaveBeenCalledWith(
      'nutriai:image-drafts',
      JSON.stringify([]),
    );
  });

  test('listPendingDrafts returnează lista din AsyncStorage', async () => {
    const drafts = ['file:///path/1.jpg', 'file:///path/2.jpg'];
    (AsyncStorage.getItem as jest.Mock).mockResolvedValue(JSON.stringify(drafts));

    const result = await listPendingDrafts();
    expect(result).toEqual(drafts);
  });
});
