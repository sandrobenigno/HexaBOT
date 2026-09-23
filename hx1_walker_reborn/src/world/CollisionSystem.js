/**
 * ============================================================================
 * HEXABOT TACTICAL ENGINE — COLLISIONSYSTEM.JS
 * Sistema de Restrição de Espaço, Limites de Arena e Colisão com Pilares
 * ============================================================================
 * Impede que:
 * 1. O corpo do mecha e suas patas ultrapassem a borda do tabuleiro (280x280m, borda segura 130m).
 * 2. O corpo do mecha se aproxime demais dos pilares, considerando o polígono de sustentação das patas.
 * 3. As pontas individuais das patas (Foot Anchors) atravessem ou pousem dentro dos pilares.
 */

import * as THREE from 'three';

export class CollisionSystem {
    /**
     * @param {Array<{x: number, z: number, radius: number}>} pillarsData Lista de pilares com raio de colisão
     * @param {number} [arenaHalfBound=130.0] Limite radial do tabuleiro
     */
    constructor(pillarsData = [], arenaHalfBound = 130.0) {
        this.pillarsData = pillarsData;
        this.arenaHalfBound = arenaHalfBound;
    }

    /**
     * Atualiza a lista de pilares de referência.
     * @param {Array<{x: number, z: number, radius: number}>} pillars
     */
    setPillarsData(pillars) {
        this.pillarsData = pillars;
    }

    /**
     * Calcula dinamicamente o raio máximo do polígono de apoio das patas do mecha.
     * @param {Array<Object>} legs Lista de pernas do robô
     * @param {number} [stanceSpread=1.10] Multiplicador de abertura das patas
     * @returns {number} Raio total de cobertura das patas
     */
    getMechFootprintRadius(legs = [], stanceSpread = 1.10) {
        let maxSpan = 6.65;
        if (legs && legs.length > 0) {
            let m = 0;
            for (let i = 0; i < legs.length; i++) {
                const leg = legs[i];
                const span = (leg.baseOffset ? Math.hypot(leg.baseOffset.x, leg.baseOffset.z) : 0) ||
                             ((leg.L1 + leg.L2 + leg.L3) * 0.85);
                if (span > m) m = span;
            }
            if (m > 0) maxSpan = m;
        }
        return maxSpan * (stanceSpread || 1.10) + 0.9;
    }

    /**
     * Restringe a posição central do robô no plano XZ garantindo que nenhuma pata penetre nos pilares
     * nem ultrapasse os limites da arena.
     * @param {number} targetX Coordenada X pretendida
     * @param {number} targetZ Coordenada Z pretendida
     * @param {Array<Object>} [legs=[]] Lista de pernas
     * @param {number} [stanceSpread=1.10] Abertura das patas
     * @returns {{x: number, z: number}} Posição corrigida e restrita
     */
    constrainPosition(targetX, targetZ, legs = [], stanceSpread = 1.10) {
        const legFootprint = this.getMechFootprintRadius(legs, stanceSpread);
        const safeBound = Math.max(this.arenaHalfBound - legFootprint, 20.0);

        let nx = THREE.MathUtils.clamp(targetX, -safeBound, safeBound);
        let nz = THREE.MathUtils.clamp(targetZ, -safeBound, safeBound);

        // Resolução de colisão circular com cada pilar considerando o raio de sustentação
        for (let i = 0; i < this.pillarsData.length; i++) {
            const p = this.pillarsData[i];
            const totalRadius = p.radius + legFootprint;
            const dx = nx - p.x;
            const dz = nz - p.z;
            const dist = Math.hypot(dx, dz);
            if (dist < totalRadius) {
                if (dist > 0.001) {
                    const overlap = totalRadius - dist;
                    nx += (dx / dist) * overlap;
                    nz += (dz / dist) * overlap;
                } else {
                    nx = p.x + totalRadius;
                }
            }
        }

        // Re-clamp após resolução de colisão
        nx = THREE.MathUtils.clamp(nx, -safeBound, safeBound);
        nz = THREE.MathUtils.clamp(nz, -safeBound, safeBound);

        return { x: nx, z: nz };
    }

    /**
     * Restrição individual para a ponta de cada pata (Foot Target), impedindo que ela pouse ou passe
     * por dentro de qualquer pilar cilíndrico.
     * @param {number} footX Coordenada X da pata
     * @param {number} footZ Coordenada Z da pata
     * @returns {{x: number, z: number}} Posição corrigida da pata
     */
    constrainFootPosition(footX, footZ) {
        let fx = THREE.MathUtils.clamp(footX, -this.arenaHalfBound, this.arenaHalfBound);
        let fz = THREE.MathUtils.clamp(footZ, -this.arenaHalfBound, this.arenaHalfBound);
        const footMargin = 0.5; // Margem física de segurança ao redor do pilar

        for (let i = 0; i < this.pillarsData.length; i++) {
            const p = this.pillarsData[i];
            const minClearance = p.radius + footMargin;
            const dx = fx - p.x;
            const dz = fz - p.z;
            const dist = Math.hypot(dx, dz);
            if (dist < minClearance) {
                if (dist > 0.001) {
                    const overlap = minClearance - dist;
                    fx += (dx / dist) * overlap;
                    fz += (dz / dist) * overlap;
                } else {
                    fx = p.x + minClearance;
                }
            }
        }

        return { x: fx, z: fz };
    }
}
