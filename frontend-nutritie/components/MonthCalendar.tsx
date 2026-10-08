import React, { useState, useMemo, useRef, useCallback, useEffect } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  ScrollView,
  LayoutAnimation,
  Platform,
  UIManager,
  GestureResponderEvent,
  LayoutChangeEvent,
} from 'react-native';
import { ChevronLeft, ChevronRight, ChevronDown, ChevronUp, Calendar } from 'lucide-react-native';
import * as Haptics from 'expo-haptics';
import { useTranslation } from 'react-i18next';
import { useTheme } from '../context/ThemeContext';
import { localDayKey } from '../lib/dateUtils';
import {
  getLocaleTag,
  getWeekDays,
  formatWeekdayShort,
  formatMonthYear,
  formatMonthName,
  formatFullDate,
  getMonthGridWeekdayHeaders,
  isSameDay,
} from '../lib/calendarLocaleUtils';

// Enable LayoutAnimation on Android
if (Platform.OS === 'android' && UIManager.setLayoutAnimationEnabledExperimental) {
  try {
    UIManager.setLayoutAnimationEnabledExperimental(true);
  } catch {
    // Ignore if already enabled or unsupported
  }
}

export interface MonthCalendarProps {
  selectedDate: Date;
  onSelectDate: (date: Date) => void;
  markedDates?: string[]; // Array of 'YYYY-MM-DD' dates with meals
  initialExpanded?: boolean;
}

export const MonthCalendar: React.FC<MonthCalendarProps> = React.memo(
  function MonthCalendar({
    selectedDate,
    onSelectDate,
    markedDates = [],
    initialExpanded = false,
  }: MonthCalendarProps) {
  const { colors } = useTheme();
  const { t, i18n } = useTranslation();
  const localeTag = useMemo(() => getLocaleTag(i18n.language), [i18n.language]);

  const [isExpanded, setIsExpanded] = useState(initialExpanded);
  const [weekAnchor, setWeekAnchor] = useState<Date>(() => new Date(selectedDate));
  const [currentMonth, setCurrentMonth] = useState<Date>(
    () => new Date(selectedDate.getFullYear(), selectedDate.getMonth(), 1)
  );
  const [showYearMonthPicker, setShowYearMonthPicker] = useState(false);
  const [pickerYear, setPickerYear] = useState(selectedDate.getFullYear());
  const [compactWidth, setCompactWidth] = useState<number | null>(null);

  const markedSet = useMemo(() => new Set(markedDates), [markedDates]);

  // Synchronize weekAnchor & currentMonth only when selectedDate actually changes
  const prevTimeRef = useRef(selectedDate.getTime());
  useEffect(() => {
    if (prevTimeRef.current !== selectedDate.getTime()) {
      prevTimeRef.current = selectedDate.getTime();
      setWeekAnchor(new Date(selectedDate));
      setCurrentMonth(new Date(selectedDate.getFullYear(), selectedDate.getMonth(), 1));
      setPickerYear(selectedDate.getFullYear());
    }
  }, [selectedDate]);

  // Trigger smooth layout transition
  const triggerAnimation = useCallback(() => {
    if (process.env.NODE_ENV === 'test') return;
    try {
      if (LayoutAnimation?.Presets?.easeInEaseOut && typeof LayoutAnimation?.configureNext === 'function') {
        LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
      }
    } catch {
      // Fallback silently if unsupported in test or environment
    }
  }, []);

  const toggleExpand = useCallback(() => {
    try {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    } catch {}
    triggerAnimation();
    setIsExpanded((prev) => {
      const next = !prev;
      if (next) {
        // When expanding, ensure currentMonth shows selectedDate's month
        setCurrentMonth(new Date(selectedDate.getFullYear(), selectedDate.getMonth(), 1));
        setShowYearMonthPicker(false);
      }
      return next;
    });
  }, [selectedDate, triggerAnimation]);

  const handleSelectDate = useCallback(
    (d: Date) => {
      const candidate = new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
      const today = new Date();
      const todayStart = new Date(today.getFullYear(), today.getMonth(), today.getDate()).getTime();
      if (candidate > todayStart) return;
      try {
        Haptics.selectionAsync();
      } catch {}
      onSelectDate(d);
      setWeekAnchor(new Date(d));
    },
    [onSelectDate]
  );

  const goToToday = useCallback(() => {
    try {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    } catch {}
    triggerAnimation();
    const today = new Date();
    setWeekAnchor(today);
    setCurrentMonth(new Date(today.getFullYear(), today.getMonth(), 1));
    setShowYearMonthPicker(false);
    onSelectDate(today);
  }, [onSelectDate, triggerAnimation]);

  // Week navigation (compact view)
  const goToPrevWeek = useCallback(() => {
    try {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    } catch {}
    triggerAnimation();
    setWeekAnchor((prev) => {
      const d = new Date(prev);
      d.setDate(d.getDate() - 7);
      return d;
    });
  }, [triggerAnimation]);

  const goToNextWeek = useCallback(() => {
    const today = new Date();
    const next = new Date(weekAnchor);
    next.setDate(next.getDate() + 7);
    const nextWeekStart = getWeekDays(next)[0];
    const todayStart = new Date(today.getFullYear(), today.getMonth(), today.getDate());
    if (nextWeekStart.getTime() > todayStart.getTime()) return;
    try {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    } catch {}
    triggerAnimation();
    setWeekAnchor((prev) => {
      const d = new Date(prev);
      d.setDate(d.getDate() + 7);
      return d;
    });
  }, [triggerAnimation, weekAnchor]);

  // Month navigation (expanded view)
  const goToPrevMonth = useCallback(() => {
    try {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    } catch {}
    triggerAnimation();
    setCurrentMonth((prev) => new Date(prev.getFullYear(), prev.getMonth() - 1, 1));
  }, [triggerAnimation]);

  const goToNextMonth = useCallback(() => {
    const today = new Date();
    if (
      currentMonth.getFullYear() > today.getFullYear() ||
      (currentMonth.getFullYear() === today.getFullYear() && currentMonth.getMonth() >= today.getMonth())
    ) return;
    try {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    } catch {}
    triggerAnimation();
    setCurrentMonth((prev) => new Date(prev.getFullYear(), prev.getMonth() + 1, 1));
  }, [triggerAnimation, currentMonth]);

  // Swipe gesture detection on compact days strip
  const touchStartXRef = useRef(0);
  const touchStartYRef = useRef(0);

  const onTouchStart = (e: GestureResponderEvent) => {
    touchStartXRef.current = e.nativeEvent.pageX;
    touchStartYRef.current = e.nativeEvent.pageY;
  };

  const onTouchEnd = (e: GestureResponderEvent) => {
    const dx = e.nativeEvent.pageX - touchStartXRef.current;
    const dy = e.nativeEvent.pageY - touchStartYRef.current;
    if (Math.abs(dx) > 42 && Math.abs(dx) > Math.abs(dy) * 1.4) {
      if (dx < 0) {
        goToNextWeek();
      } else {
        goToPrevWeek();
      }
    }
  };

  // 7 days of the currently active week
  const weekDays = useMemo(() => getWeekDays(weekAnchor), [weekAnchor]);
  const compactDayCount = useMemo(() => {
    if (compactWidth === null) return 7;
    return Math.max(3, Math.min(7, Math.floor((compactWidth - 84) / 44)));
  }, [compactWidth]);
  const visibleWeekDays = useMemo(() => {
    if (compactDayCount >= weekDays.length) return weekDays;
    const selectedIndex = weekDays.findIndex((day) => isSameDay(day, selectedDate));
    const focusIndex = selectedIndex >= 0 ? selectedIndex : Math.floor(weekDays.length / 2);
    const maxStart = weekDays.length - compactDayCount;
    const start = Math.max(0, Math.min(maxStart, focusIndex - Math.floor(compactDayCount / 2)));
    return weekDays.slice(start, start + compactDayCount);
  }, [compactDayCount, selectedDate, weekDays]);
  const todayForNavigation = new Date();
  const nextWeekStart = new Date(weekDays[0]);
  nextWeekStart.setDate(nextWeekStart.getDate() + 7);
  const nextWeekDisabled = nextWeekStart.getTime() > new Date(
    todayForNavigation.getFullYear(),
    todayForNavigation.getMonth(),
    todayForNavigation.getDate(),
  ).getTime();
  const nextMonthDisabled =
    currentMonth.getFullYear() > todayForNavigation.getFullYear() ||
    (currentMonth.getFullYear() === todayForNavigation.getFullYear() && currentMonth.getMonth() >= todayForNavigation.getMonth());
  const isSelectedDateToday = isSameDay(selectedDate, new Date());

  // Weekday initials for expanded month grid
  const monthGridHeaders = useMemo(() => getMonthGridWeekdayHeaders(localeTag), [localeTag]);

  // Month grid day calculations
  const daysInMonth = useMemo(
    () => new Date(currentMonth.getFullYear(), currentMonth.getMonth() + 1, 0).getDate(),
    [currentMonth]
  );
  const firstDayOfMonth = useMemo(
    () => new Date(currentMonth.getFullYear(), currentMonth.getMonth(), 1).getDay(),
    [currentMonth]
  );

  // Render Expanded Month Grid
  const renderMonthGrid = () => {
    const today = new Date();
    const rows = [];
    let cells = [];

    // Empty cells before start of month
    for (let i = 0; i < firstDayOfMonth; i++) {
      cells.push(<View key={`empty-start-${i}`} style={styles.gridCell} />);
    }

    for (let day = 1; day <= daysInMonth; day++) {
      const cellDate = new Date(currentMonth.getFullYear(), currentMonth.getMonth(), day);
      const isSelected = isSameDay(cellDate, selectedDate);
      const isToday = isSameDay(cellDate, today);
      const dayKey = localDayKey(cellDate);
      const hasMeals = markedSet.has(dayKey);
      const isFuture = cellDate.getTime() > new Date(today.getFullYear(), today.getMonth(), today.getDate()).getTime();

      const cellA11yLabel = `${t('jurnal.selectDateA11y', {
        date: formatFullDate(cellDate, localeTag),
        defaultValue: `Selectează ${formatFullDate(cellDate, localeTag)}`,
      })}${isToday ? t('jurnal.todayA11y', { defaultValue: ', astăzi' }) : ''}${
        isSelected ? t('jurnal.selectedA11y', { defaultValue: ', selectat' }) : ''
      }${hasMeals ? t('jurnal.hasMealsA11y', { defaultValue: ', cu mese înregistrate' }) : ''}`;

      cells.push(
        <TouchableOpacity
          key={`day-${day}`}
          testID={`month-day-${dayKey}`}
          style={[
            styles.gridCell,
            isSelected && { backgroundColor: colors.accent, borderRadius: 14 },
            isToday && !isSelected && { borderWidth: 2, borderColor: colors.accent, borderRadius: 14 },
          ]}
          onPress={() => handleSelectDate(cellDate)}
          disabled={isFuture}
          activeOpacity={0.7}
          hitSlop={{ top: 4, bottom: 4, left: 4, right: 4 }}
          accessibilityRole="button"
          accessibilityState={{ selected: isSelected, disabled: isFuture }}
          accessibilityLabel={cellA11yLabel}
        >
          <Text
            style={[
              styles.gridDayNumber,
              { color: isSelected ? colors.background : colors.textPrimary },
              isToday && !isSelected && { color: colors.accent, fontWeight: '900' },
              isFuture && { opacity: 0.35 },
            ]}
          >
            {day}
          </Text>
          {hasMeals && (
            <View
              style={[
                styles.mealDot,
                { backgroundColor: isSelected ? colors.background : colors.accent },
              ]}
            />
          )}
        </TouchableOpacity>
      );

      if ((firstDayOfMonth + day) % 7 === 0 || day === daysInMonth) {
        while (cells.length < 7) {
          cells.push(<View key={`empty-end-${cells.length}`} style={styles.gridCell} />);
        }
        rows.push(
          <View key={`grid-row-${rows.length}`} style={styles.gridWeekRow}>
            {cells}
          </View>
        );
        cells = [];
      }
    }

    return (
      <View style={styles.monthGridContainer}>
        {/* Weekday initials header */}
        <View style={styles.gridWeekRow}>
          {monthGridHeaders.map((initial, idx) => (
            <Text key={`header-${initial}-${idx}`} style={[styles.gridHeaderInitial, { color: colors.textTertiary }]}>
              {initial}
            </Text>
          ))}
        </View>
        {rows}
      </View>
    );
  };

  // Render Year & Month Picker Modal/Section
  const renderYearMonthPicker = () => {
    const years = [2023, 2024, 2025, 2026, 2027, 2028, 2029, 2030];
    const months = Array.from({ length: 12 }, (_, i) => i);

    return (
      <View style={styles.pickerSection}>
        <Text style={[styles.pickerSectionTitle, { color: colors.textSecondary }]}>
          {t('jurnal.chooseYear', { defaultValue: 'Alege Anul' })}
        </Text>
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.pickerChipsRow}
        >
          {years.map((yr) => {
            const isYearSelected = yr === pickerYear;
            const isFutureYear = yr > new Date().getFullYear();
            return (
              <TouchableOpacity
                key={`year-${yr}`}
                style={[
                  styles.pickerChip,
                  {
                    backgroundColor: isYearSelected ? colors.accent : colors.overlayLight,
                    borderColor: isYearSelected ? colors.accent : colors.cardBorder,
                  },
                ]}
                onPress={() => setPickerYear(yr)}
                disabled={isFutureYear}
                accessibilityRole="button"
                accessibilityState={{ selected: isYearSelected, disabled: isFutureYear }}
                accessibilityLabel={`${yr}`}
              >
                <Text
                  style={[
                    styles.pickerChipText,
                    { color: isYearSelected ? colors.background : colors.textPrimary, opacity: isFutureYear ? 0.35 : 1 },
                  ]}
                >
                  {yr}
                </Text>
              </TouchableOpacity>
            );
          })}
        </ScrollView>

        <Text style={[styles.pickerSectionTitle, { color: colors.textSecondary, marginTop: 12 }]}>
          {t('jurnal.chooseMonth', { defaultValue: 'Alege Luna' })}
        </Text>
        <View style={styles.monthsGrid}>
          {months.map((mIdx) => {
            const isCurMonth =
              mIdx === currentMonth.getMonth() && pickerYear === currentMonth.getFullYear();
            const mName = formatMonthName(mIdx, pickerYear, localeTag);
            const now = new Date();
            const isFutureMonth = pickerYear > now.getFullYear() || (pickerYear === now.getFullYear() && mIdx > now.getMonth());
            return (
              <TouchableOpacity
                key={`month-${mIdx}`}
                style={[
                  styles.monthChip,
                  {
                    backgroundColor: isCurMonth ? colors.accent : colors.overlayLight,
                    borderColor: isCurMonth ? colors.accent : colors.cardBorder,
                  },
                ]}
                onPress={() => {
                  triggerAnimation();
                  setCurrentMonth(new Date(pickerYear, mIdx, 1));
                  setShowYearMonthPicker(false);
                }}
                disabled={isFutureMonth}
                accessibilityRole="button"
                accessibilityState={{ selected: isCurMonth, disabled: isFutureMonth }}
                accessibilityLabel={`${mName} ${pickerYear}`}
              >
                <Text
                  style={[
                    styles.monthChipText,
                    { color: isCurMonth ? colors.background : colors.textPrimary, opacity: isFutureMonth ? 0.35 : 1 },
                  ]}
                >
                  {mName.substring(0, 3)}
                </Text>
              </TouchableOpacity>
            );
          })}
        </View>
      </View>
    );
  };

  return (
    <View
      testID="compact-calendar-container"
      style={[
        styles.container,
        {
          backgroundColor: colors.surfaceBg,
          borderColor: colors.cardBorder,
        },
      ]}
    >
      {/* Top Header Row */}
      <View style={styles.header}>
        {/* Context Title: Month and Year */}
        <View style={styles.headerTitleWrap}>
          {isExpanded ? (
            <TouchableOpacity
              onPress={() => {
                triggerAnimation();
                setShowYearMonthPicker((prev) => !prev);
              }}
              style={styles.headerTitleButton}
              activeOpacity={0.7}
              accessibilityRole="button"
              accessibilityState={{ expanded: showYearMonthPicker }}
              accessibilityLabel={`${formatMonthYear(currentMonth, localeTag)}`}
            >
              <Text style={[styles.monthTitle, { color: colors.textPrimary }]}>
                {formatMonthYear(currentMonth, localeTag)}
              </Text>
              <Text style={[styles.dropdownIndicator, { color: colors.accent }]}>
                {showYearMonthPicker ? '▲' : '▼'}
              </Text>
            </TouchableOpacity>
          ) : (
            <Text style={[styles.monthTitle, { color: colors.textPrimary }]}>
              {formatMonthYear(weekAnchor, localeTag)}
            </Text>
          )}
        </View>

        {/* Header Actions */}
        <View style={styles.headerActions}>
          {/* Quick Jump to Today */}
          <TouchableOpacity
            testID="calendar-today-btn"
            onPress={goToToday}
            hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
            style={[
              styles.todayBtn,
              {
                backgroundColor: isSelectedDateToday ? colors.accent + '20' : colors.overlayLight,
                borderColor: isSelectedDateToday ? colors.accent + '40' : colors.cardBorder,
              },
            ]}
            accessibilityRole="button"
            accessibilityLabel={t('jurnal.goToToday', { defaultValue: 'Salt la ziua de azi' })}
          >
            <Text style={[styles.todayBtnText, { color: colors.accent }]}>
              {t('jurnal.today', { defaultValue: 'Azi' })}
            </Text>
          </TouchableOpacity>

          {/* Expand / Collapse Calendar Toggle */}
          <TouchableOpacity
            testID="calendar-expand-toggle"
            onPress={toggleExpand}
            hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
            style={[
              styles.expandToggleBtn,
              {
                backgroundColor: isExpanded ? colors.accent + '20' : colors.overlayLight,
                borderColor: isExpanded ? colors.accent + '40' : colors.cardBorder,
              },
            ]}
            accessibilityRole="button"
            accessibilityState={{ expanded: isExpanded }}
            accessibilityLabel={
              isExpanded
                ? t('jurnal.collapseCalendar', { defaultValue: 'Restrânge calendarul' })
                : t('jurnal.openFullCalendar', { defaultValue: 'Deschide calendarul complet' })
            }
          >
            <Calendar size={16} color={colors.accent} />
            {isExpanded ? (
              <ChevronUp size={16} color={colors.accent} />
            ) : (
              <ChevronDown size={16} color={colors.accent} />
            )}
          </TouchableOpacity>
        </View>
      </View>

      {/* COMPACT VIEW: 7-Day Strip */}
      {!isExpanded && (
        <View
          testID="compact-calendar-strip"
          style={styles.compactRow}
          onLayout={(event: LayoutChangeEvent) => setCompactWidth(event.nativeEvent.layout.width)}
          onTouchStart={onTouchStart}
          onTouchEnd={onTouchEnd}
        >
          {/* Previous Week Navigation Arrow */}
          <TouchableOpacity
            testID="prev-week-btn"
            onPress={goToPrevWeek}
            style={[styles.navArrowBtn, { backgroundColor: colors.overlayLight, borderColor: colors.cardBorder }]}
            hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
            accessibilityRole="button"
            accessibilityLabel={t('jurnal.previousWeek', { defaultValue: 'Săptămâna anterioară' })}
          >
            <ChevronLeft size={18} color={colors.accent} />
          </TouchableOpacity>

          {/* 7 Days Strip */}
          <View style={styles.compactDaysContainer}>
            {visibleWeekDays.map((d) => {
              const isSelected = isSameDay(d, selectedDate);
              const isToday = isSameDay(d, new Date());
              const dayKey = localDayKey(d);
              const hasMeals = markedSet.has(dayKey);
              const now = new Date();
              const isFuture = d.getTime() > new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
              const weekdayStr = formatWeekdayShort(d, localeTag);

              const dayA11yLabel = `${t('jurnal.selectDateA11y', {
                date: formatFullDate(d, localeTag),
                defaultValue: `Selectează ${formatFullDate(d, localeTag)}`,
              })}${isToday ? t('jurnal.todayA11y', { defaultValue: ', astăzi' }) : ''}${
                isSelected ? t('jurnal.selectedA11y', { defaultValue: ', selectat' }) : ''
              }${hasMeals ? t('jurnal.hasMealsA11y', { defaultValue: ', cu mese înregistrate' }) : ''}`;

              return (
                <TouchableOpacity
                  key={`compact-${dayKey}`}
                  testID={`compact-day-${dayKey}`}
                  style={[
                    styles.dayPill,
                    {
                      backgroundColor: isSelected
                        ? colors.accent
                        : colors.overlayLight,
                      borderColor: isSelected
                        ? colors.accent
                        : isToday
                        ? colors.accent
                        : colors.cardBorder,
                      borderWidth: isToday && !isSelected ? 2 : 1,
                    },
                  ]}
                  onPress={() => handleSelectDate(d)}
                  disabled={isFuture}
                  activeOpacity={0.7}
                  hitSlop={{ top: 6, bottom: 6, left: 2, right: 2 }}
                  accessibilityRole="button"
                  accessibilityState={{ selected: isSelected, disabled: isFuture }}
                  accessibilityLabel={dayA11yLabel}
                >
                  <Text
                    style={[
                      styles.weekdayText,
                      {
                        color: isSelected
                          ? colors.background
                          : isToday
                          ? colors.accent
                        : colors.textTertiary,
                        opacity: isFuture ? 0.35 : 1,
                      },
                    ]}
                  >
                    {weekdayStr}
                  </Text>
                  <Text
                    style={[
                      styles.dayNumberText,
                      {
                        color: isSelected
                          ? colors.background
                          : isToday
                          ? colors.accent
                          : colors.textPrimary,
                        fontWeight: isSelected || isToday ? '900' : '700',
                        opacity: isFuture ? 0.35 : 1,
                      },
                    ]}
                  >
                    {d.getDate()}
                  </Text>
                  {hasMeals && (
                    <View
                      style={[
                        styles.mealDot,
                        {
                          backgroundColor: isSelected ? colors.background : colors.accent,
                        },
                      ]}
                    />
                  )}
                </TouchableOpacity>
              );
            })}
          </View>

          {/* Next Week Navigation Arrow */}
          <TouchableOpacity
            testID="next-week-btn"
            onPress={goToNextWeek}
            disabled={nextWeekDisabled}
            style={[styles.navArrowBtn, { backgroundColor: colors.overlayLight, borderColor: colors.cardBorder }]}
            hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
            accessibilityRole="button"
            accessibilityState={{ disabled: nextWeekDisabled }}
            accessibilityLabel={t('jurnal.nextWeek', { defaultValue: 'Săptămâna următoare' })}
          >
            <ChevronRight size={18} color={nextWeekDisabled ? colors.textTertiary : colors.accent} />
          </TouchableOpacity>
        </View>
      )}

      {/* EXPANDED VIEW: Full Month View */}
      {isExpanded && (
        <View testID="expanded-calendar-container" style={styles.expandedContent}>
          {/* Month Navigation Row */}
          <View style={styles.monthNavRow}>
            <TouchableOpacity
              testID="prev-month-btn"
              onPress={goToPrevMonth}
              style={[styles.navArrowBtn, { backgroundColor: colors.overlayLight, borderColor: colors.cardBorder }]}
              hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
              accessibilityRole="button"
              accessibilityLabel={t('jurnal.previousMonth', { defaultValue: 'Luna anterioară' })}
            >
              <ChevronLeft size={18} color={colors.accent} />
            </TouchableOpacity>

            <TouchableOpacity
              onPress={() => {
                triggerAnimation();
                setShowYearMonthPicker((prev) => !prev);
              }}
              style={styles.monthNavTitleButton}
              activeOpacity={0.7}
              accessibilityRole="button"
              accessibilityState={{ expanded: showYearMonthPicker }}
              accessibilityLabel={`${formatMonthYear(currentMonth, localeTag)}`}
            >
              <Text style={[styles.expandedMonthTitleText, { color: colors.textPrimary }]}>
                {formatMonthYear(currentMonth, localeTag)}
              </Text>
              <Text style={{ color: colors.accent, fontSize: 13, fontWeight: '800', marginLeft: 4 }}>
                {showYearMonthPicker ? '▲' : '▼'}
              </Text>
            </TouchableOpacity>

            <TouchableOpacity
              testID="next-month-btn"
              onPress={goToNextMonth}
              disabled={nextMonthDisabled}
              style={[styles.navArrowBtn, { backgroundColor: colors.overlayLight, borderColor: colors.cardBorder }]}
              hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
              accessibilityRole="button"
              accessibilityState={{ disabled: nextMonthDisabled }}
              accessibilityLabel={t('jurnal.nextMonth', { defaultValue: 'Luna următoare' })}
            >
              <ChevronRight size={18} color={nextMonthDisabled ? colors.textTertiary : colors.accent} />
            </TouchableOpacity>
          </View>

          {/* Conditional: Month Grid vs Year/Month Picker */}
          {showYearMonthPicker ? renderYearMonthPicker() : renderMonthGrid()}

          {/* Bottom Collapse Bar */}
          <TouchableOpacity
            testID="calendar-collapse-handle"
            onPress={toggleExpand}
            style={[styles.collapseHandle, { borderColor: colors.cardBorder, backgroundColor: colors.overlayLight }]}
            hitSlop={{ top: 8, bottom: 8, left: 16, right: 16 }}
            accessibilityRole="button"
            accessibilityLabel={t('jurnal.collapseCalendar', { defaultValue: 'Restrânge calendarul' })}
          >
            <ChevronUp size={16} color={colors.accent} />
            <Text style={[styles.collapseHandleText, { color: colors.textSecondary }]}>
              {t('jurnal.collapseCalendar', { defaultValue: 'Restrânge' })}
            </Text>
          </TouchableOpacity>
        </View>
      )}
    </View>
  );
},
(prev, next) => {
  if (prev.selectedDate.getTime() !== next.selectedDate.getTime()) return false;
  if (prev.initialExpanded !== next.initialExpanded) return false;
  if (prev.onSelectDate !== next.onSelectDate) return false;
  if (prev.markedDates !== next.markedDates) {
    if (prev.markedDates?.length !== next.markedDates?.length) return false;
    if (prev.markedDates?.join(',') !== next.markedDates?.join(',')) return false;
  }
  return true;
});

const styles = StyleSheet.create({
  container: {
    borderRadius: 20,
    borderWidth: 1,
    paddingHorizontal: 12,
    paddingTop: 12,
    paddingBottom: 10,
    marginBottom: 16,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 10,
  },
  headerTitleWrap: {
    flex: 1,
    justifyContent: 'center',
  },
  headerTitleButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  monthTitle: {
    fontSize: 16,
    fontWeight: '800',
    letterSpacing: -0.3,
  },
  dropdownIndicator: {
    fontSize: 12,
    fontWeight: '800',
    marginLeft: 2,
  },
  headerActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  todayBtn: {
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 12,
    borderWidth: 1,
    minHeight: 36,
    alignItems: 'center',
    justifyContent: 'center',
  },
  todayBtnText: {
    fontSize: 12,
    fontWeight: '800',
  },
  expandToggleBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 12,
    borderWidth: 1,
    minHeight: 36,
    justifyContent: 'center',
  },
  compactRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 4,
  },
  navArrowBtn: {
    width: 36,
    height: 36,
    borderRadius: 12,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  compactDaysContainer: {
    flex: 1,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    gap: 4,
  },
  dayPill: {
    flex: 1,
    minWidth: 36,
    maxWidth: 48,
    minHeight: 52,
    paddingVertical: 6,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
  },
  weekdayText: {
    fontSize: 10,
    fontWeight: '700',
    textTransform: 'uppercase',
    letterSpacing: 0.2,
    marginBottom: 2,
  },
  dayNumberText: {
    fontSize: 15,
  },
  mealDot: {
    width: 4,
    height: 4,
    borderRadius: 2,
    marginTop: 3,
  },
  expandedContent: {
    paddingTop: 4,
  },
  monthNavRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
  },
  monthNavTitleButton: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 4,
    paddingHorizontal: 8,
  },
  expandedMonthTitleText: {
    fontSize: 16,
    fontWeight: '800',
  },
  monthGridContainer: {
    marginBottom: 8,
  },
  gridWeekRow: {
    flexDirection: 'row',
    justifyContent: 'space-around',
    marginBottom: 4,
  },
  gridHeaderInitial: {
    flex: 1,
    textAlign: 'center',
    fontSize: 12,
    fontWeight: '700',
    marginBottom: 6,
  },
  gridCell: {
    flex: 1,
    aspectRatio: 1,
    maxWidth: 46,
    justifyContent: 'center',
    alignItems: 'center',
    margin: 2,
  },
  gridDayNumber: {
    fontSize: 14,
    fontWeight: '600',
  },
  collapseHandle: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingVertical: 8,
    borderRadius: 12,
    borderWidth: 1,
    marginTop: 6,
  },
  collapseHandleText: {
    fontSize: 12,
    fontWeight: '700',
  },
  pickerSection: {
    paddingVertical: 8,
  },
  pickerSectionTitle: {
    fontSize: 12,
    fontWeight: '700',
    marginBottom: 8,
    textAlign: 'center',
  },
  pickerChipsRow: {
    gap: 8,
    paddingHorizontal: 4,
    marginBottom: 12,
  },
  pickerChip: {
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 14,
    borderWidth: 1,
  },
  pickerChipText: {
    fontWeight: '800',
    fontSize: 14,
  },
  monthsGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'space-between',
    gap: 6,
  },
  monthChip: {
    width: '31%',
    paddingVertical: 10,
    borderRadius: 12,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 4,
  },
  monthChipText: {
    fontWeight: '700',
    fontSize: 13,
  },
});
