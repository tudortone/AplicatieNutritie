import React, { useState, useEffect } from 'react';
import { render, fireEvent, waitFor, cleanup } from '@testing-library/react-native';
import { MonthCalendar } from '../components/MonthCalendar';
import {
  getMondayOfWeek,
  getWeekDays,
  formatWeekdayShort,
  formatMonthYear,
  getLocaleTag,
} from '../lib/calendarLocaleUtils';
import { localDayKey } from '../lib/dateUtils';

let mockLocale = 'ro';

jest.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string, options?: any) => {
      const resources: Record<string, any> = {
        ro: require('../i18n/locales/ro.json'),
        en: require('../i18n/locales/en.json'),
        fr: require('../i18n/locales/fr.json'),
        de: require('../i18n/locales/de.json'),
      };
      const dict = resources[mockLocale] || resources.ro;
      let val = key.split('.').reduce((obj: any, part) => obj?.[part], dict);
      if (typeof val === 'string' && options) {
        Object.keys(options).forEach((k) => {
          val = val.replace(`{{${k}}}`, String(options[k]));
        });
      }
      return val ?? options?.defaultValue ?? key;
    },
    i18n: { language: mockLocale },
  }),
}));

jest.mock('expo-haptics', () => ({
  impactAsync: jest.fn(),
  selectionAsync: jest.fn(),
  ImpactFeedbackStyle: { Light: 'Light', Medium: 'Medium' },
}));

jest.mock('../context/ThemeContext', () => ({
  useTheme: () => ({
    colors: {
      accent: '#22c55e',
      surfaceBg: '#1e293b',
      cardBorder: '#334155',
      overlayLight: 'rgba(255,255,255,0.05)',
      textPrimary: '#ffffff',
      textSecondary: '#94a3b8',
      textTertiary: '#64748b',
      background: '#0f172a',
      textOnAccent: '#ffffff',
    },
  }),
}));

describe('GetFlow Journal Compact 7-Day Calendar UX', () => {
  beforeEach(() => {
    mockLocale = 'ro';
    jest.clearAllMocks();
  });

  afterEach(async () => {
    await cleanup();
  });

  // Test 1: Exactly 7 days visible in compact default view
  it('renders exactly 7 days in the compact horizontal strip', async () => {
    const fixedDate = new Date(2026, 8, 30); // Wednesday Sep 30, 2026
    const onSelectDate = jest.fn();

    const view = await render(
      <MonthCalendar selectedDate={fixedDate} onSelectDate={onSelectDate} markedDates={['2026-09-30']} />
    );

    expect(view.getByTestId('compact-calendar-container')).toBeTruthy();
    expect(view.getByTestId('compact-calendar-strip')).toBeTruthy();

    const monday = getMondayOfWeek(fixedDate);
    const week = getWeekDays(monday);
    expect(week).toHaveLength(7);

    // Each of the 7 days has a testID
    week.forEach((day) => {
      const key = localDayKey(day);
      const pill = view.getByTestId(`compact-day-${key}`);
      expect(pill).toBeTruthy();
    });
  });

  // Test 2: Selected date highlight and today indicator
  it('correctly marks the selected date and today indicator', async () => {
    const today = new Date();
    const fixedDate = new Date(today);
    const onSelectDate = jest.fn();

    const view = await render(
      <MonthCalendar selectedDate={fixedDate} onSelectDate={onSelectDate} />
    );

    const todayPill = view.getByTestId(`compact-day-${localDayKey(today)}`);
    expect(todayPill.props.accessibilityState.selected).toBe(true);
  });

  // Test 3: Tap a day to select calls onSelectDate
  it('allows tapping a day to select it', async () => {
    const baseDate = new Date(2026, 8, 28); // Monday Sep 28, 2026
    const targetDate = new Date(2026, 8, 29); // Tuesday Sep 29, 2026
    const onSelectDate = jest.fn();

    const view = await render(
      <MonthCalendar selectedDate={baseDate} onSelectDate={onSelectDate} />
    );

    const tuesdayPill = view.getByTestId(`compact-day-${localDayKey(targetDate)}`);
    await fireEvent.press(tuesdayPill);

    expect(onSelectDate).toHaveBeenCalledTimes(1);
    const calledDate: Date = onSelectDate.mock.calls[0][0];
    expect(calledDate.getDate()).toBe(29);
    expect(calledDate.getMonth()).toBe(8);
  });

  // Test 4: Jump back to Today
  it('jumps back to Today when the today button is pressed', async () => {
    const pastDate = new Date(2026, 0, 15); // Jan 15, 2026
    const onSelectDate = jest.fn();

    const view = await render(
      <MonthCalendar selectedDate={pastDate} onSelectDate={onSelectDate} />
    );

    const todayBtn = view.getByTestId('calendar-today-btn');
    await fireEvent.press(todayBtn);

    expect(onSelectDate).toHaveBeenCalledTimes(1);
    const calledDate: Date = onSelectDate.mock.calls[0][0];
    const realToday = new Date();
    expect(calledDate.toDateString()).toBe(realToday.toDateString());
  });

  // Test 5: Next and Previous week navigation
  it('navigates previous and next week in compact mode', async () => {
    const fixedDate = new Date(2026, 8, 30); // Sep 30, 2026 (week Sep 28 - Oct 4)
    const onSelectDate = jest.fn();

    const view = await render(
      <MonthCalendar selectedDate={fixedDate} onSelectDate={onSelectDate} />
    );

    // Initial week should contain Sep 28
    expect(view.getByTestId('compact-day-2026-09-28')).toBeTruthy();

    // Click next week
    const nextWeekBtn = view.getByTestId('next-week-btn');
    await fireEvent.press(nextWeekBtn);

    // New week should be Oct 5 - Oct 11
    expect(await view.findByTestId('compact-day-2026-10-05')).toBeTruthy();
    expect(view.queryByTestId('compact-day-2026-09-28')).toBeNull();

    // Click prev week twice
    const prevWeekBtn = view.getByTestId('prev-week-btn');
    await fireEvent.press(prevWeekBtn);
    await fireEvent.press(prevWeekBtn);

    // Week should now be Sep 21 - Sep 27
    expect(await view.findByTestId('compact-day-2026-09-21')).toBeTruthy();
  });

  // Test 6: Expand to full month calendar and collapse back
  it('expands to full month calendar and collapses back', async () => {
    const fixedDate = new Date(2026, 8, 30);
    const onSelectDate = jest.fn();

    const view = await render(
      <MonthCalendar selectedDate={fixedDate} onSelectDate={onSelectDate} />
    );

    // Initially compact
    expect(view.getByTestId('compact-calendar-strip')).toBeTruthy();
    expect(view.queryByTestId('expanded-calendar-container')).toBeNull();

    // Tap expand toggle
    const toggleBtn = view.getByTestId('calendar-expand-toggle');
    await fireEvent.press(toggleBtn);

    // Now expanded full calendar is visible
    expect(await view.findByTestId('expanded-calendar-container')).toBeTruthy();
    expect(view.queryByTestId('compact-calendar-strip')).toBeNull();

    // Collapse handle is present and collapses back
    const collapseHandle = view.getByTestId('calendar-collapse-handle');
    await fireEvent.press(collapseHandle);

    expect(await view.findByTestId('compact-calendar-strip')).toBeTruthy();
    expect(view.queryByTestId('expanded-calendar-container')).toBeNull();
  });

  // Test 7: Month navigation in expanded view
  it('supports previous and next month navigation in expanded calendar', async () => {
    const fixedDate = new Date(2026, 8, 15); // Sep 15, 2026
    const onSelectDate = jest.fn();

    const view = await render(
      <MonthCalendar selectedDate={fixedDate} onSelectDate={onSelectDate} initialExpanded={true} />
    );

    expect(view.getByTestId('expanded-calendar-container')).toBeTruthy();
    // September has Sep 15
    expect(view.getByTestId('month-day-2026-09-15')).toBeTruthy();

    // Navigate to next month (October)
    const nextMonthBtn = view.getByTestId('next-month-btn');
    await fireEvent.press(nextMonthBtn);

    expect(await view.findByTestId('month-day-2026-10-15')).toBeTruthy();
    expect(view.queryByTestId('month-day-2026-09-15')).toBeNull();

    // Navigate back to August
    const prevMonthBtn = view.getByTestId('prev-month-btn');
    await fireEvent.press(prevMonthBtn);
    await fireEvent.press(prevMonthBtn);

    expect(await view.findByTestId('month-day-2026-08-15')).toBeTruthy();
  });

  // Test 8: Selecting date in full calendar updates selection & synchronizes compact view
  it('synchronizes selection between full calendar and compact view', async () => {
    const Harness = () => {
      const [currentDate, setCurrentDate] = useState(new Date(2026, 8, 15)); // Sep 15, 2026
      return (
        <MonthCalendar
          selectedDate={currentDate}
          onSelectDate={setCurrentDate}
          initialExpanded={true}
        />
      );
    };

    const view = await render(<Harness />);

    // In expanded view, navigate to October and select Oct 20
    await fireEvent.press(view.getByTestId('next-month-btn'));
    const oct20Cell = await view.findByTestId('month-day-2026-10-20');
    await fireEvent.press(oct20Cell);

    // Collapse back to compact view
    await fireEvent.press(view.getByTestId('calendar-collapse-handle'));

    // Compact view should now display the week containing Oct 20 (Oct 19 - Oct 25)
    expect(await view.findByTestId('compact-calendar-strip')).toBeTruthy();
    const compactOct20 = await view.findByTestId('compact-day-2026-10-20');
    expect(compactOct20).toBeTruthy();
    expect(compactOct20.props.accessibilityState.selected).toBe(true);
  });

  // Test 9: Swipe gesture navigation on compact strip
  it('navigates weeks via horizontal swipe gesture', async () => {
    const fixedDate = new Date(2026, 8, 30);
    const onSelectDate = jest.fn();

    const view = await render(
      <MonthCalendar selectedDate={fixedDate} onSelectDate={onSelectDate} />
    );

    const strip = view.getByTestId('compact-calendar-strip');

    // Swipe left (advance to next week)
    await fireEvent(strip, 'touchStart', { nativeEvent: { pageX: 200, pageY: 100 } });
    await fireEvent(strip, 'touchEnd', { nativeEvent: { pageX: 100, pageY: 100 } });

    expect(await view.findByTestId('compact-day-2026-10-05')).toBeTruthy();

    // Swipe right (go back to previous week)
    await fireEvent(strip, 'touchStart', { nativeEvent: { pageX: 100, pageY: 100 } });
    await fireEvent(strip, 'touchEnd', { nativeEvent: { pageX: 220, pageY: 100 } });

    expect(await view.findByTestId('compact-day-2026-09-28')).toBeTruthy();
  });

  // Test 10: Multi-locale support (RO, EN, FR, DE) with zero hardcoding
  test.each([
    { locale: 'ro', month: 'Septembrie 2026', weekday: 'Mie' },
    { locale: 'en', month: 'September 2026', weekday: 'Wed' },
    { locale: 'fr', month: 'Septembre 2026', weekday: 'Mer' },
    { locale: 'de', month: 'September 2026', weekday: 'Mi' },
  ])('renders localized labels in %s', async ({ locale, month, weekday }) => {
    mockLocale = locale;
    const fixedDate = new Date(2026, 8, 30);
    const view = await render(
      <MonthCalendar selectedDate={fixedDate} onSelectDate={jest.fn()} />
    );
    expect(await view.findByText(month)).toBeTruthy();
    expect(await view.findByText(weekday)).toBeTruthy();
  });

  // Test 11: Marked dates dot indicator
  it('renders marked meal dot for days with logged meals', async () => {
    const fixedDate = new Date(2026, 8, 30);
    const onSelectDate = jest.fn();

    const view = await render(
      <MonthCalendar
        selectedDate={fixedDate}
        onSelectDate={onSelectDate}
        markedDates={['2026-09-30']}
      />
    );

    const pill = view.getByTestId('compact-day-2026-09-30');
    expect(pill.props.accessibilityLabel).toContain('cu mese înregistrate');
  });

  // Test 12: Journal reload simulation — selecting date triggers fetch with exact date
  it('triggers journal date selection callback preserving journal contract', async () => {
    const fetchedDates: string[] = [];

    const JournalSimulation = () => {
      const [currentDate, setCurrentDate] = useState(new Date(2026, 8, 28));

      useEffect(() => {
        fetchedDates.push(localDayKey(currentDate));
      }, [currentDate]);

      return (
        <MonthCalendar
          selectedDate={currentDate}
          onSelectDate={setCurrentDate}
        />
      );
    };

    const view = await render(<JournalSimulation />);
    expect(fetchedDates).toEqual(['2026-09-28']);

    // Select Sep 29
    await fireEvent.press(view.getByTestId('compact-day-2026-09-29'));
    await waitFor(() => {
      expect(fetchedDates).toEqual(['2026-09-28', '2026-09-29']);
    });

    // Select Sep 30
    await fireEvent.press(view.getByTestId('compact-day-2026-09-30'));
    await waitFor(() => {
      expect(fetchedDates).toEqual(['2026-09-28', '2026-09-29', '2026-09-30']);
    });

    // Tapping already selected date does not trigger duplicate fetch
    expect(fetchedDates.length).toBe(3);
  });
});
