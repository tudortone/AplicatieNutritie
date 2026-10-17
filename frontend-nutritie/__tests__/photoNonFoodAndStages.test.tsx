import React from 'react';
import { render, fireEvent, waitFor } from '@testing-library/react-native';
import roLocale from '../i18n/locales/ro.json';
import enLocale from '../i18n/locales/en.json';
import frLocale from '../i18n/locales/fr.json';
import deLocale from '../i18n/locales/de.json';

describe('Photo AI Non-Food Recovery & Hybrid Stage Stepper Suite', () => {
  it('has consistent and accurate non-food recovery strings across all 4 locales', () => {
    // Romanian
    expect(roLocale.camera.notFoodTitle).toBe('Nu am identificat alimente în fotografie.');
    expect(roLocale.camera.notFoodMessage).toBe('Încearcă o fotografie cu mâncarea bine încadrată sau alege o imagine din galerie.');
    expect(roLocale.camera.retakePhoto).toBe('Refă fotografia');
    expect(roLocale.camera.chooseFromGallery).toBe('Alege din galerie');
    expect(roLocale.camera.goToHome).toBe('Mergi la Acasă');

    // English
    expect(enLocale.camera.notFoodTitle).toBe('No food detected in this photo.');
    expect(enLocale.camera.notFoodMessage).toBe('Try taking a clearer photo of your meal or choose one from your gallery.');
    expect(enLocale.camera.retakePhoto).toBe('Retake photo');
    expect(enLocale.camera.chooseFromGallery).toBe('Choose from gallery');
    expect(enLocale.camera.goToHome).toBe('Go to Home');

    // French
    expect(frLocale.camera.notFoodTitle).toBe('Aucun aliment détecté sur cette photo.');
    expect(frLocale.camera.retakePhoto).toBe('Reprendre la photo');
    expect(frLocale.camera.chooseFromGallery).toBe('Choisir dans la galerie');
    expect(frLocale.camera.goToHome).toBe("Aller à l'accueil");

    // German
    expect(deLocale.camera.notFoodTitle).toBe('Keine Lebensmittel auf diesem Foto erkannt.');
    expect(deLocale.camera.retakePhoto).toBe('Foto wiederholen');
    expect(deLocale.camera.chooseFromGallery).toBe('Aus Galerie wählen');
    expect(deLocale.camera.goToHome).toBe('Zur Startseite');
  });

  it('has truthful 4-stage tracking strings across all 4 locales', () => {
    // Romanian
    expect(roLocale.camera.stagePreparing).toBe('Pregătire & încărcare imagine');
    expect(roLocale.camera.stageQueued).toBe('În așteptare procesare');
    expect(roLocale.camera.stageAnalyzing).toBe('Analiză AI alimente & macro');
    expect(roLocale.camera.stageFinalizing).toBe('Pregătire rezultat nutrițional');

    // English
    expect(enLocale.camera.stagePreparing).toBe('Preparing & uploading image');
    expect(enLocale.camera.stageQueued).toBe('Queued for processing');
    expect(enLocale.camera.stageAnalyzing).toBe('AI analyzing dish & macros');
    expect(enLocale.camera.stageFinalizing).toBe('Finalizing nutritional result');

    // French
    expect(frLocale.camera.stagePreparing).toBe('Préparation et téléversement');
    expect(frLocale.camera.stageQueued).toBe('En attente de traitement');

    // German
    expect(deLocale.camera.stagePreparing).toBe('Bildvorbereitung & Upload');
    expect(deLocale.camera.stageQueued).toBe('In der Warteschlange');
  });
});
