import type { MuscleId } from '../../constants/muscles'

/** O oprire de culoare dintr-un gradient liniar. */
export type AnatomyStop = {
	/** offset, 0..1, ca string exact cum a fost exportat */
	o: string
	/** culoare hex; null = stop fara culoare (SVGO a sters `stop-color` implicit) */
	c: string | null
}

/**
 * Gradient liniar in coordonate `userSpaceOnUse`.
 * Toate gradientele exportate folosesc acest sistem, fara `gradientTransform`.
 */
export type AnatomyGradient = {
	id: string
	x1: string
	y1: string
	x2: string
	y2: string
	stops: AnatomyStop[]
}

/**
 * O singura forma din desen, in ordinea exacta de desenare din fisierul sursa.
 *
 * Formele fara `m` sunt corpul general (piele, umbre, degete, fata, articulatii).
 * Ele nu se coloreaza niciodata si nu raspund la atingere - stau in spate si dau
 * volum desenului.
 */
export type AnatomyShape = {
	/** atributul `d` al traseului */
	d: string
	/** umplerea originala: hex sau `url(#paintN_linear_0_1)` */
	f: string
	/** muschiul logic, daca forma face parte dintr-un muschi selectabil */
	m?: MuscleId
	/** partea corpului, din perspectiva anatomica a subiectului */
	s?: 'left' | 'right'
	/** id-ul grupului anatomic din SVG, ex. `quads_vastus_lateralis_left` */
	g?: string
}

export type AnatomyView = {
	viewBox: { width: number; height: number }
	gradients: AnatomyGradient[]
	shapes: AnatomyShape[]
}
