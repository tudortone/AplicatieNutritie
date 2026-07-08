import React, { useState, useMemo } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, ScrollView } from 'react-native';
import { ChevronLeft, ChevronRight } from 'lucide-react-native';
import { useTheme } from '../context/ThemeContext';

interface MonthCalendarProps {
  selectedDate: Date;
  onSelectDate: (date: Date) => void;
  markedDates?: string[]; // array de ISO strings pentru zile cu mese
}

export const MonthCalendar: React.FC<MonthCalendarProps> = ({
  selectedDate,
  onSelectDate,
  markedDates = []
}) => {
  const { colors } = useTheme();
  const [currentMonth, setCurrentMonth] = useState(new Date(selectedDate));
  const [showPicker, setShowPicker] = useState(false);
  const [selectedYear, setSelectedYear] = useState(currentMonth.getFullYear());

  const markedSet = useMemo(() => new Set(markedDates), [markedDates]);

  const monthNames = [
    'Ianuarie', 'Februarie', 'Martie', 'Aprilie', 'Mai', 'Iunie',
    'Iulie', 'August', 'Septembrie', 'Octombrie', 'Noiembrie', 'Decembrie'
  ];

  const daysInMonth = new Date(currentMonth.getFullYear(), currentMonth.getMonth() + 1, 0).getDate();
  const firstDayOfMonth = new Date(currentMonth.getFullYear(), currentMonth.getMonth(), 1).getDay();

  const prevMonth = () => {
    setCurrentMonth(new Date(currentMonth.getFullYear(), currentMonth.getMonth() - 1, 1));
  };

  const nextMonth = () => {
    setCurrentMonth(new Date(currentMonth.getFullYear(), currentMonth.getMonth() + 1, 1));
  };

  const goToToday = () => {
    const today = new Date();
    setCurrentMonth(new Date(today.getFullYear(), today.getMonth(), 1));
    onSelectDate(today);
    setShowPicker(false);
  };

  const renderDays = () => {
    const days = [];
    const weekDays = ['D', 'L', 'M', 'M', 'J', 'V', 'S'];

    // Header zilele săptămânii
    days.push(
      <View key="header" style={styles.weekRow}>
        {weekDays.map((d, index) => (
          <Text key={`${d}-${index}`} style={[styles.weekDay, { color: colors.textTertiary }]}>{d}</Text>
        ))}
      </View>
    );

    // Zilele lunii
    const rows = [];
    let cells = [];

    // Celule goale pentru zilele dinaintea lunii
    for (let i = 0; i < firstDayOfMonth; i++) {
      cells.push(<View key={`empty-${i}`} style={styles.dayCell} />);
    }

    for (let day = 1; day <= daysInMonth; day++) {
      const date = new Date(currentMonth.getFullYear(), currentMonth.getMonth(), day);
      const isSelected = date.toDateString() === selectedDate.toDateString();
      const isToday = date.toDateString() === new Date().toDateString();
      
      // Construim formatul YYYY-MM-DD corect în timezone-ul local
      const yyyy = date.getFullYear();
      const mm = String(date.getMonth() + 1).padStart(2, '0');
      const dd = String(date.getDate()).padStart(2, '0');
      const dateStr = `${yyyy}-${mm}-${dd}`;
      
      const hasMeals = markedSet.has(dateStr);

      cells.push(
        <TouchableOpacity
          key={day}
          style={[
            styles.dayCell,
            isSelected && { backgroundColor: colors.accent, borderRadius: 12 },
            isToday && !isSelected && { borderWidth: 2, borderColor: colors.accent, borderRadius: 12 }
          ]}
          onPress={() => onSelectDate(date)}
          activeOpacity={0.7}
        >
          <Text style={[
            styles.dayText,
            { color: isSelected ? '#000000' : colors.textPrimary },
            isToday && !isSelected && { color: colors.accent, fontWeight: '900' }
          ]}>
            {day}
          </Text>
          {hasMeals && (
            <View style={[
              styles.dot,
              { backgroundColor: isSelected ? '#000000' : colors.accent }
            ]} />
          )}
        </TouchableOpacity>
      );

      if ((firstDayOfMonth + day) % 7 === 0 || day === daysInMonth) {
        while (cells.length < 7) {
          cells.push(<View key={`empty-end-${cells.length}`} style={styles.dayCell} />);
        }
        rows.push(<View key={`row-${rows.length}`} style={styles.weekRow}>{cells}</View>);
        cells = [];
      }
    }

    days.push(...rows);
    return days;
  };

  return (
    <View style={[styles.container, { backgroundColor: colors.surfaceBg, borderColor: colors.cardBorder }]}>
      <View style={styles.header}>
        <TouchableOpacity onPress={prevMonth} style={styles.arrowBtn}>
          <ChevronLeft size={20} color={colors.accent} />
        </TouchableOpacity>

        <View style={styles.titleContainer}>
          <TouchableOpacity
            onPress={() => {
              setSelectedYear(currentMonth.getFullYear());
              setShowPicker(!showPicker);
            }}
            style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}
            activeOpacity={0.7}
          >
            <Text style={[styles.monthTitle, { color: colors.textPrimary }]}>
              {monthNames[currentMonth.getMonth()]} {currentMonth.getFullYear()}
            </Text>
            <Text style={{ color: colors.accent, fontSize: 13, fontWeight: '800' }}>
              {showPicker ? '▲' : '▼'}
            </Text>
          </TouchableOpacity>
          <TouchableOpacity onPress={goToToday}>
            <Text style={[styles.todayBtn, { color: colors.accent }]}>Azi</Text>
          </TouchableOpacity>
        </View>

        <TouchableOpacity onPress={nextMonth} style={styles.arrowBtn}>
          <ChevronRight size={20} color={colors.accent} />
        </TouchableOpacity>
      </View>

      {showPicker ? (
        <View style={{ paddingVertical: 8 }}>
          <Text style={{ color: colors.textSecondary, fontSize: 12, fontWeight: '700', marginBottom: 8, textAlign: 'center' }}>
            Alege Anul
          </Text>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8, paddingHorizontal: 4, marginBottom: 16 }}>
            {[2023, 2024, 2025, 2026, 2027, 2028, 2029, 2030].map(yr => (
              <TouchableOpacity
                key={yr}
                style={[
                  styles.yearChip,
                  { backgroundColor: yr === selectedYear ? colors.accent : 'rgba(255,255,255,0.05)', borderColor: yr === selectedYear ? colors.accent : colors.cardBorder }
                ]}
                onPress={() => setSelectedYear(yr)}
              >
                <Text style={{ color: yr === selectedYear ? '#000000' : colors.textPrimary, fontWeight: '800', fontSize: 15 }}>
                  {yr}
                </Text>
              </TouchableOpacity>
            ))}
          </ScrollView>

          <Text style={{ color: colors.textSecondary, fontSize: 12, fontWeight: '700', marginBottom: 10, textAlign: 'center' }}>
            Alege Luna
          </Text>
          <View style={styles.monthsGrid}>
            {monthNames.map((mName, idx) => {
              const isCurrent = idx === currentMonth.getMonth() && selectedYear === currentMonth.getFullYear();
              return (
                <TouchableOpacity
                  key={mName}
                  style={[
                    styles.monthChip,
                    { backgroundColor: isCurrent ? colors.accent : 'rgba(255,255,255,0.05)', borderColor: isCurrent ? colors.accent : colors.cardBorder }
                  ]}
                  onPress={() => {
                    setCurrentMonth(new Date(selectedYear, idx, 1));
                    setShowPicker(false);
                  }}
                >
                  <Text style={{ color: isCurrent ? '#000000' : colors.textPrimary, fontWeight: '700', fontSize: 13 }}>
                    {mName.substring(0, 3)}
                  </Text>
                </TouchableOpacity>
              );
            })}
          </View>
        </View>
      ) : (
        renderDays()
      )}
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    borderRadius: 24,
    borderWidth: 1,
    padding: 16,
    marginBottom: 16,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 16,
  },
  arrowBtn: {
    width: 36,
    height: 36,
    borderRadius: 12,
    backgroundColor: 'rgba(255,255,255,0.05)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  titleContainer: {
    alignItems: 'center',
  },
  monthTitle: {
    fontSize: 18,
    fontWeight: '800',
    letterSpacing: -0.3,
  },
  todayBtn: {
    fontSize: 12,
    fontWeight: '700',
    marginTop: 2,
  },
  weekRow: {
    flexDirection: 'row',
    justifyContent: 'space-around',
  },
  weekDay: {
    width: 40,
    textAlign: 'center',
    fontSize: 12,
    fontWeight: '700',
    marginBottom: 8,
  },
  dayCell: {
    width: 40,
    height: 40,
    justifyContent: 'center',
    alignItems: 'center',
    margin: 2,
  },
  dayText: {
    fontSize: 14,
    fontWeight: '600',
  },
  dot: {
    width: 4,
    height: 4,
    borderRadius: 2,
    marginTop: 2,
  },
  yearChip: {
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 16,
    borderWidth: 1,
  },
  monthsGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'space-between',
    gap: 8,
  },
  monthChip: {
    width: '30%',
    paddingVertical: 12,
    borderRadius: 14,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 4,
  },
});
