'use strict';

/**
 * Nivelul este derivat din XP — serverul il recalculeaza si NU il crediteaza de
 * la client (P2.8). Formula trebuie sa ramana identica cu cea din
 * frontend-nutritie/context/GamificareContext.tsx (xpNecesarPanaLaNivel /
 * calculeazaNivel), altfel nivelurile afisate si cele stocate ar diverge.
 */

function xpNecesarPanaLaNivel(n) {
	return Math.floor((100 * n * (n + 1)) / 2);
}

function calculeazaNivel(xpTotal) {
	let n = 1;
	while (xpTotal >= xpNecesarPanaLaNivel(n)) {
		n++;
	}
	return n;
}

module.exports = { calculeazaNivel, xpNecesarPanaLaNivel };
