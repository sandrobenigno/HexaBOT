/**
 * ============================================================================
 * HEXABOT TACTICAL ENGINE — TRIPODGAIT.JS
 * Máquina de Estados da Marcha Tripé (Tripod Gait) — Zero Slipping
 * ============================================================================
 * Implementa a marcha biomecânica em escala real:
 * - Divisão dos membros em dois grupos alternados em X:
 *   * Grupo A (0): Front-Right (FR), Mid-Left (ML), Back-Right (BR)
 *   * Grupo B (1): Front-Left (FL), Mid-Right (MR), Back-Left (BL)
 * - Regra de Fixação Absoluta no Solo (Stance):
 *   * As patas em apoio permanecem 100% estáticas na coordenada do mundo (SEM LERP no chão).
 *   * O chassi do robô é impulsionado e translada/rotaciona sobre os pontos de apoio.
 * - Perna no Ar (Swing):
 *   * Executa arco parabólico suave h_lift = sin(t * PI) * stepHeight até o ponto nominal de pouso.
 * - Cadência Dinâmica de Passo:
 *   * Modulada proporcionalmente pelo gradiente de velocidade D/R e pelo slider de pivô.
 */

import * as THREE from 'three';

export class TripodGait {
    constructor() {
        // Estado do ciclo de passos
        this.isStepActive = false;
        this.gaitProgress = 0.0;    // 0.0 a 1.0
        this.activeTripodGroup = 0; // 0: Grupo A, 1: Grupo B

        // Coordenadas de início e fim da fase do corpo
        this.phaseStartPos = new THREE.Vector2(0, 0);
        this.phaseEndPos = new THREE.Vector2(0, 0);
        this.phaseStartHeading = 0.0;
        this.phaseEndHeading = 0.0;
    }

    /**
     * Reseta as variáveis de estado da marcha para a posição neutra.
     */
    reset() {
        this.isStepActive = false;
        this.gaitProgress = 0.0;
        this.activeTripodGroup = 0;
        this.phaseStartPos.set(0, 0);
        this.phaseEndPos.set(0, 0);
        this.phaseStartHeading = 0.0;
        this.phaseEndHeading = 0.0;
    }

    /**
     * Executa um ciclo de atualização da marcha tripé.
     * @param {number} dt Delta time em segundos
     * @param {Object} params Parâmetros de contexto
     * @param {boolean} params.wantsMove Usuário pressionando teclas de locomoção
     * @param {boolean} params.wantsTurn Robô solicitando rotação de base (fora da zona de conforto de 25°)
     * @param {number} params.turnDir Direção do giro (-1 ou +1)
     * @param {THREE.Vector3} params.moveVec Vetor global de deslocamento
     * @param {number} params.effectiveMoveSpeed Velocidade efetiva modulada pelo gradiente D/R
     * @param {Object} params.walkerState Estado global do walker (posX, posZ, baseHeading, strideLength, stepHeight, etc.)
     * @param {Array<import('./Leg.js').Leg>} params.legs Lista das pernas
     * @param {import('../world/CollisionSystem.js').CollisionSystem} params.collisionSystem Sistema de colisão
     * @param {import('../world/TerrainArena.js').TerrainArena} params.terrainArena Arena com consulta de altitude
     */
    update(dt, {
        wantsMove,
        wantsTurn,
        turnDir,
        moveVec,
        effectiveMoveSpeed,
        walkerState,
        legs,
        collisionSystem,
        terrainArena
    }) {
        const wantsGait = wantsMove || wantsTurn;
        const isGaitActive = wantsGait || this.isStepActive;

        if (isGaitActive) {
            // 1. Iniciar um novo meio-passo de tripé se não houver um em andamento
            if (!this.isStepActive) {
                this.isStepActive = true;
                this.gaitProgress = 0;

                // Posição e Rumo de Início do Passo
                this.phaseStartPos.set(walkerState.posX, walkerState.posZ);
                this.phaseStartHeading = walkerState.baseHeading;

                // Calcular Rumo de Fim do Passo
                let deltaH = 0;
                if (wantsTurn) {
                    deltaH = turnDir * walkerState.stepTurnAngle;
                }
                this.phaseEndHeading = this.phaseStartHeading + deltaH;

                // Calcular Posição de Fim do Passo com restrições do tabuleiro e pilares
                const stepMove = new THREE.Vector2(0, 0);
                if (wantsMove) {
                    stepMove.set(moveVec.x, moveVec.z)
                        .normalize()
                        .multiplyScalar(walkerState.strideLength);
                }
                const proposedEnd = this.phaseStartPos.clone().add(stepMove);
                const validEnd = collisionSystem.constrainPosition(
                    proposedEnd.x,
                    proposedEnd.y,
                    legs,
                    walkerState.stanceSpread
                );
                this.phaseEndPos.set(validEnd.x, validEnd.z);

                // Inicializar Pernas que vão executar Swing (no ar)
                const activeGroup = this.activeTripodGroup;
                legs.forEach((leg) => {
                    if (leg.group === activeGroup) {
                        leg.isStepping = true;
                        leg.stepStartTarget.copy(leg.currentTarget);

                        const endCenter = new THREE.Vector3(this.phaseEndPos.x, 0, this.phaseEndPos.y);
                        const nominalLanding = leg.nominalOffset.clone()
                            .applyAxisAngle(new THREE.Vector3(0, 1, 0), this.phaseEndHeading)
                            .add(endCenter);

                        // Avanço preditivo na direção do deslocamento para manter passadas naturais
                        if (wantsMove) {
                            nominalLanding.x += moveVec.x * (walkerState.strideLength * 0.4);
                            nominalLanding.z += moveVec.z * (walkerState.strideLength * 0.4);
                        }
                        const validLanding = collisionSystem.constrainFootPosition(
                            nominalLanding.x,
                            nominalLanding.z
                        );
                        nominalLanding.x = validLanding.x;
                        nominalLanding.z = validLanding.z;

                        nominalLanding.y = terrainArena.getTerrainHeight(
                            nominalLanding.x,
                            nominalLanding.z
                        );
                        leg.stepEndTarget.copy(nominalLanding);
                    } else {
                        leg.isStepping = false;
                    }
                });
            }

            // 2. Cadência do Passo modulada dinamicamente pela velocidade efetiva (D/R) ou velocidade de pivô
            const stepCadence = wantsMove
                ? (effectiveMoveSpeed / walkerState.strideLength * 0.85)
                : (2.0 * (walkerState.pivotSpeed / 4.0));

            this.gaitProgress += dt * stepCadence;
            const t = THREE.MathUtils.clamp(this.gaitProgress, 0, 1);
            const smoothT = THREE.MathUtils.smoothstep(t, 0, 1);

            // 3. O CORPO AVANÇA E GIRA IMPULSIONADO PELAS ÂNCORAS DE APOIO (STANCE)
            const rawX = THREE.MathUtils.lerp(this.phaseStartPos.x, this.phaseEndPos.x, smoothT);
            const rawZ = THREE.MathUtils.lerp(this.phaseStartPos.y, this.phaseEndPos.y, smoothT);
            const curPos = collisionSystem.constrainPosition(
                rawX,
                rawZ,
                legs,
                walkerState.stanceSpread
            );
            walkerState.posX = curPos.x;
            walkerState.posZ = curPos.z;
            walkerState.baseHeading = THREE.MathUtils.lerp(
                this.phaseStartHeading,
                this.phaseEndHeading,
                smoothT
            );

            // 4. Atualizar Posição das Patas no Espaço Mundial
            const activeGroup = this.activeTripodGroup;
            legs.forEach((leg) => {
                const isSwingLeg = (leg.group === activeGroup);

                if (isSwingLeg) {
                    // Swing Leg: Arco parabólico suave no ar em direção ao pouso
                    leg.currentTarget.lerpVectors(leg.stepStartTarget, leg.stepEndTarget, smoothT);
                    const validSwing = collisionSystem.constrainFootPosition(
                        leg.currentTarget.x,
                        leg.currentTarget.z
                    );
                    leg.currentTarget.x = validSwing.x;
                    leg.currentTarget.z = validSwing.z;
                    const groundY = terrainArena.getTerrainHeight(
                        leg.currentTarget.x,
                        leg.currentTarget.z
                    );
                    const lift = Math.sin(t * Math.PI) * walkerState.stepHeight;
                    leg.currentTarget.y = groundY + lift;
                } else {
                    // Stance Leg: 100% TRAVADA NA COORDENADA DO SOLO (NUNCA DESLIZA / SEM LERP!)
                    leg.currentTarget.y = terrainArena.getTerrainHeight(
                        leg.currentTarget.x,
                        leg.currentTarget.z
                    );
                }
            });

            // 5. Finalizar o Meio-Ciclo do Passo (Touchdown)
            if (this.gaitProgress >= 1.0) {
                this.isStepActive = false;
                this.gaitProgress = 0;
                legs.forEach((leg) => {
                    if (leg.group === activeGroup) {
                        leg.currentTarget.copy(leg.stepEndTarget);
                        leg.isStepping = false;
                    }
                });
                // Alternar grupo de tripé ativo para o próximo ciclo
                this.activeTripodGroup = (this.activeTripodGroup === 0) ? 1 : 0;
            }
        } else {
            // Modo Estático (Totalmente Parado): Todas as 6 patas em Stance firmes no chão (SEM LERP!)
            legs.forEach((leg) => {
                leg.isStepping = false;
                const validStatic = collisionSystem.constrainFootPosition(
                    leg.currentTarget.x,
                    leg.currentTarget.z
                );
                leg.currentTarget.x = validStatic.x;
                leg.currentTarget.z = validStatic.z;
                leg.currentTarget.y = terrainArena.getTerrainHeight(
                    leg.currentTarget.x,
                    leg.currentTarget.z
                );
            });
        }
    }
}
