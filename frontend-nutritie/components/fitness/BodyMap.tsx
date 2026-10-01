import React, { useMemo } from 'react'
import { View, type StyleProp, type ViewStyle } from 'react-native'
import Svg, { Defs, LinearGradient, Path, Stop } from 'react-native-svg'

import type { BodyView, MuscleId } from '../../constants/muscles'
import type { IntensityMap } from '../../lib/muscleIntensity'
import { heatColor, isOutline, COLOR_INACTIVE } from './heatColor'
import { BACK_GRADIENTS, BACK_SHAPES, BACK_VIEWBOX } from './anatomyBack'
import { FRONT_GRADIENTS, FRONT_SHAPES, FRONT_VIEWBOX } from './anatomyFront'
import type { AnatomyGradient, AnatomyShape, AnatomyStop } from './types'
import { anatomyMapSize } from '../../lib/anatomyLayout'

/**
 * Rampa de caldura vine din heatColor.ts (sursa unica), aceeasi folosita de
 * legendele din ecrane. Intentionat discreta: la intensitate mica desenul
 * original ramane aproape neatins, iar culoarea creste treptat doar pe
 * muschii lucrati.
 */

/** Opacitatea maxima a stratului de caldura. Sub 1 ca sa se vada in continuare umbrele. */
const MAX_HEAT_OPACITY = 0.92

/**
 * Opacitatea formelor neincalzite (corp general + muschi neantrenati).
 */
const UNHEATED_OPACITY = 0.7

function clamp01(n: number): number {
	if (!Number.isFinite(n)) return 0
	return n < 0 ? 0 : n > 1 ? 1 : n
}

function viewData(view: BodyView): {
	shapes: AnatomyShape[]
	gradients: AnatomyGradient[]
	box: { width: number; height: number }
} {
	return view === 'back'
		? { shapes: BACK_SHAPES, gradients: BACK_GRADIENTS, box: BACK_VIEWBOX }
		: { shapes: FRONT_SHAPES, gradients: FRONT_GRADIENTS, box: FRONT_VIEWBOX }
}

export type BodyMapProps = {
	/** Vederea desenata: fata sau spate. */
	view: BodyView
	/** Intensitatea 0..1 per muschi. Muschii lipsa sunt tratati ca 0. */
	intensity?: IntensityMap
	/** Latimea in puncte. Inaltimea se calculeaza pastrand proportia. */
	width?: number
	/** Limita verticala optionala; latimea este redusa proportional, fara decupare. */
	maxHeight?: number
	/** Apelat cand utilizatorul atinge un muschi. */
	onMusclePress?: (muscle: MuscleId) => void
	/** Muschi evidentiat cu contur, ex. cel selectat in lista. */
	selected?: MuscleId | null
	style?: StyleProp<ViewStyle>
	testID?: string
}

/**
 * Harta musculara. Deseneaza formele in ordinea exacta din fisierul sursa,
 * ca umbrele si detaliile corpului sa ramana deasupra muschilor colorati.
 *
 * FIT-ANATOMY-001: Formele de corp sunt desenate coerent, contururile originale
 * sunt pastrate pentru profunzime 3D, iar muschii activi primesc direct culoarea
 * termica corecta fara amestec pe baza rosie.
 */
function BodyMapBase({
	view,
	intensity,
	width = 280,
	maxHeight,
	onMusclePress,
	selected = null,
	style,
	testID,
}: BodyMapProps) {
	const { shapes, gradients, box } = viewData(view)
	const size = anatomyMapSize(view, width, maxHeight)

	// Recalculam doar cand se schimba intensitatile, nu la fiecare randare.
	const heat = useMemo(() => {
		const out = new Map<MuscleId, { color: string; opacity: number; isHeated: boolean }>()
		if (!intensity) return out
		for (const [muscle, raw] of Object.entries(intensity) as [MuscleId, number][]) {
			const v = clamp01(raw)
			if (v <= 0.001) {
				out.set(muscle, { color: COLOR_INACTIVE, opacity: UNHEATED_OPACITY, isHeated: false })
			} else {
				out.set(muscle, { color: heatColor(v), opacity: Math.max(0.75, v * MAX_HEAT_OPACITY), isHeated: true })
			}
		}
		return out
	}, [intensity])

	// Memoizam nodurile: la re-randari care nu schimba intensitatea/selectia
	// nu mai reconstruim ~1500 de <Path> pe firul principal.
	const nodes = useMemo(() => {
		const out: React.ReactNode[] = []
		for (let i = 0; i < shapes.length; i++) {
			const s = shapes[i]
			const outline = isOutline(s.f)

			if (outline) {
				// Contur / umbră anatomică: păstrăm culoarea originală din SVG pentru definire 3D
				out.push(<Path key={`b${i}`} d={s.d} fill={s.f} fillOpacity={0.9} />)
			} else if (s.m) {
				// Formă asociată unui mușchi
				const h = heat.get(s.m)
				if (h && h.isHeated) {
					// Mușchi antrenat: aplicăm direct culoarea din rampa termică (fără bază roșie murdărită)
					out.push(<Path key={`h${i}`} d={s.d} fill={h.color} fillOpacity={h.opacity} />)
				} else {
					// Mușchi inactiv: culoare neutră uniformă (#2A323D)
					out.push(<Path key={`b${i}`} d={s.d} fill={COLOR_INACTIVE} fillOpacity={UNHEATED_OPACITY} />)
				}
			} else {
				// Țesut general / fond neasociat unui mușchi specific:
				// Colorăm neutru ca să nu creeze găuri vizuale sau pete roșii parazite
				out.push(<Path key={`b${i}`} d={s.d} fill={COLOR_INACTIVE} fillOpacity={0.6} />)
			}

			if (!s.m) continue

			// 3. conturul muschiului selectat
			if (selected && s.m === selected) {
				out.push(
					<Path
						key={`s${i}`}
						d={s.d}
						fill="none"
						stroke="#FFFFFF"
						strokeOpacity={0.9}
						strokeWidth={1.5}
					/>,
				)
			}

			// 4. zona de atingere, invizibila, peste forma
			if (onMusclePress) {
				const muscle = s.m
				out.push(
					<Path
						key={`t${i}`}
						d={s.d}
						fill="transparent"
						onPress={() => onMusclePress(muscle)}
					/>,
				)
			}
		}
		return out
	}, [shapes, heat, selected, onMusclePress])

	return (
		<View style={style} testID={testID}>
			<Svg width={size.width} height={size.height} viewBox={`0 0 ${box.width} ${box.height}`}>
				<Defs>
					{gradients.map((g) => (
						<LinearGradient
							key={g.id}
							id={g.id}
							x1={g.x1}
							y1={g.y1}
							x2={g.x2}
							y2={g.y2}
							gradientUnits="userSpaceOnUse"
						>
							{g.stops
								.filter((st): st is AnatomyStop & { c: string } => st.c != null)
								.map((st, k) => (
									<Stop key={k} offset={st.o} stopColor={st.c} />
								))}
						</LinearGradient>
					))}
				</Defs>
				{nodes}
			</Svg>
		</View>
	)
}

export const BodyMap = React.memo(BodyMapBase)
export default BodyMap
