import AsyncStorage from '@react-native-async-storage/async-storage';
import * as FileSystem from 'expo-file-system/legacy';
import * as ImageManipulator from 'expo-image-manipulator';
import { Image } from 'react-native';
import {
  saveLocalImageDraft,
  discardLocalImageDraft,
  listPendingDrafts,
  optimizeImageBeforeUpload,
  DRAFT_DIR,
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

jest.mock('expo-image-manipulator', () => ({
  manipulateAsync: jest.fn(async (uri, actions, saveOptions) => ({
    uri: 'file:///tmp/manipulated.jpg',
    width: actions?.[0]?.resize?.width || 800,
    height: actions?.[0]?.resize?.height || 400,
  })),
  SaveFormat: { JPEG: 'jpeg' },
}));

describe('U-03 — Storage local persistent imagini (drafts) & Optimizing', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  test('DRAFT_DIR este valid și începe cu file:', () => {
    expect(typeof DRAFT_DIR).toBe('string');
    expect(DRAFT_DIR.startsWith('file:')).toBe(true);
  });

  test('optimizeImageBeforeUpload redimensionează imaginile mari (2000x1000 → 800x400)', async () => {
    const getSizeSpy = jest.spyOn(Image, 'getSize').mockImplementation((uri, success) => {
      success(2000, 1000);
    });

    const res = await optimizeImageBeforeUpload('file:///photos/large.jpg');

    expect(getSizeSpy).toHaveBeenCalledWith('file:///photos/large.jpg', expect.any(Function), expect.any(Function));
    expect(ImageManipulator.manipulateAsync).toHaveBeenCalledWith(
      'file:///photos/large.jpg',
      [{ resize: { width: 800 } }],
      { compress: 0.75, format: 'jpeg' },
    );
    expect(res.uri).toBe('file:///tmp/manipulated.jpg');
    getSizeSpy.mockRestore();
  });

  test('optimizeImageBeforeUpload nu aplică redimensionare pe imagini mici (400x300)', async () => {
    const getSizeSpy = jest.spyOn(Image, 'getSize').mockImplementation((uri, success) => {
      success(400, 300);
    });

    await optimizeImageBeforeUpload('file:///photos/small.jpg');

    expect(ImageManipulator.manipulateAsync).toHaveBeenCalledWith(
      'file:///photos/small.jpg',
      [],
      { compress: 0.75, format: 'jpeg' },
    );
    getSizeSpy.mockRestore();
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
