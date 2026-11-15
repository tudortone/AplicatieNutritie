import React from 'react'
import { render, fireEvent, act } from '@testing-library/react-native'
import SelectorValoare from '../components/onboarding/SelectorValoare'
import * as Haptics from 'expo-haptics'

jest.mock('expo-haptics', () => ({
	selectionAsync: jest.fn(),
	impactAsync: jest.fn(),
	notificationAsync: jest.fn(),
}))

jest.mock('lucide-react-native', () => new Proxy({}, { get: () => () => null }))

jest.mock('../context/ThemeContext', () => ({
	useTheme: () => ({
		colors: {
			textPrimary: '#FFFFFF',
			textSecondary: '#A0A0A0',
			accent: '#CCFF00',
			surfaceElevated: '#1A1D20',
			cardBorder: '#2A2D30',
			overlayStrong: '#3A3D40',
			danger: '#FF4444',
		},
	}),
}))

describe('SelectorValoare (Onboarding Value Selector)', () => {
	beforeEach(() => {
		jest.clearAllMocks()
	})

	it('computes initial contentOffset to match the displayed value (prevents starting from min)', async () => {
		// e.g. Height: min 120, max 230, valoare 175, pas 1 -> index 55 -> offset 55 * 14 = 770
		const mockLaSchimbare = jest.fn()
		const screen = await render(
			<SelectorValoare
				valoare={175}
				min={120}
				max={230}
				pas={1}
				unitate="cm"
				laSchimbare={mockLaSchimbare}
			/>
		)

		expect(screen.getByText('175')).toBeTruthy()
		expect(screen.getByText('cm')).toBeTruthy()

		const scrollView = screen.getByLabelText('Selectează cm')
		expect(scrollView.props.contentOffset).toEqual({ x: 55 * 14, y: 0 })
	})

	it('allows stepping up and down using precision buttons', async () => {
		const mockLaSchimbare = jest.fn()
		const screen = await render(
			<SelectorValoare
				valoare={75}
				min={35}
				max={250}
				pas={0.5}
				zecimale={1}
				unitate="kg"
				laSchimbare={mockLaSchimbare}
			/>
		)

		const cresteBtn = screen.getByLabelText('Crește kg')
		const scadeBtn = screen.getByLabelText('Scade kg')

		await act(async () => {
			fireEvent.press(cresteBtn)
		})
		expect(mockLaSchimbare).toHaveBeenCalledWith(75.5)

		await act(async () => {
			fireEvent.press(scadeBtn)
		})
		expect(mockLaSchimbare).toHaveBeenCalledWith(74.5)
	})

	it('respects min and max boundaries on stepper presses', async () => {
		const mockLaSchimbare = jest.fn()
		const screen = await render(
			<SelectorValoare
				valoare={120}
				min={120}
				max={230}
				pas={1}
				unitate="cm"
				laSchimbare={mockLaSchimbare}
			/>
		)

		const scadeBtn = screen.getByLabelText('Scade cm')
		await act(async () => {
			fireEvent.press(scadeBtn)
		})
		expect(mockLaSchimbare).not.toHaveBeenCalled()
	})

	it('supports accessibility actions increment and decrement for TalkBack', async () => {
		const mockLaSchimbare = jest.fn()
		const screen = await render(
			<SelectorValoare
				valoare={70}
				min={35}
				max={250}
				pas={0.5}
				zecimale={1}
				unitate="kg"
				laSchimbare={mockLaSchimbare}
			/>
		)

		const adjustable = screen.getByLabelText('Selectează kg')
		await act(async () => {
			fireEvent(adjustable, 'accessibilityAction', { nativeEvent: { actionName: 'increment' } })
		})
		expect(mockLaSchimbare).toHaveBeenCalledWith(70.5)

		await act(async () => {
			fireEvent(adjustable, 'accessibilityAction', { nativeEvent: { actionName: 'decrement' } })
		})
		expect(mockLaSchimbare).toHaveBeenCalledWith(69.5)
	})
})
