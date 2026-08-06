import * as ImageManipulator from 'expo-image-manipulator';
import { optimizeImageBeforeUpload, saveLocalImageDraft, discardLocalImageDraft, listPendingDrafts } from '../lib/imageOptimizer';

jest.mock('@react-native-async-storage/async-storage', () => ({
  getItem: jest.fn(async () => null),
  setItem: jest.fn(async () => {}),
  removeItem: jest.fn(async () => {}),
}));

jest.mock('expo-file-system', () => ({
  documentDirectory: 'file:///documentDirectory/',
  getInfoAsync: jest.fn(async () => ({ exists: true })),
  makeDirectoryAsync: jest.fn(async () => {}),
  copyAsync: jest.fn(async () => {}),
  deleteAsync: jest.fn(async () => {}),
}));

jest.mock('react-native', () => ({
  Image: {
    getSize: (uri: string, success: (w: number, h: number) => void) => {
      if (uri.includes('large')) {
        success(2000, 1000);
      } else {
        success(400, 300);
      }
    },
  },
}));

jest.mock('expo-image-manipulator', () => ({
  manipulateAsync: jest.fn(async (uri: string, actions: any[]) => {
    if (actions && actions.length > 0 && actions[0].resize) {
      return { uri: 'file://optimized-800x400.jpg', width: 800, height: 400 };
    }
    return { uri: 'file://unchanged-400x300.jpg', width: 400, height: 300 };
  }),
  SaveFormat: { JPEG: 'jpeg' },
}));

describe('lib/imageOptimizer — test optimizare dimensiuni si persistență draft (U-03)', () => {
  it('o imagine de 2000x1000 este redimensionată la bounding box de 800px', async () => {
    const result = await optimizeImageBeforeUpload('file://large-image.jpg');
    expect(ImageManipulator.manipulateAsync).toHaveBeenCalledWith(
      'file://large-image.jpg',
      [{ resize: { width: 800 } }],
      expect.anything()
    );
    expect(result.width).toBe(800);
    expect(result.height).toBe(400);
  });

  it('o imagine de 400x300 rămâne cu dimensiunile originale (redimensionare omisă)', async () => {
    const result = await optimizeImageBeforeUpload('file://small-image.jpg');
    expect(ImageManipulator.manipulateAsync).toHaveBeenCalledWith(
      'file://small-image.jpg',
      [],
      expect.anything()
    );
    expect(result.width).toBe(400);
    expect(result.height).toBe(300);
  });

  it('saveLocalImageDraft salvează poza în documentDirectory/drafts/', async () => {
    const draftPath = await saveLocalImageDraft('file://test.jpg');
    expect(draftPath).toContain('file:///documentDirectory/drafts/');
  });

  it('discardLocalImageDraft elimină draftul', async () => {
    await expect(discardLocalImageDraft('file:///documentDirectory/drafts/123.jpg')).resolves.toBeUndefined();
  });
});
