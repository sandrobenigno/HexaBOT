/**
 * ============================================================================
 * HEXABOT TACTICAL ENGINE — AUTOSWAY.JS
 * Controlador Procedural de Auto-Balanço / Rebolado de Repouso (Idle Breathing)
 * ============================================================================
 * Regras Estritas de Comportamento:
 * 1. Timer de Inatividade:
 *    - O balanço inicia suavemente (damp para 1.0) após 500ms (0.5s) sem nenhum
 *      comando de locomoção e sem movimentação do cursor do mouse.
 * 2. Saída Instantânea (Zero Latency):
 *    - Ao menor movimento do mouse, tecla pressionada ou disparo, swayWeight
 *      cai INSTANTANEAMENTE para 0.0 (sem inércia de saída, garantindo precisão tática).
 * 3. Parametrização via Manifesto:
 *    - Amplitudes e frequências de balanço (speed, heightAmp, pitchRoll, yaw, shift)
 *      são lidas de activeBotManifest.calibration.swayDefaults.
 */

import * as THREE from 'three';

export class AutoSway {
    constructor() {
        this.swayWeight = 0.0;
        this.IDLE_THRESHOLD = 0.50; // 500ms sem alteração no mouse/teclado
    }

    /**
     * Reseta o peso de balanço instantaneamente para zero.
     */
    reset() {
        this.swayWeight = 0.0;
    }

    /**
     * Atualiza o estado e calcula as oscilações tridimensionais de repouso.
     * @param {number} dt Delta time em segundos
     * @param {number} elapsedTime Tempo total de execução da aplicação
     * @param {Object} params
     * @param {boolean} params.isBotIdle Se o robô está sem movimento, sem pivô, sem tiro e sem dano ativo
     * @param {number} params.timeSinceLastInput Tempo decorrido desde o último comando ou movimento do mouse
     * @param {Object|null} params.activeBotManifest Manifesto ativo do modelo carregado
     * @param {number} params.bodyHeight Altura configurada do corpo
     * @returns {{ swayX: number, swayY: number, swayZ: number, swayPitch: number, swayRoll: number, swayYaw: number, swayWeight: number }}
     */
    update(dt, elapsedTime, {
        isBotIdle,
        timeSinceLastInput,
        activeBotManifest,
        bodyHeight
    }) {
        const isStill = timeSinceLastInput >= this.IDLE_THRESHOLD;
        const canSway = isBotIdle && isStill;

        if (!canSway) {
            // SAÍDA INSTANTÂNEA: Ao menor comando ou update do mouse, o peso zera imediatamente
            this.swayWeight = 0.0;
        } else {
            // ENTRADA SUAVE: Amortecimento suave em direção a 1.0
            this.swayWeight = THREE.MathUtils.damp(this.swayWeight, 1.0, 2.0, dt);
        }

        let swayX = 0.0;
        let swayY = 0.0;
        let swayZ = 0.0;
        let swayPitch = 0.0;
        let swayRoll = 0.0;
        let swayYaw = 0.0;

        if (this.swayWeight > 0.0001) {
            const swayDefaults = activeBotManifest?.calibration?.swayDefaults || {};
            const swaySpeed = (swayDefaults.speed !== undefined) ? swayDefaults.speed : 1.2;
            const defaultAmp = +(0.16 * (bodyHeight / 1.70)).toFixed(4);
            const swayHeightAmp = (swayDefaults.heightAmp !== undefined) ? swayDefaults.heightAmp : defaultAmp;
            const swayPitchRoll = (swayDefaults.pitchRoll !== undefined) ? swayDefaults.pitchRoll : 6.0;
            const swayYawDeg = (swayDefaults.yaw !== undefined) ? swayDefaults.yaw : 8.0;
            const defaultShift = +(0.14 * (bodyHeight / 1.70)).toFixed(4);
            const swayShift = (swayDefaults.shift !== undefined) ? swayDefaults.shift : defaultShift;

            const tSway = elapsedTime * swaySpeed;

            // Oscilação Vertical (Heave)
            swayY = Math.sin(tSway * 1.5) * swayHeightAmp * this.swayWeight;

            // Oscilação Angular (Pitch, Roll e Yaw)
            swayPitch = THREE.MathUtils.degToRad(Math.sin(tSway) * swayPitchRoll) * this.swayWeight;
            swayRoll = THREE.MathUtils.degToRad(Math.cos(tSway * 0.8) * swayPitchRoll) * this.swayWeight;
            swayYaw = THREE.MathUtils.degToRad(Math.sin(tSway * 0.6) * swayYawDeg) * this.swayWeight;

            // Translação Lateral e Longitudinal (Sway & Surge)
            swayX = Math.sin(tSway * 0.7) * swayShift * this.swayWeight;
            swayZ = Math.cos(tSway * 0.5) * swayShift * this.swayWeight;
        }

        return {
            swayX,
            swayY,
            swayZ,
            swayPitch,
            swayRoll,
            swayYaw,
            swayWeight: this.swayWeight
        };
    }
}
