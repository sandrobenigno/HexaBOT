/**
 * ============================================================================
 * HEXABOT TACTICAL ENGINE — SHAPEKEYANIMATOR.JS
 * Modulação Procedural das Morph Targets (Íris, Carapaça e Olhos Saltando)
 * ============================================================================
 * Gerencia a expressividade biomimética e cômica do robô:
 * 1. Durante o Disparo de Laser:
 *    - Ambas as Íris vão a 100% de dilatação.
 *    - Os Olhos saltam apenas 10% com retorno suave (Easy-Out) em 500ms.
 * 2. Durante a Reação de Dano (Tecla K):
 *    - Olhos saltam a 100%.
 *    - Carapaça se eleva a 95%.
 *    - Íris Direita a 30% e Íris Esquerda a 100% (expressão assimétrica atordoada).
 *    - Envelope por mola amortecida exponencial (Damped Spring Shockwave).
 */

import * as THREE from 'three';

export class ShapeKeyAnimator {
    constructor() {
        /**
         * Mapeamento de malhas e índices de morph targets.
         */
        this.morphTargetsMap = {
            irisD: [],
            irisE: [],
            carapaca: [],
            olhos: []
        };

        this.irisShootingWeight = 0.0;
        this.irisReleaseTime = -999.0;
        this.wasLaserFiring = false;
    }

    /**
     * Varre a hierarquia do modelo 3D para registrar todas as morph targets compatíveis.
     * @param {THREE.Object3D} modelRoot Raiz do modelo 3D carregado
     */
    scanMorphTargets(modelRoot) {
        this.morphTargetsMap.irisD = [];
        this.morphTargetsMap.irisE = [];
        this.morphTargetsMap.carapaca = [];
        this.morphTargetsMap.olhos = [];

        if (!modelRoot) return;

        modelRoot.traverse((child) => {
            if (child.isMesh && child.morphTargetDictionary && child.morphTargetInfluences) {
                for (const name in child.morphTargetDictionary) {
                    const upper = name.toUpperCase().replace('-', '_');
                    const idx = child.morphTargetDictionary[name];

                    if (/IRIS.*[_\-\s]?D|^D[_\-\s]?IRIS/i.test(upper)) {
                        this.morphTargetsMap.irisD.push({ mesh: child, index: idx });
                    } else if (/IRIS.*[_\-\s]?E|^E[_\-\s]?IRIS/i.test(upper)) {
                        this.morphTargetsMap.irisE.push({ mesh: child, index: idx });
                    } else if (/CARAPACA|SHELL|BODY_MORPH/i.test(upper)) {
                        this.morphTargetsMap.carapaca.push({ mesh: child, index: idx });
                    } else if (/OLHO|EYE/i.test(upper)) {
                        this.morphTargetsMap.olhos.push({ mesh: child, index: idx });
                    }
                }
            }
        });
    }

    /**
     * Atualiza as influências das morph targets a cada frame.
     * @param {number} dt Delta time em segundos
     * @param {number} elapsedTime Tempo total de execução
     * @param {boolean} isActuallyFiring Se o laser está efetivamente disparando
     * @param {number} damageIntensity Intensidade atual do envelope de dano (0.0 a 1.0)
     * @param {boolean} [isDead=false] Se o robô está em estado de morte/paralisia
     * @param {boolean} [isVictoryDancing=false] Se o robô está na Dança da Vitória
     */
    update(dt, elapsedTime, isActuallyFiring, damageIntensity, isDead = false, isVictoryDancing = false) {
        // 1. Componente de Tiro (Dilatação da Íris com Easy-Out de 500ms)
        if (isActuallyFiring && !isDead) {
            this.irisShootingWeight = THREE.MathUtils.damp(this.irisShootingWeight, 1.00, 32.0, dt);
            this.wasLaserFiring = true;
        } else {
            if (this.wasLaserFiring) {
                this.irisReleaseTime = elapsedTime;
                this.wasLaserFiring = false;
            }
            const timeSinceRelease = elapsedTime - this.irisReleaseTime;
            if (timeSinceRelease < 0.50 && !isDead) {
                const t = THREE.MathUtils.clamp(timeSinceRelease / 0.50, 0.0, 1.0);
                this.irisShootingWeight = 1.00 * (1.0 - t) * (1.0 - t);
            } else {
                this.irisShootingWeight = 0.0;
            }
        }

        // No tiro, os olhos saltam apenas 10%
        const shootingOlhosWeight = this.irisShootingWeight * 0.10;

        // 2. Combinação e Ponderação Final (Tiro + Dano + Morte Paralisada + Dança da Vitória)
        let finalIrisD = Math.max(this.irisShootingWeight, 0.30 * damageIntensity);
        let finalIrisE = Math.max(this.irisShootingWeight, 1.00 * damageIntensity);
        let finalCarapaca = 0.95 * damageIntensity;
        let finalOlhos = Math.max(shootingOlhosWeight, 1.00 * damageIntensity);

        // Dança da Vitória (Funk Groove): Sincronizado a 1 batida por segundo (BPM 60)
        if (isVictoryDancing && !isDead) {
            const beatPhase = (elapsedTime * Math.PI); // 1 Batida por segundo (meio ciclo seno)
            const danceCarapaca = Math.pow(Math.abs(Math.sin(beatPhase)), 1.5) * 0.95;
            const danceOlhos = Math.pow(Math.abs(Math.cos(beatPhase)), 1.5) * 0.70;
            const danceIrisD = 0.75 + Math.sin(beatPhase * 2.0) * 0.25;
            const danceIrisE = 0.75 + Math.cos(beatPhase * 2.0) * 0.25;

            finalCarapaca = Math.max(finalCarapaca, danceCarapaca);
            finalOlhos = Math.max(finalOlhos, danceOlhos);
            finalIrisD = Math.max(finalIrisD, danceIrisD);
            finalIrisE = Math.max(finalIrisE, danceIrisE);
        }

        // Quando a HX morre: carapaça travada aberta, olhos saltados pra fora, olho D meio aberto (50%) e olho E fechado (0%)
        if (isDead) {
            finalCarapaca = Math.max(0.95, finalCarapaca);
            finalOlhos = Math.max(1.00, finalOlhos);
            finalIrisD = Math.max(0.50, 0.50 + 0.50 * damageIntensity); // Meio aberto (0.50) com tremor cômico nos jolts
            finalIrisE = 0.00; // Totalmente fechado (0.00)
        }

        // 3. Aplicação nas malhas
        for (let i = 0; i < this.morphTargetsMap.irisD.length; i++) {
            const { mesh, index } = this.morphTargetsMap.irisD[i];
            mesh.morphTargetInfluences[index] = finalIrisD;
        }
        for (let i = 0; i < this.morphTargetsMap.irisE.length; i++) {
            const { mesh, index } = this.morphTargetsMap.irisE[i];
            mesh.morphTargetInfluences[index] = finalIrisE;
        }
        for (let i = 0; i < this.morphTargetsMap.carapaca.length; i++) {
            const { mesh, index } = this.morphTargetsMap.carapaca[i];
            mesh.morphTargetInfluences[index] = finalCarapaca;
        }
        for (let i = 0; i < this.morphTargetsMap.olhos.length; i++) {
            const { mesh, index } = this.morphTargetsMap.olhos[i];
            mesh.morphTargetInfluences[index] = finalOlhos;
        }
    }
}
