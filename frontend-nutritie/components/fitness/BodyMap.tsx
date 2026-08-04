import React, { useMemo } from 'react'
import { View, type StyleProp, type ViewStyle } from 'react-native'
import Svg, { Defs, LinearGradient, Path, Stop } from 'react-native-svg'

import type { BodyView, MuscleId } from '../../constants/muscles'
import type { IntensityMap } from '../../lib/muscleIntensity'
import { heatColor } from './heatColor'
import { BACK_GRADIENTS, BACK_SHAPES, BACK_VIEWBOX } from './anatomyBack'
import { FRONT_GRADIENTS, FRONT_SHAPES, FRONT_VIEWBOX } from './anatomyFront'
import type { AnatomyGradient, AnatomyShape, AnatomyStop } from './types'

/**
 * Rampa de caldura vine din heatColor.ts (sursa unica), aceeasi folosita de
 * legendele din ecrane. Intentionat discreta: la intensitate mica desenul
 * original ramane aproape neatins, iar culoarea creste treptat doar pe
 * muschii lucrati.
 */

/** Opacitatea maxima a stratului de caldura. Sub 1 ca sa se vada in continuare umbrele. */
const MAX_HEAT_OPACITY = 0.82

/**
 * Opacitatea formelor neincalzite (corp general + muschi neantrenati).
 * Semi-transparente ca muschii antrenati (colorati) sa iasa in evidenta.
 */
const UNHEATED_OPACITY = 0.5

/** Sub acest prag nu desenam deloc stratul de caldura. */
const MIN_VISIBLE = 0.02

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
	/** Apelat cand utilizatorul atinge un muschi. */
	onMusclePress?: (muscle: MuscleId) => void
	/** Muschi evidentiat cu contur, ex. cel selectat in lista. */
	selected?: MuscleId | null
	style?: StyleProp<ViewStyle>
	testID?: string
}

/**
 * Harta musculara. Deseneaza formele in ordinea exacta din fisierul sursa,
 * ca umbrele si detaliile corpului sa ramana deasupra muschilor coloriti.
 *
 * Formele de corp general nu se coloreaza si nu sunt atingibile, deci raman
 * discret in fundal, exact ca in desenul original.
 */
function BodyMapBase({
	view,
	intensity,
	width = 280,
	onMusclePress,
	selected = null,
	style,
	testID,
}: BodyMapProps) {
	const { shapes, gradients, box } = viewData(view)
	const height = (width * box.height) / box.width

	// Recalculam doar cand se schimba intensitatile, nu la fiecare randare.
	const heat = useMemo(() => {
		const out = new Map<MuscleId, { color: string; opacity: number }>()
		if (!intensity) return out
		for (const [muscle, raw] of Object.entries(intensity) as [MuscleId, number][]) {
			const v = clamp01(raw)
			if (v <= 0.001) {
				out.set(muscle, { color: heatColor(0), opacity: 0.35 })
			} else {
				out.set(muscle, { color: heatColor(v), opacity: Math.max(0.45, v * MAX_HEAT_OPACITY) })
			}
		}
		return out
	}, [intensity])

	const nodes: React.ReactNode[] = []
	for (let i = 0; i < shapes.length; i++) {
		const s = shapes[i]

		// 1. desenul original, mereu, in ordinea lui — semi-transparent, ca
		//    muschii incalziti sa iasa in evidenta
		nodes.push(<Path key={`b${i}`} d={s.d} fill={s.f} fillOpacity={UNHEATED_OPACITY} />)

		if (!s.m) continue

		// 2. stratul de caldura, exact peste forma, ca sa ramana sub umbre
		const h = heat.get(s.m)
		if (h) {
			nodes.push(
				<Path key={`h${i}`} d={s.d} fill={h.color} fillOpacity={h.opacity} />,
			)
		}

		// 3. conturul muschiului selectat
		if (selected && s.m === selected) {
			nodes.push(
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
			nodes.push(
				<Path
					key={`t${i}`}
					d={s.d}
					fill="transparent"
					onPress={() => onMusclePress(muscle)}
				/>,
			)
		}
	}

	return (
		<View style={style} testID={testID}>
			<Svg width={width} height={height} viewBox={`0 0 ${box.width} ${box.height}`}>
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
