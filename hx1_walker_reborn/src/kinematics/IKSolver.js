/**
 * ============================================================================
 * HEXABOT TACTICAL ENGINE — IKSOLVER.JS
 * Solver Analítico 3-DOF Vetorial com Base Ortonormal (Zero-Bank) e Auto-Reach Fallback
 * ============================================================================
 * Implementa a cinemática inversa exata do robô:
 * 1. calculateAdaptiveElevation: Curva sigmoide suave de elevação da coxa de acordo com a altura do corpo.
 * 2. Auto-Reach Fallback: Relaxamento e abaixamento instantâneo O(1) da coxa via dedução analítica da constante K,
 *    eliminando qualquer descolamento da ponta da pata em posturas extremas.
 * 3. Base Ortonormal Rigorosa (Zero-Bank): Construção direta da matriz de rotação SO(3) e derivação
 *    quaterniônica local (q_local = q_parent^-1 * q_world), impedindo 100% de torção parasitária (roll) nas pernas.
 */

import * as THREE from 'three';

// Variáveis temporárias estáticas para evitar alocação de memória (Zero GC Overhead no Game Loop)
const _P0 = new THREE.Vector3();
const _P1 = new THREE.Vector3();
const _P2 = new THREE.Vector3();
const _P3 = new THREE.Vector3();
const _up = new THREE.Vector3(0, 1, 0);
const _dirH = new THREE.Vector3();
const _vTarget = new THREE.Vector3();
const _vTUnit = new THREE.Vector3();
const _hingeAxis = new THREE.Vector3();
const _perpUp = new THREE.Vector3();
const _femurDir = new THREE.Vector3();
const _tibiaDir = new THREE.Vector3();
const _coxaDir = new THREE.Vector3();
const _X1 = new THREE.Vector3(); const _Y1 = new THREE.Vector3(); const _Z1 = new THREE.Vector3();
const _X2 = new THREE.Vector3(); const _Y2 = new THREE.Vector3(); const _Z2 = new THREE.Vector3();
const _X3 = new THREE.Vector3(); const _Y3 = new THREE.Vector3(); const _Z3 = new THREE.Vector3();
const _matWorld1 = new THREE.Matrix4();
const _matWorld2 = new THREE.Matrix4();
const _matWorld3 = new THREE.Matrix4();
const _qWorldBase = new THREE.Quaternion();
const _qWorld1 = new THREE.Quaternion();
const _qWorld2 = new THREE.Quaternion();
const _qWorld3 = new THREE.Quaternion();
const _qInvBase = new THREE.Quaternion();
const _qInv1 = new THREE.Quaternion();
const _qInv2 = new THREE.Quaternion();

export class IKSolver {
    /**
     * Calcula o ângulo de elevação adaptativo da coxa (graus) através de curva sigmoide suave.
     * @param {number} yHeight Altura atual do corpo em relação ao solo
     * @param {number} [totalReach=7.32] Alcance total da perna (L1 + L2 + L3)
     * @returns {number} Ângulo em graus para a elevação nominal da coxa
     */
    static calculateAdaptiveElevation(yHeight, totalReach = 7.32) {
        const maxY = totalReach * 0.38;
        const midY = totalReach * 0.20;
        const y = THREE.MathUtils.clamp(yHeight, 0.0, maxY);
        if (y >= midY) {
            const t = (y - midY) / Math.max(maxY - midY, 0.001);
            const s = t * t * (3 - 2 * t);
            return 35.0 - s * (35.0 - 5.0);
        } else {
            const t = (midY - y) / Math.max(midY, 0.001);
            const s = t * t * (3 - 2 * t);
            return 35.0 + s * (45.0 - 35.0);
        }
    }

    /**
     * Resolve a cinemática inversa de uma perna, posicionando os ossos J1, J2 e J3 com orientação Zero-Bank.
     * @param {import('./Leg.js').Leg} leg Instância da perna a ser resolvida
     * @param {THREE.Vector3} worldTarget Posição mundial da âncora do pé (T)
     * @param {number} currentElevationDeg Elevação adaptativa nominal da coxa (graus)
     * @param {boolean} [isXrayVisible=false] Se as linhas de esqueleto devem ser atualizadas
     */
    static solveLegIK(leg, worldTarget, currentElevationDeg, isXrayVisible = false) {
        const { baseNode, j1Node, j2Node, j3Node, L1, L2, L3, lineMesh, side } = leg;
        if (!baseNode || !j1Node || !j2Node || !j3Node) return;

        // 1. Posição Mundial do Quadril (P0)
        baseNode.getWorldPosition(_P0);

        // 2. Direção horizontal do Quadril até a Âncora no chão (dirH)
        _dirH.subVectors(worldTarget, _P0);
        _dirH.y = 0;
        const horizDist = _dirH.length();
        if (horizDist > 0.001) {
            _dirH.divideScalar(horizDist);
        } else {
            _dirH.set(side === 'D' ? -1 : 1, 0, 0);
        }

        // 3. Posição da Ponta da Coxa (P1) com Elevação Adaptativa e Auto-Reach Fallback
        let gamma = THREE.MathUtils.degToRad(currentElevationDeg);

        const h = _P0.y - worldTarget.y;
        const D_total = Math.sqrt(horizDist * horizDist + h * h);
        const theta_target = Math.atan2(-h, Math.max(horizDist, 0.001));
        const D_max = (L2 + L3) * 0.98;

        // Checagem se a elevação nominal excede a capacidade geométrica máxima dos elos restantes (L2 + L3)
        const p1x_nom = L1 * Math.cos(gamma);
        const p1y_nom = L1 * Math.sin(gamma);
        const dist1_sq = (horizDist - p1x_nom) * (horizDist - p1x_nom) + (-h - p1y_nom) * (-h - p1y_nom);

        if (dist1_sq > D_max * D_max && D_total > 0.001) {
            // Constante de alcançabilidade K derivada da lei dos cossenos no plano vertical
            const K = (D_total * D_total + L1 * L1 - D_max * D_max) / (2 * L1 * D_total);
            if (K <= 1.0) {
                const deltaTheta = Math.acos(THREE.MathUtils.clamp(K, -1.0, 1.0));
                const gammaLimit = theta_target + deltaTheta;
                if (gammaLimit < gamma) {
                    gamma = gammaLimit; // Relaxamento adaptativo imediato da coxa
                }
            } else {
                // Alvo além do alcance total esticado: aponta na direção direta do alvo
                gamma = theta_target;
            }
        }

        // Posição espacial calculada da ponta da Coxa (P1)
        _P1.copy(_P0)
           .addScaledVector(_dirH, L1 * Math.cos(gamma))
           .addScaledVector(_up, L1 * Math.sin(gamma));

        // 4. Cinemática 2-Bone de P1 até worldTarget (Fêmur P1->P2 e Tíbia P2->P3)
        _vTarget.subVectors(worldTarget, _P1);
        const dist = _vTarget.length();

        const minReach = Math.max(Math.abs(L2 - L3) * 1.02, 0.1);
        const maxReach = (L2 + L3) * 0.98;
        const dClamped = THREE.MathUtils.clamp(dist, minReach, maxReach);
        const cosAlpha = THREE.MathUtils.clamp(
            (L2 * L2 + dClamped * dClamped - L3 * L3) / (2 * L2 * dClamped),
            -1.0,
            1.0
        );
        const alpha = Math.acos(cosAlpha);

        if (dist > 0.001) {
            _vTUnit.copy(_vTarget).divideScalar(dist);
        } else {
            _vTUnit.copy(_dirH);
        }

        // Eixo da dobradiça UNIFICADO perpendicular ao plano de flexão (dirH x UP)
        _hingeAxis.crossVectors(_dirH, _up);
        if (_hingeAxis.lengthSq() > 0.0001) {
            _hingeAxis.normalize();
        } else {
            _hingeAxis.set(0, 0, side === 'D' ? 1 : -1);
        }

        // Vetor perpendicular no plano vertical apontando para CIMA
        _perpUp.crossVectors(_hingeAxis, _vTUnit);
        if (_perpUp.lengthSq() > 0.0001) {
            _perpUp.normalize();
        } else {
            _perpUp.copy(_up);
        }
        if (_perpUp.y < 0) _perpUp.negate();

        // Direção do Fêmur rotacionada para CIMA (Solução Elbow-UP / Joelho Erguido)
        _femurDir.copy(_vTUnit).multiplyScalar(Math.cos(alpha))
                 .addScaledVector(_perpUp, Math.sin(alpha));
        if (_femurDir.lengthSq() > 0.0001) {
            _femurDir.normalize();
        } else {
            _femurDir.copy(_vTUnit);
        }

        // Posição espacial do Joelho (P2)
        _P2.copy(_P1).addScaledVector(_femurDir, L2);

        // Direção da Tíbia apontando para a âncora de apoio
        _tibiaDir.subVectors(worldTarget, _P2);
        if (_tibiaDir.lengthSq() > 0.0001) {
            _tibiaDir.normalize();
        } else {
            _tibiaDir.copy(_femurDir);
        }
        _P3.copy(_P2).addScaledVector(_tibiaDir, L3);

        // Direção da Coxa (P0 -> P1)
        _coxaDir.subVectors(_P1, _P0);
        if (_coxaDir.lengthSq() > 0.0001) {
            _coxaDir.normalize();
        } else {
            _coxaDir.copy(_dirH);
        }

        // 5. CONSTRUÇÃO DA BASE ORTONORMAL RIGOROSA (ZERO-BANK: SEM TORÇÃO NO EIXO LONGO)
        
        // --- SEGMENTO 1: COXA (J1) ---
        _X1.copy(_coxaDir);
        _Y1.copy(_hingeAxis);
        _Z1.crossVectors(_X1, _Y1);
        if (_Z1.lengthSq() > 0.0001) _Z1.normalize(); else _Z1.set(0, 1, 0);
        _matWorld1.makeBasis(_X1, _Y1, _Z1);
        _qWorld1.setFromRotationMatrix(_matWorld1);

        baseNode.getWorldQuaternion(_qWorldBase);
        _qInvBase.copy(_qWorldBase).invert();
        j1Node.quaternion.multiplyQuaternions(_qInvBase, _qWorld1);
        j1Node.updateMatrixWorld(true);

        // --- SEGMENTO 2: FÊMUR (J2) ---
        _X2.copy(_femurDir);
        _Y2.copy(_hingeAxis);
        _Z2.crossVectors(_X2, _Y2);
        if (_Z2.lengthSq() > 0.0001) _Z2.normalize(); else _Z2.set(0, 1, 0);
        _matWorld2.makeBasis(_X2, _Y2, _Z2);
        _qWorld2.setFromRotationMatrix(_matWorld2);

        _qInv1.copy(_qWorld1).invert();
        j2Node.quaternion.multiplyQuaternions(_qInv1, _qWorld2);
        j2Node.updateMatrixWorld(true);

        // --- SEGMENTO 3: TÍBIA (J3) ---
        _X3.copy(_tibiaDir);
        _Y3.copy(_hingeAxis);
        _Z3.crossVectors(_X3, _Y3);
        if (_Z3.lengthSq() > 0.0001) _Z3.normalize(); else _Z3.set(0, 1, 0);
        _matWorld3.makeBasis(_X3, _Y3, _Z3);
        _qWorld3.setFromRotationMatrix(_matWorld3);

        _qInv2.copy(_qWorld2).invert();
        j3Node.quaternion.multiplyQuaternions(_qInv2, _qWorld3);
        j3Node.updateMatrixWorld(true);

        // 6. Atualizar geometria da linha de Raio-X se ativo
        if (lineMesh && isXrayVisible) {
            lineMesh.geometry.setPositions([
                _P0.x, _P0.y, _P0.z,
                _P1.x, _P1.y, _P1.z,
                _P2.x, _P2.y, _P2.z,
                _P3.x, _P3.y, _P3.z
            ]);
        }
    }
}
